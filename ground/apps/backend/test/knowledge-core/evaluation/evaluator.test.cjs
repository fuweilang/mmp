const {test}=require('node:test'),assert=require('node:assert/strict');
const fixture=require('./fixed-60.json');const {evaluateRetrieval}=require('./evaluator.cjs');
function input(){
 const manifest=Object.fromEntries(fixture.sources.map(s=>[s.key,{knowledgeReleaseId:'release',documentId:s.documentKey,revisionId:'revision-'+s.documentKey,indexRevisionId:'index-'+s.documentKey,chunkId:s.key,text:s.exactText,locator:s.locator}]));
 const results=fixture.questions.map(q=>({questionId:q.id,status:q.category==='noanswer'?'NO_EVIDENCE':'READY',evidence:q.expectedSourceKeys.map((k,index)=>({...manifest[k],citation:index+1}))}));return{manifest,results};
}
test('Hit@5 and complete multi-evidence have different denominators and preserve missed second evidence',()=>{
 const {manifest,results}=input();results.find(r=>r.questionId==='crosschunk-01').evidence.pop();const report=evaluateRetrieval(fixture,manifest,results);
 assert.deepEqual(report.hitAt5,{hits:50,total:50,rate:1});assert.deepEqual(report.completeMultiEvidenceAt5,{hits:9,total:10,rate:0.9});assert.equal(report.noAnswer.noEvidence,10);
 assert.equal(report.sourceReferences.failures.length,0);assert.equal(report.manualFaithfulness.status,'PENDING');
});
test('citation checks reject changed locator or frozen version even when the text matches',()=>{
 const {manifest,results}=input();results[0].evidence=[{...results[0].evidence[0],revisionId:'newest-substitution'}];results[1].evidence=[{...results[1].evidence[0],locator:{paragraph:999}}];
 const report=evaluateRetrieval(fixture,manifest,results);assert.equal(report.sourceReferences.failures.length,2);assert.equal(report.hitAt5.hits,48);
});
test('evaluation rejects incomplete or duplicated sixty-question result sets',()=>{
 const {manifest,results}=input();assert.throws(()=>evaluateRetrieval(fixture,manifest,results.slice(1)),/60|question/i);results[1]=results[0];assert.throws(()=>evaluateRetrieval(fixture,manifest,results),/duplicate|question/i);
});

test('citation ordinals must address the exact retained evidence array',()=>{
 const {manifest,results}=input();results[0].evidence[0].citation=0;
 const report=evaluateRetrieval(fixture,manifest,results);assert.equal(report.sourceReferences.failures.length,1);assert.equal(report.hitAt5.hits,49);
});
