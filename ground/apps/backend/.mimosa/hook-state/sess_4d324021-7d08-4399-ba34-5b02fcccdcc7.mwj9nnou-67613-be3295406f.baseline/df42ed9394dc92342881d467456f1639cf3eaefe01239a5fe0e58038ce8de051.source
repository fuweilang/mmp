import 'reflect-metadata';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ExpertRuntimeService,BUILTIN_TOOL_REVISION} from '../../src/official-agent/expert-runtime.service';
test('an empty or not-yet-processed owned folder does not enable required retrieval with no usable files',async()=>{
  const config={route:'KNOWLEDGE_CORE',retrievalPolicy:'OFF',releaseIds:[],knowledge:[],skillPackages:[],builtinToolRevision:BUILTIN_TOOL_REVISION,generationModel:{mode:'AUTO'},budgetTokens:8000};
  const db:any={user:{findUnique:async()=>({id:'actor',status:'active'})},officialAgent:{findUnique:async()=>({id:'expert',key:'expert',kind:'GENERAL',status:'PUBLISHED',onlineVersionId:'version'})},officialAgentVersion:{findFirst:async()=>({id:'version',version:1,systemPrompt:'测试',expertDefinition:{},toolScope:[],linkedSkillSummaries:[],executionConfig:config})}};
  const core:any={resolveExpertKnowledge:async()=>({releases:[],ownsKnowledge:true,selectionPolicy:'OFF'})};
  const runtime=new ExpertRuntimeService(db,{} as any,core);
  const resolved=await runtime.resolve({id:'actor'} as any,null,{agentId:'expert',versionId:'version'});
  assert.deepEqual(resolved.executionConfig.releaseIds,[]);
  assert.equal(resolved.executionConfig.retrievalPolicy,'OFF');
});
