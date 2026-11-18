import {createHash,randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {mkdir,open,link,unlink,readdir} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {KnowledgeCoreError} from './errors';
import type {OcrTranscription} from './vision-ocr';
export const OCR_BATCH_SIZE=5, OCR_PREVIEW_PAGES=3, MAX_OCR_PAGES=2000;
export interface OcrPageResult extends OcrTranscription {method?:'text'|'ocr'|'blank'}
interface OcrMeta {identity:string;totalPages:number}
export interface OcrProgress {totalPages:number;completedPages:number;nextPage:number|null;batchSize:number}
/** Private immutable per-page checkpoints, shared by API and workers alongside original blobs. */
export class OcrPageStore {
 constructor(private readonly directory?:string){}
 private path(indexId:string){
  if(!/^[a-zA-Z0-9_-]{1,128}$/.test(indexId))throw new KnowledgeCoreError('OCR_CHECKPOINT_MISMATCH');
  const root=this.directory||join(resolve(process.env.KNOWLEDGE_CORE_DIR||join(process.env.UPLOAD_DIR||join(process.cwd(),'uploads'),'knowledge-core','blobs')),'ocr-progress');
  return join(root,createHash('sha256').update(indexId).digest('hex'));
 }
 private async read(path:string){
  let fd;
  try{fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);const stat=await fd.stat();if(!stat.isFile()||stat.size>8*1024*1024)throw Error();return JSON.parse(await fd.readFile('utf8'));}
  catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw new KnowledgeCoreError('OCR_CHECKPOINT_UNAVAILABLE');}
  finally{await fd?.close();}
 }
 private async publish(path:string,value:unknown){
  const temporary=path+'.'+randomUUID();
  try{const fd=await open(temporary,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);try{await fd.writeFile(JSON.stringify(value));await fd.sync();}finally{await fd.close();}try{await link(temporary,path);}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}const parent=await open(dirname(path),constants.O_RDONLY);try{await parent.sync();}finally{await parent.close();}}
  catch(e){if(e instanceof KnowledgeCoreError)throw e;throw new KnowledgeCoreError('OCR_CHECKPOINT_UNAVAILABLE');}
  finally{await unlink(temporary).catch(()=>{});}
 }
 private validateMeta(value:any):OcrMeta|undefined{
  if(value===undefined)return undefined;
  if(!/^[0-9a-f]{64}$/.test(value?.identity)||!Number.isSafeInteger(value?.totalPages)||value.totalPages<1||value.totalPages>MAX_OCR_PAGES)throw new KnowledgeCoreError('OCR_CHECKPOINT_MISMATCH');return {identity:value.identity,totalPages:value.totalPages};
 }
 async initialize(indexId:string,meta:OcrMeta){
  this.validateMeta(meta);const dir=this.path(indexId);await mkdir(dir,{recursive:true,mode:0o700});await this.publish(join(dir,'meta.json'),meta);
  const saved=this.validateMeta(await this.read(join(dir,'meta.json')));if(saved?.identity!==meta.identity||saved?.totalPages!==meta.totalPages)throw new KnowledgeCoreError('OCR_CHECKPOINT_MISMATCH');
 }
 async readPage(indexId:string,page:number):Promise<OcrPageResult|undefined>{
  if(!Number.isSafeInteger(page)||page<1||page>MAX_OCR_PAGES)throw new KnowledgeCoreError('OCR_CHECKPOINT_MISMATCH');
  const value=await this.read(join(this.path(indexId),`${page}.json`));if(value===undefined)return undefined;
  if(value.page!==page||typeof value.text!=='string'||value.text.length>(value.method==='text'?1_000_000:50_000)||value.partial!==false)throw new KnowledgeCoreError('OCR_CHECKPOINT_MISMATCH');if(value.method!==undefined&&!['text','ocr','blank'].includes(value.method))throw new KnowledgeCoreError('OCR_CHECKPOINT_MISMATCH');return {text:value.text,partial:false,...(value.method?{method:value.method}:{} )};
 }
 async writePage(indexId:string,page:number,result:OcrPageResult){
  const meta=this.validateMeta(await this.read(join(this.path(indexId),'meta.json')));
  if(!meta||!Number.isSafeInteger(page)||page<1||page>meta.totalPages||result.partial||typeof result.text!=='string'||result.text.length>(result.method==='text'?1_000_000:50_000))throw new KnowledgeCoreError('OCR_CHECKPOINT_MISMATCH');
  await this.publish(join(this.path(indexId),`${page}.json`),{page,text:result.text,partial:false,...(result.method?{method:result.method}:{})});
  const saved=await this.readPage(indexId,page);if(!saved)throw new KnowledgeCoreError('OCR_CHECKPOINT_MISMATCH');return saved;
 }
 async progress(indexId:string):Promise<OcrProgress|undefined>{
  const meta=this.validateMeta(await this.read(join(this.path(indexId),'meta.json')));if(!meta)return undefined;
  const files=await readdir(this.path(indexId));const pages=new Set(files.filter(f=>/^\d+\.json$/.test(f)).map(f=>Number(f.slice(0,-5))).filter(n=>n>=1&&n<=meta.totalPages));
  let nextPage:number|null=null;for(let n=1;n<=meta.totalPages;n++)if(!pages.has(n)){nextPage=n;break;}
  return {totalPages:meta.totalPages,completedPages:pages.size,nextPage,batchSize:OCR_BATCH_SIZE};
 }
}
