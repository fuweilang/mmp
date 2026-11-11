import 'reflect-metadata';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {LibraryService} from '../../src/library/library.service';
import {MemoryLibraryStore} from '../../src/library/library.store';
import {KnowledgeLibrarySourceAdapter} from '../../src/knowledge-core/library-source.adapter';

test('Library bridge retains full exact version and reuses owning private/shared/recycle ACL',async()=>{
 const store=new MemoryLibraryStore();store.rememberTenant('tenant','Tenant');store.rememberUser('owner','Owner');store.rememberUser('peer','Peer');
 const library=new LibraryService(store);
 const actor={userId:'owner',tenantId:'tenant',activeMember:true,isOrgAdmin:false,isPlatformAdmin:false};
 const text='头部说明。\n\n'+Array.from({length:100},(_,i)=>`第${i}段，保留完整内容。`).join('\n\n')+'\n\n尾部 MMP-OLD-001';
 const file=await library.upload(actor,{originalName:'original.txt',mimeType:'text/plain',bytes:Buffer.from(text)});
 let active=true;
 const db={user:{findUnique:async()=>({status:active?'active':'disabled'})},orgMember:{findUnique:async()=>({role:'MEMBER',tenant:{status:'active'}})}} as any;
 const adapter=new KnowledgeLibrarySourceAdapter(db,library),version=file.currentVersion!.id;
 const initial=await adapter.readVersion('owner','tenant',file.id,version);
 assert.ok(initial.chunks.some(c=>c.content.includes('MMP-OLD-001')));assert.equal(initial.versionId,version);
 await assert.rejects(adapter.readVersion('peer','tenant',file.id,version));
 await assert.rejects(adapter.readVersion('owner','other',file.id,version));
 await library.setScope(actor,file.id,'ENTERPRISE',true);
 assert.equal((await adapter.readVersion('peer','tenant',file.id,version)).versionId,version);
 await library.replaceVersion(actor,file.id,'new.txt','text/plain',Buffer.from('replacement body'));
 assert.ok((await adapter.readVersion('peer','tenant',file.id,version)).chunks.some(c=>c.content.includes('MMP-OLD-001')));
 await library.setScope(actor,file.id,'PRIVATE');
 await assert.rejects(adapter.readVersion('peer','tenant',file.id,version));
 active=false;await assert.rejects(adapter.readVersion('owner','tenant',file.id,version));active=true;
 await library.recycle(actor,file.id);await assert.rejects(adapter.readVersion('owner','tenant',file.id,version));
});
