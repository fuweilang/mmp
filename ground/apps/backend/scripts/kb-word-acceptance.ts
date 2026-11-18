import 'reflect-metadata';
import {readFile,writeFile} from 'node:fs/promises';
import {PrismaClient} from '@prisma/client';
import {parseKnowledgeBytes} from '../src/knowledge-core/parser';
import {chunkSections} from '../src/knowledge-core/chunking';
import {createTokenCounter} from '../src/knowledge-core/tokenizer';
import {KnowledgeProfilesService} from '../src/knowledge-core/profiles.service';
import {KnowledgeHttpAdapter} from '../src/knowledge-core/provider';
import {KnowledgeRetrievalService} from '../src/knowledge-core/retrieval.service';
import {chunkEmbeddingInput} from '../src/knowledge-core/embedding-input';
import {lexicalTerms} from '../src/knowledge-core/query-plan';
import assert from 'node:assert/strict';
async function main(){
const dir=process.argv[2];if(!dir)throw Error('OUTPUT_DIRECTORY_REQUIRED');
const bytes=await readFile(`${dir}/source.docx`),counter=createTokenCounter('cl100k_base');
const previous=JSON.parse(await readFile(`${dir}/sections-before.json`,'utf8'));
const parsed=await parseKnowledgeBytes('source.docx',bytes);assert.equal(parsed.status,'READY');
const configs=[{name:'before',sections:previous.sections,targetTokens:600,maxTokens:900,overlapTokens:80},...[
 ['600-900-80',600,900,80],['1000-2000-80',1000,2000,80],['200-300-20',200,300,20],['600-900-0',600,900,0],['600-900-160',600,900,160],['200-210-20',200,210,20]
].map(([name,targetTokens,maxTokens,overlapTokens])=>({name:String(name),sections:parsed.sections,targetTokens:Number(targetTokens),maxTokens:Number(maxTokens),overlapTokens:Number(overlapTokens)}))];
const corpora=configs.map(config=>{const chunks=chunkSections(config.sections,{...config,tokenCounter:counter});const original=config.sections.map((s:any)=>s.text).join('');let covered=0;for(const c of chunks){assert.equal(c.sourceText,original.slice(c.sourceStart,c.sourceEnd));assert.ok(c.tokenCount<=config.maxTokens);assert.ok(c.sourceStart<=covered);covered=Math.max(covered,c.sourceEnd);}assert.equal(covered,original.length);return {name:config.name,chunks};});
const summary=corpora.map(c=>({name:c.name,count:c.chunks.length,minTokens:Math.min(...c.chunks.map(x=>x.tokenCount)),maxTokens:Math.max(...c.chunks.map(x=>x.tokenCount)),meanTokens:Math.round(c.chunks.reduce((n,x)=>n+x.tokenCount,0)/c.chunks.length),overlappingPairs:c.chunks.filter((x,i)=>i>0&&x.sourceStart<c.chunks[i-1].sourceEnd).length}));
await writeFile(`${dir}/comparison.json`,JSON.stringify({summary,corpora},null,2));console.log(JSON.stringify({summary}));
const cases=[
 {query:'课程结营达标需要多少分？低于70分怎么办？',expect:['70—84','补交']},
 {query:'GEO模块的实操任务是什么，需要交付哪些成果？',expect:['语义词库','优先问题清单']},
 {query:'课前应该准备哪些企业材料？',expect:['企业介绍','典型客户']},
 {query:'每个学员需要设置几个北极星指标和过程指标？',expect:['北极星指标','2—3']},
 {query:'企业AI改革试点的达标检查有哪些要求？',expect:['效率指标','人工复核']},
 {query:'讲师罗小军写过哪本GEO著作？',expect:['GEO 生成式引擎优化']},
 {query:'私域运营模块的阶段成果有哪些？',expect:['用户分层标准','7 天触达计划']},
 {query:'参加课程对学员的决策权限有什么要求？',expect:['决策或推进权限','启动试点']},
];
const db=new PrismaClient(),usage:any[]=[];
try{
 const profiles=new KnowledgeProfilesService(db as never);
 const profile=await db.knowledgeProfile.findFirstOrThrow({where:{id:'migration-source-bge-m3-v1',enabled:true,task:'EMBEDDING'}});
 const adapter=new KnowledgeHttpAdapter({resolveForRequest:profiles.resolveForRequest.bind(profiles),recordUsage:async(row:any)=>{usage.push(row);}} as never);
 const tested=[corpora[0],corpora[1],corpora[2],corpora[3]];
 const embeddingText=(c:any)=>chunkEmbeddingInput(c,counter,profile.maxInputTokens);
 const texts=[...new Set([...tested.flatMap(c=>c.chunks.map(embeddingText)),...cases.map(x=>x.query)])];
 console.log(JSON.stringify({embeddingInputs:texts.length,model:profile.model}));
 const vectors=(await adapter.embed(profile.id,texts)).vectors,cache=new Map(texts.map((text,i)=>[text,vectors[i]]));
 await writeFile(`${dir}/embedding-cache.json`,JSON.stringify({model:profile.model,texts,vectors}));
 const dot=(a:number[],b:number[])=>{let v=0,aa=0,bb=0;for(let i=0;i<a.length;i++){v+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}return v/Math.sqrt(aa*bb);};
 const reports=[];
 for(const corpus of tested){
  const rows=corpus.chunks.map(c=>({...c,chunkId:`chunk-${c.ordinal}`,documentId:'local-doc',revisionId:'local-rev',indexRevisionId:'local-index',knowledgeReleaseId:'local-release',sourceTitle:'AI增长训练营·课程大纲-专业磨课版.docx',scope:{type:'PLATFORM'},score:0}));
  const trace={count:async()=>0,create:async({data}:any)=>data,update:async({data}:any)=>data,updateMany:async()=>({count:1})};
  const memoryDb={user:{findUnique:async()=>({status:'active'})},userRole:{findFirst:async()=>({roleId:'local-super'})},knowledgeRetrievalTrace:trace,$transaction:async(work:any)=>work({$queryRaw:async()=>[{locked:true}],knowledgeRetrievalTrace:trace})};
  const core={getRetrievalInventory:async()=>[{id:'local-index',profileId:profile.id,status:'READY',revision:{document:{id:'local-doc',enabled:true}},profile:{enabled:true}}]};
  const store={
   dense:async(_s:any,v:number[])=>rows.map(r=>({...r,score:dot(cache.get(embeddingText(r))!,v)})).sort((a,b)=>b.score-a.score).slice(0,40),
   lexical:async(_s:any,q:string)=>rows.map(r=>({...r,score:(r.text.toLowerCase().includes(q.toLowerCase())?1000:0)+lexicalTerms(q).reduce((n,t)=>n+(r.text.toLowerCase().includes(t)?t.length:0),0)})).filter(r=>r.score>0).sort((a,b)=>b.score-a.score||a.chunkId.localeCompare(b.chunkId)).slice(0,30),
   exact:async(_s:any,id:string)=>rows.filter(r=>r.chunkId===id),
   neighbors:async(_s:any,_i:string,n:number)=>rows.filter(r=>Math.abs(r.ordinal-n)<=2&&r.ordinal!==n).sort((a,b)=>Math.abs(a.ordinal-n)-Math.abs(b.ordinal-n)),
   section:async(_s:any,_i:string,p:string[])=>rows.filter(r=>JSON.stringify(r.locator.headingPath)===JSON.stringify(p)).slice(0,7),
  };
  const provider={embed:async(_id:string,queries:string[])=>({vectors:queries.map(q=>cache.get(q)!)})};
  const service=new KnowledgeRetrievalService(memoryDb as never,core as never,provider as never,store as never),results=[];
  for(const [i,c] of cases.entries()){
   const result=await service.retrieveForAdmin('local-admin',{actorUserId:'local-admin',tenantId:null,conversationId:'local-test',turnId:String(i),authorize:async()=>[{releaseId:'local-release',scope:{type:'PLATFORM'}}]}, {query:c.query,mode:'required',budgetTokens:4000});
   assert.equal(result.status,'READY',JSON.stringify(result.degradation));
   const evidence=result.evidence.map(e=>e.text).join('\n'),hit=c.expect.every(fact=>evidence.includes(fact));
   results.push({query:c.query,expected:c.expect,hit,evidence:result.evidence.map(e=>({text:e.text,locator:e.locator})),status:result.status,degradation:result.degradation});
  }
  reports.push({name:corpus.name,pass:results.filter(r=>r.hit).length,total:results.length,results});console.log(JSON.stringify({corpus:corpus.name,recallFactsPassed:reports.at(-1)!.pass,total:cases.length}));
 }
 await writeFile(`${dir}/recall.json`,JSON.stringify({method:'Real configured BGE-M3 embeddings with production chapter-context input + production retrieval orchestration; in-memory cosine/lexical candidates and traces; no database writes; no reranker or generated answers',model:profile.model,usage,reports},null,2));
}catch(error){await writeFile(`${dir}/recall-error.json`,JSON.stringify({code:(error as any).code??'LOCAL_ACCEPTANCE_FAILED',usage}));throw error;}finally{await db.$disconnect();}
}
main().catch(e=>{console.error({code:e?.code??'LOCAL_ACCEPTANCE_FAILED',message:e?.code?'Provider or validation failed':e.message});process.exitCode=1;});
