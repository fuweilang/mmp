import assert from 'node:assert/strict';
import { it } from 'node:test';
import { LibraryService } from '../../src/library/library.service';
import { MemoryLibraryStore } from '../../src/library/library.store';
import type { Actor } from '../../src/library/library.types';
const owner: Actor = { userId: 'owner', tenantId: 'ta', activeMember: true, isOrgAdmin: false, isPlatformAdmin: false };
const platform = { userId: 'platform', isPlatformAdmin: true };
function setup() {
 const store = new MemoryLibraryStore(); store.rememberTenant('ta', '甲'); store.rememberTenant('tb', '乙');
 let now = Date.parse('2026-11-08T00:00:00+08:00');
 return { store, service: new LibraryService(store, undefined, () => now), expire: () => { now += 120_000; }, end: () => now + 60_000 };
}
it('managed browsing derives the tenant from one grant and never leaks another owner title, even under multiple grants', async () => {
 const h = setup(); const upload = (who: Actor, name: string) => h.service.upload(who, { originalName: name, mimeType: 'text/markdown', bytes: Buffer.from('测试授权正文') });
 const own = await upload(owner, '甲私人.md');
 const other = { ...owner, userId: 'other' }; await upload(other, '他人秘密.md');
 await upload({ ...owner, tenantId: 'tb' }, '乙企业秘密.md');
 const shared = await upload(other, '企业共享.md'); await h.service.setScope(other, shared.id, 'ENTERPRISE', true);
 const privateGrant = await h.service.grantCustody(owner, { tenantId: 'ta', granteeUserId: 'platform', contentScope: 'PRIVATE_OWNER', ownerUserId: 'owner', powers: 'READ', expiresAt: h.end(), reason: '批准处理私人资料' });
 await h.service.grantCustody({ ...owner, isOrgAdmin: true }, { tenantId: 'ta', granteeUserId: 'platform', contentScope: 'ENTERPRISE', powers: 'READ', expiresAt: h.end(), reason: '批准处理共享资料' });
 const managed = await h.service.managedActor(platform, privateGrant.id);
 assert.equal(managed.tenantId, 'ta'); assert.equal(managed.activeMember, false);
 const list = await h.service.list(managed, 'managed'); assert.deepEqual(list.items.map(x => x.name), ['甲私人.md']);
 assert.equal((await h.service.openCitation(managed, own.id, own.currentVersion!.id)).quote, '测试授权正文');
 await assert.rejects(h.service.preview(managed, shared.id), /不存在|不可见/);
 assert.ok(h.store.audits.some(a => a.action === 'library_custody_read'));
 await h.service.revokeCustody(owner, privateGrant.id);
 await assert.rejects(h.service.managedActor(platform, privateGrant.id));
 await assert.rejects(h.service.preview(managed, own.id));
 assert.deepEqual((await h.service.list(managed, 'managed')).items, []);
});
it('rejects private approval by tenant admin, self-grants, other grantees, expired grants and non-platform browsers', async () => {
 const h = setup();
 const input = { tenantId: 'ta', granteeUserId: 'platform', contentScope: 'PRIVATE_OWNER' as const, ownerUserId: 'owner', powers: 'READ' as const, expiresAt: h.end(), reason: '本人明确批准只读' };
 await assert.rejects(h.service.grantCustody({ ...owner, userId: 'tenant-admin', isOrgAdmin: true }, input));
 await assert.rejects(h.service.grantCustody({ ...owner, userId: 'platform', isPlatformAdmin: true }, { ...input, ownerUserId: 'platform' }));
 const grant = await h.service.grantCustody(owner, input);
 await assert.rejects(h.service.managedActor({ ...platform, userId: 'someone' }, grant.id));
 await assert.rejects(h.service.managedActor({ ...platform, isPlatformAdmin: false }, grant.id));
 h.expire(); await assert.rejects(h.service.managedActor(platform, grant.id));
});
