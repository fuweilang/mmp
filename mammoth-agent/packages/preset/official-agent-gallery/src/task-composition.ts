/** Versioned per-message composition: mutable draft references never become runtime authority. */
import type { Agent } from '@mammoth-ai/mmp-agent'
import type { UserMessage } from '@mammoth-ai/mmp-llm'
import type { Session } from '@mammoth-ai/mmp-session'
import { createHash } from 'node:crypto'
import type { OfficialAgentBinding, OfficialSkillBinding } from './types.ts'
export interface CatalogSelection {
 readonly protocol:1; readonly selectionVersion:number
 readonly expertRef:{readonly id:string;readonly versionId:string}|null
 readonly skillRef:{readonly id:string;readonly revision:number}|null
}
export interface CatalogAttempt {
 readonly protocol:1; readonly requestId:string; readonly messageId:string
 readonly authScope:{readonly userId:string;readonly scope:string}
 readonly selection:CatalogSelection; readonly selectionHash:string; readonly inputHash:string; readonly compositionHash:string
 readonly expert:OfficialAgentBinding|null; readonly skill:OfficialSkillBinding|null; readonly skillHash:string|null
}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('TASK_SELECTION_INVALID');return value as Record<string,unknown>}
function id(value:unknown):string{if(typeof value!=='string'||!value||value.length>256)throw Error('TASK_SELECTION_INVALID_REF');return value}
export function parseSelection(raw:unknown):CatalogSelection{
 const v=object(raw)
 if(v.protocol!==1||!Number.isSafeInteger(v.selectionVersion)||Number(v.selectionVersion)<0||!Object.prototype.hasOwnProperty.call(v,'expertRef')||!Object.prototype.hasOwnProperty.call(v,'skillRef'))throw Error('TASK_SELECTION_INCOMPLETE')
 const expert=v.expertRef===null?null:object(v.expertRef),skill=v.skillRef===null?null:object(v.skillRef)
 if(skill&&(!Number.isSafeInteger(skill.revision)||Number(skill.revision)<1))throw Error('TASK_SELECTION_INVALID_REVISION')
 return {protocol:1,selectionVersion:Number(v.selectionVersion),expertRef:expert?{id:id(expert.id),versionId:id(expert.versionId)}:null,skillRef:skill?{id:id(skill.id),revision:Number(skill.revision)}:null}
}
export const catalogHash=(v:unknown):string=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
export function attemptForMessage(session:Session,messageId:string):CatalogAttempt|undefined{
 const event=session.snapshotEvents().findLast(event=>event.type==='official-gallery/attempt'&&event.data.messageId===messageId)
 return event?.type==='official-gallery/attempt'?validateAttempt(event.data):undefined
}
export function attemptForRequest(session:Session,requestId:string):CatalogAttempt|undefined{
 const event=session.snapshotEvents().findLast(event=>event.type==='official-gallery/attempt'&&event.data.requestId===requestId)
 return event?.type==='official-gallery/attempt'?validateAttempt(event.data):undefined
}
declare module '@mammoth-ai/cordis' { interface Events { 'task/prepare-prompt'(agent:Agent,request:unknown,message?:UserMessage):Promise<'handled'|undefined> } }
declare module '@mammoth-ai/mmp-session/types' { interface SessionEventMap {
 /** Frozen authorized role/method revision for one accepted user-message attempt. Required, not ignorable. */
 'official-gallery/attempt':CatalogAttempt
 /** A claimed user message pins one frozen composition to its real native turn. Required on replay. */
 'official-gallery/attempt-start':{requestId:string;messageId:string;turn:number;compositionHash:string}
} }

/** A damaged/unknown composition never falls back to the session's old binding. */
export function validateAttempt(value:CatalogAttempt):CatalogAttempt{
 const selection=parseSelection(value.selection)
 if(value.protocol!==1||!value.messageId||!value.requestId||!value.authScope?.userId||!value.authScope.scope||catalogHash(selection)!==value.selectionHash||catalogHash({expert:value.expert,skill:value.skill,skillHash:value.skillHash,selectionHash:value.selectionHash,authScope:value.authScope})!==value.compositionHash)throw Error('TASK_COMPOSITION_HISTORY_INVALID')
 if((selection.expertRef?.id??null)!==(value.expert?.agentId??null)||(selection.expertRef?.versionId??null)!==(value.expert?.versionId??null)||(selection.skillRef?.id??null)!==(value.skill?.sessionSource.id??null)||(selection.skillRef?.revision??null)!==(value.skill?.sessionSource.packageRevision??null))throw Error('TASK_COMPOSITION_REFERENCE_MISMATCH')
 return value
}
