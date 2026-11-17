import 'reflect-metadata';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ExpertRuntimeService} from '../../src/official-agent/expert-runtime.service';
import {encryptApiKey} from '../../src/llm/llm-key-crypto';
process.env.LLM_API_KEY_SECRET='fix1-test-only';

test('freeze blocks locally unusable embedding and rerank dependencies without provider I/O',async t=>{
 for(const task of ['EMBEDDING','RERANK'])for(const kind of ['disabled-provider','missing-key','corrupt-key','empty-key','missing-endpoint','wrong-task'])await t.test(task+'/'+kind,async()=>{
  const profile:any={id:'p',task:kind==='wrong-task'?'OTHER':task,enabled:true,providerId:'provider',model:'fake',adapter:task==='EMBEDDING'?'OPENAI_EMBEDDINGS':'COMPATIBLE_RERANK',batchSize:32,dimension:2,endpoint:kind==='missing-endpoint'?'':'http://127.0.0.1:9/unused'};
  const provider={enabled:kind!=='disabled-provider',apiKeyEnc:kind==='missing-key'?null:kind==='corrupt-key'?'not-ciphertext':encryptApiKey(kind==='empty-key'?'  ':'fake')};
  const index={id:'i',status:'READY',profileId:'p',indexConfigHash:'hash',revision:{id:'rev',document:{id:'d',enabled:true}},profile};
  const db:any={knowledgeRelease:{findUnique:async()=>({id:'r',baseId:'b',sealed:true,base:{scope:'PLATFORM',tenantId:null,enabled:true},items:[{index}]})},knowledgeProfile:{findUnique:async()=>({...profile,provider})},llmProvider:{findUnique:async()=>provider}};
  const service=new ExpertRuntimeService(db,{} as any);
  const config=task==='EMBEDDING'?{route:'KNOWLEDGE_CORE',releaseIds:['r']}:{rerankProfileId:'p'};
  await assert.rejects(()=>service.freeze(config,[],[],db));
 });
});
test('freeze rejects fixed model absent URL/corrupt or empty credential and missing web search configuration',async t=>{
 for(const kind of ['missing-url','corrupt-key','empty-key','web-search'])await t.test(kind,async()=>{
  const provider={name:'p',enabled:true,baseUrl:kind==='missing-url'?null:'http://127.0.0.1:9',apiKeyEnc:kind==='corrupt-key'?'bad':encryptApiKey(kind==='empty-key'?' ':'fake')};
  const db:any={llmModel:{findUnique:async()=>({id:'m',enabled:true,modelId:'chat',provider})},llmProvider:{findFirst:async()=>null}};
  const svc=new ExpertRuntimeService(db,{} as any);
  await assert.rejects(()=>svc.freeze(kind==='web-search'?undefined:{generationModel:{mode:'FIXED',modelId:'m'}},kind==='web-search'?['web_search']:[],[],db));
 });
});
