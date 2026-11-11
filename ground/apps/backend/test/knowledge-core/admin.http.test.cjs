require('reflect-metadata');
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {randomUUID,randomInt}=require('node:crypto');
const {mkdtemp,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {createServer}=require('node:http');
const {encryptApiKey}=require('../../dist/llm/llm-key-crypto.js');
const bcrypt=require('bcryptjs');
const {NestFactory}=require('@nestjs/core');
const {ValidationPipe}=require('@nestjs/common');
const cookieParser=require('cookie-parser');
const url=process.env.RAG_TEST_DATABASE_URL;
if(!url?.startsWith('postgresql://rag_test:')||!url.includes('@127.0.0.1:55441/mmp_rag_acceptance'))throw new Error('DEDICATED_DB_REQUIRED');
process.env.DATABASE_URL=url;process.env.JWT_SECRET=randomUUID()+randomUUID();
process.env.LLM_API_KEY_SECRET='test-only-rag-encryption-secret';
process.env.LLM_HEALTH_ENABLED='0';process.env.LLM_PRICE_REFRESH_ENABLED='0';
process.env.COOKIE_NAME='rag3_http';
const {AppModule}=require('../../dist/app.module.js');
const {PrismaService}=require('../../dist/prisma/prisma.service.js');
test('actual AppModule boots; normal login, strict super_admin HTTP boundary, DTOs and precise source',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'rag3-http-'));process.env.LOG_DIR=dir;process.env.KNOWLEDGE_CORE_DIR=join(dir,'blobs');
 let app,db,mock;let providerFail=false;const users=[],tenants=[],roles=[],immutableFixtureTenants=new Set();let createdSuper;
 try{
  app=await NestFactory.create(AppModule,{logger:false,abortOnError:false});
  app.setGlobalPrefix('api');app.use(cookieParser());app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true,forbidNonWhitelisted:true}));
  await app.listen(0,'127.0.0.1');const origin=await app.getUrl();db=app.get(PrismaService);
  const phones=Array.from({length:3},()=>`18${randomInt(100000000,999999999)}`);
  const marker=randomUUID(),password=randomUUID(),passwordHash=await bcrypt.hash(password,4);
  let superRole=await db.role.findUnique({where:{key:'super_admin'}});
  if(!superRole){superRole=await db.role.create({data:{key:'super_admin',name:'RAG3 super fixture',scope:'PLATFORM',permissions:{create:{permKey:'portal.admin.access'}}}});createdSuper=superRole.id;}
  const platformRole=await db.role.create({data:{key:`rag3-${marker}`,name:'RAG3 non-super platform',scope:'PLATFORM',permissions:{create:{permKey:'portal.admin.access'}}}});roles.push(platformRole.id);
  const tenant=await db.tenant.create({data:{name:'RAG3 HTTP',slug:`rag3-${marker}`,type:'ENTERPRISE'}});tenants.push(tenant.id);
  for(const name of ['super','platform','member']){
   const user=await db.user.create({data:{name,phone:phones[users.length],passwordHash,isPlatformAdmin:name!=='member'}});users.push(user.id);
   if(name!=='member')await db.userRole.create({data:{userId:user.id,roleId:name==='super'?superRole.id:platformRole.id}});
   else await db.orgMember.create({data:{userId:user.id,tenantId:tenant.id,role:'MEMBER'}});
  }
  const sessions={};
  for(let i=0;i<3;i++){
   const response=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({phone:phones[i],password})});
   assert.equal(response.status,200);sessions[['super','platform','member'][i]]=response.headers.getSetCookie().find(c=>c.startsWith('rag3_http=')).split(';')[0];await response.arrayBuffer();
  }
  const request=async(who,path,method='GET',body)=>{
   const response=await fetch(origin+'/api/admin/knowledge-core/'+path,{method,headers:{...(who?{cookie:sessions[who]}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
   return {status:response.status,body:await response.json(),headers:response.headers};
  };
  assert.equal((await request(null,'profiles')).status,401);
  for(const who of ['platform','member'])for(const [path,method,body] of [['profiles','GET'],['bases','POST',{name:'forbidden'}],['retrieval-test','POST',{query:'secret',releaseIds:['forged']}],['sources/open','POST',{}]])assert.equal((await request(who,path,method,body)).status,403);
  await t.test('RAG-only credentials use the encrypted owner and fresh super role without chat models',async()=>{
   for(const who of ['platform','member']) for(const method of ['GET','POST','PATCH'])
    assert.equal((await request(who,method==='PATCH'?'providers/missing':'providers',method,method==='GET'?undefined:{name:'blocked',displayName:'blocked'})).status,403);
   const made=await request('super','providers','POST',{name:`rag7-${marker}`,displayName:'RAG only',baseUrl:'http://127.0.0.1:9',apiKey:'synthetic-rag7-secret'});
   assert.equal(made.status,201);assert.deepEqual(made.body.models,[]);assert.equal(made.body.hasApiKey,true);
   assert.ok(!JSON.stringify(made.body).includes('synthetic-rag7-secret'));assert.ok(!('apiKeyEnc' in made.body));
   const id=made.body.id, encrypted=(await db.llmProvider.findUniqueOrThrow({where:{id}})).apiKeyEnc;
   assert.notEqual(encrypted,'synthetic-rag7-secret');
   const edited=await request('super',`providers/${id}`,'PATCH',{displayName:'Edited RAG only',apiKey:'   ',enabled:false});
   assert.equal(edited.status,200);assert.equal(edited.body.hasApiKey,true);assert.equal(edited.body.enabled,false);
   assert.equal((await db.llmProvider.findUniqueOrThrow({where:{id}})).apiKeyEnc,encrypted);
   assert.ok((await request('super','providers')).body.some(p=>p.id===id&&p.models.length===0));
   const rotated=await request('super',`providers/${id}`,'PATCH',{apiKey:'synthetic-rag7-rotated',enabled:true});assert.equal(rotated.body.hasApiKey,true);
   assert.notEqual((await db.llmProvider.findUniqueOrThrow({where:{id}})).apiKeyEnc,encrypted);
   const bound=await request('super','profiles','POST',{providerId:id,task:'EMBEDDING',model:'retrieval-only',dimension:2});assert.equal(bound.status,201);
   assert.equal(await db.llmModel.count({where:{providerId:id}}),0);
   assert.equal((await request('super',`providers/${id}`,'PATCH',{clearApiKey:true})).body.hasApiKey,false);
   assert.equal((await request('super',`providers/${id}`,'PATCH',{apiKey:'x',clearApiKey:true})).status,400);
   assert.equal((await request('super','providers','POST',{name:'forbidden-model',displayName:'x',models:[{modelId:'not-chat'}]})).status,400);
  });
  const all=await request('super','profiles');assert.equal(all.status,200);assert.ok(!JSON.stringify(all).includes('apiKeyEnc'));assert.ok(!JSON.stringify(all).includes('fake-key'));
  assert.equal((await request('super','bases','POST',{name:'bad',tenantId:tenant.id})).status,400);
  assert.equal((await request('super','profiles','POST',{providerId:'missing',task:'EMBEDDING',model:'fake',dimension:2})).body.code,'PROVIDER_UNCONFIGURED');
  mock=createServer((req,res)=>{let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{
   if(providerFail){res.statusCode=503;res.end('fake-sensitive-body');return;}
   const parsed=JSON.parse(body);res.end(JSON.stringify(parsed.input?{data:parsed.input.map((_,index)=>({index,embedding:[1,0]})),usage:{total_tokens:7}}:{results:[{index:0,relevance_score:1}],usage:{total_tokens:7}}));
  });});await new Promise(resolve=>mock.listen(0,'127.0.0.1',resolve));
  const fakeProvider=await db.llmProvider.create({data:{name:`rag3-http-${marker}`,displayName:'RAG3 loopback only',baseUrl:`http://127.0.0.1:${mock.address().port}`,apiKeyEnc:encryptApiKey('fake-key')}});
  const profileResponse=await request('super','profiles','POST',{providerId:fakeProvider.id,task:'EMBEDDING',model:'engineering-loopback',dimension:2});assert.equal(profileResponse.status,201);
  const profileId=profileResponse.body.id;
  await t.test('referenced supplier deletion conflicts and final chat model removal preserves immutable profile owner',async()=>{
   const legacy=async(path,method='DELETE')=>{const r=await fetch(origin+'/api/admin/'+path,{method,headers:{cookie:sessions.super}});return {status:r.status,body:await r.json()};};
   const removed=await legacy(`llm-providers/${fakeProvider.id}`);assert.equal(removed.status,409);assert.match(JSON.stringify(removed.body),/检索|知识/);
   assert.ok(await db.knowledgeProfile.findUnique({where:{id:profileId}}));
   const model=await db.llmModel.create({data:{providerId:fakeProvider.id,modelId:'temporary-chat',displayName:'temporary'}});
   assert.equal((await legacy(`llm-models/${model.id}`)).status,200);
   assert.equal(await db.llmModel.count({where:{providerId:fakeProvider.id}}),0);assert.ok(await db.llmProvider.findUnique({where:{id:fakeProvider.id}}));
   const unused=await db.llmProvider.create({data:{name:`unused-${marker}`,displayName:'unused',models:{create:{modelId:'last',displayName:'last'}}},include:{models:true}});
   assert.equal((await legacy(`llm-models/${unused.models[0].id}`)).status,200);assert.equal(await db.llmProvider.findUnique({where:{id:unused.id}}),null);
  });
  const priorUsage=await db.knowledgeProviderUsage.count({where:{profileId}});
  const health=await request('super',`profiles/${profileId}/health`);assert.equal(health.body.configured,true);assert.equal(health.body.providerProbed,false);
  assert.equal(await db.knowledgeProviderUsage.count({where:{profileId}}),priorUsage);
  const probe=await request('super',`profiles/${profileId}/probe`,'POST');assert.equal(probe.body.available,true);assert.equal(probe.body.providerProbed,true);assert.equal(probe.body.actualTokens,7);
  assert.equal(await db.knowledgeProviderUsage.count({where:{profileId}}),priorUsage+1);
  const rerankProfile=await request('super','profiles','POST',{providerId:fakeProvider.id,task:'RERANK',model:'engineering-rerank'});
  assert.equal((await request('super',`profiles/${rerankProfile.body.id}/probe`,'POST')).body.available,true);
  providerFail=true;const badProbe=await request('super',`profiles/${profileId}/probe`,'POST');assert.equal(badProbe.body.available,false);assert.ok(badProbe.body.errorCode);assert.ok(!JSON.stringify(badProbe).includes('fake-sensitive-body'));providerFail=false;
  const created=await request('super','bases','POST',{name:'RAG3 HTTP base'});assert.equal(created.status,201);assert.equal(created.body.scope,'PLATFORM');assert.equal(created.body.tenantId,null);
  assert.equal((await request('super',`bases/${created.body.id}/documents`)).status,200);
  const archived=await request('super',`bases/${created.body.id}`,'PATCH',{name:'renamed HTTP base',enabled:false});assert.equal(archived.status,200);assert.equal(archived.body.enabled,false);
  const detail=await request('super',`bases/${created.body.id}`);assert.equal(detail.body.name,'renamed HTTP base');assert.equal(detail.body.enabled,false);
  assert.equal((await request('super',`bases/${created.body.id}`,'PATCH',{enabled:true})).body.enabled,true);
  const form=new FormData();form.append('file',new Blob(['RAG3 HTTP上传正文 <script>alert(1)</script>']),'中文资料🦣.txt');form.append('profileId',profileId);form.append('idempotencyKey',randomUUID());
  const uploadResponse=await fetch(origin+`/api/admin/knowledge-core/bases/${created.body.id}/documents`,{method:'POST',headers:{cookie:sessions.super},body:form});
  assert.equal(uploadResponse.status,201);const uploaded=await uploadResponse.json();assert.equal(uploaded.status,'QUEUED');assert.ok(!('leaseToken' in uploaded));
  assert.equal((await request('super',`jobs/${uploaded.id}`)).body.stage,'UPLOADED');
  assert.equal((await request('super',`jobs/${uploaded.id}/cancel`,'POST')).body.status,'CANCELLED');
  assert.equal((await request('super',`jobs/${uploaded.id}/retry`,'POST')).body.status,'QUEUED');
  assert.equal((await request('super',`jobs/${uploaded.id}/cancel`,'POST')).body.status,'CANCELLED');
  // READY but unreleased content must be inspectable before knowledge release creation.
  assert.equal((await request('super',`jobs/${uploaded.id}/retry`,'POST')).body.status,'QUEUED');
  const {KnowledgeIngestionWorker}=require('../../dist/knowledge-core/ingestion.worker.js');await app.get(KnowledgeIngestionWorker).runOnce();
  const ready=await request('super',`jobs/${uploaded.id}`);assert.equal(ready.body.index.status,'READY');
  const revisionId=ready.body.index.revisionId,indexId=ready.body.index.id;
  const revision=await db.knowledgeDocumentRevision.findUnique({where:{id:revisionId}});
  await t.test('browser UTF8 multipart filename survives exact immutable metadata',async()=>{assert.equal(revision.originalName,'中文资料🦣.txt');const doc=await db.knowledgeDocument.findUniqueOrThrow({where:{id:revision.documentId}});assert.equal(doc.title,'中文资料🦣.txt');});
  const previewPath=`documents/${revision.documentId}/revisions/${revisionId}`;
  assert.equal(await db.knowledgeReleaseItem.count({where:{indexRevisionId:indexId}}),0);
  await t.test('READY unreleased original extracted and chunks are inspectable within scope',async()=>{
  const preview=await request('super',`${previewPath}/indexes/${indexId}/chunks?offset=0&limit=1`);assert.equal(preview.status,200);assert.equal(preview.body.chunks.length,1);assert.equal(preview.body.indexRevisionId,indexId);assert.ok(preview.body.chunks[0].locator);assert.match(preview.headers.get('content-type'),/^application\/json/);assert.equal(preview.headers.get('x-content-type-options'),'nosniff');assert.ok(preview.body.chunks[0].text.includes('<script>'));
  const extracted=await request('super',`${previewPath}/indexes/${indexId}/extracted?offset=0&limit=8`);assert.equal(extracted.status,200);assert.ok(extracted.body.text.length<=8);assert.equal(extracted.body.revisionId,revisionId);
  const original=await fetch(origin+`/api/admin/knowledge-core/${previewPath}/original`,{headers:{cookie:sessions.super}});
  assert.equal(original.status,200);assert.equal(original.headers.get('content-type'),'application/octet-stream');assert.match(original.headers.get('content-disposition'),/^attachment;/);assert.equal(original.headers.get('x-content-type-options'),'nosniff');assert.equal(await original.text(),'RAG3 HTTP上传正文 <script>alert(1)</script>');
  await request('super',`documents/${revision.documentId}`,'PATCH',{enabled:false});assert.equal((await request('super',`${previewPath}/original`)).status,403);assert.equal((await request('super',`${previewPath}/indexes/${indexId}/chunks`)).status,403);await request('super',`documents/${revision.documentId}`,'PATCH',{enabled:true});
  for(const who of ['platform','member'])for(const suffix of ['/original',`/indexes/${indexId}/chunks`,`/indexes/${indexId}/extracted`])assert.equal((await request(who,previewPath+suffix)).status,403);
  const {KnowledgeCoreService}=require('../../dist/knowledge-core/knowledge-core.service.js');const fixtureCore=app.get(KnowledgeCoreService);
  const privateScope={type:'TENANT',tenantId:tenant.id};const privateBase=await fixtureCore.createBase(privateScope,'HTTP private forbidden');immutableFixtureTenants.add(tenant.id);
  const privateJob=await fixtureCore.upload(privateBase.id,privateScope,{bytes:Buffer.from('TENANT forbidden source'),originalName:'private.txt',profileId,idempotencyKey:randomUUID()});
  await app.get(KnowledgeIngestionWorker).runOnce();
  const foreign=await db.knowledgeIndexRevision.findUniqueOrThrow({where:{id:privateJob.indexRevisionId},include:{revision:true}});assert.equal(foreign.status,'READY');
  const foreignPath=`documents/${foreign.revision.documentId}/revisions/${foreign.revisionId}`;
  for(const suffix of ['/original',`/indexes/${foreign.id}/chunks`,`/indexes/${foreign.id}/extracted`])assert.ok([403,404].includes((await request('super',foreignPath+suffix)).status));
  assert.equal((await request('super',`${previewPath}/indexes/${indexId}/chunks?limit=101`)).status,400);
  });
  const releaseResponse=await request('super',`bases/${created.body.id}/releases`,'POST',{indexRevisionIds:[indexId]});assert.equal(releaseResponse.status,201);
  const diagnosticInput={query:'HTTP上传正文',releaseIds:[releaseResponse.body.id],mode:'required',rerankProfileId:rerankProfile.body.id};
  await t.test('protected bounded candidate diagnostics remain separate from runtime response',async()=>{
  const diagnostic=await request('super','retrieval-test/diagnostics','POST',diagnosticInput);assert.equal(diagnostic.status,201);assert.equal(diagnostic.body.status,'READY');assert.ok(diagnostic.body.diagnostics);
  for(const who of ['platform','member'])assert.equal((await request(who,'retrieval-test/diagnostics','POST',diagnosticInput)).status,403);
  assert.ok(diagnostic.body.diagnostics.candidates.length<=100);assert.ok(diagnostic.body.diagnostics.candidates.some(row=>row.retained&&row.fusionRank&&row.rerankRank&&row.finalRank));
  assert.ok(diagnostic.body.diagnostics.candidates.every(row=>row.snippet.length<=240&&row.routeRanks.length<=15));
  assert.ok(diagnostic.body.diagnostics.counts.denseGlobalCandidates<=40);assert.ok(diagnostic.body.diagnostics.counts.lexicalGlobalCandidates<=30);assert.ok(diagnostic.body.diagnostics.timings.totalMs>=0);
  const tinyDiagnostic=await request('super','retrieval-test/diagnostics','POST',{...diagnosticInput,budgetTokens:1});assert.ok(tinyDiagnostic.body.diagnostics.candidates.some(row=>row.reason==='BUDGET'));assert.equal(tinyDiagnostic.body.diagnostics.counts.retainedEvidence,0);
  const diagnosticTrace=await db.knowledgeRetrievalTrace.findUniqueOrThrow({where:{id:diagnostic.body.retrievalId}});assert.ok(!('diagnostics' in diagnosticTrace));assert.ok(!JSON.stringify(diagnosticTrace).includes('HTTP上传正文'));
  const {KnowledgeRetrievalService}=require('../../dist/knowledge-core/retrieval.service.js');
  await assert.rejects(app.get(KnowledgeRetrievalService).retrieveForAdmin(users[1],{actorUserId:users[1],tenantId:null,conversationId:'c',turnId:'t',authorize:async()=>[]},{query:'q'}),error=>error.getStatus?.()===403);
  const ordinary=await request('super','retrieval-test','POST',diagnosticInput);assert.ok(!('diagnostics' in ordinary.body));
  });
  assert.equal((await request('super','retrieval-test','POST',{query:'query',releaseIds:['forged'],debug:true})).status,400);
  const failed=await request('super','retrieval-test','POST',{query:'query',releaseIds:['forged'],mode:'required'});assert.equal(failed.body.status,'FORBIDDEN');assert.deepEqual(failed.body.evidence,[]);
  const chunk=await db.knowledgeChunk.findFirst({where:{indexRevisionId:indexId},include:{index:{include:{releaseItems:true,revision:true}}}});
  assert.ok(chunk);const ref={knowledgeReleaseId:chunk.index.releaseItems[0].releaseId,documentId:chunk.index.revision.documentId,revisionId:chunk.index.revisionId,indexRevisionId:chunk.indexRevisionId,chunkId:chunk.id};
  const source=await request('super','sources/open','POST',ref);assert.equal(source.status,201);assert.equal(source.body.text,chunk.text);assert.equal(source.body.chunkId,chunk.id);
  assert.equal((await request('super','sources/open','POST',{...ref,revisionId:'forged'})).status,404);
  await db.userRole.deleteMany({where:{userId:users[0],roleId:superRole.id}});
  assert.equal((await request('super','sources/open','POST',ref)).status,403);
  assert.equal((await request('super','providers')).status,403);
  assert.equal((await request('super',`providers/${fakeProvider.id}`,'PATCH',{enabled:false})).status,403);

 }finally{
  if(db){await db.user.deleteMany({where:{id:{in:users}}});await db.tenant.deleteMany({where:{id:{in:tenants.filter(id=>!immutableFixtureTenants.has(id))}}});await db.role.deleteMany({where:{id:{in:[...roles,...(createdSuper?[createdSuper]:[])]}}});}
  if(mock){mock.closeAllConnections();await new Promise(resolve=>mock.close(resolve));}
  if(app)await app.close();await rm(dir,{recursive:true,force:true});
 }
});
