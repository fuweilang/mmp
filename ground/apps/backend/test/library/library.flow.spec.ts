import 'reflect-metadata';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { deflateRawSync } from 'node:zlib';
import JSZip from 'jszip';
import sharp from 'sharp';
import { ValidationPipe } from '@nestjs/common';
import {
  confirmLibrarySelection,
  libraryPickBlock,
  markSavedToLibrary,
  retainRowsOnListError,
  stageLocalFiles,
} from '../../../../packages/shared/src/index';
import { CreateFolderDto, ListQuery } from '../../src/library/library.dto';
import { LibraryError } from '../../src/library/library.errors';
import { resolveUnderRoot } from '../../src/library/library.files';
import { buildLibraryModelRequest, readModelText } from '../../src/library/library.llm';
import { LIBRARY_ALLOWED_EXTENSIONS } from '../../src/library/library.limits';
import { htmlToText, listZipEntries, parseLibraryBytes } from '../../src/library/library.parse';
import { canSee } from '../../src/library/library.policy';
import { createLibraryService, type LibraryService } from '../../src/library/library.service';
import { MemoryLibraryStore } from '../../src/library/library.store';
import type { Actor, LibraryItem } from '../../src/library/library.types';

function zipStored(name: string, content: Buffer, method: 0 | 8 = 0, declared = content.length) {
  const data = method === 8 ? deflateRawSync(content) : content;
  const nameBuf = Buffer.from(name);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(method, 8);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt16LE(nameBuf.length, 26);
  header.writeUInt32LE(declared, 22);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
  central.writeUInt16LE(method, 10); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(declared, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  const local = Buffer.concat([header, nameBuf, data]);
  const directory = Buffer.concat([central, nameBuf]);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, directory, end]);
}

async function officeZip(entries: Record<string, string>) {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(entries)) zip.file(path, content);
  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
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
  const service = createLibraryService({ store, limits: {
    maxFileBytes: 1000,
    tenantQuotaBytes: 2500,
    recycleDays: 30,
    askMaxChars: 12_000,
    allowedExtensions: LIBRARY_ALLOWED_EXTENSIONS,
  }, now: () => clock });
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
  it('keeps one private copy, lets only the org admin read another member, and does not share on departure or unconfirmed move', async () => {
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
    assert.equal((await service.download(org, item.id)).bytes.toString(), '只有本人能看的正文');
    assert.equal((await service.list(org, 'mine', null, '秘密')).items.length, 0);
    assert.equal((await service.list(org, 'members', null, '秘密')).items[0]?.ownerUserId, owner.userId);
    const memberView = code(await service.list(mate, 'members').catch((error: unknown) => error));
    assert.equal(memberView.status, 403);
    const left = actor('owner', 'ta', { activeMember: false });
    const departed = code(await service.preview(left, item.id).catch((error: unknown) => error));
    assert.equal(departed.status, 404);
    assert.equal((await store.getNode(item.id))?.scope, 'PRIVATE');
    const folder = await service.createFolder(owner, '共享夹');
    await service.setScope(owner, folder.id, 'ENTERPRISE', true);
    await assert.rejects(service.move(owner, item.id, folder.id), { code: 'CONFIRM_SHARE' });
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

  it('keeps preview format metadata bound to each immutable version after rename and replacement', async () => {
    const { service, actor } = world();
    const owner = actor('owner', 'ta');
    const wordMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const item = await service.upload(owner, {
      originalName: '原始文件.docx', mimeType: wordMime,
      bytes: zipStored('word/document.xml', Buffer.from('<w:document><w:t>原始正文</w:t></w:document>')),
    });
    const first = item.currentVersion!.id;
    await service.rename(owner, item.id, '没有扩展名的展示标题');
    const renamed = await service.preview(owner, item.id, first);
    assert.equal(renamed.name, '没有扩展名的展示标题');
    assert.equal(renamed.originalName, '原始文件.docx');
    assert.equal(renamed.mimeType, wordMime);
    const replaced = await service.replaceVersion(owner, item.id, '替换版本.pdf', 'application/pdf', textPdf('Replacement document'));
    const second = replaced.currentVersion!.id;
    await service.rename(owner, item.id, '误导标题.xlsx');
    const current = await service.preview(owner, item.id, second);
    assert.equal(current.name, '误导标题.xlsx');
    assert.equal(current.originalName, '替换版本.pdf');
    assert.equal(current.mimeType, 'application/pdf');
    const historical = await service.preview(owner, item.id, first);
    assert.equal(historical.name, '误导标题.xlsx');
    assert.equal(historical.versionId, first);
    assert.equal(historical.originalName, '原始文件.docx');
    assert.equal(historical.mimeType, wordMime);
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
    // Historical purged metadata remains readable as an unavailable source, without deleting a live fixture.
    await store.updateNode(item.id, { state: 'PURGED', purgedAt: Date.now() });
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

  it('recycles a folder together with the active items inside it', async () => {
    const { service, store, actor } = world();
    const owner = actor('owner', 'ta');
    const folder = await service.createFolder(owner, '资料夹');
    const child = await upload(service, owner, '子文件.md', Buffer.from('子文件正文'));
    await service.move(owner, child.id, folder.id);
    await service.recycle(owner, folder.id);
    assert.equal((await store.getNode(folder.id))?.state, 'RECYCLED');
    assert.equal((await store.getNode(child.id))?.state, 'RECYCLED');
    assert.equal((await service.list(owner, 'trash')).items.length, 2);
  });

  it('keeps a recycled folder while a protected file is still inside it', async () => {
    const { service, store, actor } = world();
    const owner = actor('owner', 'ta');
    const folder = await service.createFolder(owner, '资料夹');
    const child = await upload(service, owner, '子文件.md', Buffer.from('子文件正文'));
    await service.move(owner, child.id, folder.id);
    await service.recycle(owner, child.id);
    await service.recycle(owner, folder.id);
    const blocked = code(await service.purge(owner, folder.id).catch((error: unknown) => error));
    assert.equal(blocked.status, 400);
    assert.equal(blocked.code, 'FOLDER_NONEMPTY');
    assert.equal((await store.getNode(folder.id))?.state, 'RECYCLED');
    assert.equal((await store.getNode(child.id))?.state, 'RECYCLED');
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
    const citedZip = await service.openCitation(owner, packed.id, packed.currentVersion!.id);
    assert.match(citedZip.quote ?? '', /压缩包里的机密/);
    assert.match(citedZip.locator ?? '', /readme\.md/);
    const hidden = code(await service.openCitation(other, single.id, singleId).catch((error: unknown) => error));
    assert.equal(hidden.status, 404);
    assert.equal(hidden.message.includes('唯一段落'), false);
    await service.recycle(owner, single.id);
    await store.updateNode(single.id, { state: 'PURGED', purgedAt: Date.now() });
    const gone = code(await service.openCitation(owner, single.id, singleId).catch((error: unknown) => error));
    assert.equal(gone.status, 410);
  });

  it('retries parse without duplicating chunks, indexes one zip level, and does not execute html', async () => {
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
    assert.equal(packed.currentVersion?.parseStatus, 'READY');
    const zipChunks = await store.listChunks(packed.currentVersion!.id);
    assert.ok(zipChunks.some((chunk) => chunk.content.includes('压缩包里的机密') && chunk.locator.includes('readme.md')));
    const zipPreview = await service.preview(owner, packed.id);
    assert.deepEqual(zipPreview.entries, [{ name: 'readme.md', size: Buffer.from('压缩包里的机密').length }]);
    assert.match(zipPreview.text ?? '', /压缩包里的机密/);
    assert.equal((await store.getBlob((await store.getVersion(packed.currentVersion!.id))!.storageKey))?.equals(zip), true);
    const html = await upload(service, owner, '页面.html', Buffer.from('<script>alert(1)</script><p>政策正文</p>'));
    const preview = await service.preview(owner, html.id);
    assert.equal(preview.executable, false);
    assert.match(preview.text ?? '', /政策正文/);
    assert.equal((preview.text ?? '').includes('alert'), false);
    const scanned = await upload(service, owner, '扫描.pdf', textPdf(''));
    assert.equal(scanned.currentVersion?.parseStatus, 'DOWNLOAD_ONLY');
    assert.match(scanned.currentVersion?.parseReason ?? '', /OCR/);
    const broken = await upload(service, owner, '坏表.xlsx', Buffer.from('PK fake xlsx'));
    assert.equal(broken.currentVersion?.parseStatus, 'FAILED');
    const deck = await upload(service, owner, '发布.pptx', await officeZip({ 'ppt/slides/slide1.xml': '<p:sld><a:t>封面标题</a:t></p:sld>' }));
    assert.equal(deck.currentVersion?.parseStatus, 'READY');
    assert.match((await service.preview(owner, deck.id)).text ?? '', /封面标题/);
    const sheet = await upload(service, owner, '表.xlsx', await officeZip({
      'xl/sharedStrings.xml': '<sst><si><t>品名</t></si></sst>',
      'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row><c t="s"><v>0</v></c><c><f>A1+1</f><v>42</v></c></row></sheetData></worksheet>',
    }));
    assert.equal(sheet.currentVersion?.parseStatus, 'READY');
    const cited = await service.openCitation(owner, sheet.id, sheet.currentVersion!.id);
    assert.match(cited.quote ?? '', /品名/);
    assert.match(cited.quote ?? '', /42/);
    assert.equal((cited.quote ?? '').includes('A1+1'), false);
    await store.updateVersion(sheet.currentVersion!.id, { parseStatus: 'DOWNLOAD_ONLY', parseReason: '旧状态' });
    await store.replaceChunks(sheet.currentVersion!.id, 'ta', []);
    const again = await service.retryParse(owner, sheet.id);
    assert.equal(again.currentVersion?.parseStatus, 'READY');
  });

  it('cites a legacy Word file and text inside a picture on this Mac', async () => {
    if (process.platform !== 'darwin') return;
    const dir = await mkdtemp(join(tmpdir(), 'legacy-doc-'));
    try {
      const convert = (profile: string, target: string, inputName: string) => new Promise<void>((resolve, reject) => {
        const child = spawn('/opt/homebrew/bin/soffice', [
          `-env:UserInstallation=file://${join(dir, profile)}`,
          '--headless', '--norestore', '--nolockcheck', '--nologo',
          '--convert-to', target, '--outdir', dir, join(dir, inputName),
        ], { stdio: 'ignore', timeout: 45_000 });
        child.on('error', reject);
        child.on('close', (code) => code === 0 ? resolve() : reject(new Error(String(code))));
      });
      await writeFile(join(dir, 'source.txt'), '旧版合同');
      await convert('profile-doc', 'doc', 'source.txt');
      const parsed = await parseLibraryBytes('旧版.doc', await readFile(join(dir, 'source.doc')));
      assert.equal(parsed.status, 'READY');
      assert.match(parsed.chunks.map((chunk) => chunk.content).join('\n'), /旧版合同/);
      await writeFile(join(dir, 'source.csv'), '品名\n');
      await convert('profile-xls', 'xls', 'source.csv');
      const sheet = await parseLibraryBytes('老版.xls', await readFile(join(dir, 'source.xls')));
      assert.equal(sheet.status, 'READY');
      assert.match(sheet.chunks.map((chunk) => chunk.content).join('\n'), /品名/);
      await writeFile(join(dir, 'source.fodp'), `<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" office:version="1.3" office:mimetype="application/vnd.oasis.opendocument.presentation">
 <office:body><office:presentation><draw:page draw:name="page1">
  <draw:frame svg:width="20cm" svg:height="3cm" svg:x="1cm" svg:y="1cm"><draw:text-box><text:p>老版演示</text:p></draw:text-box></draw:frame>
 </draw:page></office:presentation></office:body></office:document>`);
      await convert('profile-ppt', 'ppt', 'source.fodp');
      const deck = await parseLibraryBytes('老版.ppt', await readFile(join(dir, 'source.ppt')));
      assert.equal(deck.status, 'READY');
      assert.match(deck.chunks.map((chunk) => chunk.content).join('\n'), /老版演示/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
    const png = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="160"><rect width="100%" height="100%" fill="white"/><text x="24" y="100" font-size="72" font-family="Helvetica" fill="black">CONTRACT</text></svg>')).png().toBuffer();
    const image = await parseLibraryBytes('条款.png', png);
    assert.equal(image.status, 'READY');
    assert.match(image.chunks.map((chunk) => chunk.content).join('\n'), /CONTRACT/);
    const scanDir = await mkdtemp(join(tmpdir(), 'scan-pdf-'));
    try {
      const scanPng = join(scanDir, 'page.png');
      const scanPdf = join(scanDir, 'page.pdf');
      await writeFile(scanPng, png);
      await new Promise<void>((resolve, reject) => {
        const child = spawn('sips', ['-s', 'format', 'pdf', scanPng, '--out', scanPdf], { stdio: 'ignore' });
        child.on('error', reject);
        child.on('close', (code) => code === 0 ? resolve() : reject(new Error(String(code))));
      });
      const scanned = await parseLibraryBytes('扫描件.pdf', await readFile(scanPdf));
      assert.equal(scanned.status, 'READY');
      assert.match(scanned.chunks.map((chunk) => chunk.content).join('\n'), /CONTRACT/);
    } finally {
      await rm(scanDir, { recursive: true, force: true });
    }
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
    const service = createLibraryService({ store, limits: {
      maxFileBytes: 5000,
      tenantQuotaBytes: 5000,
      recycleDays: 30,
      askMaxChars: 12,
      allowedExtensions: LIBRARY_ALLOWED_EXTENSIONS,
    } });
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
    await assert.rejects(() => service.purge(owner, item.id), (error: unknown) => error instanceof LibraryError && error.code === 'REFERENCE_UNVERIFIED');
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

  it('accepts the processing list filter', async () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
    const query = await pipe.transform(
      { view: 'mine', status: 'processing', page: '1', pageSize: '20' },
      { type: 'query', metatype: ListQuery },
    ) as ListQuery;
    assert.equal(query.status, 'processing');
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
    const indexed = await parseLibraryBytes('包.zip', zipStored('a.md', Buffer.from('秘密')));
    assert.match(indexed.chunks[0]?.content ?? '', /秘密/);
    assert.match(indexed.chunks[0]?.locator ?? '', /a\.md/);
    const nested = await parseLibraryBytes('外层.zip', zipStored('inner.zip', zipStored('secret.md', Buffer.from('不能展开'))));
    assert.equal(nested.chunks.length, 0);
    assert.equal((await listZipEntries(zipStored('inner.zip', Buffer.from('PK')))).entries[0]?.name, 'inner.zip');
    const slip = zipStored('../secret.md', Buffer.from('越界'));
    assert.equal((await listZipEntries(slip)).entries.length, 0);
    assert.equal((await parseLibraryBytes('越界.zip', slip)).chunks.length, 0);
    const program = zipStored('run.exe', Buffer.from('nope'));
    assert.equal((await parseLibraryBytes('工具.zip', program)).chunks.length, 0);
    assert.equal((await listZipEntries(program)).entries[0]?.name, 'run.exe');
    const page = await parseLibraryBytes('页.zip', zipStored('a.html', Buffer.from('<script>alert(1)</script><p>包内正文</p>')));
    assert.match(page.chunks[0]?.content ?? '', /包内正文/);
    assert.equal((page.chunks[0]?.content ?? '').includes('alert'), false);
    const bomb = zipStored('a.md', Buffer.from('x'), 0, 50_000_000);
    assert.equal((await parseLibraryBytes('炸弹.zip', bomb)).status, 'DOWNLOAD_ONLY');
    assert.equal((await listZipEntries(bomb)).entries[0]?.size, 50_000_000);
    assert.throws(() => resolveUnderRoot('/data/library', '../etc/passwd'));
    assert.throws(() => resolveUnderRoot('/data/library', 'tenant/../../etc/passwd'));
    const node = {
      id: 'n', tenantId: 'ta', ownerUserId: 'owner', parentId: null, kind: 'FILE' as const, name: '私人',
      scope: 'PRIVATE' as const, state: 'ACTIVE' as const, linkUrl: null, currentVersionId: null,
      recycledAt: null, purgedAt: null, createdAt: 0, updatedAt: 0,
    };
    const org: Actor = { userId: 'admin', tenantId: 'ta', isPlatformAdmin: false, isOrgAdmin: true, activeMember: true };
    assert.equal(canSee(org, node, [], Date.now()), true);
    assert.equal(canSee({ ...org, activeMember: false }, node, [], Date.now()), false);
    assert.equal(canSee({ ...org, isOrgAdmin: false }, node, [], Date.now()), false);
    assert.equal(canSee({ ...org, tenantId: 'tb' }, node, [], Date.now()), false);
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
  it('pages owned items by ten and filters the recorded file type', async () => {
    const { service, actor } = world();
    const owner = actor('owner', 'ta');
    await service.createFolder(owner, '目录');
    await service.upload(owner, { originalName: '图.png', mimeType: 'image/png', bytes: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
    for (let i = 0; i < 11; i++) await service.upload(owner, { originalName: `笔记-${i}.txt`, mimeType: 'text/plain', bytes: Buffer.from('字') });
    const page = await service.list(owner, 'mine', null, '', true, 1, 10);
    assert.equal(page.total, 13);
    assert.equal(page.items.length, 10);
    const images = await service.list(owner, 'mine', null, '', true, 1, 10, 'all', 'image');
    assert.equal(images.total, 1);
    assert.equal(images.items[0]?.name, '图.png');
    const content = await service.list(owner, 'mine', null, '', true, 1, 20, 'all', 'content');
    assert.equal(content.total, 12);
    assert.equal(content.items.some((row) => row.kind === 'FOLDER'), false);
  });

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
    const { service, store, actor } = world(); const owner = actor('owner', 'ta'); const mate = actor('mate', 'ta');
    const hidden = await service.createFolder(mate, '不得泄漏上级名称'); await service.setScope(mate, hidden.id, 'ENTERPRISE', true);
    const file = await service.upload(owner, { originalName: 'valid.txt', mimeType: 'text/plain', bytes: Buffer.from('isolated fixture'), parentId: hidden.id });
    await service.rename(owner, file.id, '误导名称.png');
    // Legacy mixed-visibility trees remain readable without disclosing a hidden ancestor.
    await store.updateNode(hidden.id, { scope: 'PRIVATE' });
    const row = (await service.list(owner, 'mine', null, '', true, 1, 20)).items[0]!;
    assert.equal(row.parentHidden, true); assert.equal(row.parentName, null); assert.deepEqual(row.parentPath, []);
    assert.equal(row.currentVersion?.mimeType, 'text/plain'); assert.ok(!JSON.stringify(row).includes('不得泄漏上级名称'));
  });
  it('searches only the caller\'s private files and enterprise-shared excerpts', async () => {
    const { service, actor } = world();
    const owner = actor('owner', 'ta');
    const mate = actor('mate', 'ta');
    const org = actor('admin', 'ta', { isOrgAdmin: true });
    const privateFile = await upload(service, owner, '泡泡玛特商业分析.md', Buffer.from('泡泡玛特 2026 年渠道仍以盲盒为主。'));
    const picture = await service.upload(owner, { originalName: '仅保存.png', mimeType: 'image/png', bytes: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64') });
    const video = Buffer.alloc(32);
    video.writeUInt32BE(32, 0);
    video.write('ftyp', 4, 'ascii');
    video.write('isom', 8, 'ascii');
    await service.upload(owner, { originalName: '不看的视频.mp4', mimeType: 'video/mp4', bytes: video });
    const shared = await upload(service, mate, '公开说明.md', Buffer.from('企业共享里提到泡泡玛特联名。'));
    await service.setScope(mate, shared.id, 'ENTERPRISE', true);
    const own = await service.searchQuotes(owner, '泡泡玛特');
    assert.deepEqual(own.hits.map(hit => hit.nodeId).sort(), [privateFile.id, shared.id].sort());
    assert.equal(own.hits.every(hit => hit.quote.includes('泡泡玛特') && hit.image === undefined), true);
    const colleague = await service.searchQuotes(mate, '泡泡玛特');
    assert.deepEqual(colleague.hits.map(hit => hit.nodeId), [shared.id]);
    const admin = await service.searchQuotes(org, '泡泡玛特');
    assert.deepEqual(admin.hits.map(hit => hit.nodeId), [shared.id]);
    const named = await service.searchQuotes(owner, '仅保存');
    assert.equal(named.hits.length, 1);
    assert.equal(named.hits[0]?.nodeId, picture.id);
    assert.equal(named.hits[0]?.image, true);
    assert.equal(named.hits[0]?.matched, 'name');
    assert.equal((await service.searchQuotes(mate, '仅保存')).hits.length, 0);
    assert.equal((await service.searchQuotes(owner, '不看的视频')).hits.length, 0);
    await service.recycle(owner, privateFile.id);
    assert.equal((await service.searchQuotes(owner, '渠道仍以盲盒')).hits.length, 0);
  });

  it('opens one member at a time and keeps another member\'s folder out of their root', async () => {
    const { service, store, actor } = world();
    const owner = actor('owner', 'ta');
    const mate = actor('mate', 'ta');
    const org = actor('admin', 'ta', { isOrgAdmin: true });
    const secret = await upload(service, owner, '私人.md', Buffer.from('只有本人'));
    const folder = await service.createFolder(mate, '同事目录');
    const nested = await service.createFolder(owner, '挂在别人目录下');
    await store.updateNode(nested.id, { parentId: folder.id });
    await assert.rejects(() => service.list(mate, 'members'), (error: unknown) => code(error).status === 403);
    await assert.rejects(() => service.ownerCounts(mate), (error: unknown) => code(error).status === 403);
    const counts = await service.ownerCounts(org);
    assert.equal(counts.owner, 2);
    assert.equal(counts.mate, 1);
    const all = await service.list(org, 'members');
    assert.equal(all.ownerUserId, null);
    assert.equal(all.items.some((row) => row.id === secret.id), true);
    assert.equal(all.items.some((row) => row.id === folder.id), true);
    const one = await service.list(org, 'members', null, '', false, 1, 20, 'all', undefined, 'owner');
    assert.deepEqual(one.items.map((row) => row.id).sort(), [secret.id, nested.id].sort());
    assert.equal(one.items.some((row) => row.id === folder.id), false);
    const wrongFolder = code(await service.list(org, 'members', folder.id, '', false, 1, 20, 'all', undefined, 'owner').catch((error: unknown) => error));
    assert.equal(wrongFolder.status, 404);
    const matePage = await service.list(org, 'members', folder.id, '', false, 1, 20, 'all', undefined, 'mate');
    assert.equal(matePage.ownerUserId, 'mate');
    assert.equal(matePage.items.some((row) => row.id === nested.id), false);
    const ignored = await service.list(owner, 'mine', null, '', false, 1, 20, 'all', undefined, 'mate');
    assert.equal(ignored.items.some((row) => row.id === secret.id), true);
    assert.equal(ignored.items.some((row) => row.id === folder.id), false);
  });

  it('pages every visible file by name and returns the tree path used to locate it', async () => {
    const { service, actor } = world();
    const owner = actor('owner', 'ta');
    const mate = actor('mate', 'ta');
    const apple = await service.createFolder(owner, 'apple');
    const inner = await service.createFolder(owner, 'inner', apple.id);
    const deep = await service.upload(owner, { originalName: 'deep.md', mimeType: 'text/plain', bytes: Buffer.from('深层'), parentId: inner.id });
    const root = await service.upload(owner, { originalName: 'root.md', mimeType: 'text/plain', bytes: Buffer.from('根上') });
    const picture = await service.upload(owner, { originalName: '封面.png', mimeType: 'image/png', bytes: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
    await service.createFolder(owner, 'only-folder');
    await service.createLink(owner, '只是链接', 'https://example.test/');
    const shared = await service.upload(mate, { originalName: 'shared.md', mimeType: 'text/plain', bytes: Buffer.from('共享正文') });
    await service.setScope(mate, shared.id, 'ENTERPRISE', true);
    const secret = await service.upload(mate, { originalName: 'secret.md', mimeType: 'text/plain', bytes: Buffer.from('别人的私人') });
    const hidden = await service.createFolder(mate, '私有夹');
    const exposed = await service.upload(mate, { originalName: '露出.md', mimeType: 'text/plain', bytes: Buffer.from('共享文件'), parentId: hidden.id });
    await service.setScope(mate, exposed.id, 'ENTERPRISE', true);
    const recycled = await service.upload(owner, { originalName: 'gone.md', mimeType: 'text/plain', bytes: Buffer.from('回收') });
    await service.recycle(owner, recycled.id);

    const first = await service.catalog(owner, '', 1, 10);
    assert.equal(first.total, 5);
    assert.deepEqual(first.items.map((row) => row.name).sort(), ['deep.md', 'root.md', 'shared.md', '封面.png', '露出.md'].sort());
    assert.equal(first.items.some((row) => row.kind !== 'FILE' || row.name === 'secret.md' || row.name === 'only-folder'), false);
    const nested = first.items.find((row) => row.id === deep.id)!;
    assert.equal(nested.location, 'mine');
    assert.deepEqual(nested.parentPath, [{ id: apple.id, name: 'apple' }, { id: inner.id, name: 'inner' }]);
    assert.equal(first.items.find((row) => row.id === shared.id)?.location, 'shared');
    assert.deepEqual(first.items.find((row) => row.id === exposed.id)?.parentPath, []);
    assert.equal((await service.catalog(owner, 'DEEP', 1, 10)).items.map((row) => row.id).join(), deep.id);
    assert.equal((await service.catalog(owner, '封面', 1, 10)).items[0]?.id, picture.id);
    assert.equal((await service.catalog(mate, '', 1, 10)).items.some((row) => row.id === root.id || row.id === secret.id && row.location !== 'mine'), false);
    const mateRows = await service.catalog(mate, '', 1, 10);
    assert.equal(mateRows.items.find((row) => row.id === secret.id)?.location, 'mine');
    assert.equal(mateRows.items.find((row) => row.id === shared.id)?.location, 'mine');
    assert.equal(mateRows.items.some((row) => row.id === root.id), false);

    for (let i = 0; i < 12; i++) await service.upload(owner, { originalName: `n${i}.md`, mimeType: 'text/plain', bytes: Buffer.from('x') });
    const page1 = await service.catalog(owner, '', 1, 10);
    const page2 = await service.catalog(owner, '', 2, 10);
    assert.equal(page1.total, 17);
    assert.equal(page1.items.length, 10);
    assert.equal(page2.items.length, 7);
    assert.equal(new Set([...page1.items, ...page2.items].map((row) => row.id)).size, 17);
    const bad = code(await service.catalog(owner, '', 0, 10).catch((error: unknown) => error));
    assert.equal(bad.status, 400);
    assert.equal(bad.code, 'BAD_PAGE');
  });

  it('hides failed files from the agent library and keeps them on the console list', async () => {
    const { service, store, actor } = world();
    const owner = actor('owner', 'ta');
    const org = actor('admin', 'ta', { isOrgAdmin: true });
    const ready = await upload(service, owner, '可用.md', Buffer.from('可以引用'));
    const failed = await upload(service, owner, '失败.md', Buffer.from('解析失败'));
    const pending = await upload(service, owner, '等待.md', Buffer.from('还在处理'));
    const image = await service.upload(owner, { originalName: '封面.png', mimeType: 'image/png', bytes: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
    await store.updateVersion(failed.currentVersion!.id, { parseStatus: 'FAILED' });
    await store.updateVersion(pending.currentVersion!.id, { parseStatus: 'PENDING' });
    await store.updateVersion(image.currentVersion!.id, { parseStatus: 'DOWNLOAD_ONLY' });
    const agent = await service.list(owner, 'mine', null, '', false, 1, 20, 'all', undefined, undefined, true);
    assert.equal(agent.items.some((row) => row.id === failed.id), false);
    assert.equal(agent.items.some((row) => row.id === ready.id), true);
    assert.equal(agent.items.some((row) => row.id === pending.id), true);
    const consoleList = await service.list(owner, 'mine');
    assert.equal(consoleList.items.some((row) => row.id === failed.id), true);
    const members = await service.list(org, 'members');
    assert.equal(members.items.some((row) => row.id === failed.id), true);
    const cite = await service.list(owner, 'mine', null, '', true, 1, 20, 'ready', undefined, undefined, true);
    assert.deepEqual(cite.items.map((row) => row.id), [ready.id]);
    const unavailable = await service.list(owner, 'mine', null, '', true, 1, 20, 'uncitable', undefined, undefined, true);
    assert.deepEqual(unavailable.items.map((row) => row.name).sort(), ['封面.png', '等待.md']);
    const found = await service.catalog(owner, '', 1, 10);
    assert.equal(found.items.some((row) => row.id === failed.id), false);
    assert.equal(found.items.some((row) => row.id === ready.id), true);
  });
});

describe('atomic parse retry', () => {
  it('keeps a completed parse when a queued tree transaction fails', { timeout: 2000 }, async () => {
    const { service, store, actor } = world();
    const owner = actor('owner', 'ta');
    const item = await upload(service, owner, 'queued.md', Buffer.from('committed source'));
    const versionId = item.currentVersion!.id;
    await store.updateVersion(versionId, { parseStatus: 'FAILED', parseReason: 'retryable' });
    let entered!: () => void;
    let release!: () => void;
    const enteredParse = new Promise<void>(resolve => { entered = resolve; });
    const allowParse = new Promise<void>(resolve => { release = resolve; });
    const listChunks = store.listChunks.bind(store);
    let pause = true;
    store.listChunks = async id => {
      if (pause) { pause = false; entered(); await allowParse; }
      return listChunks(id);
    };
    const parsed = service.retryParse(owner, item.id);
    await enteredParse;
    const tree = store.withTenantWrite('ta', async () => {
      await parsed;
      throw new Error('tree write failed');
    });
    const failedTree = assert.rejects(tree, /tree write failed/);
    release();
    assert.equal((await parsed).currentVersion?.parseStatus, 'READY');
    await failedTree;
    assert.equal((await store.getVersion(versionId))?.parseStatus, 'READY');
    assert.deepEqual((await store.listChunks(versionId)).map(row => ({ content: row.content, locator: row.locator })),
      [{ content: 'committed source', locator: 'paragraph:1' }]);
    assert.equal(store.audits.filter(row => row.action === 'library_retry_parse').length, 1);
  });

  it('joins a parse retry inside an existing tree transaction without waiting on itself', { timeout: 2000 }, async () => {
    const { service, store, actor } = world();
    const owner = actor('owner', 'ta');
    const item = await upload(service, owner, 'nested.md', Buffer.from('nested source'));
    const versionId = item.currentVersion!.id;
    await store.updateVersion(versionId, { parseStatus: 'FAILED', parseReason: 'retryable' });
    const parsed = await store.withTenantWrite('ta', () => service.retryParse(owner, item.id));
    assert.equal(parsed.currentVersion?.parseStatus, 'READY');
    assert.equal((await store.listChunks(versionId))[0]?.content, 'nested source');
    assert.equal(store.audits.filter(row => row.action === 'library_retry_parse').length, 1);
  });

  it('rolls back status and chunks after a chunk write fails, then permits a retry', async () => {
    const { service, store, actor } = world();
    const owner = actor('owner', 'ta');
    const item = await upload(service, owner, 'retry.md', Buffer.from('persistent source'));
    const versionId = item.currentVersion!.id;
    await store.updateVersion(versionId, { parseStatus: 'FAILED', parseReason: 'retryable' });
    const beforeVersion = structuredClone(await store.getVersion(versionId));
    const beforeChunks = structuredClone(await store.listChunks(versionId));
    const beforeAudits = [...store.audits];
    const replace = store.replaceChunks.bind(store);
    store.replaceChunks = async (...args) => { await replace(...args); throw new Error('chunk write failed'); };
    await assert.rejects(() => service.retryParse(owner, item.id), /chunk write failed/);
    assert.deepEqual(await store.getVersion(versionId), beforeVersion);
    assert.deepEqual(await store.listChunks(versionId), beforeChunks);
    assert.deepEqual(store.audits, beforeAudits);
    store.replaceChunks = replace;
    assert.equal((await service.retryParse(owner, item.id)).currentVersion?.parseStatus, 'READY');
    assert.equal((await store.listChunks(versionId)).length, 1);
  });

  it('rolls back parsed data if the success audit fails', async () => {
    const { service, store, actor } = world();
    const owner = actor('owner', 'ta');
    const item = await upload(service, owner, 'audit.md', Buffer.from('audited source'));
    const versionId = item.currentVersion!.id;
    await store.updateVersion(versionId, { parseStatus: 'FAILED', parseReason: 'retryable' });
    const beforeVersion = structuredClone(await store.getVersion(versionId));
    const beforeChunks = structuredClone(await store.listChunks(versionId));
    const beforeAudits = [...store.audits];
    const audit = store.audit.bind(store);
    store.audit = async row => { await audit(row); throw new Error('audit write failed'); };
    await assert.rejects(() => service.retryParse(owner, item.id), /audit write failed/);
    assert.deepEqual(await store.getVersion(versionId), beforeVersion);
    assert.deepEqual(await store.listChunks(versionId), beforeChunks);
    assert.deepEqual(store.audits, beforeAudits);
  });

  it('commits simultaneous retries once and preserves the successful chunk ids and locators', async () => {
    const { service, store, actor } = world();
    const owner = actor('owner', 'ta');
    const item = await upload(service, owner, 'concurrent.md', Buffer.from('first\n\nsecond'));
    const versionId = item.currentVersion!.id;
    await store.updateVersion(versionId, { parseStatus: 'FAILED' });
    await Promise.all([service.retryParse(owner, item.id), service.retryParse(owner, item.id)]);
    const chunks = structuredClone(await store.listChunks(versionId));
    assert.equal(chunks.length, 2);
    assert.equal(store.audits.filter(row => row.action === 'library_retry_parse').length, 1);
    await service.retryParse(owner, item.id);
    assert.deepEqual(await store.listChunks(versionId), chunks);
  });

  for (const action of ['replace', 'recycle'] as const) it('rejects a retry when the node changes by ' + action + ' during parsing', async () => {
    const { service, store, actor } = world();
    const owner = actor('owner', 'ta');
    const item = await upload(service, owner, 'stale.md', Buffer.from('old source'));
    const versionId = item.currentVersion!.id;
    await store.updateVersion(versionId, { parseStatus: 'FAILED' });
    const getBlob = store.getBlob.bind(store);
    store.getBlob = async key => {
      if (action === 'replace') await service.replaceVersion(owner, item.id, 'stale.md', 'text/markdown', Buffer.from('new source'));
      else await service.recycle(owner, item.id);
      return getBlob(key);
    };
    await assert.rejects(() => service.retryParse(owner, item.id), (error: unknown) => error instanceof LibraryError && error.status === 409 && error.code === 'VERSION_CONFLICT');
    assert.equal((await store.getVersion(versionId))?.parseStatus, 'FAILED');
    assert.equal(store.audits.filter(row => row.action === 'library_retry_parse').length, 0);
  });
});

describe('file purge protection', () => {
  it('refuses file purge without changing originals, versions, chunks, state or audit', async () => {
    const { service, store, actor } = world();
    const owner = actor('owner', 'ta');
    const item = await upload(service, owner, 'protected.md', Buffer.from('v1 body'));
    await service.replaceVersion(owner, item.id, 'protected.md', 'text/markdown', Buffer.from('v2 body'));
    await service.recycle(owner, item.id);
    const before = structuredClone({ node: await store.getNode(item.id), versions: [...store.versions.values()], chunks: [...store.chunks.values()], audits: store.audits });
    const blobs = [...store.blobs].map(([key, bytes]) => [key, bytes.toString('hex')]);
    await assert.rejects(() => service.purge(owner, item.id), (error: unknown) => error instanceof LibraryError && error.status === 409 && error.code === 'REFERENCE_UNVERIFIED');
    assert.deepEqual({ node: await store.getNode(item.id), versions: [...store.versions.values()], chunks: [...store.chunks.values()], audits: store.audits }, before);
    assert.deepEqual([...store.blobs].map(([key, bytes]) => [key, bytes.toString('hex')]), blobs);
    const row = (await service.list(owner, 'trash')).items.find(row => row.id === item.id)!;
    assert.equal(typeof row.purgeBlockedReason, 'string');
    assert.ok(row.purgeBlockedReason);
    await service.restore(owner, item.id);
    assert.equal((await service.openCitation(owner, item.id, item.currentVersion!.id)).quote, 'v1 body');
  });

  it('reports protected files as failed in a mixed purge batch while clearing empty metadata', async () => {
    const { service, store, actor } = world();
    const owner = actor('owner', 'ta');
    const file = await upload(service, owner, 'batch.md', Buffer.from('kept body'));
    const folder = await service.createFolder(owner, 'empty folder');
    const link = await service.createLink(owner, 'empty link', 'https://example.test/kept');
    for (const row of [file, folder, link]) await service.recycle(owner, row.id);
    const result = await service.batch(owner, [file.id, folder.id, link.id], 'purge');
    assert.deepEqual(result.ok, [folder.id, link.id]);
    assert.deepEqual(result.failed.map(row => row.id), [file.id]);
    assert.equal((await store.getNode(file.id))?.state, 'RECYCLED');
    assert.equal((await store.getNode(folder.id))?.state, 'PURGED');
    assert.equal((await store.getNode(link.id))?.state, 'PURGED');
  });

  it('keeps a recycled folder nonempty while its protected file remains', async () => {
    const { service, actor } = world();
    const owner = actor('owner', 'ta');
    const folder = await service.createFolder(owner, 'parent');
    const file = await upload(service, owner, 'child.md', Buffer.from('retained child'));
    await service.move(owner, file.id, folder.id);
    await service.recycle(owner, file.id);
    await service.recycle(owner, folder.id);
    await assert.rejects(() => service.purge(owner, folder.id), (error: unknown) => error instanceof LibraryError && error.code === 'FOLDER_NONEMPTY');
    const rows = (await service.list(owner, 'trash')).items;
    assert.equal(rows.find(row => row.id === folder.id)?.purgeBlockedReason, null);
    assert.ok(rows.find(row => row.id === file.id)?.purgeBlockedReason);
  });
});
