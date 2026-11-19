import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import sharp from 'sharp';
import { AvatarGenerationService } from '../../src/llm/avatar-generation.service';
import { encryptApiKey } from '../../src/llm/llm-key-crypto';
process.env.LLM_API_KEY_SECRET='avatar-unit-test-secret';
const admin={id:'admin',isPlatformAdmin:true} as any;
const provider={id:'sf',name:'sf',displayName:'SiliconFlow',enabled:true,baseUrl:'https://api.siliconflow.cn/v1',apiKeyEnc:encryptApiKey('test-only-key'),models:['Kwai-Kolors/Kolors','Qwen/Qwen-Image'].map(modelId=>({modelId,displayName:modelId.split('/').pop(),enabled:true,meta:{purpose:'image'}}))};
function service(){return new AvatarGenerationService({llmProvider:{findMany:async()=>[provider]}} as any);}
test('rejects non-admin before looking up credentials', async()=>{
 await assert.rejects(service().models({id:'user',isPlatformAdmin:false} as any), /仅平台管理员/);
});
test('discovers only supported generation models, excludes edit and chat', async()=>{
 const old=axios.defaults.adapter;
 axios.defaults.adapter=async config=>({data:{data:[{id:'Kwai-Kolors/Kolors'},{id:'Qwen/Qwen-Image'},{id:'Qwen/Qwen-Image-Edit'},{id:'vision-chat'}]},status:200,statusText:'OK',headers:{},config});
 try {const result=await service().models(admin);assert.deepEqual(result.models.map(x=>x.model),['Kwai-Kolors/Kolors','Qwen/Qwen-Image']);assert.ok(!JSON.stringify(result).includes('test-only-key'));}
 finally {axios.defaults.adapter=old;}
});
test('generates normalized pending image without persisting and never forwards credentials to image storage',async()=>{
 const old=axios.defaults.adapter;const png=await sharp({create:{width:64,height:64,channels:3,background:'#504da0'}}).png().toBuffer();let calls=0;
 axios.defaults.adapter=async config=>{calls++;let data:any;
 if(config.url?.endsWith('/models')) data={data:[{id:'Kwai-Kolors/Kolors'}]};
 else if(config.url?.endsWith('/images/generations')){assert.ok(config.headers.Authorization);assert.equal(JSON.parse(config.data).image_size,'1024x1024');data={images:[{url:'https://s3.siliconflow.cn/result.png'}]};}
 else {assert.equal(config.headers.Authorization,undefined);data=png;}
 return {data,status:200,statusText:'OK',headers:{},config};};
 try{const result=await service().generate(admin,{providerId:'sf',model:'Kwai-Kolors/Kolors',prompt:'简洁的增长图标'});assert.equal(result.mimeType,'image/png');assert.ok(result.base64.length);assert.equal(calls,3);}
 finally{axios.defaults.adapter=old;}
});
test('blocks upstream URLs outside approved image storage and invalid prompts',async()=>{
 const old=axios.defaults.adapter;
 axios.defaults.adapter=async config=>({data:config.url?.endsWith('/models')?{data:[{id:'Kwai-Kolors/Kolors'}]}:{images:[{url:'http://127.0.0.1/private'}]},status:200,statusText:'OK',headers:{},config});
 try{await assert.rejects(service().generate(admin,{providerId:'sf',model:'Kwai-Kolors/Kolors',prompt:'avatar'}), /图片地址/);await assert.rejects(service().generate(admin,{providerId:'sf',model:'Kwai-Kolors/Kolors',prompt:''}),/描述/);}
 finally{axios.defaults.adapter=old;}
});
test('production proxy budget covers model discovery, generation and image download', async()=>{
 const {readFileSync}=await import('node:fs');const {resolve}=await import('node:path');
 const config=readFileSync(resolve(__dirname,'../../../../infra/production/nginx-mmai.conf'),'utf8');
 const block=config.match(/location = \/admin\/api\/avatar-generation\s*\{([^}]+)\}/)?.[1] || '';
 assert.match(block,/proxy_read_timeout 180s;/);assert.match(block,/proxy_pass http:\/\/127\.0\.0\.1:33100\/api\/admin\/avatar-generation;/);
});
test('avatar choices only include registered enabled image models and use their display names',async()=>{
 const p={...provider,models:[{id:'i',modelId:'Kwai-Kolors/Kolors',displayName:'Kolors',enabled:true,meta:{purpose:'image'}}]};
 const db={llmProvider:{findMany:async()=>[p]}};const old=axios.defaults.adapter;
 axios.defaults.adapter=async config=>({data:{data:[{id:'Kwai-Kolors/Kolors'},{id:'Qwen/Qwen-Image'}]},status:200,statusText:'OK',headers:{},config});
 try{const result=await new AvatarGenerationService(db as any).models(admin);assert.deepEqual(result.models.map(m=>m.model),['Kwai-Kolors/Kolors']);assert.equal(result.models[0].displayName,'Kolors');}
 finally{axios.defaults.adapter=old;}
});
test('disabled registered model rejects generation before contacting upstream',async()=>{
 const p={...provider,models:[{modelId:'Kwai-Kolors/Kolors',enabled:false,meta:{purpose:'image'}}]};
 const service=new AvatarGenerationService({llmProvider:{findMany:async()=>[p]}} as any);
 await assert.rejects(service.generate(admin,{providerId:'sf',model:'Kwai-Kolors/Kolors',prompt:'avatar'}), /停用|管理/);
});
test('explicit image sync preserves existing enabled switch and custom name, without chat defaults or probes',async()=>{
 const old=axios.defaults.adapter;const updates:any[]=[];let audited=0;
 axios.defaults.adapter=async config=>({data:{data:[{id:'Kwai-Kolors/Kolors'}]},status:200,statusText:'OK',headers:{},config});
 const tx={llmModel:{findUnique:async()=>({enabled:false,displayName:'我的头像模型',meta:{extra:'keep'}}),upsert:async(input:any)=>{updates.push(input);}},auditLog:{create:async()=>{audited++;}}};
 const db={llmProvider:{findMany:async()=>[provider]},$transaction:async(fn:any)=>fn(tx)};
 try{const result=await new AvatarGenerationService(db as any).sync(admin);assert.equal(result.registered,1);assert.equal(audited,1);assert.equal(updates[0].update.enabled,undefined);assert.equal(updates[0].update.displayName,undefined);assert.equal(updates[0].update.isPreferred,false);assert.equal(updates[0].update.meta.purpose,'image');assert.equal(updates[0].update.meta.extra,'keep');}
 finally{axios.defaults.adapter=old;}
});
