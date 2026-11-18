import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { normalizeKnowledgeIndexConfig, KNOWLEDGE_PARSER_VERSION, KNOWLEDGE_CHUNKER_VERSION, KNOWLEDGE_EMBEDDING_INPUT_VERSION } from '../../src/knowledge-core/index-config';
import { KnowledgeCoreError } from '../../src/knowledge-core/errors';
import { prepareKnowledgeDocument, createPreparationPreviewKey, type PreparationPdf } from '../../src/knowledge-core/preparation';
import { isLocalOcrAvailable } from '../../src/library/library.ocr';
import { KnowledgeInspectionService } from '../../src/knowledge-core/inspection.service';
import { KnowledgeIngestionWorker } from '../../src/knowledge-core/ingestion.worker';
import { effectiveFileIndexes } from '../../src/knowledge-core/live-files';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EventEmitter } from 'node:events';
import { PDFParse } from 'pdf-parse';
import sharp from 'sharp';
import { KnowledgeAdminController } from '../../src/knowledge-core/admin.controller';
import { KnowledgePreparationPreviewDto } from '../../src/knowledge-core/admin.dto';

const cfg = { targetTokens: 20, maxTokens: 30, overlapTokens: 3 };
const baseInput = { name: 'fixture.md', bytes: Buffer.from('# 标题\n\nHello 😀 world. '.repeat(20)), tokenizer: 'cl100k_base' as const, maxInputTokens: 8192, config: cfg };
const code = (expected: string) => (error: unknown) => error instanceof KnowledgeCoreError && error.code === expected;
function fixturePdf(text: string): Buffer {
  const bodies = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [4 0 R] /Count 1 >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 220] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>'];
  const stream = `BT /F1 28 Tf 20 100 Td (${text}) Tj ET`;
  bodies.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  let source = '%PDF-1.4\n'; const offsets = [0];
  bodies.forEach((body, i) => { offsets.push(Buffer.byteLength(source)); source += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = Buffer.byteLength(source);
  source += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(source);
}
function fakePdf(total = 2, width = 100, missing = false) {
  let rendered = 0, destroyed = 0;
  const pdf: PreparationPdf = {
    getInfo: async options => ({ total, pages: options?.partial?.map(pageNumber => ({ pageNumber, width, height: 100 })) }),
    getScreenshot: async options => { rendered++; return { pages: missing ? [] : [{ pageNumber: options.partial[0], width, height: 100, data: Uint8Array.from([1]) }] }; },
    destroy: async () => { destroyed++; },
  };
  return { pdf, rendered: () => rendered, destroyed: () => destroyed };
}
function ocrInput(pdf: PreparationPdf) {
  return { ...baseInput, name: 'scan.pdf', bytes: Buffer.from('%PDF-1.4'), config: { ...cfg, parseMode: 'ocr' as const }, ocrAvailable: async () => true, pdfFactory: () => pdf, ocrRecognizer: async (name: string) => `Recognized ${name} 😀` };
}
function inspectionFixture() {
  const state = { active: true, superAdmin: true, enabled: true, deleted: false, tenant: null as string | null, disabledProfiles: new Set<string>(), onRead: () => {}, resolutions: 0, revokeAtResolution: 0 };
  const indexes: Array<{id:string;profileId:string;chunkerConfig:unknown}> = [];
  const db = new Proxy({
    user: { findUnique: async () => ({status: state.active ? 'active' : 'disabled'}) },
    userRole: { findFirst: async () => state.superAdmin ? {roleId:'super'} : null },
    knowledgeDocumentRevision: { findUnique: async () => ({ id:'rev', documentId:'doc', originalName:'fixture.md', parserFormat:'.md', storageKey:'private-path', contentHash:'hash', indexes,
      document:{id:'doc', baseId:'base', requestedIndexId: indexes[0]?.id, enabled:state.enabled, deletedAt:state.deleted?new Date():null, base:{enabled:true,scope:state.tenant?'TENANT':'PLATFORM',tenantId:state.tenant}} }) },
  }, { get(target, key) { if (!(key in target)) throw new Error(`Unexpected database operation: ${String(key)}`); return Reflect.get(target,key); } });
  const profiles = { resolveForRequest: async (id: string) => {
    state.resolutions++; if (state.resolutions === state.revokeAtResolution) state.disabledProfiles.add(id);
    if (state.disabledProfiles.has(id)) throw new KnowledgeCoreError('PROFILE_DISABLED');
    return { id, maxInputTokens:128, tokenizer:'cl100k_base', apiKey:'do-not-disclose', endpoint:'private-endpoint' };
  } };
  const service = new KnowledgeInspectionService(db as never, {read:async()=>{state.onRead();return baseInput.bytes;}} as never, {defaultProfile:async()=> 'healthy'} as never, profiles as never);
  return {state,indexes,service};
}

test('legacy/default text identities remain byte-for-byte compatible and OCR adds a new identity', () => {
  const legacy = { parserVersion: KNOWLEDGE_PARSER_VERSION, chunkerVersion: KNOWLEDGE_CHUNKER_VERSION, embeddingInputVersion: KNOWLEDGE_EMBEDDING_INPUT_VERSION, targetTokens:600,maxTokens:900,overlapTokens:80 };
  const expected = createHash('sha256').update(JSON.stringify(legacy)).digest('hex');
  assert.equal(normalizeKnowledgeIndexConfig(undefined,8192).indexConfigHash,expected);
  assert.equal(normalizeKnowledgeIndexConfig({parseMode:'text'},8192).indexConfigHash,expected);
  assert.notEqual(normalizeKnowledgeIndexConfig({parseMode:'ocr'},8192).indexConfigHash,expected);
  assert.deepEqual(normalizeKnowledgeIndexConfig(undefined,1).chunkerConfig,{targetTokens:1,maxTokens:1,overlapTokens:0});
  for (const invalid of [null,[],{unknown:1},{parseMode:'invented'},{targetTokens:1.5},{targetTokens:10,maxTokens:9},{targetTokens:2,maxTokens:3,overlapTokens:2}])
    assert.throws(()=>normalizeKnowledgeIndexConfig(invalid as never,8192),code('INVALID_INDEX_CONFIGURATION'));
});
test('actual Markdown/CSV preparation preserves original ranges and locators', async () => {
  const md = await prepareKnowledgeDocument(baseInput);
  assert.equal(md.parseStatus,'READY'); assert.ok(md.chunks.length>1);
  for(const chunk of md.chunks){assert.equal(chunk.sourceText,md.originalText.slice(chunk.sourceStart,chunk.sourceEnd));assert.ok(chunk.tokenCount<=30);assert.ok(!chunk.text.includes('\ufffd'));}
  assert.ok(md.chunks.some(chunk=>chunk.locator.headingPath?.includes('标题')));
  const csv = await prepareKnowledgeDocument({...baseInput,name:'rows.csv',bytes:Buffer.from('名称,说明\n甲,乙\n')});
  assert.equal(csv.chunks[0].locator.rowStart,2); assert.match(csv.chunks[0].text,/名称/);
  assert.equal((await prepareKnowledgeDocument({...baseInput,bytes:Buffer.alloc(0)})).failureReason,'UPLOAD_SIZE_LIMIT');
});
test('OCR is capability-gated; page and viewport limits precede raster allocation and always clean up', async () => {
  const many=fakePdf(2001); const out=await prepareKnowledgeDocument(ocrInput(many.pdf));
  assert.equal(out.parseStatus,'PARTIAL');assert.equal(out.whyPartial,'OCR_PAGE_LIMIT');assert.equal(many.rendered(),0);assert.equal(many.destroyed(),1);
  const huge=fakePdf(1,200000);
  await assert.rejects(()=>prepareKnowledgeDocument(ocrInput(huge.pdf)),code('OCR_RENDER_LIMIT'));
  assert.equal(huge.rendered(),0);assert.equal(huge.destroyed(),1);
  await assert.rejects(()=>prepareKnowledgeDocument({...ocrInput(huge.pdf),ocrAvailable:async()=>false}),code('OCR_UNAVAILABLE'));
});
test('OCR preserves physical pages and source ranges; missing/blank pages never become usable',async()=>{
  const f=fakePdf();const out=await prepareKnowledgeDocument(ocrInput(f.pdf));
  assert.equal(out.parseStatus,'READY');assert.equal(f.destroyed(),1);assert.equal(f.rendered(),2);
  assert.deepEqual(out.sections.map(s=>s.locator.page),[1,2]);
  for(const c of out.chunks)assert.equal(c.sourceText,out.originalText.slice(c.sourceStart,c.sourceEnd));
  const blank=await prepareKnowledgeDocument({...ocrInput(fakePdf().pdf),ocrRecognizer:async name=>name.includes('1')?'first':''});
  assert.equal(blank.parseStatus,'PARTIAL');assert.equal(blank.chunks.length,0);
  const missing=await prepareKnowledgeDocument(ocrInput(fakePdf(1,100,true).pdf));
  assert.equal(missing.parseStatus,'PARTIAL');assert.equal(missing.whyPartial,'OCR_PAGE_MISSING');
  const bad=fakePdf(1);const failed=await prepareKnowledgeDocument({...ocrInput(bad.pdf),ocrRecognizer:async()=>{throw Error('private path and secret');}});
  assert.equal(failed.parseStatus,'FAILED');assert.equal(failed.failureReason,'OCR_RECOGNITION_FAILED');assert.ok(!JSON.stringify(failed).includes('private path'));assert.equal(bad.destroyed(),1);
});
test('inspection returns saved valid settings and whitelists profile/credential data',async()=>{
  const f=inspectionFixture(); f.indexes.push({id:'i',profileId:'existing',chunkerConfig:{targetTokens:70,maxTokens:100,overlapTokens:2}});
  const ctx=await f.service.preparationContext('u','doc','rev');
  assert.equal(ctx.profileId,'existing');assert.equal(ctx.defaultConfig.targetTokens,70);
  const serialized=JSON.stringify(ctx);for(const value of ['do-not-disclose','private-path','private-endpoint'])assert.ok(!serialized.includes(value));
  f.state.disabledProfiles.add('existing');assert.equal((await f.service.preparationContext('u','doc','rev')).profileId,'healthy');
});
test('inspection preview does actual extraction with no persistent or provider-call surface',async()=>{
  const f=inspectionFixture();const out=await f.service.preparationPreview('u','doc','rev',{config:cfg});
  assert.equal(out.readyForReprocess,true);assert.equal(out.parseStatus,'READY');assert.ok(out.displayChunks.length);assert.match(out.previewKey,/^[0-9a-f]{64}$/);
  const key=createPreparationPreviewKey({documentId:'doc',revisionId:'rev',contentHash:'hash',profileId:'healthy',tokenizer:'cl100k_base',capacityTokens:128,config:{parseMode:'text',...cfg}});
  assert.equal(key,out.previewKey);
});
test('inspection rejects wrong identities, inactive/non-admin users, foreign tenants and deleted documents',async()=>{
  let f=inspectionFixture();await assert.rejects(()=>f.service.preparationContext('u','wrong','rev'),code('KNOWLEDGE_REVISION_NOT_FOUND'));
  f=inspectionFixture();f.state.active=false;await assert.rejects(()=>f.service.preparationContext('u','doc','rev'));
  f=inspectionFixture();f.state.superAdmin=false;await assert.rejects(()=>f.service.preparationContext('u','doc','rev'));
  f=inspectionFixture();f.state.tenant='other';await assert.rejects(()=>f.service.preparationContext('u','doc','rev'),code('KNOWLEDGE_FORBIDDEN'));
  f=inspectionFixture();f.state.deleted=true;await assert.rejects(()=>f.service.preparationContext('u','doc','rev'),code('KNOWLEDGE_REVISION_NOT_FOUND'));
});
test('inspection rechecks privileges and provider dependencies after a blob read',async()=>{
  const revoked=inspectionFixture();revoked.state.onRead=()=>{revoked.state.enabled=false;};
  await assert.rejects(()=>revoked.service.preparationPreview('u','doc','rev',{}),code('KNOWLEDGE_DISABLED'));
  const profile=inspectionFixture();profile.state.revokeAtResolution=3;
  await assert.rejects(()=>profile.service.preparationPreview('u','doc','rev',{}),code('PROFILE_DISABLED'));
});
test('preview DTO enforces integer pages and nested config whitelist',async()=>{
  assert.ok((await validate(plainToInstance(KnowledgePreparationPreviewDto,{config:{},textPage:0}),{whitelist:true,forbidNonWhitelisted:true})).length);
  assert.ok((await validate(plainToInstance(KnowledgePreparationPreviewDto,{config:{invented:1}}),{whitelist:true,forbidNonWhitelisted:true})).length);
});
test('worker uses exactly the previewed chunks and keeps an old successful index while replacement is unready',async()=>{
  const prepared=await prepareKnowledgeDocument(baseInput), config=normalizeKnowledgeIndexConfig(cfg,8192);
  const written:any[]=[];const failures:any[]=[];
  const doc={id:'doc',baseId:'base',enabled:true,base:{enabled:true,autoUpdate:false}};
  const index={id:'idx',profileId:'p',...config,revision:{documentId:'doc',originalName:baseInput.name,storageKey:'blob',document:doc}};
  const tx={knowledgeDocument:{findUniqueOrThrow:async()=>doc},knowledgeChunk:{create:async({data}:any)=>written.push(data)},knowledgeIndexRevision:{update:async()=>{}},knowledgeIngestionJob:{update:async()=>{}},$executeRaw:async()=>{}};
  const worker=new KnowledgeIngestionWorker({knowledgeIndexRevision:{findUniqueOrThrow:async()=>index}} as never,{resolveForRequest:async()=>({id:'p',maxInputTokens:8192,tokenizer:'cl100k_base',dimension:2})} as never,{read:async()=>baseInput.bytes} as never,{claim:async()=>({id:'job',indexRevisionId:'idx',leaseToken:'token'}),heartbeat:async()=>{},setStage:async()=>{},withLease:async(_j:any,_t:any,fn:any)=>fn(tx),fail:async(...args:any[])=>failures.push(args)} as never,{embed:async(_p:any,inputs:string[])=>({vectors:inputs.map(()=>[1,2])})} as never);
  assert.equal(await worker.runOnce(),true);assert.equal(failures.length,0);assert.deepEqual(written.map(({id,indexRevisionId,...chunk})=>chunk),prepared.chunks);
  const old={id:'old',status:'READY',createdAt:'2026-01-01',profile:{enabled:true},revision:{createdAt:'2026-01-01',document:{id:'doc',enabled:true,requestedIndexId:'new'}}};
  assert.deepEqual(effectiveFileIndexes([old,{...old,id:'new',status:'PARTIAL'}],['old']).map(i=>i.id),['old']);
});
test('native PDF OCR performs actual rasterization and recognition on this host',{skip:process.platform!=='darwin'},async t=>{
  if(!await isLocalOcrAvailable())return t.skip('Native recognizer unavailable');
  // Rasterize a source page, then build an image-only PDF: no text operators or fonts remain.
  const source = new PDFParse({data: new Uint8Array(fixturePdf('KNOWLEDGE OCR TEST 4242'))});
  let jpeg: Buffer;
  try {
    const rendered = await source.getScreenshot({partial:[1],imageBuffer:true,imageDataUrl:false,scale:2});
    jpeg = await sharp(rendered.pages[0].data).jpeg({quality:95}).toBuffer();
  } finally { await source.destroy(); }
  const bodies = [Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'), Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 220] /Resources << /XObject << /Scan 4 0 R >> >> /Contents 5 0 R >>'),
    Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width 1200 /Height 440 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),jpeg,Buffer.from('\nendstream')])];
  const draw = 'q 600 0 0 220 0 0 cm /Scan Do Q';
  bodies.push(Buffer.from(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`));
  let bytes = Buffer.from('%PDF-1.4\n'); const offsets: number[] = [];
  bodies.forEach((body,i) => { offsets.push(bytes.length); bytes=Buffer.concat([bytes,Buffer.from(`${i+1} 0 obj\n`),body,Buffer.from('\nendobj\n')]); });
  const xref = bytes.length;
  bytes=Buffer.concat([bytes,Buffer.from(`xref\n0 6\n0000000000 65535 f \n${offsets.map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`)]);
  const textOnly=await prepareKnowledgeDocument({...baseInput,name:'scan.pdf',bytes});
  assert.equal(textOnly.originalText.trim(),'');assert.equal(textOnly.chunks.length,0);assert.notEqual(textOnly.parseStatus,'READY');
  const out=await prepareKnowledgeDocument({...baseInput,name:'scan.pdf',bytes,config:{...cfg,parseMode:'ocr'},ocrRecognizer:async (name,bytes,signal)=>(await import('../../src/library/library.ocr')).recognizeImageText(name,bytes,true,signal)});
  assert.equal(out.parseStatus,'READY');assert.match(out.originalText,/4242/);assert.equal(out.chunks[0].locator.page,1);
});

test('HTTP preview propagates early-close cancellation and removes listeners', async () => {
  const req = Object.assign(new EventEmitter(), { user: { id: 'u' }, res: Object.assign(new EventEmitter(), { writableFinished: false }) });
  let seen: AbortSignal | undefined;
  const inspection = { preparationPreview: async (...args: unknown[]) => {
    seen = args[4] as AbortSignal;
    assert.ok(seen instanceof AbortSignal);
    req.res.emit('close');
    assert.equal(seen.aborted, true);
    return { readyForReprocess: false };
  } };
  const controller = new KnowledgeAdminController(inspection as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  await controller.preparationPreview(req as never, 'doc', 'rev', { config: cfg });
  assert.equal(req.listenerCount('aborted'), 0); assert.equal(req.res.listenerCount('close'), 0);
});
test('inspection forwards cancellation and OCR stops remaining pages and releases its gate', async () => {
  const aborted = new AbortController(), f = inspectionFixture();
  f.state.onRead = () => aborted.abort();
  await assert.rejects(() => f.service.preparationPreview('u', 'doc', 'rev', { config: cfg }, aborted.signal), code('RETRIEVAL_CANCELLED'));
  const abort = new AbortController(), pdf = fakePdf(3); let calls = 0;
  await assert.rejects(() => prepareKnowledgeDocument({ ...ocrInput(pdf.pdf), signal: abort.signal, ocrRecognizer: async () => { calls++; abort.abort(); return 'recognized'; } }), code('RETRIEVAL_CANCELLED'));
  assert.equal(calls, 1); assert.equal(pdf.rendered(), 1); assert.equal(pdf.destroyed(), 1);
  assert.equal((await prepareKnowledgeDocument(ocrInput(fakePdf(1).pdf))).parseStatus, 'READY');
});

test('static images share server OCR and partial results never produce a usable index',async()=>{
 const input={...baseInput,name:'scan.png',bytes:Buffer.from('adapter handles decoding'),ocrRecognizer:async()=>({text:'Code 4242. Training lasts 37 days.',partial:false})};
 const out=await prepareKnowledgeDocument(input);assert.equal(out.resolvedConfig.parseMode,'ocr');assert.equal(out.parseStatus,'READY');assert.equal(out.chunks[0].locator.page,1);
 const partial=await prepareKnowledgeDocument({...input,ocrRecognizer:async()=>({text:'Code [无法辨认]',partial:true})});assert.equal(partial.parseStatus,'PARTIAL');assert.equal(partial.chunks.length,0);assert.equal(partial.whyPartial,'OCR_PARTIAL');assert.match(partial.originalText,/无法辨认/);
 const blank=await prepareKnowledgeDocument({...input,ocrRecognizer:async()=>({text:'',partial:false})});assert.equal(blank.parseStatus,'DOWNLOAD_ONLY');assert.equal(blank.chunks.length,0);
 await assert.rejects(()=>prepareKnowledgeDocument({...input,ocrRecognizer:undefined}),code('OCR_UNAVAILABLE'));
});

test('OCR model is part of immutable index and preview identities',()=>{
 const a={...cfg,parseMode:'ocr' as const,ocrModelId:'model-a'},b={...a,ocrModelId:'model-b'};
 assert.notEqual(normalizeKnowledgeIndexConfig(a,8192).indexConfigHash,normalizeKnowledgeIndexConfig(b,8192).indexConfigHash);
 assert.notEqual(normalizeKnowledgeIndexConfig({...a,ocrRouteHash:'a'.repeat(64)},8192).indexConfigHash,normalizeKnowledgeIndexConfig({...a,ocrRouteHash:'b'.repeat(64)},8192).indexConfigHash);
 const identity={documentId:'doc',revisionId:'rev',contentHash:'hash',profileId:'profile',tokenizer:'cl100k_base' as const,capacityTokens:8192};
 assert.notEqual(createPreparationPreviewKey({...identity,config:a}),createPreparationPreviewKey({...identity,config:b}));
});

test('confirmed blank PDF pages do not hide following text and physical page numbers remain intact',async()=>{
 const out=await prepareKnowledgeDocument({...ocrInput(fakePdf(2).pdf),ocrRecognizer:async name=>({text:name.includes('1')?'':'Page two has code 4242.',partial:false})});
 assert.equal(out.parseStatus,'READY');assert.equal(out.sections.length,1);assert.equal(out.chunks[0].locator.page,2);
 const partial=await prepareKnowledgeDocument({...ocrInput(fakePdf(2).pdf),ocrRecognizer:async()=>({text:'',partial:true})});assert.equal(partial.parseStatus,'PARTIAL');assert.equal(partial.whyPartial,'OCR_PARTIAL');
});

test('original image preview uses a sniffed raster MIME and refuses HTML disguised as an image',async()=>{
 const headers=new Map<string,unknown>();let bytes=Buffer.from('89504e470d0a1a0a','hex');
 const inspection={original:async()=>({bytes,originalName:'scan.png'})};
 const controller=new KnowledgeAdminController(inspection as never,{} as never,{} as never,{} as never,{} as never,{} as never);
 const response={setHeader:(k:string,v:unknown)=>headers.set(k,v),send:()=>{}};
 await controller.original({user:{id:'admin'}} as never,'doc','rev',response as never,'1');assert.equal(headers.get('Content-Type'),'image/png');assert.match(String(headers.get('Content-Disposition')),/^inline;/);
 bytes=Buffer.from('<html><script>bad</script></html>');await controller.original({user:{id:'admin'}} as never,'doc','rev',response as never,'1');assert.equal(headers.get('Content-Type'),'application/octet-stream');assert.match(String(headers.get('Content-Disposition')),/^attachment;/);
});

import {OcrPageStore} from '../../src/knowledge-core/ocr-progress';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('120-page scans yield bounded batches and resume after a page failure without re-recognizing completed pages',async t=>{
 const root=await mkdtemp(join(tmpdir(),'ocr-long-'));t.after(()=>rm(root,{recursive:true,force:true}));let failed=false;const calls:number[]=[];
 const input={...ocrInput(fakePdf(120).pdf),ocrRecognizer:async(name:string)=>{const page=Number(name.match(/\d+/)![0]);calls.push(page);if(page===7&&!failed){failed=true;throw new KnowledgeCoreError('OCR_TIMEOUT',true);}return {text:`Page ${page} code ${1000+page}.`,partial:false};}};
 const run=()=>prepareKnowledgeDocument({...input,pdfFactory:()=>fakePdf(120).pdf,ocrWork:{indexId:'long-index',store:new OcrPageStore(root)}});
 const first=await run();assert.equal(first.ocrPending,true);assert.equal(first.chunks.length,0);assert.equal((await new OcrPageStore(root).progress('long-index'))?.completedPages,5);
 await assert.rejects(run,code('OCR_TIMEOUT'));assert.equal((await new OcrPageStore(root).progress('long-index'))?.completedPages,6);
 let out;for(let i=0;i<30;i++){out=await run();if(!out.ocrPending)break;}
 assert.equal(out?.parseStatus,'READY');assert.equal(out?.sections.length,120);assert.equal(out?.sections.at(-1)?.locator.page,120);assert.match(out!.originalText,/code 1120/);
 assert.equal(calls.filter(p=>p===1).length,1);assert.equal(calls.filter(p=>p===6).length,1);assert.equal(calls.filter(p=>p===7).length,2);assert.equal(calls.length,121);
 assert.deepEqual(out?.sections.map(s=>s.locator.page),Array.from({length:120},(_,i)=>i+1));assert.equal((await new OcrPageStore(root).progress('long-index'))?.nextPage,null);
});
test('long-document previews explicitly sample only three physical pages',async()=>{
 const fake=fakePdf(120);const out=await prepareKnowledgeDocument({...ocrInput(fake.pdf),ocrPreview:true});
 assert.equal(fake.rendered(),3);assert.deepEqual(out.ocrSample,{totalPages:120,sampledPages:3});assert.equal(out.sections.at(-1)?.locator.page,3);assert.equal(out.ocrPending,undefined);
});

test('large extraction stops at the first page exceeding the text cap instead of recognizing the rest',async t=>{
 const root=await mkdtemp(join(tmpdir(),'ocr-cap-'));t.after(()=>rm(root,{recursive:true,force:true}));let calls=0;
 const out=await prepareKnowledgeDocument({...ocrInput(fakePdf(30).pdf),ocrWork:{indexId:'large',store:new OcrPageStore(root),batchSize:2000},ocrRecognizer:async()=>{calls++;return {text:'x'.repeat(50_000),partial:false};}});
 assert.equal(out.parseStatus,'PARTIAL');assert.equal(out.whyPartial,'EXTRACTION_CHAR_LIMIT');assert.equal(calls,20);assert.equal((await new OcrPageStore(root).progress('large'))?.completedPages,19);
});
test('a graceful OCR worker shutdown yields the job for automatic continuation',async()=>{
 const normalized=normalizeKnowledgeIndexConfig({parseMode:'ocr',ocrModelId:'vision'},8192);let started!:()=>void;const began=new Promise<void>(r=>{started=r;});const yields:any[]=[];const failed:any[]=[];
 const worker=new KnowledgeIngestionWorker({knowledgeIndexRevision:{findUniqueOrThrow:async()=>({id:'index',profileId:'profile',...normalized,revision:{originalName:'image.png',storageKey:'blob',document:{id:'doc',enabled:true,base:{enabled:true}}}})}} as never,{resolveForRequest:async()=>({id:'profile',maxInputTokens:8192,tokenizer:'cl100k_base'})} as never,{read:async()=>Buffer.from('image')} as never,{claim:async()=>({id:'job',indexRevisionId:'index',leaseToken:'token'}),setStage:async()=>{},heartbeat:async()=>{},releaseForRestart:async(...args:any[])=>yields.push(args),fail:async(...args:any[])=>failed.push(args)} as never,{} as never,undefined,{recognize:async(_n:any,_b:any,_m:any,signal:AbortSignal)=>new Promise((_r,reject)=>{started();signal.addEventListener('abort',()=>reject(new KnowledgeCoreError('RETRIEVAL_CANCELLED')),{once:true});})} as never);
 const running=worker.runOnce();await began;worker.stop();assert.equal(await running,true);assert.deepEqual(yields,[['job','token']]);assert.equal(failed.length,0);
});

test('PDF auto mode recognizes scanned pages in the same preparation and preserves native text and blank page positions',async()=>{
 const image=await sharp({create:{width:100,height:100,channels:3,background:'white'}}).composite([{input:await sharp({create:{width:40,height:40,channels:3,background:'black'}}).png().toBuffer(),left:20,top:20}]).png().toBuffer();let calls=0;
 const f=fakePdf(3);const pdf={...f.pdf,getText:async({partial}:any)=>({pages:[{num:partial[0],text:partial[0]===1?'Native section code 5531.':''}]}),getScreenshot:async({partial}:any)=>({pages:[{pageNumber:partial[0],width:100,height:100,data:partial[0]===2?image:await sharp({create:{width:100,height:100,channels:3,background:'white'}}).png().toBuffer()}]})};
 const out=await prepareKnowledgeDocument({...ocrInput(pdf),config:{...cfg,parseMode:'auto' as any},ocrRecognizer:async()=>{calls++;return {text:'Scanned section code 7733.',partial:false};}});
 assert.equal(out.parseStatus,'READY');assert.equal(out.resolvedConfig.parseMode,'auto');assert.equal(calls,1);assert.deepEqual(out.sections.map(s=>s.locator.page),[1,2]);assert.match(out.originalText,/5531/);assert.match(out.originalText,/7733/);assert.equal(out.usedOcr,true);
});
test('PDF auto mode extracts ordinary native text with no OCR provider and no rasterization',async()=>{
 const f=fakePdf(1);const out=await prepareKnowledgeDocument({...ocrInput({...f.pdf,getText:async()=>({pages:[{num:1,text:'Native PDF code 4242.'}]})} as any),config:{...cfg,parseMode:'auto' as any},ocrRecognizer:undefined,ocrAvailable:async()=>false});
 assert.equal(out.parseStatus,'READY');assert.match(out.originalText,/4242/);assert.equal(f.rendered(),0);assert.equal(out.usedOcr,false);
});

test('a disabled optional OCR route cannot block a pinned auto native-PDF configuration',async()=>{
 const {KnowledgeCoreService}=await import('../../src/knowledge-core/knowledge-core.service');let calls=0;const core=new KnowledgeCoreService({} as never,{} as never,{} as never,{} as never,{resolveModel:async()=>{calls++;throw new KnowledgeCoreError('OCR_UNAVAILABLE');}} as never);const config={parseMode:'auto' as const,ocrModelId:'disabled-model',ocrRouteHash:'a'.repeat(64),...cfg};assert.deepEqual(await core.resolveIndexConfiguration('native.pdf',config),config);assert.equal(calls,0);
});

test('automatic blank pages skip OCR but a real OCR failure remains visible',async()=>{
 const white=await sharp({create:{width:100,height:100,channels:3,background:'white'}}).png().toBuffer();const ink=await sharp(white).composite([{input:await sharp({create:{width:20,height:20,channels:3,background:'black'}}).png().toBuffer(),left:20,top:20}]).png().toBuffer();
 const pdf=(data:Buffer)=>({...fakePdf(1).pdf,getText:async()=>({pages:[{num:1,text:''}]}),getScreenshot:async()=>({pages:[{pageNumber:1,width:100,height:100,data}]})});
 const input={...ocrInput(pdf(white)),config:{...cfg,parseMode:'auto' as const}};
 const blank=await prepareKnowledgeDocument({...input,ocrRecognizer:async()=>{throw Error('blank must not call a model');}});assert.equal(blank.parseStatus,'DOWNLOAD_ONLY');assert.equal(blank.usedOcr,false);
 await assert.rejects(()=>prepareKnowledgeDocument({...input,pdfFactory:()=>pdf(ink),ocrRecognizer:async()=>{throw new KnowledgeCoreError('OCR_RECOGNITION_FAILED');}}),code('OCR_RECOGNITION_FAILED'));
});
test('automatic page methods survive batch recovery and preserve the used-OCR guard',async t=>{
 const root=await mkdtemp(join(tmpdir(),'auto-resume-'));t.after(()=>rm(root,{recursive:true,force:true}));const image=await sharp({create:{width:100,height:100,channels:3,background:'white'}}).composite([{input:await sharp({create:{width:20,height:20,channels:3,background:'black'}}).png().toBuffer(),left:20,top:20}]).png().toBuffer();
 const make=()=>({...fakePdf(7).pdf,getText:async({partial}:any)=>({pages:[{num:partial[0],text:partial[0]<=2?'Native text.':''}]}),getScreenshot:async({partial}:any)=>({pages:[{pageNumber:partial[0],width:100,height:100,data:image}]})});
 const input={...ocrInput(make()),config:{...cfg,parseMode:'auto' as const},pdfFactory:make};const run=()=>prepareKnowledgeDocument({...input,ocrWork:{indexId:'auto',store:new OcrPageStore(root)}});
 assert.equal((await run()).ocrPending,true);assert.equal((await new OcrPageStore(root).readPage('auto',1))?.method,'text');assert.equal((await new OcrPageStore(root).readPage('auto',3))?.method,'ocr');const complete=await run();assert.equal(complete.parseStatus,'READY');assert.equal(complete.usedOcr,true);assert.equal(complete.sections.at(-1)?.locator.page,7);
});
