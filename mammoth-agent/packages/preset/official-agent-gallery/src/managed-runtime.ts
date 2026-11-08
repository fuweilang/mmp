/** Native-loop managed document profile: no arbitrary path, process or network capability. */
import {createHash} from 'node:crypto'
import {z} from 'zod'
import type {Context} from '@mammoth-ai/cordis'
import type {Agent} from '@mammoth-ai/mmp-agent'
import type {GenerateOptions} from '@mammoth-ai/mmp-llm'
import type {} from '@mammoth-ai/mmp-attachment'
import type {FileAttachmentRef} from '@mammoth-ai/mmp-attachment'
import type {Session} from '@mammoth-ai/mmp-session'
import type {ProjectionDefinition} from '@mammoth-ai/mmp-session-projection'
export const sha=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex')
export const pinSchema=z.object({id:z.string(),key:z.string(),revision:z.number().int().positive(),hash:z.string().regex(/^[a-f0-9]{64}$/)}).strict()
export const compositionSchema=z.object({version:z.literal(3),profile:z.literal('managed-documents'),preset:z.literal('standard'),selected:pinSchema.nullable()}).strict()
export type ManagedComposition=z.infer<typeof compositionSchema>
export interface GalleryReceipt {compositionHash?:string;skillKey?:string;revision?:number;boundary?:'native'|'wire';eventId:string;attemptId:string;phase:string;turn:number;step:number;generation:number;requestHash?:string;skillHash?:string;actionId?:string;reason?:string}
export interface GalleryArtifact {id:string;callId:string;file:FileAttachmentRef;hash:string;hostInstance:string;cancelled:boolean}
declare module '@mammoth-ai/mmp-session/types' {interface SessionEventMap {
 /** Freezes the standard managed-document capability profile and optional exact skill revision/hash; required on restore, never ignorable. */
 'official-gallery/composition':ManagedComposition
 /** Records a real preparation, context, action or terminal boundary for an attempt; does not claim model compliance or independent skill execution. */
 'official-gallery/receipt':GalleryReceipt
 /** Records a committed managed attachment with ownership, content hash and cancellation outcome for verified downloads and immutable action replay. */
 'official-gallery/artifact':GalleryArtifact
}}
const runtimeState=z.object({compositionHash:z.string().nullable().default(null),phase:z.string(),attemptId:z.string(),turn:z.number(),generation:z.number(),loaded:z.boolean(),artifactCount:z.number(),lastArtifact:z.object({id:z.string(),name:z.string()}).nullable()}).strict()
export type ManagedView=z.infer<typeof runtimeState>
export const managedRuntimeProjection={key:'officialGalleryRuntime',stateSchema:runtimeState,stateVersion:2,
 init:():ManagedView=>({compositionHash:null,phase:'bound',attemptId:'',turn:0,generation:0,loaded:false,artifactCount:0,lastArtifact:null}),
 apply:(state:ManagedView,event:Parameters<ProjectionDefinition<'officialGalleryRuntime',ManagedView>['apply']>[1]):ManagedView=>{
  if(event.type==='official-gallery/attempt-start')return {...state,compositionHash:event.data.compositionHash,phase:'preparing',attemptId:event.data.requestId,turn:event.data.turn,loaded:false}
  if(event.type==='official-gallery/artifact')return {...state,artifactCount:state.artifactCount+1,lastArtifact:{id:event.data.id,name:event.data.file.name}}
  if(event.type==='official-gallery/receipt'){
   const r=event.data;if(r.turn<state.turn)return state
   if(r.turn===state.turn&&state.compositionHash!==null&&(r.compositionHash!==state.compositionHash||r.attemptId!==state.attemptId))return state
   if(r.attemptId===state.attemptId&&['cancelled','failed','completed'].includes(state.phase))return state
   return {...state,phase:r.phase,attemptId:r.attemptId,turn:r.turn,generation:r.generation,loaded:r.phase==='preparing'?false:r.phase==='context_loaded'||r.phase==='running'||state.loaded}
  }
  if(event.type==='turn/end'&&event.data.turn===state.turn&&!['cancelled','failed','completed'].includes(state.phase))return {...state,phase:event.data.reason.kind==='aborted'?'cancelled':event.data.reason.kind==='completed'?'completed':'failed'}
  return state
 },wire:{viewSchema:runtimeState,view:(state:ManagedView)=>state}} satisfies ProjectionDefinition<'officialGalleryRuntime',ManagedView>
export function compositionOf(session:Session):ManagedComposition|null {
 const event=session.snapshotEvents().find(e=>e.type==='official-gallery/composition');if(!event)return null
 return compositionSchema.parse(event.data)
}
export function verifyFinalRequest(request:GenerateOptions,body:string|undefined,contextWindow:number|undefined):string {
 request.signal?.throwIfAborted()
 if(request.provider!=='mammoth-ground')throw new Error('GALLERY_MODEL_POLICY: only Admin-resolved cloud provider is available')
 if(body){
  const latest=request.messages.filter(m=>m.role==='system').slice(-1)[0]
  const systemText=latest?.content.flatMap(p=>p.type==='text'?[p.text]:[]).join('')??''
  if(!systemText.includes(body))throw new Error('GALLERY_CONTEXT_MISSING: required frozen skill was lost or truncated')
 }
 const inputBytes=Buffer.byteLength(JSON.stringify(request.messages)+JSON.stringify(request.tools??[])+(request.system??''),'utf8')
 const reserve=request.maxTokens??4096
 if(!contextWindow||!Number.isFinite(contextWindow)||inputBytes+reserve>contextWindow)throw new Error('GALLERY_CONTEXT_BUDGET: model context metadata unavailable or conservative byte-token budget exceeded; reduce input')
 return sha(JSON.stringify({provider:request.provider,model:request.model,messages:request.messages,tools:request.tools??[]}))
}
/** Exact serialized post-budget OpenAI body, not an earlier prompt assembly. */
export function verifyWireRequest(body:string,required:string|undefined,allowedNames:readonly string[]=['skill','read_skill_reference','read_uploaded_text','create_document']):string {
 const request=z.object({messages:z.array(z.object({role:z.string(),content:z.unknown()}).passthrough()),tools:z.array(z.object({function:z.object({name:z.string()}).passthrough()}).passthrough()).optional()}).passthrough().parse(JSON.parse(body))
 const last=request.messages.filter(m=>m.role==='system').slice(-1)[0]
 const content=last?.content
 const text=typeof content==='string'?content:Array.isArray(content)?content.map(v=>{const p=object(v);return p.type==='text'&&typeof p.text==='string'?p.text:''}).join(''):''
 if(required&&!text.includes(required))throw new Error('GALLERY_WIRE_CONTEXT_MISSING: post-budget body lost required method')
 const allowed=new Set(allowedNames)
 if(request.tools?.some(t=>!allowed.has(t.function.name)))throw new Error('GALLERY_WIRE_TOOL_POLICY')
 return sha(body)
}
function object(v:unknown):Record<string,unknown>{return v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{}}
export function ownedFiles(session:Session):FileAttachmentRef[]{
 const files:FileAttachmentRef[]=[]
 for(const e of session.snapshotEvents()){
  if(e.type==='official-gallery/artifact'){files.push(e.data.file);continue}
  if(e.type!=='user/message'||e.data.source.kind!=='user')continue
  for(const part of e.data.content){const r=object(part);if(r.type==='file')files.push(r.attachment as FileAttachmentRef)}
 }
 return files
}
export class ManagedDocuments {
 constructor(readonly ctx:Context,readonly agent:Agent,readonly authorize:(signal?:AbortSignal)=>Promise<void>,readonly hostInstance:string){}
 async verifiedBytes(file:FileAttachmentRef,signal?:AbortSignal):Promise<Uint8Array>{
  await this.authorize(signal);signal?.throwIfAborted()
  if(!ownedFiles(this.agent.session).some(f=>f.attachmentId===file.attachmentId&&f.name===file.name&&f.bytes===file.bytes))throw new Error('GALLERY_OBJECT_SCOPE: foreign or unadmitted attachment')
  if(file.bytes>1048576)throw new Error('GALLERY_OBJECT_LIMIT: maximum 1MiB for managed text/download')
  const parts:Uint8Array[]=[];let total=0
  for await(const bytes of this.ctx.attachments.readFileStream(file,signal)){signal?.throwIfAborted();total+=bytes.length;if(total>1048576)throw new Error('GALLERY_OBJECT_LIMIT');parts.push(bytes)}
  const value=Buffer.concat(parts);if(value.length!==file.bytes||`sha256:${sha(value)}`!==file.attachmentId)throw new Error('GALLERY_OBJECT_INTEGRITY')
  return value
 }
 async download(id:string):Promise<{name:string;data:string;sha256:string}>{
  const event=this.agent.session.snapshotEvents().find(e=>e.type==='official-gallery/artifact'&&e.data.id===id)
  if(event?.type!=='official-gallery/artifact')throw new Error('GALLERY_OBJECT_SCOPE')
  const bytes=await this.verifiedBytes(event.data.file);return {name:event.data.file.name,data:Buffer.from(bytes).toString('base64'),sha256:sha(bytes)}
 }
}
