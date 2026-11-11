/** Versioned per-message composition: mutable draft references never become runtime authority. */
import type { Agent } from '@mammoth-ai/mmp-agent'
import type { UserMessage } from '@mammoth-ai/mmp-llm'
import type { Session } from '@mammoth-ai/mmp-session'
import { createHash } from 'node:crypto'
import type { OfficialAgentBinding, OfficialSkillBinding } from './types.ts'
export const MAX_CATALOG_SKILLS=5
export interface CatalogSkillRef { readonly id:string; readonly revision:number }
export interface CatalogSelection {
 readonly protocol:1; readonly selectionVersion:number
 readonly expertRef:{readonly id:string;readonly versionId:string}|null
 readonly skillRef:CatalogSkillRef|null
 /** Present when the client sent a list. Older selections have only `skillRef`. */
 readonly skillRefs?:readonly CatalogSkillRef[]
}
export interface CatalogAttempt {
 readonly protocol:1; readonly requestId:string; readonly messageId:string
 readonly authScope:{readonly userId:string;readonly scope:string}
 readonly selection:CatalogSelection; readonly selectionHash:string; readonly inputHash:string; readonly compositionHash:string
 readonly expert:OfficialAgentBinding|null; readonly skill:OfficialSkillBinding|null; readonly skillHash:string|null
 /** Chip order. Absent on attempts stored before skills could stack. */
 readonly skills?:readonly OfficialSkillBinding[]; readonly skillHashes?:readonly string[]
 /** Display offsets into the user text, one per listed skill. Absent from the composition hash. */
 readonly skillMarks?:readonly number[]
}
/** Display offsets aligned with the listed skills. A partial or damaged list is omitted. */
export function skillMarksOf(raw:unknown,count:number):readonly number[]|undefined{
 if(count===0||!raw||typeof raw!=='object')return undefined
 const marks=(raw as {skillMarks?:unknown}).skillMarks
 if(!Array.isArray(marks)||marks.length!==count)return undefined
 const offsets:number[]=[]
 for(const mark of marks){if(!Number.isSafeInteger(mark)||Number(mark)<0)return undefined;offsets.push(Number(mark))}
 return offsets
}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('TASK_SELECTION_INVALID');return value as Record<string,unknown>}
function id(value:unknown):string{if(typeof value!=='string'||!value||value.length>256)throw Error('TASK_SELECTION_INVALID_REF');return value}
function skillRefOf(raw:Record<string,unknown>):CatalogSkillRef{
 if(!Number.isSafeInteger(raw.revision)||Number(raw.revision)<1)throw Error('TASK_SELECTION_INVALID_REVISION')
 return {id:id(raw.id),revision:Number(raw.revision)}
}
export function selectionSkills(selection:CatalogSelection):readonly CatalogSkillRef[]{
 return selection.skillRefs??(selection.skillRef?[selection.skillRef]:[])
}
export function parseSelection(raw:unknown):CatalogSelection{
 const v=object(raw)
 if(v.protocol!==1||!Number.isSafeInteger(v.selectionVersion)||Number(v.selectionVersion)<0||!Object.prototype.hasOwnProperty.call(v,'expertRef')||!Object.prototype.hasOwnProperty.call(v,'skillRef'))throw Error('TASK_SELECTION_INCOMPLETE')
 const expert=v.expertRef===null?null:object(v.expertRef),legacy=v.skillRef===null?null:skillRefOf(object(v.skillRef))
 const base:CatalogSelection={protocol:1,selectionVersion:Number(v.selectionVersion),expertRef:expert?{id:id(expert.id),versionId:id(expert.versionId)}:null,skillRef:legacy}
 if(!Object.prototype.hasOwnProperty.call(v,'skillRefs'))return base
 if(!Array.isArray(v.skillRefs))throw Error('TASK_SELECTION_INVALID')
 if(v.skillRefs.length>MAX_CATALOG_SKILLS)throw Error('TASK_SELECTION_TOO_MANY_SKILLS')
 const skillRefs=v.skillRefs.map(item=>skillRefOf(object(item))),seen=new Set<string>()
 for(const skill of skillRefs){if(seen.has(skill.id))throw Error('TASK_SELECTION_DUPLICATE_SKILL');seen.add(skill.id)}
 const first=skillRefs[0]??null
 if((legacy?.id??null)!==(first?.id??null)||(legacy?.revision??null)!==(first?.revision??null))throw Error('TASK_SELECTION_SKILL_MISMATCH')
 return {...base,skillRef:first,skillRefs}
}
export function compositionHashOf(value:Pick<CatalogAttempt,'expert'|'skill'|'skillHash'|'skills'|'skillHashes'|'selectionHash'|'authScope'>):string{
 const base={expert:value.expert,skill:value.skill,skillHash:value.skillHash,selectionHash:value.selectionHash,authScope:value.authScope}
 return Array.isArray(value.skills)?catalogHash({...base,skills:value.skills,skillHashes:value.skillHashes}):catalogHash(base)
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
 if(value.protocol!==1||!value.messageId||!value.requestId||!value.authScope?.userId||!value.authScope.scope||catalogHash(selection)!==value.selectionHash||compositionHashOf(value)!==value.compositionHash)throw Error('TASK_COMPOSITION_HISTORY_INVALID')
 const listed=selectionSkills(selection),bound=Array.isArray(value.skills)?value.skills:value.skill?[value.skill]:[]
 if(listed.length!==bound.length||listed.some((skill,index)=>skill.id!==bound[index]?.sessionSource.id||skill.revision!==bound[index]?.sessionSource.packageRevision))throw Error('TASK_COMPOSITION_REFERENCE_MISMATCH')
 if((selection.expertRef?.id??null)!==(value.expert?.agentId??null)||(selection.expertRef?.versionId??null)!==(value.expert?.versionId??null)||(selection.skillRef?.id??null)!==(value.skill?.sessionSource.id??null)||(selection.skillRef?.revision??null)!==(value.skill?.sessionSource.packageRevision??null))throw Error('TASK_COMPOSITION_REFERENCE_MISMATCH')
 if(Array.isArray(value.skills)&&(value.skillHashes?.length??-1)!==value.skills.length)throw Error('TASK_COMPOSITION_HISTORY_INVALID')
 return value
}
