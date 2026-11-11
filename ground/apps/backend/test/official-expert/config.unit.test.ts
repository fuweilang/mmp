import {encryptApiKey} from '../../src/llm/llm-key-crypto';
process.env.LLM_API_KEY_SECRET='task4-config-fixture';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ExpertRuntimeService, normalizeExecutionConfig } from '../../src/official-agent/expert-runtime.service';
import { AdminOfficialAgentsService } from '../../src/admin/admin-official-agents.service';

test('old configs remain legacy and attached new knowledge defaults REQUIRED', () => {
  assert.equal(normalizeExecutionConfig(undefined).route, 'LEGACY');
  const config = normalizeExecutionConfig({route:'KNOWLEDGE_CORE',releaseIds:['r']});
  assert.equal(config.retrievalPolicy,'REQUIRED');
  assert.deepEqual(config.generationModel,{mode:'AUTO'});
  assert.throws(()=>normalizeExecutionConfig({route:'KNOWLEDGE_CORE',releaseIds:['r'],scope:'TENANT'}));
});
test('platform admin without fresh super role cannot author', async()=> {
  const db:any={user:{findUnique:async()=>({status:'active'})},userRole:{findFirst:async()=>null},officialAgent:{findUnique:async()=>null}};
  const service=new AdminOfficialAgentsService(db,{adminScope:async()=>{}} as any,{} as any,{} as any);
  await assert.rejects(()=>service.create({id:'u',isPlatformAdmin:true} as any,{} as any),/SUPER_ADMIN_REQUIRED/);
});
test('publication rejects unready dependencies; exact ready references freeze',async()=>{
  let ready=false;
  const index:any={id:'i',status:'FAILED',profileId:'p',indexConfigHash:'hash',revision:{id:'drev',document:{id:'doc',enabled:true}},profile:{enabled:true}};
  const db:any={knowledgeRelease:{findUnique:async()=>({id:'r',sealed:true,base:{scope:'PLATFORM',tenantId:null,enabled:true},items:[{index:{...index,status:ready?'READY':'FAILED'}}]})}};
  db.knowledgeProfile={findUnique:async()=>({id:'p',task:'EMBEDDING',enabled:true,model:'fake',adapter:'OPENAI_EMBEDDINGS',batchSize:32,dimension:2,endpoint:'http://127.0.0.1:9/unused',provider:{enabled:true,apiKeyEnc:encryptApiKey('fake')}})};
  const service=new ExpertRuntimeService(db,{} as any);
  await assert.rejects(()=>service.freeze({route:'KNOWLEDGE_CORE',releaseIds:['r']},[],[],db),/KNOWLEDGE_DEPENDENCY_NOT_READY/);
  ready=true;
  const frozen=await service.freeze({route:'KNOWLEDGE_CORE',releaseIds:['r']},[],[],db);
  assert.equal(frozen.knowledge[0].indexes[0].indexRevisionId,'i');
  assert.equal(frozen.knowledge[0].indexes[0].profileId,'p');
});
test('prompt-only publishing never consults embedding configuration',async()=>{
 const service=new ExpertRuntimeService({} as any,{} as any);
 const frozen=await service.freeze(undefined,[],[],{} as any);
 assert.equal(frozen.route,'LEGACY');
 assert.deepEqual(frozen.knowledge,[]);
});
import { OfficialAgentService } from '../../src/official-agent/official-agent.service';
test('protocol 1 stays exact for legacy, rejects knowledge expert before unsafe legacy output',async()=>{
 const db:any={officialAgent:{findUnique:async()=>({id:'a',key:'a',kind:'GENERAL',status:'PUBLISHED',onlineVersionId:'v'})},officialAgentVersion:{findFirst:async()=>({id:'v',version:1,systemPrompt:'prompt',toolScope:[],expertDefinition:{},executionConfig:{route:'KNOWLEDGE_CORE',retrievalPolicy:'REQUIRED'}})}};
 const svc=new OfficialAgentService(db,{} as any,{} as any,{} as any,{listAgentLinkedSkillIds:async()=>[],summarizeEnabledSkills:async()=>[]} as any,{} as any,{} as any,{} as any,{} as any);
 await assert.rejects(()=>svc.resolve({id:'u',status:'active'} as any,null,'a','v'),/EXECUTION_PROTOCOL_UPGRADE_REQUIRED/);
});
test('published preview and rollback APIs are available on the existing author service',()=>{
 assert.equal(typeof AdminOfficialAgentsService.prototype.createPreview,'function');
 assert.equal(typeof AdminOfficialAgentsService.prototype.rollback,'function');
});
import { seedMissingOfficialDraft } from '../../src/official-agent/legacy-inventory';
test('repeated seed preserves existing administrator draft exactly',async()=>{
 const row:any={id:'a',key:'existing',systemPrompt:'admin edited'};let writes=0;
 const db:any={officialAgent:{upsert:async({update,create}:any)=>{if(Object.keys(update).length){writes++;Object.assign(row,update);}return row;}}};
 await seedMissingOfficialDraft(db,{key:'existing',systemPrompt:'asset baseline'} as any);
 await seedMissingOfficialDraft(db,{key:'existing',systemPrompt:'asset changed'} as any);
 assert.equal(row.systemPrompt,'admin edited');assert.equal(writes,0);
});
test('fixed generation with requested builtins requires an enabled tool-capable model',async()=>{
 const db:any={llmModel:{findUnique:async()=>({id:'m',modelId:'text-only',enabled:true,meta:{supportsTools:false},provider:{name:'p',enabled:true,baseUrl:'http://127.0.0.1:9',apiKeyEnc:encryptApiKey('fake')}})}};
 const svc=new ExpertRuntimeService(db,{} as any);
 await assert.rejects(()=>svc.freeze({generationModel:{mode:'FIXED',modelId:'m'}},['tabular_analyze'],[],db),/GENERATION_MODEL_CAPABILITY/);
});
test('expired preview, different creator, offline user and disabled fixed model fail current authority',async()=>{
 let expiresAt=new Date(Date.now()-1),actorUserId='u',active=true,enabled=true;
 const snapshot={executionConfig:{...normalizeExecutionConfig(undefined),builtinToolRevision:'ground-builtins-v1',knowledge:[],skillPackages:[],generationModel:{mode:'FIXED',modelId:'m',modelRef:'p/chat'}}};
 const db:any={user:{findUnique:async()=>({id:'u',status:active?'active':'disabled'})},userRole:{findFirst:async()=>({roleId:'s'})},officialExpertPreview:{findUnique:async()=>({id:'pv',actorUserId,agentId:'a',expiresAt,snapshot})},llmModel:{findUnique:async()=>({id:'m',modelId:'chat',enabled,provider:{name:'p',enabled:true,apiKeyEnc:'fake'}})}};
 const svc=new ExpertRuntimeService(db,{} as any),user={id:'u'} as any,binding={agentId:'a',previewId:'pv'};
 await assert.rejects(()=>svc.resolve(user,null,binding),/PREVIEW_EXPIRED_OR_FORBIDDEN/);
 expiresAt=new Date(Date.now()+10000);actorUserId='foreign';await assert.rejects(()=>svc.resolve(user,null,binding),/PREVIEW_EXPIRED_OR_FORBIDDEN/);
 actorUserId='u';active=false;await assert.rejects(()=>svc.resolve(user,null,binding),/ACCOUNT_INACTIVE/);
 active=true;enabled=false;await assert.rejects(()=>svc.enforceModel(user,null,binding),/FIXED_GENERATION_MODEL_UNAVAILABLE/);
});
test('opaque native ids are isolated by actor actual tenant version and preview without synced history',async()=>{
 const config={...normalizeExecutionConfig({route:'KNOWLEDGE_CORE',releaseIds:['r']}),builtinToolRevision:'ground-builtins-v1',knowledge:[{releaseId:'r',indexes:[]}],skillPackages:[]};
 const db:any={user:{findUnique:async()=>({status:'active'})},orgMember:{findUnique:async()=>({tenant:{status:'active'}})},officialAgent:{findUnique:async()=>({id:'a',status:'PUBLISHED',onlineVersionId:'v'})},officialAgentVersion:{findFirst:async({where}:any)=>({id:where.id,executionConfig:config,systemPrompt:'p',expertDefinition:{}})}};
 const svc=new ExpertRuntimeService(db,{} as any),transport={sessionId:'same',turnId:'same'};
 const a=await svc.access({id:'u'} as any,'tenantA',{agentId:'a',versionId:'v'},transport);
 const b=await svc.access({id:'u'} as any,'tenantB',{agentId:'a',versionId:'v'},transport);
 const c=await svc.access({id:'u'} as any,'tenantA',{agentId:'a',versionId:'v2'},transport);
 assert.notEqual(a.access.conversationId,b.access.conversationId);assert.notEqual(a.access.conversationId,c.access.conversationId);
 assert.deepEqual(await a.access.authorize(),[{releaseId:'r',scope:{type:'PLATFORM'}}]);
 await assert.rejects(()=>svc.access({id:'u'} as any,null,{agentId:'a',versionId:'v'},{sessionId:'s',turnId:'t',context:[{role:'system',content:'hidden'}] as any}),/INVALID_VISIBLE_CONTEXT/);
});
import { applyOfficialShadow } from '../../src/official-agent/legacy-inventory';
test('shadow apply rejects private source kinds before reading or queueing',async()=>{
 await assert.rejects(()=>applyOfficialShadow({} as any,{} as any,{actorUserId:'u',baseId:'b',profileId:'p',items:[{sourceKind:'LIBRARY',sourceId:'private',sourceHash:'a'.repeat(64)}]} as any),/ONLY_OFFICIAL_SHADOW_SUPPORTED/);
});
import {OfficialOrchestrateService} from '../../src/official-agent/orchestrate.service';
test('direct Ground delegation fails closed for new knowledge instead of prompt-only child execution',async()=>{
 for(const retrievalPolicy of ['REQUIRED','AUTO']){
 const db:any={officialAgent:{findUnique:async()=>({id:'child',status:'PUBLISHED',onlineVersion:{id:'v',toolScope:[],executionConfig:{route:'KNOWLEDGE_CORE',retrievalPolicy}}})}};
 const svc=new OfficialOrchestrateService(db,{} as any,{} as any,{} as any,{} as any);
 await assert.rejects(()=>svc.delegate({id:'u'} as any,null,'boss',{id:'boss-v',toolScope:['delegate_official_agent']} as any,{targetKey:'copy',task:'question'}),/KNOWLEDGE_DIRECT_DELEGATION_UNSUPPORTED/);
 }
});
test('preview builtin permission uses immutable snapshot and rechecks creator authority',async()=>{
 const db:any={user:{findUnique:async()=>({status:'active'})},userRole:{findFirst:async()=>({roleId:'s'})},officialExpertPreview:{findUnique:async()=>({id:'pv',agentId:'a',actorUserId:'u',expiresAt:new Date(Date.now()+10000),snapshot:{toolScope:['tabular_analyze'],executionConfig:{route:'LEGACY'}}})}};
 const svc=new ExpertRuntimeService(db,{} as any);
 await svc.authorizeTool({id:'u'} as any,null,{agentId:'a',previewId:'pv'},'tabular_analyze');
 await assert.rejects(()=>svc.authorizeTool({id:'u'} as any,null,{agentId:'a',previewId:'pv'},'web_search'),/EXPERT_TOOL_NOT_AUTHORIZED/);
});
test('exact skill packages are frozen and missing package revisions block publish',async()=>{
 let missing=false;
 const db:any={officialSkillPackage:{findUnique:async({where}:any)=>missing?null:{id:`pkg-${where.skillId_revision.revision}`}}};
 const svc=new ExpertRuntimeService(db,{} as any);
 const first=await svc.freeze(undefined,[],[{id:'skill',packageRevision:1}],db);
 const next=await svc.freeze(undefined,[],[{id:'skill',packageRevision:2}],db);
 assert.equal(first.skillPackages[0].packageId,'pkg-1');assert.equal(next.skillPackages[0].packageId,'pkg-2');
 missing=true;await assert.rejects(()=>svc.freeze(undefined,[],[{id:'skill',packageRevision:3}],db),/SKILL_PACKAGE_NOT_READY/);
});
test('publication rejects private, disabled and too many profile dependencies',async()=>{
 let scope='TENANT',enabled=true;
 const db:any={knowledgeRelease:{findUnique:async({where}:any)=>({id:where.id,baseId:'base',sealed:true,base:{scope,tenantId:scope==='TENANT'?'foreign':null,enabled},items:[{index:{id:'i'+where.id,status:'READY',profileId:'p'+where.id,indexConfigHash:'h',revision:{id:'rev',document:{id:'doc',enabled:true}},profile:{enabled:true}}}]})}};
 const svc=new ExpertRuntimeService(db,{} as any);
 await assert.rejects(()=>svc.freeze({route:'KNOWLEDGE_CORE',releaseIds:['r']},[],[],db),/KNOWLEDGE_DEPENDENCY_NOT_READY/);
 scope='PLATFORM';enabled=false;await assert.rejects(()=>svc.freeze({route:'KNOWLEDGE_CORE',releaseIds:['r']},[],[],db),/KNOWLEDGE_DEPENDENCY_NOT_READY/);
 enabled=true;await assert.rejects(()=>svc.freeze({route:'KNOWLEDGE_CORE',releaseIds:['1','2','3','4','5']},[],[],db),/KNOWLEDGE_PROFILE_LIMIT/);
});
