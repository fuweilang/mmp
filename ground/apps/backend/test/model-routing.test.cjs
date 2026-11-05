const {test}=require('node:test');const assert=require('node:assert/strict');const {EventEmitter}=require('node:events');const {Readable}=require('node:stream');const axios=require('axios').default;
const {LlmChatGatewayService}=require('../dist/llm/llm-chat.gateway.service');const {modelPricingSnapshot}=require('../dist/billing/model-pricing');const {failureDisposition}=require('../dist/llm/llm-health.service');
function fixture(){
 const events=[],charged=[],calls=[],failedProviders=new Set();
 const rows=[['a','channel-a'],['a2','channel-a'],['b','channel-b']].map(([id,providerId])=>({id,providerId,modelId:id,meta:{supportsTools:true},provider:{id:providerId,name:providerId}}));
 const billing={precheck:async()=>{},quoteModel:async(provider,model)=>modelPricingSnapshot(`${provider}/${model}`,{[`${provider}/${model}`]:{input:2,output:4}},3,10000),reportTokenUsage:async()=>{},freeze:async()=>({skipped:false,frozenCoins:10}),releaseFrozen:async()=>{},settleFrozen:async(_u,_t,payload,price)=>{charged.push({usage:payload.charge,price});return{chargedCoins:3};},charge:async(_u,_t,usage,price)=>{charged.push({usage,price});return{chargedCoins:3};}};
 const health={states:async()=>new Map(),available:target=>!failedProviders.has(target.providerId),failure:async(target,status)=>{if([401,402,403].includes(status))failedProviders.add(target.providerId);return failureDisposition(status)!=='ignore';},success:async()=>{}};
 const log={event:(level,event,fields)=>events.push({level,event,...fields}),requestId:()=> 'test-request'};
 const service=new LlmChatGatewayService({},billing,health,{acquire:()=>()=>{}},log);
 service.candidates=async()=>rows;
 service.toResolved=(p,m)=>({providerId:p.id,providerName:p.name,modelRowId:m.id,modelId:m.modelId,modelRef:`${p.name}/${m.modelId}`,apiKey:'test-secret',baseUrl:'https://example.invalid',thinkingEnabled:false});
 service.resolveModel=async()=>service.toResolved(rows[0].provider,rows[0]);
 const res=new EventEmitter();Object.assign(res,{destroyed:false,headersSent:false,writableEnded:false,headers:{},writes:[],statusCode:200,setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},json(body){this.body=body;this.headersSent=true;this.writableEnded=true;return this;},write(data){this.headersSent=true;this.writes.push(data);},end(){this.writableEnded=true;}});
 return{service,billing,health,log,rows,res,events,charged,calls};
}
const user={id:'member',isPlatformAdmin:false};const data={choices:[{message:{content:'OK'}}],usage:{prompt_tokens:100,completion_tokens:10,total_tokens:110}};
test('auto bypasses a failed provider, charges only the actual fallback model, and records its request',async()=>{
 const f=fixture(),original=axios.post;
 axios.post=async(_url,body)=>{f.calls.push(body.model);return body.model==='a'?{status:401,data:{},headers:{}}:{status:200,data,headers:{}};};
 try{await f.service.proxyChatCompletions(user,'tenant',{model:'auto',messages:[{role:'user',content:'private conversation'}]},f.res);
 assert.deepEqual(f.calls,['a','b']);assert.equal(f.res.headers['X-MMP-Model'],'channel-b/b');assert.equal(f.charged.length,1);assert.equal(f.charged[0].price.modelRef,'channel-b/b');assert.equal(f.charged[0].price.multiplier,3);assert.ok(f.events.some(e=>e.event==='model.selected'&&e.model==='channel-b/b'));assert.ok(!JSON.stringify(f.events).includes('private conversation'));}finally{axios.post=original;}
});
test('explicit selection does not fall back and provider credentials never invalidate the customer login',async()=>{
 const f=fixture(),original=axios.post;axios.post=async(_url,body)=>{f.calls.push(body.model);return{status:401,data:{},headers:{}}};
 try{await f.service.proxyChatCompletions(user,'tenant',{model:'channel-a/a',messages:[]},f.res);assert.deepEqual(f.calls,['a']);assert.equal(f.res.statusCode,503);assert.equal(f.res.body.code,'MODEL_UNAVAILABLE');assert.equal(f.res.body.requestId,'test-request');assert.equal(f.charged.length,0);}finally{axios.post=original;}
});
test('an exhausted customer wallet stops before any model is called',async()=>{
 const f=fixture(),original=axios.post;const {HttpException}=require('@nestjs/common');f.billing.precheck=async()=>{throw new HttpException({code:'INSUFFICIENT_AI_COINS',message:'Insufficient'},402)};axios.post=async()=>{throw Error('must never call upstream')};
 try{await f.service.proxyChatCompletions(user,'tenant',{model:'auto',messages:[]},f.res);assert.equal(f.res.statusCode,402);assert.equal(f.res.body.code,'INSUFFICIENT_AI_COINS');}finally{axios.post=original;}
});
test('a stream that fails after output is visibly interrupted and never switches or replays',async()=>{
 const f=fixture(),original=axios.post;axios.post=async(_url,body)=>{f.calls.push(body.model);return{status:200,headers:{},data:Readable.from((async function*(){yield 'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n';throw Error('stream broken');})())}};
 try{await f.service.proxyChatCompletions(user,'tenant',{model:'auto',stream:true,messages:[]},f.res);assert.deepEqual(f.calls,['a']);assert.ok(f.res.writes.join('').includes('MODEL_STREAM_INTERRUPTED'));assert.ok(f.events.some(e=>e.event==='model.stream_error'));}finally{axios.post=original;}
});
test('availability filters task capability, enterprise restrictions and valid prices',async()=>{
 const f=fixture();const real=new LlmChatGatewayService({llmModel:{findMany:async query=>{assert.equal(query.where.tenantAssignments.none.tenantId,'tenant');return f.rows;}}},f.billing,f.health,{acquire:()=>()=>{}},f.log);
 f.rows[0].meta.supportsTools=false;f.billing.quoteModel=async(p,m)=>{if(m==='b')throw Error('No valid tariff');return {};};
 const rows=await real.candidates(user,'tenant',{messages:[],max_tokens:16,tools:[{type:'function'}]});assert.deepEqual(rows.map(r=>r.id),['a2']);
});
