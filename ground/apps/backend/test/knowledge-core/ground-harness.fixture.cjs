// Integration fixture: real AppModule/Core/worker/gateway; only external supplier and reference-price input are synthetic.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID, randomInt } = require('node:crypto');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { createServer } = require('node:http');
exports.createGroundBridge = async function createGroundBridge() {
  const database = new URL(process.env.RAG_TEST_DATABASE_URL || 'http://invalid');
  if (database.protocol !== 'postgresql:' || database.hostname !== '127.0.0.1' || database.port !== '55441' || database.pathname !== '/mmp_rag_acceptance' || database.username !== 'rag_test') throw Error('DEDICATED_DB_REQUIRED');
  const temp = await mkdtemp(join(tmpdir(), 'rag7-bridge-'));
  Object.assign(process.env, {DATABASE_URL:database.href, JWT_SECRET:randomUUID()+randomUUID(), LLM_API_KEY_SECRET:'rag7-local-encryption-only', LLM_HEALTH_ENABLED:'0', LLM_PRICE_REFRESH_ENABLED:'0', COOKIE_NAME:'rag7_bridge', LOG_DIR:temp, KNOWLEDGE_CORE_DIR:join(temp,'blobs')});
  const { NestFactory } = require('@nestjs/core'), { ValidationPipe } = require('@nestjs/common');
  const { AppModule } = require('../../dist/app.module');
  const { PrismaService } = require('../../dist/prisma/prisma.service');
  const { KnowledgeIngestionWorker } = require('../../dist/knowledge-core/ingestion.worker');
  const { LlmHealthService } = require('../../dist/llm/llm-health.service');
  const { BillingConfigService } = require('../../dist/billing/billing-config.service');
  let app, mock, user, agentId, db, failingEmbedding = false;
  const wires = [], retrievals = [], rerankWires = [], historyDecisions = [], sourceReads = [];
  let alternatingDocs;
  const close = async () => {
    if (db) {
      if (agentId) await db.officialAgent.delete({where:{id:agentId}});
      if (user) await db.user.delete({where:{id:user.id}});
    }
    await app?.close();
    if (mock) { mock.closeAllConnections(); await new Promise(resolve=>mock.close(resolve)); }
    await rm(temp,{recursive:true,force:true});
  };
  try {
    mock = createServer((request,response) => {
      let bytes=''; request.on('data', part=>bytes+=part); request.on('end',()=>{
        const body=JSON.parse(bytes); response.setHeader('Content-Type','application/json');
        if (request.url.endsWith('/embeddings')) {
          if(failingEmbedding){response.statusCode=503;response.end('{}');return;}
          response.end(JSON.stringify({data:body.input.map((_,index)=>({index,embedding:[1,0]})),usage:{total_tokens:7}}));return;
        }
        if(request.url.endsWith('/rerank')) { rerankWires.push(body); response.end(JSON.stringify({results:body.documents.slice(0,body.top_n).map((_,index)=>({index,relevance_score:1/(index+1)})),usage:{total_tokens:3}}));return; }
        if (body.stream) {
          wires.push(body);
          // Deliberately scripted transport answer, not learned relevance or faithfulness evidence.
          const wire = JSON.stringify(body.messages);
          const label = wire.match(/T\d+L\d+S\d+/)?.[0];
          const fact = wire.includes('BRIDGE_FACT_OLD') ? 'BRIDGE_FACT_OLD: 退款期限三天' : wire.includes('BRIDGE_FACT_NEW') ? 'BRIDGE_FACT_NEW: 退款期限七天' : 'LEGACY_PROMPT_ONLY';
          response.setHeader('Content-Type','text/event-stream');
          response.write('data: '+JSON.stringify({id:'rag7-local',choices:[{index:0,delta:{content:fact+(label?` [${label}]`:'')},finish_reason:null}]})+'\n\n');
          response.write('data: '+JSON.stringify({id:'rag7-local',choices:[{index:0,delta:{},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:5,total_tokens:15}})+'\n\n');
          response.end('data: [DONE]\n\n');
        } else response.end(JSON.stringify({choices:[{message:{role:'assistant',content:'local health only'},finish_reason:'stop'}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}}));
      });
    });
    await new Promise(resolve=>mock.listen(0,'127.0.0.1',resolve));
    app=await NestFactory.create(AppModule,{logger:false,abortOnError:false});app.setGlobalPrefix('api');app.use(require('cookie-parser')());app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true,forbidNonWhitelisted:true}));
    await app.listen(0,'127.0.0.1');const origin=await app.getUrl();db=app.get(PrismaService);
    const {ExpertRuntimeService}=require('../../dist/official-agent/expert-runtime.service');
    const runtime=app.get(ExpertRuntimeService), retrieve=runtime.retrieve.bind(runtime), open=runtime.source.bind(runtime), history=runtime.authorizeHistory.bind(runtime);
    runtime.retrieve=async(...args)=>{const result=await retrieve(...args);retrievals.push({transport:args[3],query:args[4],strategy:result.queryStrategy,queries:result.queries,evidence:result.evidence});return result;};
    runtime.source=async(...args)=>{const result=await open(...args);if(alternatingDocs){sourceReads.push(result.documentId);if(result.documentId===alternatingDocs[0])await db.$transaction([db.knowledgeDocument.update({where:{id:alternatingDocs[0]},data:{enabled:false}}),db.knowledgeDocument.update({where:{id:alternatingDocs[1]},data:{enabled:true}})]);}return result;};
    runtime.authorizeHistory=async(...args)=>{try{const result=await history(...args);historyDecisions.push({allowed:true,entries:args[3]});return result;}catch(error){historyDecisions.push({allowed:false,entries:args[3]});throw error;}};
    const marker=randomUUID(), password=randomUUID(), passwordHash=await require('bcryptjs').hash(password,4);
    const role=await db.role.upsert({where:{key:'super_admin'},update:{},create:{key:'super_admin',name:'local super',scope:'PLATFORM',permissions:{create:{permKey:'portal.admin.access'}}}});
    user=await db.user.create({data:{name:'RAG7 synthetic bridge',phone:`16${randomInt(100000000,999999999)}`,passwordHash,isPlatformAdmin:true}});
    await db.userRole.create({data:{userId:user.id,roleId:role.id}});
    const login=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({phone:user.phone,password})});assert.equal(login.status,200);
    const cookie=login.headers.getSetCookie().find(c=>c.startsWith('rag7_bridge=')).split(';')[0], token=cookie.slice(cookie.indexOf('=')+1);await login.arrayBuffer();
    const request=async(path,method='GET',body) => {
      const r=await fetch(origin+'/api/'+path,{method,headers:{authorization:`Bearer ${token}`,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
      const result=await r.json();assert.ok(r.ok,`${path}: ${r.status} ${JSON.stringify(result)}`);return result;
    };
    const provider=await request('admin/knowledge-core/providers','POST',{name:`rag7-${marker}`,displayName:'LOCAL ENGINEERING ONLY',baseUrl:`http://127.0.0.1:${mock.address().port}/v1`,apiKey:'synthetic-rag7-provider-key'});
    const model=await db.llmModel.create({data:{providerId:provider.id,modelId:'engineering-chat',displayName:'local transport',meta:{supportsTools:true,contextWindow:64000}}});
    const helperModel=await db.llmModel.create({data:{providerId:provider.id,modelId:'engineering-helper',displayName:'local helper',meta:{supportsTools:true,contextWindow:64000}}});
    const billing=app.get(BillingConfigService);
    billing.quoteModel=async(name,modelId)=>name===provider.name?{version:'model-cost-v1',modelRef:`${name}/${modelId}`,input:1,output:2,cachedInput:0.1,multiplier:1,aiCoinsPerYuan:10000,source:'LOCAL_ENGINEERING_FAKE_PRICE_NOT_INVOICE',checkedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString()}:(()=>{throw Error('No external reference-price input for non-fixture supplier');})();
    assert.equal((await app.get(LlmHealthService).probeSaved(model.id)).ok,true);
    assert.equal((await app.get(LlmHealthService).probeSaved(helperModel.id)).ok,true);
    const profile=await request('admin/knowledge-core/profiles','POST',{providerId:provider.id,task:'EMBEDDING',model:'synthetic-embedding',dimension:2});
    const base=await request('admin/knowledge-core/bases','POST',{name:'RAG7 synthetic corpus'});
    const worker=app.get(KnowledgeIngestionWorker);
    async function upload(text,documentId,targetBaseId=base.id,originalName='桥接退款🦣.md') {
      const form=new FormData();form.append('file',new Blob([text]),originalName);form.append('profileId',profile.id);form.append('idempotencyKey',randomUUID());if(documentId)form.append('documentId',documentId);
      const r=await fetch(origin+`/api/admin/knowledge-core/bases/${targetBaseId}/documents`,{method:'POST',headers:{authorization:`Bearer ${token}`},body:form});assert.equal(r.status,201);return r.json();
    }
    async function finish(job) {
      for(let i=0;i<30;i++) { const state=await request(`admin/knowledge-core/jobs/${job.id}`);if(!['QUEUED','RUNNING'].includes(state.status)){assert.equal(state.index.status,'READY',JSON.stringify(state));return state.index;}await worker.runOnce(); }
      throw Error('fixture worker did not reach READY');
    }
    const initial=await finish(await upload('BRIDGE_FACT_OLD：退款期限三天。'));
    const release=await request(`admin/knowledge-core/bases/${base.id}/releases`,'POST',{indexRevisionIds:[initial.id]});
    const draft=await request('admin/official-agents','POST',{key:`rag7-${marker}`,kind:'GENERAL',name:'RAG7 桥接专家',summary:'本地合成验收',openingQuestions:[],systemPrompt:'依据返回资料回答退款问题。',toolScope:[]});agentId=draft.id;
    const legacy=await request(`admin/official-agents/${agentId}/publish`,'POST',{});
    const publish=async(releaseId)=>{await request(`admin/official-agents/${agentId}`,'PATCH',{executionConfig:{route:'KNOWLEDGE_CORE',releaseIds:[releaseId],retrievalPolicy:'REQUIRED',budgetTokens:8000,generationModel:{mode:'FIXED',modelId:model.id}}});return request(`admin/official-agents/${agentId}/publish`,'POST',{});};
    const publication=await publish(release.id);
    const original=await db.knowledgeDocumentRevision.findUniqueOrThrow({where:{id:initial.revisionId}});
    const oldChunks=await db.knowledgeChunk.findMany({where:{indexRevisionId:initial.id},orderBy:{ordinal:'asc'}});
    assert.equal(original.originalName,'桥接退款🦣.md');
    return {origin,token,agentId,versionId:publication.onlineVersion.id,legacyVersionId:legacy.onlineVersion.id,releaseId:release.id,indexId:initial.id,documentId:original.documentId,revisionId:original.id,profileId:profile.id,modelRef:`${provider.name}/${model.modelId}`,wires,retrievals,rerankWires,historyDecisions,sourceReads,oldChunks,request,close,userId:user.id,helperModelRef:`${provider.name}/${helperModel.modelId}`,
      async usage(sessionId){return db.tokenUsageTurn.findMany({where:{userId:user.id,threadId:sessionId},orderBy:{createdAt:'asc'}});},
      async expiringPreview(){
        const created=await request(`admin/official-agents/${agentId}/preview`,'POST',{});
        const row=await db.officialExpertPreview.findUniqueOrThrow({where:{id:created.id??created.previewId}});
        const {id,createdAt,...data}=row;
        const [{now}]=await db.$queryRaw`SELECT statement_timestamp() AS now`;
        return db.officialExpertPreview.create({data:{...data,expiresAt:new Date(Math.max(Date.now(),now.getTime())+15000)}});
      },
      async waitPreviewExpiry(id){
        const row=await db.officialExpertPreview.findUniqueOrThrow({where:{id}});
        const deadline=performance.now()+60000;
        for(;;){
          const [{expired}]=await db.$queryRaw`SELECT expires_at <= statement_timestamp() AS expired FROM official_expert_preview WHERE id=${id}`;
          if(expired&&Date.now()>=row.expiresAt.getTime())return;
          if(performance.now()>deadline)throw Error('fixture preview clocks did not reach expiry');
          await new Promise(resolve=>setTimeout(resolve,100));
        }
      },
      publishRelease:publish,
      async pairRelease(){
        const second=await finish(await upload('BRIDGE_FACT_B：保修期限十天。'));
        const pair=await request(`admin/knowledge-core/bases/${base.id}/releases`,'POST',{indexRevisionIds:[initial.id,second.id]});
        const published=await publish(pair.id);
        return {versionId:published.onlineVersion.id,releaseId:pair.id};
      },
      async alternate(documents){
        alternatingDocs=documents;sourceReads.length=0;
        await db.$transaction(documents.map((id,i)=>db.knowledgeDocument.update({where:{id},data:{enabled:i===0}})));
      },
      async restoreSources(){
        const docs=alternatingDocs;alternatingDocs=undefined;
        if(docs)await db.knowledgeDocument.updateMany({where:{id:{in:docs}},data:{enabled:true}});
      },
      async rerankCapacity(batchSize){
        const rerank=await request('admin/knowledge-core/profiles','POST',{providerId:provider.id,task:'RERANK',model:'synthetic-rerank',batchSize});
        const index=await finish(await upload(Array.from({length:20},(_,i)=>`RERANK_CAPACITY_${i} 退款期限说明${i}。`).join('\n\n')));
        const rel=await request(`admin/knowledge-core/bases/${base.id}/releases`,'POST',{indexRevisionIds:[index.id]});
        const result=await request('admin/knowledge-core/retrieval-test/diagnostics','POST',{query:'退款期限',releaseIds:[rel.id],mode:'required',rerankProfileId:rerank.id});
        return {result,wire:rerankWires.at(-1),profileId:rerank.id};
      },
      async ingest(originalName,text,targetBaseId){
        const index=await finish(await upload(text,undefined,targetBaseId,originalName));
        const revision=await db.knowledgeDocumentRevision.findUniqueOrThrow({where:{id:index.revisionId}});
        return {documentId:revision.documentId,revisionId:revision.id,indexId:index.id,chunks:await db.knowledgeChunk.findMany({where:{indexRevisionId:index.id},orderBy:{ordinal:'asc'}})};
      },
      failEmbedding(value){failingEmbedding=value;},
      async replaceAndReindex(){
        const changed=await finish(await upload('BRIDGE_FACT_NEW：退款期限七天。',original.documentId));
        const reindex=await request(`admin/knowledge-core/revisions/${changed.revisionId}/reindex`,'POST',{profileId:profile.id,idempotencyKey:randomUUID(),indexConfig:{targetTokens:50,maxTokens:100,overlapTokens:0}});
        const next=await finish(reindex);assert.notEqual(next.id,changed.id);
        const nextRelease=await request(`admin/knowledge-core/bases/${base.id}/releases`,'POST',{indexRevisionIds:[next.id]});const nextPublication=await publish(nextRelease.id);
        assert.deepEqual(await db.knowledgeChunk.findMany({where:{indexRevisionId:initial.id},orderBy:{ordinal:'asc'}}),oldChunks);
        return {versionId:nextPublication.onlineVersion.id,releaseId:nextRelease.id,indexId:next.id,revisionId:next.revisionId};
      },
      async cancelAndRetry(){const job=await upload('取消后重试的独立资料');assert.equal((await request(`admin/knowledge-core/jobs/${job.id}/cancel`,'POST',{})).status,'CANCELLED');await worker.runOnce();assert.equal((await request(`admin/knowledge-core/jobs/${job.id}`)).status,'CANCELLED');await request(`admin/knowledge-core/jobs/${job.id}/retry`,'POST',{});return finish(job);},
      revoke(enabled){return request(`admin/knowledge-core/documents/${original.documentId}`,'PATCH',{enabled});},
      rollback(){return request(`admin/official-agents/${agentId}/rollback/${legacy.onlineVersion.id}`,'POST',{});},
    };
  } catch(error) { await close(); throw error; }
};
