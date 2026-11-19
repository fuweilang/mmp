import 'reflect-metadata';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {modelPurpose} from '../../src/llm/model-purpose';
import {modelCapabilities} from '../../src/llm/model-capabilities';
import {LlmProvidersService} from '../../src/llm/llm-providers.service';
import {LlmHealthService} from '../../src/llm/llm-health.service';
import {LlmChatGatewayService} from '../../src/llm/llm-chat.gateway.service';
const image={id:'image',providerId:'sf',modelId:'Kwai-Kolors/Kolors',displayName:'Kolors',enabled:true,meta:{purpose:'image',supportsVision:true,supportsTools:true},isPreferred:true};
const chat={id:'chat',providerId:'sf',modelId:'deepseek-flash',displayName:'DeepSeek',enabled:true,isPreferred:true};
test('legacy chat remains chat; image metadata cannot opt into vision chat/tools',()=>{
 assert.equal(modelPurpose(chat),'chat');assert.equal(modelPurpose(image),'image');assert.equal(modelCapabilities(image).vision,false);assert.equal(modelCapabilities(image).tools,false);
});
test('enabled catalog never publishes images or chooses them as preferred',async()=>{
 const db={llmProvider:{findMany:async()=>[{id:'sf',name:'sf',apiKeyEnc:'x',models:[image,chat]}]}};
 const result=await new LlmProvidersService(db as any,{} as any).listEnabledChatCatalog();
 assert.deepEqual(result.models.map(x=>x.modelId),['deepseek-flash']);assert.equal(result.preferredRef,'sf/deepseek-flash');
});
test('automatic chat candidates exclude image before price or health checks',async()=>{
 const db={llmModel:{findMany:async()=>[{...image,provider:{name:'sf'}}]}};
 let quoted=false;const service=new LlmChatGatewayService(db as any,{quoteModel:()=>{quoted=true;}} as any,{states:async()=>new Map(),available:()=>true} as any,{} as any,{} as any);
 const result=await service.listModelsOpenAiShape({isPlatformAdmin:true} as any,null);
 assert.ok(!result.data.some(x=>x.id.includes('Kolors')));assert.equal(quoted,false);
});
test('image cannot be probed as chat or change provider health',async()=>{
 const db={llmModel:{findUnique:async()=>image}};const service=new LlmHealthService(db as any,{} as any);
 const result=await service.probeSaved('image');assert.equal(result.ok,false);assert.match(result.message,/对话/);
});
test('image rejects chat routing controls before mutation',async()=>{
 const db={llmModel:{findUnique:async()=>image}};const service=new LlmProvidersService(db as any,{} as any);
 await assert.rejects(service.updateModel({isPlatformAdmin:true} as any,'image',{isPreferred:true}),/对话/);
});
test('explicit provider/image selection cannot enter chat routing',async()=>{
 const db={llmProvider:{findFirst:async()=>({id:'sf',name:'sf',models:[image]})}};
 const service=new LlmChatGatewayService(db as any,{} as any,{} as any,{} as any,{} as any);
 await assert.rejects(service.resolveModel({isPlatformAdmin:true} as any,null,'sf/Kwai-Kolors/Kolors'),/不可用/);
});
test('background health polling skips image models entirely',async()=>{
 const db={llmProvider:{findMany:async()=>[{id:'sf',models:[image]}]}};
 const service=new LlmHealthService(db as any,{} as any);service.states=async()=>new Map();
 let probes=0;service.probeSaved=async()=>{probes++;throw new Error('unexpected image chat probe');};
 await (service as any).poll();assert.equal(probes,0);
});
