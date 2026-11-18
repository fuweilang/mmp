import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVisionTranscription, normalizeOcrImages, supportsKnowledgeOcr, isKnowledgeImage } from '../../src/knowledge-core/vision-ocr';
import sharp from 'sharp';
const code=(expected:string)=>(e:any)=>e.code===expected;
test('OCR supports PDF and static raster formats, never arbitrary documents',()=>{
 for(const name of ['scan.PDF','photo.PNG','photo.jpg','photo.jpeg','photo.webp','photo.gif'])assert.equal(supportsKnowledgeOcr(name),true);
 for(const name of ['notes.md','report.docx','file.svg','scan.pdf.exe'])assert.equal(supportsKnowledgeOcr(name),false);
 assert.equal(isKnowledgeImage('scan.PDF'),false);
});
test('vision transcription requires valid complete structured output and does not guess unreadable content',()=>{
 const payload=(content:string,finish='stop')=>({choices:[{finish_reason:finish,message:{content}}]});
 assert.deepEqual(parseVisionTranscription(payload('{"status":"ok","text":"Code 4242","unreadable":[]}')),{text:'Code 4242',partial:false});
 assert.equal(parseVisionTranscription(payload('{"status":"ok","text":"[无法辨认] 4242","unreadable":[]}')).partial,true);
 assert.equal(parseVisionTranscription(payload('{"status":"partial","text":"Code","unreadable":["右下角"]}')).partial,true);
 assert.equal(parseVisionTranscription(payload('{"status":"empty","text":"","unreadable":[]}')).text,'');
 for(const value of ['{}','[]','null','{"status":"ok","text":"Code"}','{"status":"ok","text":"Code","unreadable":[4]}'])assert.throws(()=>parseVisionTranscription(payload(value)),code('OCR_INVALID_RESPONSE'));
 assert.throws(()=>parseVisionTranscription(payload('{"status":"ok","text":"truncated","unreadable":[]}', 'length')),code('OCR_OUTPUT_LIMIT'));
});
test('image validation decodes pixels, rejects broken/oversized input and tiles long images',async()=>{
 await assert.rejects(()=>normalizeOcrImages(Buffer.from('not an image')),code('OCR_INVALID_IMAGE'));
 await assert.rejects(()=>normalizeOcrImages(Buffer.alloc(8*1024*1024+1)),code('OCR_IMAGE_LIMIT'));
 const normal=await sharp({create:{width:100,height:100,channels:3,background:'white'}}).png().toBuffer();
 assert.equal((await normalizeOcrImages(normal)).length,1);
 const long=await sharp({create:{width:200,height:5000,channels:3,background:'white'}}).png().toBuffer();
 const tiles=await normalizeOcrImages(long);assert.ok(tiles.length>1);
 const metas=await Promise.all(tiles.map(b=>sharp(b).metadata()));assert.equal(metas.reduce((n,m)=>n+(m.height??0),0),5000);
 const aborted=new AbortController();aborted.abort();await assert.rejects(()=>normalizeOcrImages(normal,aborted.signal),code('RETRIEVAL_CANCELLED'));
});

import { KnowledgeOcrService } from '../../src/knowledge-core/vision-ocr';
import { encryptApiKey } from '../../src/llm/llm-key-crypto';
import axios from 'axios';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('server adapter uses configured vision routes, bounds requests, caches complete text and honors revocation',async t=>{
 const old={secret:process.env.LLM_API_KEY_SECRET,dir:process.env.KNOWLEDGE_CORE_DIR,model:process.env.KNOWLEDGE_OCR_MODEL};
 const dir=await mkdtemp(join(tmpdir(),'ocr-test-'));process.env.LLM_API_KEY_SECRET='unit-only-no-real-credential';process.env.KNOWLEDGE_CORE_DIR=dir;delete process.env.KNOWLEDGE_OCR_MODEL;
 t.after(async()=>{for(const [key,value] of Object.entries({LLM_API_KEY_SECRET:old.secret,KNOWLEDGE_CORE_DIR:old.dir,KNOWLEDGE_OCR_MODEL:old.model})){if(value===undefined)delete process.env[key];else process.env[key]=value;}await rm(dir,{recursive:true,force:true});});
 const provider={name:'test',kind:'openai_compatible',baseUrl:'https://example.invalid/v1',apiKeyEnc:encryptApiKey('unit-only-dummy')};
 const vision={id:'vision-1',modelId:'unit-vision',meta:{supportsVision:true},providerId:'provider',provider};
 let rows:any[]=[{...vision,id:'text-1',meta:{supportsVision:false}},vision];
 const service=new KnowledgeOcrService({llmModel:{findMany:async(q:any)=>rows.filter(r=>!q.where.id||q.where.id===r.id)}} as any);
 assert.equal((await service.resolveModel()).id,'vision-1');
 const image=await sharp({create:{width:100,height:100,channels:3,background:'white'}}).png().toBuffer();let calls=0;
 const post=t.mock.method(axios,'post',async(url:string,body:any,options:any)=>{calls++;assert.equal(url,'https://example.invalid/v1/chat/completions');assert.equal(body.stream,false);assert.equal(options.maxRedirects,0);assert.equal(options.timeout,90000);assert.ok(body.messages[1].content[1].image_url.url.startsWith('data:image/png;base64,'));assert.ok(!JSON.stringify(body).includes('private-filename'));return {status:200,data:{choices:[{finish_reason:'stop',message:{content:'{"status":"ok","text":"Code 4242","unreadable":[]}'}}]}};});
 assert.equal((await service.recognize('private-filename.png',image,vision.id)).text,'Code 4242');
 assert.equal((await service.recognize('another-name.png',image,vision.id)).text,'Code 4242');assert.equal(calls,1);
 rows=[];await assert.rejects(()=>service.recognize('a.png',image,vision.id),code('OCR_UNAVAILABLE'));rows=[vision];
 const aborted=new AbortController();aborted.abort();await assert.rejects(()=>service.recognize('a.png',image,vision.id,aborted.signal),code('RETRIEVAL_CANCELLED'));
 const different=await sharp(image).resize(110,110).png().toBuffer();
 post.mock.mockImplementation(async()=>({status:200,data:{choices:[{finish_reason:'length',message:{content:'bad'}}]}}));
 await assert.rejects(()=>service.recognize('a.png',different,vision.id),code('OCR_OUTPUT_LIMIT'));
 post.mock.mockImplementation(async()=>{throw new Error('private url and headers');});
 await assert.rejects(()=>service.recognize('a.png',different,vision.id),e=>(e as any).code==='OCR_RECOGNITION_FAILED'&&!String(e).includes('private'));
});


test('long image OCR skips blank tiles without dropping later text and checks pinned routes',async()=>{
 const service=new KnowledgeOcrService({} as any);
 const route={id:'model',revision:'a'.repeat(64)};
 (service as any).resolveModel=async()=>route;
 const parts=[{text:'',partial:false},{text:'TAIL4242',partial:false},{text:'',partial:false},{text:'end',partial:false},{text:'',partial:false}];let calls=0;
 (service as any).transcribe=async()=>parts[calls++];
 const long=await sharp({create:{width:200,height:5000,channels:3,background:'white'}}).png().toBuffer();
 assert.deepEqual(await service.recognize('long.png',long,'model',undefined,route.revision),{text:'TAIL4242\nend',partial:false});assert.equal(calls,5);
 await assert.rejects(()=>service.recognize('long.png',long,'model',undefined,'b'.repeat(64)),code('OCR_CONFIGURATION_CHANGED'));
});

test('a key rotation uses the freshly validated credential for each request',async t=>{
 const oldDir=process.env.KNOWLEDGE_CORE_DIR,dir=await mkdtemp(join(tmpdir(),'ocr-rotate-'));process.env.KNOWLEDGE_CORE_DIR=dir;
 t.after(async()=>{if(oldDir===undefined)delete process.env.KNOWLEDGE_CORE_DIR;else process.env.KNOWLEDGE_CORE_DIR=oldDir;await rm(dir,{recursive:true,force:true});});
 const service=new KnowledgeOcrService({} as any),route={id:'rotate',revision:'a'.repeat(64),model:'unit',baseUrl:'https://example.invalid/v1',apiKey:'stale-unit-key'};
 (service as any).resolveModel=async()=>({...route,apiKey:'fresh-unit-key'});
 t.mock.method(axios,'post',async(_url:any,_body:any,options:any)=>{assert.equal(options.headers.Authorization,'Bearer fresh-unit-key');return {status:200,data:{choices:[{finish_reason:'stop',message:{content:'{"status":"ok","text":"Rotated 4242","unreadable":[]}'}}]}};});
 const image=await sharp({create:{width:100,height:100,channels:3,background:'white'}}).png().toBuffer();
 assert.equal((await (service as any).transcribe(image,route)).text,'Rotated 4242');
});

test('an unreadable image with no recognized text remains partial rather than empty',()=>{
 assert.deepEqual(parseVisionTranscription({choices:[{finish_reason:'stop',message:{content:'{"status":"partial","text":"","unreadable":["文字模糊"]}'}}]}),{text:'',partial:true});
});
