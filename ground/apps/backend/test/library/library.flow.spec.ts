import 'reflect-metadata';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { deflateRawSync } from 'node:zlib';
import { ValidationPipe } from '@nestjs/common';
import {
  confirmLibrarySelection,
  libraryPickBlock,
  markSavedToLibrary,
  retainRowsOnListError,
  stageLocalFiles,
} from '../../../../packages/shared/src/index';
import { CreateFolderDto } from '../../src/library/library.dto';
import { LibraryError } from '../../src/library/library.errors';
import { resolveUnderRoot } from '../../src/library/library.files';
import { buildLibraryModelRequest, readModelText } from '../../src/library/library.llm';
import { LIBRARY_ALLOWED_EXTENSIONS } from '../../src/library/library.limits';
import { htmlToText, parseLibraryBytes } from '../../src/library/library.parse';
import { canSee } from '../../src/library/library.policy';
import { LibraryService } from '../../src/library/library.service';
import { MemoryLibraryStore } from '../../src/library/library.store';
import type { Actor, LibraryItem } from '../../src/library/library.types';

function zipStored(name: string, content: Buffer, method: 0 | 8 = 0) {
  const data = method === 8 ? deflateRawSync(content) : content;
  const nameBuf = Buffer.from(name);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(method, 8);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt16LE(nameBuf.length, 26);
  header.writeUInt32LE(content.length, 22);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
  central.writeUInt16LE(method, 10); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  const local = Buffer.concat([header, nameBuf, data]);
  const directory = Buffer.concat([central, nameBuf]);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, directory, end]);
}

function textPdf(text: string) {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let doc = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(doc)); doc += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(doc);
  doc += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) doc += `${String(offset).padStart(10, '0')} 00000 n \n`;
  doc += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(doc);
}

function world() {
  const store = new MemoryLibraryStore();
  store.rememberTenant('ta', '甲企业');
  store.rememberTenant('tb', '乙企业');
  for (const [id, name] of [['owner', '甲所有者'], ['mate', '甲同事'], ['admin', '甲管理员'], ['other', '乙成员'], ['platform', '平台']] as const) {
    store.rememberUser(id, name);
  }
  let clock = Date.parse('2026-11-08T00:00:00Z');
  const service = new LibraryService(store, {
    maxFileBytes: 1000,
    tenantQuotaBytes: 2500,
    recycleDays: 30,
    askMaxChars: 12_000,
    allowedExtensions: LIBRARY_ALLOWED_EXTENSIONS,
  }, () => clock);
  const actor = (userId: string, tenantId: string, extra: Partial<Actor> = {}): Actor => ({
    userId,
    tenantId,
    isPlatformAdmin: false,
    isOrgAdmin: false,
    activeMember: true,
    ...extra,
  });
  return {
    store,
    service,
    actor,
    setClock(value: number) {
      clock = value;
    },
  };
}

function code(error: unknown) {
  assert.ok(error instanceof LibraryError);
  return error;
}

async function upload(service: LibraryService, actor: Actor, name: string, bytes: Buffer) {
  return service.upload(actor, { originalName: name, mimeType: 'application/octet-stream', bytes });
}

describe('enterprise library', () => {
  it('keeps one private copy, rejects cross-tenant and admin reads, and does not share on departure or move', async () => {
    const { service, store, actor } = world();
    const owner = actor('owner', 'ta');
    const mate = actor('mate', 'ta');
    const org = actor('admin', 'ta', { isOrgAdmin: true });
    const other = actor('other', 'tb');
    const item = await upload(service, owner, '../../秘密.md', Buffer.from('只有本人能看的正文'));
    assert.equal(item.name, '秘密.md');
    assert.equal(item.scope, 'PRIVATE');
    assert.equal(item.currentVersion?.parseStatus, 'READY');
    const version = await store.getVersion(item.currentVersion!.id);
    assert.ok(version);
    assert.equal(version.storageKey.includes('..'), false);
    assert.equal((await service.list(mate, 'mine', null, '秘密')).items.length, 0);
    assert.equal((await service.list(other, 'shared', null, '秘密')).items.length, 0);
    const hidden = code(await service.preview(other, item.id).catch((error: unknown) => error));
    assert.equal(hidden.status, 404);
    assert.equal(hidden.message.includes('秘密'), false);
    const adminRead = code(await service.download(org, item.id).catch((error: unknown) => error));
    assert.equal(adminRead.status, 404);
    assert.equal(adminRead.message.includes('秘密'), false);
    const left = actor('owner', 'ta', { activeMember: false });
    const departed = code(await service.preview(left, item.id).catch((error: unknown) => error));
    assert.equal(departed.status, 404);
    assert.equal((await store.getNode(item.id))?.scope, 'PRIVATE');
    const folder = await service.createFolder(owner, '共享夹');
    await service.setScope(owner, folder.id, 'ENTERPRISE', true);
    await service.move(owner, item.id, folder.id);
    assert.equal((await store.getNode(item.id))?.scope, 'PRIVATE');
    assert.equal((await service.list(mate, 'shared', folder.id)).items.some((row) => row.id === item.id), false);
    const same = await upload(service, owner, '秘密.md', Buffer.from('另一份'));
    assert.notEqual(same.id, item.id);
  });

  it('requires confirmation to share, then revoke hides the file again', async () => {
    const { service, actor } = world();
    const owner = actor('owner', 'ta');
    const mate = actor('mate', 'ta');
    const item = await upload(service, owner, '制度.md', Buffer.from('共享前不可见'));
    const refused = code(await service.setScope(owner, item.id, 'ENTERPRISE').catch((error: unknown) => error));
    assert.equal(refused.code, 'CONFIRM_SHARE');
    assert.equal((await service.list(mate, 'shared')).items.length, 0);
    await service.setScope(owner, item.id, 'ENTERPRISE', true);
    assert.ok((await service.list(mate, 'shared')).items.some((row) => row.id === item.id));
    await service.setScope(owner, item.id, 'PRIVATE');
    assert.equal((await service.list(mate, 'shared')).items.some((row) => row.id === item.id), false);
    const gone = code(await service.download(mate, item.id).catch((error: unknown) => error));
    assert.equal(gone.status, 404);
    assert.equal(gone.message.includes('制度'), false);
  });

  it('keeps version citations, blocks recycle, restores the same ids, and does not retarget after purge', async () => {
    const { service, store, actor } = world();
    const owner = actor('owner', 'ta');
    const item = await upload(service, owner, '合同.md', Buffer.from('旧版本条款'));
    const first = item.currentVersion!.id;
    await service.replaceVersion(owner, item.id, '合同.md', 'text/markdown', Buffer.from('新版本条款'));
    const versions = await service.versions(owner, item.id);
    assert.equal(versions.length, 2);
    assert.equal(versions[0]?.id, first);
    const cited = await service.openCitation(owner, item.id, first, 'paragraph:1');
    assert.equal(cited.versionId, first);
    assert.match(cited.quote ?? '', /旧版本条款/);
    assert.equal(cited.replacementVersionId, null);
    assert.equal(cited.preciseHighlight, false);
    await service.recycle(owner, item.id);
    const recycled = code(await service.download(owner, item.id, first).catch((error: unknown) => error));
    assert.equal(recycled.status, 409);
    let calls = 0;
    const asked = await service.ask(owner, [first], '条款是什么', undefined, async () => {
      calls += 1;
      return { ok: true, modelRef: 'pool/auto', text: '不应调用' };
    });
    assert.equal(calls, 0);
    assert.equal(asked.status, 'no_evidence');
    assert.match(asked.notices.join(' '), /回收站/);
    const restored = await service.restore(owner, item.id);
    assert.equal(restored.id, item.id);
    assert.equal(restored.scope, 'PRIVATE');
    assert.equal((await store.getVersion(first))?.id, first);
    await service.recycle(owner, item.id);
    await service.purge(owner, item.id);
    const gone = code(await service.openCitation(owner, item.id, first, 'paragraph:1').catch((error: unknown) => error));
    assert.equal(gone.status, 410);
    assert.match(gone.message, /不能改指向/);
    assert.equal(gone.message.includes('新版本'), false);
  });

  it('requires recycle before permanent purge and allows recycling a folder whose child is already recycled', async () => {
    const { service, store, actor } = world();
    const owner = actor('owner', 'ta');
    const folder = await service.createFolder(owner, '资料夹');
    const child = await upload(service, owner, '子文件.md', Buffer.from('子文件正文'));
    await service.move(owner, child.id, folder.id);
    const activePurge = code(await service.purge(owner, child.id).catch((error: unknown) => error));
    assert.equal(activePurge.status, 400);
    assert.equal((await store.getNode(child.id))?.state, 'ACTIVE');
    await service.recycle(owner, child.id);
    await service.recycle(owner, folder.id);
    assert.equal((await service.list(owner, 'trash')).items.length, 2);
    assert.equal((await service.restore(owner, folder.id)).state, 'ACTIVE');
  });

  it('opens a single ready chunk without a locator and still rejects missing or forbidden versions', async () => {
    const { service, store, actor } = world();
    const owner = actor('owner', 'ta');
    const other = actor('other', 'tb');
    const single = await upload(service, owner, '单段.md', Buffer.from('唯一段落正文，中间没有空行。'));
    const singleId = single.currentVersion!.id;
    assert.equal((await store.listChunks(singleId)).length, 1);
    const opened = await service.openCitation(owner, single.id, singleId);
    assert.equal(opened.versionId, singleId);
    assert.equal(opened.locator, 'paragraph:1');
    assert.equal(opened.quote, '唯一段落正文，中间没有空行。');
    const many = await upload(service, owner, '两段.md', Buffer.from('第一段\n\n第二段'));
    const joined = await service.openCitation(owner, many.id, many.currentVersion!.id);
    assert.match(joined.quote ?? '', /第一段/);
    assert.match(joined.quote ?? '', /第二段/);
    assert.match(joined.locator ?? '', /paragraph:1/);
    assert.match(joined.locator ?? '', /paragraph:2/);
    const zip = zipStored('readme.md', Buffer.from('压缩包里的机密'));
    const packed = await upload(service, owner, '空摘录.zip', zip);
    const empty = await service.openCitation(owner, packed.id, packed.currentVersion!.id);
    assert.equal(empty.quote, null);
    assert.equal(empty.locator, null);
    const hidden = code(await service.openCitation(other, single.id, singleId).catch((error: unknown) => error));
    assert.equal(hidden.status, 404);
    assert.equal(hidden.message.includes('唯一段落'), false);
    await service.recycle(owner, single.id);
    await service.purge(owner, single.id);
    const gone = code(await service.openCitation(owner, single.id, singleId).catch((error: unknown) => error));
    assert.equal(gone.status, 410);
  });

  it('retries parse without duplicating chunks and does not index zip or execute html', async () => {
    const { service, store, actor } = world();
    const owner = actor('owner', 'ta');
    const md = await upload(service, owner, '笔记.md', Buffer.from('第一段说明\n\n第二段说明'));
    const versionId = md.currentVersion!.id;
    const before = (await store.listChunks(versionId)).length;
    assert.ok(before >= 2);
    await service.retryParse(owner, md.id);
    const after = await store.listChunks(versionId);
    assert.equal(after.length, before);
    assert.equal(store.chunkWrites.at(-1), before);
    const zip = zipStored('readme.md', Buffer.from('压缩包里的机密'));
    const packed = await upload(service, owner, '材料.zip', zip);
    assert.equal(packed.currentVersion?.parseStatus, 'DOWNLOAD_ONLY');
    assert.equal((await store.listChunks(packed.currentVersion!.id)).length, 0);
    assert.equal((await store.getBlob((await store.getVersion(packed.currentVersion!.id))!.storageKey))?.equals(zip), true);
    const html = await upload(service, owner, '页面.html', Buffer.from('<script>alert(1)</script><p>政策正文</p>'));
    const preview = await service.preview(owner, html.id);
    assert.equal(preview.executable, false);
    assert.match(preview.text ?? '', /政策正文/);
    assert.equal((preview.text ?? '').includes('alert'), false);
    const scanned = await upload(service, owner, '扫描.pdf', textPdf(''));
    assert.equal(scanned.currentVersion?.parseStatus, 'DOWNLOAD_ONLY');
    assert.match(scanned.currentVersion?.parseReason ?? '', /OCR/);
    const sheet = await upload(service, owner, '表.xlsx', Buffer.from('PK fake xlsx'));
    assert.equal(sheet.currentVersion?.parseStatus, 'DOWNLOAD_ONLY');
    assert.match(sheet.currentVersion?.parseReason ?? '', /表格/);
  });

  it('extracts a real pdf page and a docx paragraph, and bounds the model prompt', async () => {
    const { service, actor } = world();
    const owner = actor('owner', 'ta');
    const pdf = await upload(service, owner, '说明.pdf', textPdf('Hello library'));
    const opened = await service.openCitation(owner, pdf.id, pdf.currentVersion!.id, 'page:1');
    assert.equal(opened.preciseHighlight, true);
    assert.match(opened.quote ?? '', /Hello library/);
    const docx = zipStored('word/document.xml', Buffer.from('<w:document><w:p><w:t>合同条款</w:t></w:p></w:document>'), 8);
    const word = await upload(service, owner, '合同.docx', docx);
    assert.equal(word.currentVersion?.parseStatus, 'READY');
    let seen = '';
    const answer = await service.ask(owner, [word.currentVersion!.id], '条款原文', 'auto', async (input) => {
      seen = input.messages.map((message) => message.content).join('\n');
      return { ok: true, modelRef: 'ground/auto', text: '见 [S1]。编造 [S99]。' };
    });
    assert.match(seen, /合同条款/);
    assert.match(seen, /untrusted-library-data/);
    assert.equal(answer.modelVerified, true);
    assert.equal(answer.modelRef, 'ground/auto');
    assert.equal(answer.citations.length, 1);
    assert.equal(answer.citations[0]?.versionId, word.currentVersion!.id);
    assert.equal(answer.answer?.includes('[S99]'), false);
    assert.match(answer.answer ?? '', /\[S1\]/);
    const unavailable = await service.ask(owner, [word.currentVersion!.id], '再问', undefined, async () => ({
      ok: false,
      reason: '云端模型暂不可用，本次没有生成回答。',
    }));
    assert.equal(unavailable.status, 'model_unconfigured');
    assert.equal(unavailable.modelVerified, false);
    assert.equal(unavailable.answer, null);
    assert.equal(unavailable.citations[0]?.versionId, word.currentVersion!.id);
  });

  it('truncates long extracts and skips hidden selections without names', async () => {
    const store = new MemoryLibraryStore();
    store.rememberTenant('ta', '甲企业');
    store.rememberUser('owner', '甲');
    store.rememberUser('mate', '乙');
    const service = new LibraryService(store, {
      maxFileBytes: 5000,
      tenantQuotaBytes: 5000,
      recycleDays: 30,
      askMaxChars: 12,
      allowedExtensions: LIBRARY_ALLOWED_EXTENSIONS,
    });
    const owner: Actor = { userId: 'owner', tenantId: 'ta', isPlatformAdmin: false, isOrgAdmin: false, activeMember: true };
    const mate: Actor = { ...owner, userId: 'mate' };
    const item = await upload(service, owner, '长文.md', Buffer.from('一二三四五六七八九十甲乙丙丁'));
    const asked = await service.ask(owner, [item.currentVersion!.id, 'missing'], '总结', undefined, async () => ({
      ok: true,
      modelRef: 'ground/auto',
      text: '片段',
    }));
    assert.equal(asked.truncated, true);
    assert.match(asked.truncationNote ?? '', /没有读完全文/);
    assert.match(asked.notices.join(' '), /无权访问/);
    assert.equal(asked.citations[0]?.name, '长文.md');
    const hidden = await service.ask(mate, [item.currentVersion!.id], '偷看', undefined, async () => {
      throw new Error('不应调用模型');
    });
    assert.equal(hidden.status, 'no_evidence');
    assert.equal(hidden.notices.join('').includes('长文'), false);
  });

  it('counts old and recycled versions without permanently deleting on reads', async () => {
    const { service, store, actor, setClock } = world();
    const owner = actor('owner', 'ta');
    const platform = actor('platform', 'ta', { isPlatformAdmin: true, activeMember: false });
    const item = await upload(service, owner, '私人.md', Buffer.from('私人正文'));
    const denied = code(await service.preview(platform, item.id).catch((error: unknown) => error));
    assert.equal(denied.status, 404);
    const grant = await service.grantCustody(
      actor('owner', 'ta', { isOrgAdmin: true }),
      {
        tenantId: 'ta',
        granteeUserId: 'platform',
        contentScope: 'PRIVATE_OWNER',
        ownerUserId: 'owner',
        powers: 'READ',
        expiresAt: Date.parse('2026-11-09T00:00:00Z'),
        reason: '企业书面授权排查',
      },
    );
    assert.match((await service.preview(platform, item.id)).text ?? '', /私人正文/);
    const write = code(await service.rename(platform, item.id, '改名').catch((error: unknown) => error));
    assert.equal(write.status, 403);
    await service.revokeCustody(actor('owner', 'ta'), grant.id);
    const revoked = code(await service.preview(platform, item.id).catch((error: unknown) => error));
    assert.equal(revoked.status, 404);
    assert.match(store.audits.map((row) => row.action).join(','), /library_custody_grant/);
    assert.match(store.audits.map((row) => row.action).join(','), /library_custody_revoke/);
    const enterprise = await service.grantCustody(
      actor('owner', 'ta', { isOrgAdmin: true }),
      {
        tenantId: 'ta',
        granteeUserId: 'platform',
        contentScope: 'ENTERPRISE',
        powers: 'CRUD',
        expiresAt: Date.parse('2026-12-01T00:00:00Z'),
        reason: '只代管共享范围',
      },
    );
    assert.ok(enterprise.id);
    const stillPrivate = code(await service.preview(platform, item.id).catch((error: unknown) => error));
    assert.equal(stillPrivate.status, 404);
    const used = (await service.config(owner)).usedBytes;
    await service.recycle(owner, item.id);
    assert.equal((await service.config(owner)).usedBytes, used);
    await upload(service, owner, 'a.md', Buffer.from('a'.repeat(800)));
    await upload(service, owner, 'b.md', Buffer.from('b'.repeat(800)));
    const quota = code(await upload(service, owner, 'c.md', Buffer.from('c'.repeat(1000))).catch((error: unknown) => error));
    assert.equal(quota.code, 'QUOTA');
    setClock(Date.parse('2026-12-20T00:00:00Z'));
    await service.list(owner, 'trash');
    const swept = code(await service.openCitation(owner, item.id, item.currentVersion!.id).catch((error: unknown) => error));
    assert.equal(swept.status, 409);
    await service.purge(owner, item.id);
    const stats = await service.adminStats({ userId: 'platform', isPlatformAdmin: true });
    assert.equal(JSON.stringify(stats).includes('私人正文'), false);
    assert.equal(JSON.stringify(stats).includes('私人.md'), false);
    const link = await service.createLink(owner, '外链', 'https://example.com/spec');
    assert.equal((await service.preview(owner, link.id)).linkUrl, 'https://example.com/spec');
    const badLink = code(await service.createLink(owner, '坏链', 'javascript:alert(1)').catch((error: unknown) => error));
    assert.equal(badLink.code, 'BAD_LINK');
    const magic = code(await upload(service, owner, '伪装.md', Buffer.from('MZ not markdown')).catch((error: unknown) => error));
    assert.equal(magic.code, 'BAD_TYPE');
  });

  it('rejects platform self-grants and keeps tenant grants revocable and private', async () => {
    const { service, actor } = world();
    const request = { tenantId: 'ta', granteeUserId: 'platform', contentScope: 'PRIVATE_OWNER' as const,
      ownerUserId: 'owner', powers: 'READ' as const, expiresAt: Date.parse('2026-11-09T00:00:00Z'), reason: '限定范围支持排查' };
    const platform = actor('platform', 'ta', { isPlatformAdmin: true, activeMember: false });
    await assert.rejects(() => service.grantCustody(platform, request), error => code(error).status === 403);
    await assert.rejects(() => service.grantCustody(actor('admin', 'ta', { isOrgAdmin: true }), request), error => code(error).status === 403);
    const grant = await service.grantCustody(actor('owner', 'ta'), request);
    assert.equal((await service.listCustody(actor('mate', 'ta'))).length, 0);
    assert.equal((await service.listCustody(actor('admin', 'ta', { isOrgAdmin: true }))).length, 0);
    assert.equal((await service.listCustody(actor('owner', 'ta'))).length, 1);
    await assert.rejects(() => service.revokeCustody(actor('other', 'tb'), grant.id), error => code(error).status === 404);
    const revoked = await service.revokeCustody(actor('owner', 'ta'), grant.id);
    assert.ok(revoked.revokedAt);
  });

  it('stops reading when custody expires', async () => {
    const { service, actor, setClock } = world();
    const owner = actor('owner', 'ta');
    const platform = actor('platform', 'ta', { isPlatformAdmin: true, activeMember: false });
    const item = await upload(service, owner, '共享.md', Buffer.from('共享正文'));
    await service.setScope(owner, item.id, 'ENTERPRISE', true);
    await service.grantCustody(actor('owner', 'ta', { isOrgAdmin: true }), {
      tenantId: 'ta',
      granteeUserId: 'platform',
      contentScope: 'ENTERPRISE',
      powers: 'READ',
      expiresAt: Date.parse('2026-11-09T00:00:00Z'),
      reason: '短期代管共享资料',
    });
    assert.match((await service.preview(platform, item.id)).text ?? '', /共享正文/);
    setClock(Date.parse('2026-11-10T00:00:00Z'));
    const expired = code(await service.preview(platform, item.id).catch((error: unknown) => error));
    assert.equal(expired.status, 404);
    assert.equal(expired.message.includes('共享'), false);
  });

  it('rejects a client tenant id on the folder body and keeps picker files unsent', async () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
    await assert.rejects(() => pipe.transform(
      { name: '目录', tenantId: 'attacker' },
      { type: 'body', metatype: CreateFolderDto },
    ));
    const drafts = stageLocalFiles(['本地.docx']);
    assert.equal(drafts[0]?.persisted, false);
    assert.equal(markSavedToLibrary(drafts[0]!).scope, 'PRIVATE');
    assert.equal(markSavedToLibrary(drafts[0]!).confirmShare, false);
    const picked = confirmLibrarySelection([], [{ nodeId: 'n', versionId: 'v', versionNo: 1, name: '制度.md' }]);
    assert.equal(picked.sent, false);
    assert.equal(picked.chips.length, 1);
    const rows: LibraryItem[] = [];
    assert.equal(retainRowsOnListError(rows), rows);
    assert.equal(libraryPickBlock({
      id: '1', kind: 'FILE', name: '表.xlsx', versionId: 'v', versionNo: 1, parseStatus: 'DOWNLOAD_ONLY', parseReason: '只能下载',
    }).disabled, true);
    const request = buildLibraryModelRequest(undefined, [{ role: 'user', content: '问' }]);
    assert.equal(request.model, 'auto');
    assert.equal(request.stream, false);
    assert.equal('api_key' in request, false);
    assert.equal(readModelText({ choices: [{ message: { content: '回答' } }] }), '回答');
    const source = readFileSync('src/library/library.llm.ts', 'utf8');
    assert.equal(source.includes('ollama'), false);
    assert.equal(source.includes('OPENAI_API_KEY'), false);
    assert.equal(htmlToText('<style>.x{}</style><script>steal()</script>正文'), '正文');
    assert.equal((await parseLibraryBytes('包.zip', zipStored('a.md', Buffer.from('秘密')))).chunks.length, 0);
    assert.throws(() => resolveUnderRoot('/data/library', '../etc/passwd'));
    assert.throws(() => resolveUnderRoot('/data/library', 'tenant/../../etc/passwd'));
    const node = {
      id: 'n', tenantId: 'ta', ownerUserId: 'owner', parentId: null, kind: 'FILE' as const, name: '私人',
      scope: 'PRIVATE' as const, state: 'ACTIVE' as const, linkUrl: null, currentVersionId: null,
      recycledAt: null, purgedAt: null, createdAt: 0, updatedAt: 0,
    };
    const org: Actor = { userId: 'admin', tenantId: 'ta', isPlatformAdmin: false, isOrgAdmin: true, activeMember: true };
    assert.equal(canSee(org, node, [], Date.now()), false);
  });
});

// t188: isolated in-memory metadata corruption, never real user records.
describe('t188 navigation and media bounds', () => {
  it('keeps own shared children in mine and surfaces a safe root for a corrupt folder cycle', async () => {
    const { service, store, actor } = world(); const owner = actor('owner', 'ta');
    const a = await service.createFolder(owner, 'QA_a'), b = await service.createFolder(owner, 'QA_b', a.id);
    await service.setScope(owner, a.id, 'ENTERPRISE', true);
    assert.ok((await service.list(owner, 'mine')).items.some(row => row.id === a.id));
    assert.ok((await service.list(owner, 'mine', a.id)).items.some(row => row.id === b.id));
    await store.updateNode(a.id, { parentId: b.id });
    const roots = (await service.list(owner, 'mine')).items;
    assert.equal(roots.filter(row => [a.id, b.id].includes(row.id)).length, 1);
    const page = await service.list(owner, 'mine', roots[0]!.id);
    assert.ok(page.breadcrumb.length <= 2);
    await assert.rejects(service.move(owner, a.id, b.id));
  });
  it('rejects oversized/spoofed media before storage and does not index media', async () => {
    const { service, store, actor } = world(); const owner = actor('owner', 'ta');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64');
    const file = await upload(service, owner, 'QA.png', png); assert.equal(file.currentVersion?.parseStatus, 'DOWNLOAD_ONLY');
    assert.equal((await store.listChunks(file.currentVersion!.id)).length, 0);
    assert.equal((await service.list(owner, 'recent')).items.length, 0);
    await service.preview(owner, file.id); assert.equal((await service.list(owner, 'recent')).items.length, 0);
    await service.download(owner, file.id, undefined, true); assert.equal((await service.list(owner, 'recent')).items.length, 1);
    await assert.rejects(upload(service, owner, 'QA_fake.png', Buffer.from('<script/>')));
    await assert.rejects(upload(service, owner, 'QA_big.png', Buffer.concat([png, Buffer.alloc(1000)])));
    await assert.rejects(service.download(owner, (await upload(service, owner, 'QA.md', Buffer.from('text'))).id, undefined, true));
  });
});


describe('t191 Console flat mine management', () => {
  it('paginates owned levels including shared, searches globally and keeps directory semantics', async () => {
    const { service, actor } = world(); const owner = actor('owner', 'ta');
    const apple = await service.createFolder(owner, 'Apple');
    const inner = await service.createFolder(owner, 'Inner', apple.id);
    const expected = new Set([apple.id, inner.id]);
    for (let i = 0; i < 22; i++) {
      const row = await service.createLink(owner, `nested-${i}`, 'https://example.test/', inner.id);
      expected.add(row.id); if (i === 0) await service.setScope(owner, row.id, 'ENTERPRISE', true);
    }
    const first = await service.list(owner, 'mine', null, '', true, 1, 20);
    const second = await service.list(owner, 'mine', null, '', true, 2, 20);
    assert.equal(first.total, 24); assert.equal(first.items.length, 20); assert.equal(second.items.length, 4);
    assert.deepEqual(new Set([...first.items, ...second.items].map(row => row.id)), expected);
    const shared = [...first.items, ...second.items].find(row => row.scope === 'ENTERPRISE')!;
    assert.deepEqual(shared.parentPath, [{ id: apple.id, name: 'Apple' }, { id: inner.id, name: 'Inner' }]);
    assert.equal((await service.list(owner, 'mine', null, 'nested-21', true, 1, 20)).items[0]?.name, 'nested-21');
    assert.deepEqual((await service.list(owner, 'mine', null, '', false, 1, 20)).items.map(row => row.id), [apple.id]);
    assert.deepEqual((await service.list(owner, 'mine', apple.id, '', false, 1, 20)).items.map(row => row.id), [inner.id]);
    assert.equal((await service.list(owner, 'mine', inner.id, '', false, 1, 20)).total, 22);
    for (const who of [actor('mate', 'ta'), actor('admin', 'ta', { isOrgAdmin: true }), actor('platform', 'ta', { isPlatformAdmin: true }), actor('other', 'tb')]) assert.equal((await service.list(who, 'mine', null, '', true, 1, 20)).total, 0);
  });
  it('omits hidden ancestor labels and preserves recorded MIME despite a misleading renamed title', async () => {
    const { service, actor } = world(); const owner = actor('owner', 'ta'); const mate = actor('mate', 'ta');
    const hidden = await service.createFolder(mate, '不得泄漏上级名称'); await service.setScope(mate, hidden.id, 'ENTERPRISE', true);
    const file = await service.upload(owner, { originalName: 'valid.txt', mimeType: 'text/plain', bytes: Buffer.from('isolated fixture'), parentId: hidden.id });
    await service.rename(owner, file.id, '误导名称.png'); await service.setScope(mate, hidden.id, 'PRIVATE');
    const row = (await service.list(owner, 'mine', null, '', true, 1, 20)).items[0]!;
    assert.equal(row.parentHidden, true); assert.equal(row.parentName, null); assert.deepEqual(row.parentPath, []);
    assert.equal(row.currentVersion?.mimeType, 'text/plain'); assert.ok(!JSON.stringify(row).includes('不得泄漏上级名称'));
  });
});
