const assert=require('node:assert/strict'),{test}=require('node:test');
const {readFile,writeFile}=require('node:fs/promises'),{join}=require('node:path');
const fixture=require('./fixed-60.json'),{evaluateRetrieval}=require('./evaluator.cjs');
const {createGroundBridge}=require('../ground-harness.fixture.cjs');
test('fixed 60 synthetic questions exercise real Core retrieval; fake scores are not semantic acceptance',async()=>{
 const f=await createGroundBridge();
 try{
  const base=await f.request('admin/knowledge-core/bases','POST',{name:'Fixed 60 synthetic evaluation'}),manifest={},indexes=[];
  for(const document of fixture.documents){
   const text=await readFile(join(__dirname,document.file),'utf8');
   const ingested=await f.ingest(document.file,text,base.id);indexes.push(ingested.indexId);
   for(const source of fixture.sources.filter(s=>s.documentKey===document.key)){
    const chunk=ingested.chunks.find(c=>c.locator.paragraph===source.locator.paragraph);
    assert.ok(chunk,source.key);assert.equal(chunk.text,source.exactText,source.key+' must match actual parser/chunk text');
    manifest[source.key]={documentId:ingested.documentId,revisionId:ingested.revisionId,indexRevisionId:ingested.indexId,chunkId:chunk.id,text:chunk.text,locator:chunk.locator};
   }
  }
  const release=await f.request(`admin/knowledge-core/bases/${base.id}/releases`,'POST',{indexRevisionIds:indexes});
  for(const value of Object.values(manifest))value.knowledgeReleaseId=release.id;
  const published=await f.publishRelease(release.id),results=[];
  for(const q of fixture.questions){
   const result=await f.request(`official-agents/${f.agentId}/runtime/retrieve`,'POST',{executionProtocol:2,versionId:published.onlineVersion.id,sessionId:'synthetic-fixed-60',turnId:q.id,query:q.question,context:q.context});
   if(q.category==='followup')assert.equal(result.queryStrategy,'DETERMINISTIC_CONTEXT');
   assert.ok(['READY','NO_EVIDENCE'].includes(result.status),JSON.stringify(result));
   results.push({questionId:q.id,status:result.status,queries:result.queries,evidence:result.evidence,answer:null,manualReview:'PENDING'});
  }
  const metrics=evaluateRetrieval(fixture,manifest,results);assert.equal(metrics.sourceReferences.failures.length,0);assert.equal(metrics.hitAt5.total,50);assert.equal(metrics.completeMultiEvidenceAt5.total,10);
  const report={runMode:'LOCAL_FAKE_EMBEDDINGS_TRANSPORT_ONLY',semanticQualityAccepted:false,liveEmbeddingConfigured:false,liveRerankConfigured:false,invoiceAccepted:false,releaseId:release.id,manifest,metrics,results};
  if(process.env.RAG_EVALUATION_REPORT_PATH)await writeFile(process.env.RAG_EVALUATION_REPORT_PATH,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({runMode:report.runMode,hitAt5:metrics.hitAt5,completeMultiEvidenceAt5:metrics.completeMultiEvidenceAt5,noAnswer:metrics.noAnswer,sourceReferences:metrics.sourceReferences,manualFaithfulness:metrics.manualFaithfulness}));
 }finally{await f.close();}
});
