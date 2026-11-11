require('reflect-metadata');
const assert=require('node:assert/strict'),{test}=require('node:test');
const {randomUUID,randomInt,createHash}=require('node:crypto');
const {mkdtemp,rm,writeFile}=require('node:fs/promises'),{tmpdir}=require('node:os'),{join}=require('node:path'),{createServer}=require('node:http');
const execFile=require('node:util').promisify(require('node:child_process').execFile);
const bcrypt=require('bcryptjs'),{NestFactory}=require('@nestjs/core'),{ValidationPipe}=require('@nestjs/common'),cookieParser=require('cookie-parser');
const url=process.env.RAG_TEST_DATABASE_URL;
if(!url?.startsWith('postgresql://rag_test:')||!url.includes('@127.0.0.1:55441/mmp_rag_acceptance'))throw Error('DEDICATED_DB_REQUIRED');
process.env.DATABASE_URL=url;process.env.JWT_SECRET=randomUUID()+randomUUID();process.env.LLM_API_KEY_SECRET='rag4-fake-secret';process.env.LLM_HEALTH_ENABLED='0';process.env.LLM_PRICE_REFRESH_ENABLED='0';process.env.COOKIE_NAME='rag4_http';
const {AppModule}=require('../../dist/app.module'),{PrismaService}=require('../../dist/prisma/prisma.service');
const {KnowledgeIngestionWorker}=require('../../dist/knowledge-core/ingestion.worker');
const {encryptApiKey}=require('../../dist/llm/llm-key-crypto');
test('protocol2 immutable official expert, preview authority, current retrieval and migration HTTP contract',async t=>{
 const temp=await mkdtemp(join(tmpdir(),'rag4-'));process.env.LOG_DIR=temp;process.env.KNOWLEDGE_CORE_DIR=join(temp,'blobs');process.env.UPLOAD_DIR=temp;
 let app,db,mock;const users=[],agents=[],previews=[];let customRole,tenant;
 try{
 app=await NestFactory.create(AppModule,{logger:false,abortOnError:false});app.setGlobalPrefix('api');app.use(cookieParser());app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true,forbidNonWhitelisted:true}));await app.listen(0,'127.0.0.1');const origin=await app.getUrl();db=app.get(PrismaService);
 const marker=randomUUID(),password=randomUUID(),passwordHash=await bcrypt.hash(password,4);
 const role=await db.role.upsert({where:{key:'super_admin'},update:{},create:{key:'super_admin',name:'super fixture',scope:'PLATFORM',permissions:{create:{permKey:'portal.admin.access'}}}});
 customRole=await db.role.create({data:{key:`rag4-${marker}`,name:'non super',scope:'PLATFORM',permissions:{create:{permKey:'portal.admin.access'}}}});
 const sessions={};
 tenant=await db.tenant.create({data:{name:'RAG4 member tenant',slug:`rag4-${marker}`,type:'ENTERPRISE'}});
 for(const name of ['super','otherSuper','platform','member']){
 const user=await db.user.create({data:{name,phone:`17${randomInt(100000000,999999999)}`,passwordHash,isPlatformAdmin:name!=='member'}});users.push(user.id);
 if(name==='member')await db.orgMember.create({data:{userId:user.id,tenantId:tenant.id,role:'MEMBER'}});
 else await db.userRole.create({data:{userId:user.id,roleId:name==='platform'?customRole.id:role.id}});
 const r=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({phone:user.phone,password})});assert.equal(r.status,200);sessions[name]=r.headers.getSetCookie().find(c=>c.startsWith('rag4_http=')).split(';')[0];await r.arrayBuffer();
 }
 const req=async(who,path,method='POST',body={})=>{const r=await fetch(origin+'/api/'+path,{method,headers:{cookie:sessions[who],'content-type':'application/json'},...(method!=='GET'?{body:JSON.stringify(body)}:{})});return{status:r.status,body:await r.json()};};
 const draft={key:`rag4-${marker}`,kind:'GENERAL',name:'协议二专家',summary:'测试简介',openingQuestions:[],systemPrompt:'初始指令',toolScope:[]};
 assert.equal((await req('platform','admin/official-agents','POST',draft)).status,403);
 let created=await req('super','admin/official-agents','POST',draft);assert.equal(created.status,201,JSON.stringify(created.body));const id=created.body.id;agents.push(id);
 assert.equal((await req('super',`admin/official-agents/${id}/publish`)).status,200);
 const promptPreview=await req('super',`admin/official-agents/${id}/preview`);assert.equal(promptPreview.status,201);previews.push(promptPreview.body.previewId);
 await req('super',`admin/official-agents/${id}`,'PATCH',{toolScope:['enterprise_knowledge']});
 const legacyKnowledgePreview=await req('super',`admin/official-agents/${id}/preview`);assert.equal(legacyKnowledgePreview.status,400);assert.equal(legacyKnowledgePreview.body.code,'LEGACY_KNOWLEDGE_PREVIEW_REQUIRES_MIGRATION');
 await req('super',`admin/official-agents/${id}`,'PATCH',{toolScope:[]});
 const old=await req('platform',`official-agents/${id}/resolve`);assert.equal(old.status,200);assert.deepEqual(Object.keys(old.body).sort(),['agentId','key','kind','versionId','version','systemPrompt','toolScope','linkedSkills'].sort());const legacyVersion=old.body.versionId;
 mock=createServer((request,response)=>{let body='';request.on('data',x=>body+=x);request.on('end',()=>{const p=JSON.parse(body);response.end(JSON.stringify({data:p.input.map((_,index)=>({index,embedding:[1,0]})),usage:{total_tokens:5}}));});});await new Promise(r=>mock.listen(0,'127.0.0.1',r));
 const provider=await db.llmProvider.create({data:{name:`rag4-${marker}`,displayName:'fake loopback only',baseUrl:`http://127.0.0.1:${mock.address().port}`,apiKeyEnc:encryptApiKey('fake-key')}});
 const profile=await req('super','admin/knowledge-core/profiles','POST',{providerId:provider.id,task:'EMBEDDING',model:'fake',dimension:2});assert.equal(profile.status,201);
 const base=await req('super','admin/knowledge-core/bases','POST',{name:'Task4 explicit official'});
 const form=new FormData();form.append('file',new Blob(['协议四测试。退款编号 AB-991 的规则是三天内提交申请。']),'rag4.txt');form.append('profileId',profile.body.id);form.append('idempotencyKey',randomUUID());
 const uploaded=await fetch(origin+`/api/admin/knowledge-core/bases/${base.body.id}/documents`,{method:'POST',headers:{cookie:sessions.super},body:form});assert.equal(uploaded.status,201);const job=await uploaded.json();await app.get(KnowledgeIngestionWorker).runOnce();const ready=await req('super',`admin/knowledge-core/jobs/${job.id}`,'GET');assert.equal(ready.body.index.status,'READY');
 const release=await req('super',`admin/knowledge-core/bases/${base.body.id}/releases`,'POST',{indexRevisionIds:[ready.body.index.id]});assert.equal(release.status,201,JSON.stringify(release.body));
 // Local dependency failures block both publish and preview without network/provider calls.
 const originalProvider={enabled:true,baseUrl:provider.baseUrl,apiKeyEnc:provider.apiKeyEnc};
 const assertDependencyBlocked=async(config,toolScope=[])=>{
  await req('super',`admin/official-agents/${id}`,'PATCH',{executionConfig:config,toolScope});
  const beforeVersions=await db.officialAgentVersion.count({where:{agentId:id}}),beforePreviews=await db.officialExpertPreview.count({where:{agentId:id}});
  for(const action of ['publish','preview']){const response=await req('super',`admin/official-agents/${id}/${action}`);assert.ok([400,503].includes(response.status),action+':'+JSON.stringify(response));}
  assert.equal(await db.officialAgentVersion.count({where:{agentId:id}}),beforeVersions);assert.equal(await db.officialExpertPreview.count({where:{agentId:id}}),beforePreviews);
 };
 for(const change of [{enabled:false},{apiKeyEnc:null},{apiKeyEnc:'corrupt-ciphertext'},{apiKeyEnc:encryptApiKey('  ')}]){
  await db.llmProvider.update({where:{id:provider.id},data:change});
  await assertDependencyBlocked({route:'KNOWLEDGE_CORE',releaseIds:[release.body.id]});
  await db.llmProvider.update({where:{id:provider.id},data:originalProvider});
 }
 const rerank=await req('super','admin/knowledge-core/profiles','POST',{providerId:provider.id,task:'RERANK',model:'fake-rerank'});assert.equal(rerank.status,201);
 await db.llmProvider.update({where:{id:provider.id},data:{enabled:false}});
 await assertDependencyBlocked({route:'LEGACY',rerankProfileId:rerank.body.id});
 await db.llmProvider.update({where:{id:provider.id},data:originalProvider});
 const fixed=await db.llmModel.create({data:{providerId:provider.id,modelId:'fake-chat',displayName:'fake local config',meta:{supportsTools:true}}});
 for(const change of [{baseUrl:null},{apiKeyEnc:'corrupt-ciphertext'},{apiKeyEnc:encryptApiKey(' ')}]){
  await db.llmProvider.update({where:{id:provider.id},data:change});await assertDependencyBlocked({generationModel:{mode:'FIXED',modelId:fixed.id}});await db.llmProvider.update({where:{id:provider.id},data:originalProvider});
 }
 await assertDependencyBlocked({route:'LEGACY'},['web_search']);
 await req('super',`admin/official-agents/${id}`,'PATCH',{executionConfig:{route:'LEGACY'},toolScope:[]});
 const {applyOfficialShadow}=require('../../dist/official-agent/legacy-inventory');
 const {KnowledgeCoreService}=require('../../dist/knowledge-core/knowledge-core.service');
 const original=Buffer.from('shadow original official fixture');await writeFile(join(temp,'shadow.txt'),original);
 const legacyDoc=await db.officialKbDocument.create({data:{agentId:id,assetKey:'shadow-fixture',name:'shadow test',originalName:'shadow.txt',mimeType:'text/plain',sizeBytes:original.length,storagePath:'shadow.txt',status:'READY'}});
 const oldCorpusPreview=await req('super',`admin/official-agents/${id}/preview`);assert.equal(oldCorpusPreview.status,400);assert.equal(oldCorpusPreview.body.code,'LEGACY_KNOWLEDGE_PREVIEW_REQUIRES_MIGRATION');
 await req('super',`admin/official-agents/${id}`,'PATCH',{executionConfig:{route:'KNOWLEDGE_CORE',retrievalPolicy:'OFF'}});
 const explicitOff=await req('super',`admin/official-agents/${id}/preview`);assert.equal(explicitOff.status,201);previews.push(explicitOff.body.previewId);
 await req('super',`admin/official-agents/${id}`,'PATCH',{executionConfig:{route:'LEGACY'}});
 const applyInput={actorUserId:users[0],baseId:base.body.id,profileId:profile.body.id,items:[{sourceKind:'LEGACY_OFFICIAL',sourceId:legacyDoc.id,sourceHash:createHash('sha256').update(original).digest('hex')}]};
 await assert.rejects(()=>applyOfficialShadow(db,app.get(KnowledgeCoreService),{...applyInput,actorUserId:users[2]}),/SUPER_ADMIN_REQUIRED/);
 const shadow=await applyOfficialShadow(db,app.get(KnowledgeCoreService),applyInput);
 const repeated=await applyOfficialShadow(db,app.get(KnowledgeCoreService),applyInput);
 await writeFile(join(temp,'plan.json'),JSON.stringify({operation:'SHADOW_PLAN_ONLY',items:applyInput.items}));
 const cli=await execFile(process.execPath,[join(__dirname,'../../scripts/official-expert-inventory.cjs'),'--apply-shadow','--actor',users[0],'--base',base.body.id,'--profile',profile.body.id,'--plan',join(temp,'plan.json')],{env:process.env});
 assert.equal(JSON.parse(cli.stdout).mappings[0].jobId,shadow.mappings[0].jobId);
 assert.equal(shadow.mappings[0].jobId,repeated.mappings[0].jobId);assert.equal(shadow.mappings[0].status,'QUEUED');assert.equal(await db.knowledgeRelease.count({where:{baseId:base.body.id}}),1);
 assert.deepEqual(await db.officialKbDocument.findUnique({where:{id:legacyDoc.id}}),legacyDoc);
 await writeFile(join(temp,'shadow.txt'),'changed after review');await assert.rejects(()=>applyOfficialShadow(db,app.get(KnowledgeCoreService),applyInput),/LEGACY_SOURCE_CHANGED/);
 await app.get(KnowledgeIngestionWorker).runOnce();
 assert.equal((await db.knowledgeIndexRevision.findUnique({where:{id:shadow.mappings[0].indexRevisionId}})).status,'READY');
 const config={route:'KNOWLEDGE_CORE',releaseIds:[release.body.id]};
 const configEdit=await req('super',`admin/official-agents/${id}`,'PATCH',{executionConfig:config});assert.equal(configEdit.status,200);assert.equal(configEdit.body.hasUnpublishedChanges,true);
 await req('super',`admin/official-agents/${id}`,'PATCH',{toolScope:['tabular_analyze']});
 const preview=await req('super',`admin/official-agents/${id}/preview`);assert.equal(preview.status,201,JSON.stringify(preview.body));previews.push(preview.body.previewId);assert.match(preview.body.launch.path,/expertPreview=/);
 const binding={executionProtocol:2,previewId:preview.body.previewId};
 const table=await req('super',`official-agents/${id}/runtime/analyze-tabular`,'POST',{...binding,content:'city,value\nA,1\nA,2',format:'csv',groupBy:'city'});assert.equal(table.status,200);assert.equal(table.body.rowCount,2);
 assert.equal((await req('otherSuper',`official-agents/${id}/runtime/analyze-tabular`,'POST',{...binding,content:'a,b\n1,2',format:'csv'})).status,403);
 assert.equal((await req('otherSuper',`official-agents/${id}/runtime/resolve`,'POST',binding)).status,403);
 assert.equal((await req('platform',`official-agents/${id}/runtime/resolve`,'POST',binding)).status,403);
 let resolved=await req('super',`official-agents/${id}/runtime/resolve`,'POST',binding);assert.equal(resolved.status,200);assert.equal(resolved.body.executionConfig.retrievalPolicy,'REQUIRED');assert.equal(resolved.body.executionConfig.knowledge[0].indexes[0].indexRevisionId,ready.body.index.id);
 await req('super',`admin/official-agents/${id}`,'PATCH',{systemPrompt:'后来编辑',executionConfig:{route:'LEGACY'}});
 resolved=await req('super',`official-agents/${id}/runtime/resolve`,'POST',binding);assert.ok(resolved.body.systemPrompt.includes('初始指令'));assert.equal(resolved.body.executionConfig.route,'KNOWLEDGE_CORE');
 await assert.rejects(()=>db.officialExpertPreview.update({where:{id:binding.previewId},data:{expiresAt:new Date(Date.now()+600000)}}),/immutable/);
 await req('super',`admin/official-agents/${id}`,'PATCH',{executionConfig:config});
 const published=await req('super',`admin/official-agents/${id}/publish`);assert.equal(published.status,200,JSON.stringify(published.body));const versionId=published.body.onlineVersion.id;
 assert.equal((await req('platform',`official-agents/${id}/resolve`)).status,400);
 resolved=await req('platform',`official-agents/${id}/resolve`,'POST',{executionProtocol:2});assert.equal(resolved.status,200);assert.equal(resolved.body.versionId,versionId);
 const transport={executionProtocol:2,versionId,sessionId:'native-not-yet-synced',turnId:'turn1',query:'AB-991 退款规则',context:[{role:'user',content:'这次讨论退款'}]};
 const retrieved=await req('platform',`official-agents/${id}/runtime/retrieve`,'POST',transport);assert.equal(retrieved.status,200,JSON.stringify(retrieved.body));assert.equal(retrieved.body.status,'READY');assert.ok(retrieved.body.context.context.includes('AB-991'));assert.ok(!('diagnostics' in retrieved.body));
 const memberResolved=await req('member',`official-agents/${id}/resolve`,'POST',{executionProtocol:2});assert.equal(memberResolved.status,200);
 const memberRetrieval=await req('member',`official-agents/${id}/runtime/retrieve`,'POST',transport);assert.equal(memberRetrieval.body.status,'READY');
 assert.equal(await db.officialAgentTenantGrant.count({where:{agentId:id,tenantId:tenant.id}}),0);
 await db.orgMember.deleteMany({where:{userId:users[3],tenantId:tenant.id}});
 assert.equal((await req('member',`official-agents/${id}/runtime/retrieve`,'POST',{...transport,turnId:'revoked-member'})).status,403);
 const trace=await db.knowledgeRetrievalTrace.findUnique({where:{id:retrieved.body.retrievalId}});assert.equal(trace.expertVersionId,versionId);assert.equal(trace.actorUserId,users[2]);
 const evidence=retrieved.body.evidence[0],source={executionProtocol:2,versionId,...Object.fromEntries(['knowledgeReleaseId','documentId','revisionId','indexRevisionId','chunkId'].map(k=>[k,evidence[k]]))};
 assert.equal((await req('platform',`official-agents/${id}/runtime/sources/open`,'POST',source)).status,200);
 assert.equal((await req('platform',`official-agents/${id}/runtime/sources/open`,'POST',{...source,revisionId:'forged'})).status,404);
 await req('platform',`official-agents/${id}/runtime/retrieve`,'POST',transport);
 const exhausted=await req('platform',`official-agents/${id}/runtime/retrieve`,'POST',transport);assert.ok(exhausted.body.degradation.includes('RETRIEVAL_LOOKUP_BUDGET_EXHAUSTED'));
 await db.knowledgeDocument.update({where:{id:evidence.documentId},data:{enabled:false}});
 assert.equal((await req('platform',`official-agents/${id}/runtime/sources/open`,'POST',source)).status,403);
 await db.knowledgeDocument.update({where:{id:evidence.documentId},data:{enabled:true}});
 const previewResult=await req('super',`official-agents/${id}/runtime/retrieve`,'POST',{...transport,...binding,versionId:undefined});assert.equal(previewResult.body.status,'READY');
 const previewTrace=await db.knowledgeRetrievalTrace.findUnique({where:{id:previewResult.body.retrievalId}});assert.equal(previewTrace.previewId,binding.previewId);
 // Terminal disclosure uses a real single-statement database snapshot after all inventory I/O.
 const {KnowledgeRetrievalService}=require('../../dist/knowledge-core/retrieval.service');
 const {authorizeExpertDisclosure}=require('../../dist/official-agent/expert-disclosure');
 const core=app.get(KnowledgeCoreService),retrievalService=app.get(KnowledgeRetrievalService);
 const normalBinding={agentId:id,versionId},previewBinding={agentId:id,previewId:binding.previewId};
 const decision=(actor=users[2],tenantId=null,b=normalBinding,refs=[evidence])=>authorizeExpertDisclosure(db,actor,tenantId,b,refs);
 assert.equal(await decision(),true);assert.equal(await decision(users[0],null,previewBinding),true);
 assert.equal(await decision(users[1],null,previewBinding),false,'preview creator is required');
 assert.equal(await decision(users[2],null,{...normalBinding,previewId:binding.previewId}),false,'ambiguous binding denied');
 for(const key of ['knowledgeReleaseId','indexRevisionId','revisionId','documentId','chunkId'])
  assert.equal(await decision(users[2],null,normalBinding,[{...evidence,[key]:'forged'}]),false,key+' exact identity');
 assert.equal(await decision(users[3],tenant.id),false,'removed membership denied');
 await db.orgMember.create({data:{userId:users[3],tenantId:tenant.id,role:'MEMBER'}});
 assert.equal(await decision(users[3],tenant.id),true,'current membership needs no enterprise grant for PLATFORM');
 await db.tenant.update({where:{id:tenant.id},data:{status:'disabled'}});
 assert.equal(await decision(users[3],tenant.id),false,'inactive tenant denied');
 await db.tenant.update({where:{id:tenant.id},data:{status:'active'}});
 for(const [model,key] of [['knowledgeDocument',evidence.documentId],['knowledgeBase',base.body.id],['knowledgeProfile',profile.body.id]]){
  await db[model].update({where:{id:key},data:{enabled:false}});assert.equal(await decision(),false,model+' disabled');
  await db[model].update({where:{id:key},data:{enabled:true}});
 }
 const expired=await db.officialExpertPreview.create({data:{agentId:id,actorUserId:users[0],snapshot:(await db.officialExpertPreview.findUnique({where:{id:binding.previewId}})).snapshot,createdAt:new Date(Date.now()-2000),expiresAt:new Date(Date.now()-1000)}});previews.push(expired.id);
 assert.equal(await decision(users[0],null,{agentId:id,previewId:expired.id}),false,'expired immutable preview denied');
 for(const scenario of ['account-final-inventory','preview-role-final-inventory','material-final-decision']){
  await t.test(scenario,async()=>{
   const originalRetrieve=retrievalService.retrieve,originalInventory=core.getReleaseInventory,originalQuery=db.$queryRaw;
   let terminal=false,reads=0,mutated=false,decisions=0;
   retrievalService.retrieve=async function(...args){const result=await originalRetrieve.apply(this,args);terminal=true;return result;};
   const revoke=async()=>{mutated=true;if(scenario==='account-final-inventory')await db.user.update({where:{id:users[2]},data:{status:'disabled'}});
    else if(scenario==='preview-role-final-inventory')await db.userRole.deleteMany({where:{userId:users[0],roleId:role.id}});
    else await db.knowledgeDocument.update({where:{id:evidence.documentId},data:{enabled:false}});};
   core.getReleaseInventory=async function(...args){const result=await originalInventory.apply(this,args);if(terminal&&++reads===2&&scenario!=='material-final-decision')await revoke();return result;};
   db.$queryRaw=async function(...args){if(String(args[0]).includes('expert_terminal_disclosure_v1')){decisions++;if(scenario==='material-final-decision')await revoke();}return originalQuery.apply(this,args);};
   try{
    const isPreview=scenario.startsWith('preview');
    const denied=await req(isPreview?'super':'platform',`official-agents/${id}/runtime/retrieve`,'POST',{...transport,...(isPreview?{...binding,versionId:undefined}:{}),turnId:scenario});
    assert.equal(denied.status,200,JSON.stringify(denied));assert.equal(mutated,true);assert.equal(reads,2);assert.equal(decisions,1);
    assert.equal(denied.body.status,'FORBIDDEN');assert.deepEqual(denied.body.evidence,[]);assert.equal(denied.body.context.context,'');
    const deniedTrace=await db.knowledgeRetrievalTrace.findUnique({where:{id:denied.body.retrievalId}});assert.equal(deniedTrace.status,'FORBIDDEN');assert.deepEqual(deniedTrace.evidence,[]);assert.deepEqual(deniedTrace.releaseIds,[]);
   }finally{
    retrievalService.retrieve=originalRetrieve;core.getReleaseInventory=originalInventory;db.$queryRaw=originalQuery;
    await db.user.update({where:{id:users[2]},data:{status:'active'}});
    await db.userRole.upsert({where:{userId_roleId:{userId:users[0],roleId:role.id}},update:{},create:{userId:users[0],roleId:role.id}});
    await db.knowledgeDocument.update({where:{id:evidence.documentId},data:{enabled:true}});
   }
  });
 }
 for(const scenario of ['source-account-final-decision','source-material-final-decision'])await t.test(scenario,async()=>{
  const originalQuery=db.$queryRaw;let decisionCount=0;
  db.$queryRaw=async function(...args){if(String(args[0]).includes('expert_terminal_disclosure_v1')){decisionCount++;
   if(scenario.includes('account'))await db.user.update({where:{id:users[2]},data:{status:'disabled'}});
   else await db.knowledgeDocument.update({where:{id:evidence.documentId},data:{enabled:false}});
  }return originalQuery.apply(this,args);};
  try{const denied=await req('platform',`official-agents/${id}/runtime/sources/open`,'POST',source);assert.equal(denied.status,403);assert.equal(decisionCount,1);assert.ok(!JSON.stringify(denied).includes('AB-991'));}
  finally{db.$queryRaw=originalQuery;await db.user.update({where:{id:users[2]},data:{status:'active'}});await db.knowledgeDocument.update({where:{id:evidence.documentId},data:{enabled:true}});}
 });
 await req('super',`admin/official-agents/${id}/rollback/${legacyVersion}`);
 resolved=await req('platform',`official-agents/${id}/resolve`);assert.equal(resolved.body.versionId,legacyVersion);
 assert.equal((await req('platform',`official-agents/${id}/resolve`,'POST',{versionId,executionProtocol:2})).body.versionId,versionId);
 await assert.rejects(()=>db.officialAgentVersion.update({where:{id:versionId},data:{systemPrompt:'overwrite'}}),/immutable/);
 await req('super',`admin/official-agents/${id}/offline`);
 assert.equal((await req('platform',`official-agents/${id}/runtime/retrieve`,'POST',{...transport,turnId:'after-offline'})).status,403);
 await db.userRole.deleteMany({where:{userId:users[0],roleId:role.id}});
 assert.equal((await req('super',`official-agents/${id}/runtime/resolve`,'POST',binding)).status,403);
 }finally{
 if(db){await db.officialExpertPreview.deleteMany({where:{id:{in:previews}}});await db.officialAgent.deleteMany({where:{id:{in:agents}}});await db.userRole.deleteMany({where:{userId:{in:users}}});await db.user.deleteMany({where:{id:{in:users}}});if(customRole)await db.role.delete({where:{id:customRole.id}});if(tenant)await db.tenant.delete({where:{id:tenant.id}});}
 await app?.close();await new Promise(r=>mock?mock.close(r):r());await rm(temp,{recursive:true,force:true});
 }
});
