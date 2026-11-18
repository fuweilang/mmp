import 'reflect-metadata';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ExpertRuntimeService} from '../../src/official-agent/expert-runtime.service';
import {buildEvidenceContext} from '../../src/knowledge-core/retrieval';
import {knowledgeResultSchema,openedSourceSchema} from '../../../../../mammoth-agent/packages/preset/official-agent-gallery/src/knowledge-protocol';

test('runtime protocol2 stays compatible with the actual strict client while stored paragraph ranges remain intact',async()=>{
 const evidence={knowledgeReleaseId:'r',documentId:'d',revisionId:'v',indexRevisionId:'i',chunkId:'c',text:'Some source text',locator:{paragraph:2,paragraphEnd:5,headingPath:['Heading'],headingPaths:[['Heading','First'],['Heading','Second']]},sourceTitle:'source.docx'};
 const context=buildEvidenceContext([evidence],2000);
 const raw={retrievalId:'trace',status:'READY',queries:['query'],evidence:context.evidence,degradation:[],timings:{},context,queryStrategy:'ORIGINAL'};
 const source={...evidence,sourceStart:10,sourceEnd:26};
 const runtime=new ExpertRuntimeService({$queryRaw:async()=>[{allowed:true}]} as never,{retrieve:async()=>raw,openSource:async()=>source} as never);
 // Isolate the output boundary; the existing terminal authorization still executes.
 (runtime as any).access=async()=>({access:{},config:{retrievalPolicy:'REQUIRED',budgetTokens:2000}});
 const result=await runtime.retrieve({id:'u'} as never,null,{agentId:'a',previewId:'p'},{sessionId:'s',turnId:'t'},'query');
 assert.equal(knowledgeResultSchema.safeParse(result).success,true,'actual client must accept retrieval and context locators');
 assert.deepEqual(raw.evidence[0].locator.headingPaths,[['Heading','First'],['Heading','Second']]);
 assert.equal(raw.evidence[0].locator.paragraphEnd,5,'internal paragraph range must survive projection');
 assert.equal(result.evidence[0].locator.paragraph,2);assert.deepEqual(result.evidence[0].locator.headingPath,['Heading']);
 const opened=await runtime.source({id:'u'} as never,null,{agentId:'a',previewId:'p'},evidence);
 assert.equal(openedSourceSchema.safeParse(opened).success,true,'actual client must accept source reopen');
 assert.equal(opened.sourceStart,10);assert.equal(opened.sourceEnd,26);assert.equal(source.locator.paragraphEnd,5);
});
