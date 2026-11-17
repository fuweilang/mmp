import 'reflect-metadata';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ExpertRuntimeService} from '../../src/official-agent/expert-runtime.service';

test('content-verified history requires every source prefix and fails closed on a denied snapshot',async()=>{
 const db={$queryRaw:async()=>[{allowed:true}]};
 const runtime=new ExpertRuntimeService(db as any,undefined as any);
 const expected={userId:'u',scope:'personal',verifyContent:true};
 const source={knowledgeReleaseId:'r',documentId:'d',revisionId:'v',indexRevisionId:'i',chunkId:'c'};
 const entry={binding:{agentId:'a',previewId:'pv'},sources:[source]};
 await assert.rejects(runtime.authorizeHistory({id:'u'} as any,null,expected,[entry]),/EXPERT_SOURCE_CONTENT_REQUIRED/);
 assert.deepEqual(await runtime.authorizeHistory({id:'u'} as any,null,expected,[{...entry,sources:[{...source,text:'原始证据前缀🦣'}]}]),{authorized:true,contentVerified:true});
 db.$queryRaw=async()=>[{allowed:false}];
 await assert.rejects(runtime.authorizeHistory({id:'u'} as any,null,expected,[{...entry,sources:[{...source,text:'原始证据前缀🦣'}]}]),/KNOWLEDGE_FORBIDDEN/);
});
