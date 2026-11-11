const assert=require('node:assert/strict');
const {isDeepStrictEqual}=require('node:util');
const IDENTITY=['knowledgeReleaseId','documentId','revisionId','indexRevisionId','chunkId'];
/** Evidence-only metrics; absent model answers are never scored as faithful. */
exports.evaluateRetrieval=function evaluateRetrieval(fixture,manifest,results){
 const distribution={direct:15,paraphrase:15,followup:10,crosschunk:10,noanswer:10};
 assert.equal(fixture.questions.length,60,'Expected 60 fixed questions');assert.equal(results.length,60,'Expected 60 question results');
 for(const [category,total] of Object.entries(distribution))assert.equal(fixture.questions.filter(q=>q.category===category).length,total,category);
 const questions=new Map(fixture.questions.map(q=>[q.id,q]));assert.equal(questions.size,60,'Duplicate question');
 const seen=new Set(),failures=[],cases=[];
 let checked=0;
 const validSource=(e)=>Object.values(manifest).find(source=>IDENTITY.every(k=>source[k]===e[k])&&source.text===e.text&&isDeepStrictEqual(source.locator,e.locator));
 for(const result of results){
  const q=questions.get(result.questionId);assert.ok(q&&!seen.has(q.id),'Unknown or duplicate question');seen.add(q.id);
  for(const key of q.expectedSourceKeys)assert.ok(manifest[key],'Expected source missing from frozen manifest');
  const valid=[];
  for(const [index,e] of result.evidence.entries()){
   checked++;if(e.citation!==index+1||!validSource(e)){failures.push({questionId:q.id,index,reason:'CITATION_ORDINAL_OR_EXACT_SOURCE_MISMATCH'});continue;}if(index<5)valid.push(e);
  }
  const hits=q.expectedSourceKeys.filter(key=>valid.some(e=>IDENTITY.every(k=>manifest[key][k]===e[k])));
  cases.push({questionId:q.id,category:q.category,status:result.status,expectedSourceKeys:q.expectedSourceKeys,hitSourceKeys:hits,hitAt5:hits.length>0,completeAt5:q.expectedSourceKeys.length>0&&hits.length===q.expectedSourceKeys.length});
 }
 const answerable=cases.filter(c=>c.category!=='noanswer'),multi=cases.filter(c=>c.category==='crosschunk'),absent=cases.filter(c=>c.category==='noanswer');
 const metric=(rows,key)=>{const hits=rows.filter(r=>r[key]).length;return{hits,total:rows.length,rate:hits/rows.length};};
 return{schemaVersion:1,hitAt5:metric(answerable,'hitAt5'),completeMultiEvidenceAt5:metric(multi,'completeAt5'),noAnswer:{total:10,noEvidence:absent.filter(c=>c.status==='NO_EVIDENCE').length,returnedEvidence:absent.filter(c=>c.hitSourceKeys.length===0&&results.find(r=>r.questionId===c.questionId).evidence.length>0).length},sourceReferences:{checked,failures},manualFaithfulness:{status:'PENDING',reason:'Retrieval metrics do not assess generated claims or no-answer restraint; real model answer and reviewer checklist required.'},cases};
};
