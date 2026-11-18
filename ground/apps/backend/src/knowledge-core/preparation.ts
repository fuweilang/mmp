import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { PDFParse } from 'pdf-parse';
import { parseKnowledgeBytes, knowledgeUploadLimit, type KnowledgeParseResult } from './parser';
import { chunkSections } from './chunking';
import { createTokenCounter } from './tokenizer';
import { KnowledgeCoreError } from './errors';
import type { KnowledgeChunkInput, TextSection } from './types';
import { normalizeKnowledgeIndexConfig, type KnowledgeIndexConfiguration } from './index-config';
import { isKnowledgeImage, supportsKnowledgeOcr, type OcrTranscription } from './vision-ocr';

import { OcrPageStore, OCR_BATCH_SIZE, OCR_PREVIEW_PAGES, MAX_OCR_PAGES, type OcrPageResult } from './ocr-progress';

export type KnowledgeParseMode = 'text' | 'ocr' | 'auto';
export interface PreparationResult {
  usedOcr?:boolean; ocrPending?: boolean; ocrSample?: {totalPages:number;sampledPages:number};
  parseStatus: KnowledgeParseResult['status']; failureReason?: string; whyPartial?: string;
  originalText: string; totalOriginalChars: number; sections: TextSection[];
  chunks: KnowledgeChunkInput[]; totalChunkTokens: number; truncated: boolean;
  resolvedConfig: { parseMode: KnowledgeParseMode; targetTokens: number; maxTokens: number; overlapTokens: number };
}
interface PdfPageInfo { pageNumber: number; width: number; height: number }
export interface PreparationPdf {
  getInfo(options?: { partial?: number[]; parsePageInfo?: boolean }): Promise<{ total: number; pages?: PdfPageInfo[] }>;
  getScreenshot(options: { partial: number[]; imageBuffer: boolean; imageDataUrl: boolean; scale: number }): Promise<{ pages: Array<PdfPageInfo & { data: Uint8Array }> }>;
  getText?(options:{partial:number[]}):Promise<{pages:Array<{num:number;text:string}>}>;
  destroy(): Promise<void>;
}
export interface PreparationInput {
  name: string; bytes: Buffer; tokenizer: 'cl100k_base' | 'o200k_base'; maxInputTokens: number;
  config?: KnowledgeIndexConfiguration; signal?: AbortSignal;
  ocrPreview?: boolean;
  ocrWork?: {indexId:string;store:OcrPageStore;batchSize?:number};
  /** Internal test adapters; HTTP callers cannot supply these. */
  ocrAvailable?: () => Promise<boolean>;
  ocrRecognizer?: (name: string, bytes: Buffer, signal?: AbortSignal) => Promise<string | OcrTranscription>;
  pdfFactory?: (bytes: Buffer) => PreparationPdf;
}
let activeOcr = 0;
const MAX_RENDER_PIXELS = 16_000_000;
type OcrParseResult = KnowledgeParseResult & {usedOcr?:boolean;ocrPending?:boolean;ocrSample?:{totalPages:number;sampledPages:number}};
function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new KnowledgeCoreError('RETRIEVAL_CANCELLED');
}
function failure(status: KnowledgeParseResult['status'], reason: string, sections: TextSection[] = []): KnowledgeParseResult {
  return { status, reason, sections, truncated: status === 'PARTIAL' };
}
function pixelCount(width: number, height: number, scale: number) {
  const w = Math.ceil(width * scale), h = Math.ceil(height * scale), pixels = w * h;
  if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w < 1 || h < 1 || !Number.isSafeInteger(pixels) || pixels > MAX_RENDER_PIXELS)
    throw new KnowledgeCoreError('OCR_RENDER_LIMIT');
  return pixels;
}
async function parseWithOcr(input: PreparationInput): Promise<OcrParseResult> {
  if (!supportsKnowledgeOcr(input.name)) throw new KnowledgeCoreError('OCR_UNSUPPORTED_FORMAT');
  const automatic=input.config?.parseMode==='auto';
  if (!automatic && (!input.ocrRecognizer || (input.ocrAvailable && !await input.ocrAvailable()))) throw new KnowledgeCoreError('OCR_UNAVAILABLE');
  checkAbort(input.signal);
  if (activeOcr) throw new KnowledgeCoreError('OCR_BUSY');
  if (!isKnowledgeImage(input.name) && input.bytes.subarray(0, 5).toString('latin1') !== '%PDF-') return failure('FAILED', 'PDF_RENDER_FAILED');
  activeOcr++;
  let pdf: PreparationPdf | undefined;
  const budgetMs = input.ocrWork ? 120_000 : 300_000;
  const deadline = Date.now() + budgetMs;
  const signal = AbortSignal.any([...(input.signal ? [input.signal] : []), AbortSignal.timeout(budgetMs)]);
  let savedInBatch=0;
  try {
    if (isKnowledgeImage(input.name)) {
      const value = await input.ocrRecognizer!(input.name, input.bytes, signal);
      const part = typeof value === 'string' ? {text:value,partial:false} : value;
      const text = part.text.replace(/\r\n?/g,'\n').replace(/\0/g,'').trim();
      checkAbort(input.signal);
      const sections = text ? [{text,sourceOffset:0,locator:{page:1}}] : [];
      return part.partial ? failure('PARTIAL','OCR_PARTIAL',sections) : text ? {status:'READY',sections,truncated:false} : failure('DOWNLOAD_ONLY','OCR_NO_TEXT');
    }
    pdf = input.pdfFactory?.(input.bytes) ?? new PDFParse({ data: new Uint8Array(input.bytes) });
    const info = await pdf.getInfo();
    if (!Number.isSafeInteger(info.total) || info.total < 1) return failure('FAILED', 'PDF_RENDER_FAILED');
    if (info.total > MAX_OCR_PAGES) return failure('PARTIAL', 'OCR_PAGE_LIMIT');
    const work=input.ocrWork;
    const sample=input.ocrPreview && info.total>OCR_PREVIEW_PAGES ? {totalPages:info.total,sampledPages:OCR_PREVIEW_PAGES} : undefined;
    const lastPage=sample?.sampledPages??info.total;
    let usedOcr=!automatic;
    const result=(status:KnowledgeParseResult['status'],sections:TextSection[],reason?:string):OcrParseResult=>({status,sections,usedOcr,truncated:status==='PARTIAL',...(reason?{reason}:{}),...(sample?{ocrSample:sample}:{})});
    if(work)await work.store.initialize(work.indexId,{identity:createHash('sha256').update(input.bytes).update(normalizeKnowledgeIndexConfig(input.config,input.maxInputTokens).indexConfigHash).digest('hex'),totalPages:info.total});
    const sections:TextSection[]=[];
    const pageValues=new Map<number,OcrPageResult>();
    let totalCharacters=0,nonemptyPages=0;
    const accept=(part:OcrTranscription)=>{if(part.text){totalCharacters+=part.text.length+(nonemptyPages?2:0);nonemptyPages++;}return totalCharacters<=1_000_000;};
    for(let n=1;n<=lastPage;n++){
      checkAbort(input.signal);
      if(work){const saved=await work.store.readPage(work.indexId,n);if(saved){usedOcr ||= saved.method==='ocr';if(!accept(saved))return result('PARTIAL',[],'EXTRACTION_CHAR_LIMIT');pageValues.set(n,saved);continue;}}
      if(work&&savedInBatch>=(work.batchSize??OCR_BATCH_SIZE))return {...result('PARTIAL',[],'OCR_BATCH_PENDING'),ocrPending:true};
      if(Date.now()>deadline)return work&&savedInBatch>0?{...result('PARTIAL',[],'OCR_BATCH_PENDING'),ocrPending:true}:result('PARTIAL',sections,'OCR_TIMEOUT');
      let part:OcrPageResult|undefined;
      if(automatic){
        if(!pdf.getText)throw new KnowledgeCoreError('PDF_RENDER_FAILED');
        const native=(await pdf.getText({partial:[n]})).pages.find(page=>page.num===n)?.text.replace(/\r\n?/g,'\n').replace(/\0/g,'').trim()||'';
        if(native)part={text:native,partial:false,method:'text'};
      }
      let value:string|OcrTranscription|undefined;
      if(!part){
        const dimensions=(await pdf.getInfo({partial:[n],parsePageInfo:true})).pages?.find(page=>page.pageNumber===n);
        if(!dimensions)return result('PARTIAL',sections,'OCR_PAGE_MISSING');
        pixelCount(dimensions.width,dimensions.height,1.5);
        const page=(await pdf.getScreenshot({partial:[n],imageBuffer:true,imageDataUrl:false,scale:1.5})).pages.find(row=>row.pageNumber===n);
        if(!page?.data?.byteLength)return result('PARTIAL',sections,'OCR_PAGE_MISSING');
        pixelCount(page.width,page.height,1);
        if(page.data.byteLength>16*1024*1024)throw new KnowledgeCoreError('OCR_RENDER_LIMIT');
        checkAbort(input.signal);
        if(automatic){
          const stats=await sharp(Buffer.from(page.data),{limitInputPixels:MAX_RENDER_PIXELS}).flatten({background:'white'}).stats();
          if(!stats.channels.slice(0,3).some(channel=>channel.max>channel.min))part={text:'',partial:false,method:'blank'};
        }
        if(!part){
          if(!input.ocrRecognizer || (input.ocrAvailable&&!await input.ocrAvailable()))throw new KnowledgeCoreError('OCR_UNAVAILABLE');
          value=await input.ocrRecognizer(`page-${n}.png`,Buffer.from(page.data),signal);
          part={...(typeof value==='string'?{text:value,partial:false}:value),method:'ocr'};usedOcr=true;
        }
      }
      const text=part.text.replace(/\r\n?/g,'\n').replace(/\0/g,'').trim();
      checkAbort(input.signal);
      if(part.partial)return result('PARTIAL',[{text,sourceOffset:0,locator:{page:n}}],'OCR_PARTIAL');
      if(!text&&typeof value==='string')return result(n>1?'PARTIAL':'DOWNLOAD_ONLY',sections,'OCR_PAGE_EMPTY');
      let complete:OcrPageResult={text,partial:false,...(automatic?{method:part.method}:{})};
      if(totalCharacters+text.length+(text&&nonemptyPages?2:0)>1_000_000)return result('PARTIAL',[],'EXTRACTION_CHAR_LIMIT');
      if(work){complete=await work.store.writePage(work.indexId,n,complete);savedInBatch++;}
      if(!accept(complete))return result('PARTIAL',[],'EXTRACTION_CHAR_LIMIT');
      pageValues.set(n,complete);
    }
    let sourceOffset=0;
    for(let n=1;n<=lastPage;n++){
      const value=pageValues.get(n);if(!value)throw new KnowledgeCoreError('OCR_CHECKPOINT_MISMATCH');
      if(!value.text)continue;
      const text=(sections.length?'\n\n':'')+value.text;
      if(sourceOffset+text.length>1_000_000)return result('PARTIAL',sections,'EXTRACTION_CHAR_LIMIT');
      sections.push({text,sourceOffset,locator:{page:n}});sourceOffset+=text.length;
    }
    return result(sections.length?'READY':'DOWNLOAD_ONLY',sections,sections.length?undefined:'OCR_NO_TEXT');
  } catch (error) {
    checkAbort(input.signal);
    if (signal.aborted && !input.signal?.aborted) {
      if(input.ocrWork&&savedInBatch>0)return {...failure('PARTIAL','OCR_BATCH_PENDING'),ocrPending:true};
      throw new KnowledgeCoreError('OCR_TIMEOUT',true);
    }
    if (error instanceof KnowledgeCoreError) throw error;
    return failure('FAILED', 'OCR_RECOGNITION_FAILED');
  } finally {
    try { await pdf?.destroy(); } catch { /* cleanup must not expose implementation details */ }
    activeOcr--;
  }
}
export async function prepareKnowledgeDocument(input: PreparationInput): Promise<PreparationResult> {
  checkAbort(input.signal);
  const selectedConfig = isKnowledgeImage(input.name) && input.config?.parseMode === undefined ? {...input.config,parseMode:'ocr' as const} : input.config;
  const normalized = normalizeKnowledgeIndexConfig(selectedConfig, input.maxInputTokens);
  const resolvedConfig = { parseMode: selectedConfig?.parseMode ?? 'text', ...normalized.chunkerConfig };
  const parsed:OcrParseResult = !input.bytes.length || input.bytes.length > knowledgeUploadLimit(input.name)
    ? failure('FAILED', 'UPLOAD_SIZE_LIMIT')
    : resolvedConfig.parseMode !== 'text' ? await parseWithOcr(input) : await parseKnowledgeBytes(input.name, input.bytes);
  checkAbort(input.signal);
  const text = parsed.sections.map(section => section.text).join('');
  const result: PreparationResult = {
    ...(parsed.usedOcr!==undefined?{usedOcr:parsed.usedOcr}:{}),...(parsed.ocrPending?{ocrPending:true}:{}),...(parsed.ocrSample?{ocrSample:parsed.ocrSample}:{}),
    parseStatus: parsed.status, failureReason: parsed.reason,
    whyPartial: parsed.status === 'PARTIAL' ? parsed.reason : undefined,
    originalText: text, totalOriginalChars: text.length, sections: parsed.sections,
    chunks: [], totalChunkTokens: 0, truncated: parsed.truncated, resolvedConfig,
  };
  if (parsed.status !== 'READY') return result;
  try { result.chunks = chunkSections(parsed.sections, { tokenCounter: createTokenCounter(input.tokenizer), ...normalized.chunkerConfig }); }
  catch { throw new KnowledgeCoreError('DOCUMENT_CHUNK_LIMIT'); }
  result.totalChunkTokens = result.chunks.reduce((sum, row) => sum + row.tokenCount, 0);
  if (!result.chunks.length || result.chunks.length > 10000 || result.totalChunkTokens > 500000) {
    result.parseStatus = 'PARTIAL'; result.truncated = true; result.whyPartial = 'EXTRACTION_TOKEN_LIMIT';
  }
  return result;
}
export function createPreparationPreviewKey(input: {
  documentId: string; revisionId: string; contentHash: string; profileId: string;
  tokenizer: 'cl100k_base' | 'o200k_base'; capacityTokens: number;
  config: { parseMode: KnowledgeParseMode; ocrModelId?:string; ocrRouteHash?:string; targetTokens: number; maxTokens: number; overlapTokens: number };
}) {
  return createHash('sha256').update(JSON.stringify([
    input.documentId, input.revisionId, input.contentHash, input.profileId, input.tokenizer, input.capacityTokens,
    input.config.parseMode, ...(input.config.ocrModelId ? [input.config.ocrModelId] : []), ...(input.config.ocrRouteHash ? [input.config.ocrRouteHash] : []), input.config.targetTokens, input.config.maxTokens, input.config.overlapTokens,
  ])).digest('hex');
}
