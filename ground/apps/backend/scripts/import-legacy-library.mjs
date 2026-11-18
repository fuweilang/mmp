/**
 * 把老猛犸个人库、团队库导入本地资料库。只连本机 Docker 的 mammoth_core（5433）。
 * 可重复执行：已有的节点、版本、正文块按旧 id 跳过，不覆盖。
 *
 *   node scripts/import-legacy-library.mjs
 */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { StringDecoder } from 'node:string_decoder';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const libraryDir = resolve(root, 'library-data');
const remoteHost = 'root@124.223.179.250';
const expected = { libs: [1400, 1800], docs: [9000, 12000], chunks: [1_500_000, 2_200_000] };

const eligible = `
WITH ok_lib AS (
  SELECT l.id
  FROM libraries l
  JOIN tenants t ON t.id = l."tenantId" AND t.status = 'active'
  LEFT JOIN users u ON u.id = l."ownerId"
  WHERE (
    l.scope = 'personal'
    AND l."agentId" IS NULL AND l."ownerKey" IS NULL AND l."tenantId" <> '__official__'
    AND u.status = 'active'
    AND EXISTS (
      SELECT 1 FROM memberships m
      WHERE m."userId" = l."ownerId" AND m."tenantId" = l."tenantId" AND m.status = 'active'
    )
  ) OR (
    l.scope = 'team'
    AND l."agentId" IS NULL AND l."ownerKey" IS NULL AND l."tenantId" <> '__official__'
    AND l."tenantId" <> 'f3a9e935-c6f2-4088-96c3-8c53b03a9767'
  )
)`;

function assertRange(label, value) {
  const [min, max] = expected[label];
  if (value < min || value > max) throw new Error(`${label} 数量 ${value} 不在 ${min}-${max}，已停止，避免导入范围错了`);
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'], ...options.spawn });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk; });
    child.stderr?.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`${command} ${args.join(' ')} 退出 ${code}\n${stderr.slice(-2000)}`));
      else resolvePromise({ stdout, stderr });
    });
  });
}

function localPsql(sql) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('docker', ['exec', '-i', 'mammoth-postgres', 'psql', '-U', 'mammoth', '-d', 'mammoth_core', '-v', 'ON_ERROR_STOP=1', '-q'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`本地 SQL 失败\n${stderr.slice(-2000)}\n${stdout.slice(-1000)}`));
      else resolvePromise(stdout);
    });
    child.stdin.end(sql);
  });
}

function remotePsql(sql) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('ssh', ['-o', 'BatchMode=yes', remoteHost, 'docker exec -i mammoth-platform-postgres-1 psql -U mammoth -d mammoth -v ON_ERROR_STOP=1 -q'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`老库 SQL 失败\n${stderr.slice(-2000)}`));
      else resolvePromise(stdout);
    });
    child.stdin.end(sql);
  });
}

async function assertLocalDatabase() {
  const mapped = await run('docker', ['port', 'mammoth-postgres', '5432']);
  if (!mapped.stdout.includes('5433')) throw new Error(`mammoth-postgres 不是本地 5433：${mapped.stdout.trim()}`);
  const database = await localPsql('SELECT current_database();');
  if (!database.includes('mammoth_core')) throw new Error(`目标库不是 mammoth_core：${database.trim()}`);
}

function pipeCopy(selectSql, copySql) {
  return new Promise((resolvePromise, reject) => {
    const remote = spawn('ssh', ['-o', 'BatchMode=yes', remoteHost, 'docker exec -e PGOPTIONS=-c\\ statement_timeout=0 -i mammoth-platform-postgres-1 psql -U mammoth -d mammoth -v ON_ERROR_STOP=1 -q'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const local = spawn('docker', ['exec', '-i', 'mammoth-postgres', 'psql', '-U', 'mammoth', '-d', 'mammoth_core', '-v', 'ON_ERROR_STOP=1', '-q', '-c', copySql], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let remoteErr = '';
    let localErr = '';
    let localOut = '';
    remote.stderr.on('data', (chunk) => { remoteErr += chunk; });
    local.stderr.on('data', (chunk) => { localErr += chunk; });
    local.stdout.on('data', (chunk) => { localOut += chunk; });
    remote.stdout.pipe(local.stdin);
    remote.on('error', reject);
    local.on('error', reject);
    remote.on('close', (code) => {
      if (code !== 0) {
        local.stdin.destroy();
        reject(new Error(`老库导出失败 ${code}\n${remoteErr.slice(-2000)}`));
      }
    });
    local.on('close', (code) => {
      if (code !== 0) reject(new Error(`本地导入失败 ${code}\n${localErr.slice(-2000)}\n${localOut.slice(-500)}`));
      else resolvePromise(localOut.trim());
    });
    remote.stdin.end(`COPY (${selectSql}) TO STDOUT WITH (FORMAT csv, HEADER true);\n`);
  });
}

async function stage() {
  await localPsql(`
    DROP SCHEMA IF EXISTS legacy_import CASCADE;
    CREATE SCHEMA legacy_import;
    CREATE TABLE legacy_import.lib (
      id text PRIMARY KEY, scope text NOT NULL, tenant_id text NOT NULL, owner_id text,
      name text NOT NULL, created_at timestamp NOT NULL
    );
    CREATE TABLE legacy_import.doc (
      id text PRIMARY KEY, library_id text NOT NULL, name text NOT NULL, doc_type text,
      oss_key text, status text NOT NULL, status_detail text, created_at timestamp NOT NULL
    );
    CREATE TABLE legacy_import.chunk (
      id text PRIMARY KEY, document_id text NOT NULL, ordinal integer NOT NULL, text text NOT NULL
    );
    CREATE INDEX legacy_import_chunk_doc ON legacy_import.chunk (document_id, ordinal);
  `);
  const counts = await remotePsql(`
    COPY (
      ${eligible}
      SELECT
        (SELECT count(*) FROM ok_lib),
        (SELECT count(*) FROM documents d JOIN ok_lib l ON l.id = d."libraryId"),
        (SELECT count(*) FROM chunks c JOIN documents d ON d.id = c."documentId" JOIN ok_lib l ON l.id = d."libraryId" WHERE c.text IS NOT NULL AND btrim(c.text) <> ''),
        (SELECT count(*) FROM documents d JOIN libraries l ON l.id = d.id JOIN ok_lib x ON x.id = l.id)
    ) TO STDOUT;
  `);
  const [libs, docs, chunks, collisions] = counts.trim().split('\n')[0].split('\t').map((item) => Number(item.trim()));
  console.log(`老库候选 库 ${libs} 文档 ${docs} 正文块 ${chunks}`);
  assertRange('libs', libs);
  assertRange('docs', docs);
  assertRange('chunks', chunks);
  if (collisions !== 0) throw new Error(`库 id 和文档 id 有 ${collisions} 个冲突`);

  console.log('导出库');
  await pipeCopy(`
    ${eligible}
    SELECT l.id, l.scope, l."tenantId", coalesce(l."ownerId", ''), l.name, l."createdAt"
    FROM libraries l JOIN ok_lib x ON x.id = l.id
  `, `COPY legacy_import.lib (id, scope, tenant_id, owner_id, name, created_at) FROM STDIN WITH (FORMAT csv, HEADER true)`);

  console.log('导出文档');
  await pipeCopy(`
    ${eligible}
    SELECT d.id, d."libraryId", d.name, coalesce(d.type, ''), coalesce(d."ossKey", ''), d.status, coalesce(d."statusDetail", ''), d."createdAt"
    FROM documents d JOIN ok_lib l ON l.id = d."libraryId"
  `, `COPY legacy_import.doc (id, library_id, name, doc_type, oss_key, status, status_detail, created_at) FROM STDIN WITH (FORMAT csv, HEADER true)`);

  console.log('导出正文');
  await pipeCopy(`
    ${eligible}
    SELECT c.id, c."documentId",
      (row_number() OVER (PARTITION BY c."documentId" ORDER BY c.ordinal NULLS LAST, c."createdAt", c.id) - 1)::int,
      c.text
    FROM chunks c
    JOIN documents d ON d.id = c."documentId"
    JOIN ok_lib l ON l.id = d."libraryId"
    WHERE c.text IS NOT NULL AND btrim(c.text) <> ''
  `, `COPY legacy_import.chunk (id, document_id, ordinal, text) FROM STDIN WITH (FORMAT csv, HEADER true)`);
}

const loadSql = `
CREATE OR REPLACE FUNCTION legacy_import.safe_name(raw text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(NULLIF(left(btrim(regexp_replace(replace(replace(COALESCE(raw, ''), '/', '／'), E'\\\\', '＼'), '[[:cntrl:]]', '', 'g')), 180), ''), '未命名资料');
$$;

CREATE OR REPLACE FUNCTION legacy_import.file_ext(name text, oss_key text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN COALESCE(oss_key, '') ~ '\\.[A-Za-z0-9]{1,12}$' THEN lower(substring(oss_key FROM '\\.[A-Za-z0-9]{1,12}$'))
    WHEN COALESCE(oss_key, '') = '' THEN '.txt'
    WHEN COALESCE(name, '') ~ '\\.[A-Za-z0-9]{1,12}$' THEN lower(substring(name FROM '\\.[A-Za-z0-9]{1,12}$'))
    ELSE '.bin'
  END;
$$;

CREATE OR REPLACE FUNCTION legacy_import.mime_of(ext text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE ext
    WHEN '.pdf' THEN 'application/pdf'
    WHEN '.txt' THEN 'text/plain'
    WHEN '.md' THEN 'text/markdown'
    WHEN '.csv' THEN 'text/csv'
    WHEN '.doc' THEN 'application/msword'
    WHEN '.docx' THEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    WHEN '.xls' THEN 'application/vnd.ms-excel'
    WHEN '.xlsx' THEN 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    WHEN '.ppt' THEN 'application/vnd.ms-powerpoint'
    WHEN '.pptx' THEN 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    WHEN '.png' THEN 'image/png'
    WHEN '.jpg' THEN 'image/jpeg'
    WHEN '.jpeg' THEN 'image/jpeg'
    WHEN '.gif' THEN 'image/gif'
    WHEN '.webp' THEN 'image/webp'
    WHEN '.mp4' THEN 'video/mp4'
    WHEN '.mov' THEN 'video/quicktime'
    ELSE 'application/octet-stream'
  END;
$$;

INSERT INTO library_node (id, tenant_id, owner_user_id, parent_id, kind, name, scope, state, created_at, updated_at)
SELECT l.id, l.tenant_id,
  CASE WHEN l.scope = 'personal' THEN NULLIF(l.owner_id, '') ELSE admin_owner.user_id END,
  NULL, 'FOLDER', legacy_import.safe_name(l.name),
  CASE WHEN l.scope = 'personal' THEN 'PRIVATE'::"LibraryScope" ELSE 'ENTERPRISE'::"LibraryScope" END,
  'ACTIVE', l.created_at, l.created_at
FROM legacy_import.lib l
JOIN tenant t ON t.id = l.tenant_id
LEFT JOIN LATERAL (
  SELECT m.user_id FROM org_member m
  WHERE m.tenant_id = l.tenant_id AND m.role IN ('OWNER', 'ADMIN')
  ORDER BY CASE m.role WHEN 'OWNER' THEN 0 ELSE 1 END, m.user_id
  LIMIT 1
) admin_owner ON true
WHERE (l.scope = 'personal' AND EXISTS (
  SELECT 1 FROM org_member m WHERE m.tenant_id = l.tenant_id AND m.user_id = NULLIF(l.owner_id, '')
)) OR (l.scope = 'team' AND admin_owner.user_id IS NOT NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO library_node (id, tenant_id, owner_user_id, parent_id, kind, name, scope, state, created_at, updated_at)
SELECT d.id, parent.tenant_id, parent.owner_user_id, parent.id, 'FILE', legacy_import.safe_name(d.name),
  parent.scope, 'ACTIVE', d.created_at, d.created_at
FROM legacy_import.doc d
JOIN library_node parent ON parent.id = d.library_id AND parent.kind = 'FOLDER'
ON CONFLICT (id) DO NOTHING;

INSERT INTO library_version (
  id, node_id, tenant_id, version_no, original_name, mime_type, size_bytes, storage_key, sha256,
  parse_status, parse_reason, extract_truncated, created_by_user_id, created_at
)
SELECT d.id, n.id, n.tenant_id, 1, legacy_import.safe_name(d.name),
  legacy_import.mime_of(legacy_import.file_ext(d.name, NULLIF(d.oss_key, ''))),
  0,
  n.tenant_id || '/' || d.id || legacy_import.file_ext(d.name, NULLIF(d.oss_key, '')),
  repeat('0', 64),
  CASE
    WHEN d.status = 'ready' AND EXISTS (SELECT 1 FROM legacy_import.chunk c WHERE c.document_id = d.id) THEN 'READY'::"LibraryParseStatus"
    WHEN d.status = 'failed' THEN 'FAILED'::"LibraryParseStatus"
    ELSE 'DOWNLOAD_ONLY'::"LibraryParseStatus"
  END,
  CASE
    WHEN d.status = 'failed' THEN COALESCE(NULLIF(left(d.status_detail, 180), ''), '旧库解析失败')
    WHEN d.status = 'ready' AND NOT EXISTS (SELECT 1 FROM legacy_import.chunk c WHERE c.document_id = d.id) THEN '没有可提取的文字'
    ELSE NULL
  END,
  d.status_detail LIKE '%截断%',
  n.owner_user_id, d.created_at
FROM legacy_import.doc d
JOIN library_node n ON n.id = d.id AND n.kind = 'FILE'
ON CONFLICT (id) DO NOTHING;

UPDATE library_node n
SET current_version_id = v.id
FROM library_version v
WHERE v.node_id = n.id AND n.kind = 'FILE' AND n.current_version_id IS NULL
  AND n.id IN (SELECT id FROM legacy_import.doc);

INSERT INTO library_chunk (id, version_id, tenant_id, ordinal, content, locator, locator_kind)
SELECT c.id, v.id, v.tenant_id, c.ordinal, c.text, 'paragraph:' || (c.ordinal + 1), 'paragraph'
FROM legacy_import.chunk c
JOIN library_version v ON v.id = c.document_id
ON CONFLICT (id) DO NOTHING;
`;

async function load() {
  console.log('写入资料库表');
  await localPsql(loadSql);
}

function parseCsvRecords(push) {
  let field = '';
  let row = [];
  let quoted = false;
  const decoder = new StringDecoder('utf8');
  return (buffer, end = false) => {
    const text = decoder.write(buffer) + (end ? decoder.end() : '');
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (quoted) {
        if (char === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 1; }
          else quoted = false;
        } else field += char;
      } else if (char === '"') quoted = true;
      else if (char === ',') { row.push(field); field = ''; }
      else if (char === '\n') {
        row.push(field);
        push(row);
        row = [];
        field = '';
      } else if (char !== '\r') field += char;
    }
    if (end && (field || row.length)) {
      row.push(field);
      push(row);
    }
  };
}

async function writeTextFiles() {
  console.log('写没有原文件的正文');
  const child = spawn('docker', ['exec', '-i', 'mammoth-postgres', 'psql', '-U', 'mammoth', '-d', 'mammoth_core', '-v', 'ON_ERROR_STOP=1', '-q'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const done = new Promise((resolvePromise, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`导出正文文件失败\n${stderr.slice(-1500)}`));
      else resolvePromise();
    });
  });
  child.stdin.end(`COPY (
    SELECT v.storage_key, c.ordinal, c.content
    FROM library_chunk c
    JOIN library_version v ON v.id = c.version_id
    JOIN legacy_import.doc d ON d.id = v.node_id
    WHERE COALESCE(d.oss_key, '') = ''
    ORDER BY v.id, c.ordinal
  ) TO STDOUT WITH (FORMAT csv);\n`);

  let currentKey = '';
  let parts = [];
  let files = 0;
  const finish = async () => {
    if (!currentKey) return;
    const target = resolve(libraryDir, currentKey);
    await mkdir(dirname(target), { recursive: true });
    await new Promise((resolvePromise, reject) => {
      const out = createWriteStream(target);
      out.on('error', reject);
      out.on('finish', resolvePromise);
      out.end(Buffer.from(parts.join('\n'), 'utf8'));
    });
    files += 1;
    parts = [];
  };
  let chain = Promise.resolve();
  const feed = parseCsvRecords((row) => {
    const [key, , content] = row;
    if (!key) return;
    chain = chain.then(async () => {
      if (key !== currentKey) {
        await finish();
        currentKey = key;
      }
      if (content) parts.push(content);
    });
  });
  for await (const chunk of child.stdout) {
    feed(chunk);
    await chain;
  }
  feed(Buffer.alloc(0), true);
  await chain;
  await finish();
  await done;
  console.log(`正文文件 ${files}`);
}

async function downloadOriginalsFixed() {
  const manifest = await localPsql(`COPY (
    SELECT v.storage_key, d.oss_key
    FROM legacy_import.doc d
    JOIN library_version v ON v.id = d.id
    WHERE COALESCE(d.oss_key, '') <> '' AND d.oss_key LIKE 'knowledge-originals/%'
  ) TO STDOUT WITH (FORMAT csv);`);
  const lines = manifest.split('\n').filter((line) => line.includes('knowledge-originals/'));
  console.log(`原文件 ${lines.length}`);
  const scriptPath = '/tmp/import-legacy-library-files.mjs';
  const localScript = '/tmp/import-legacy-library-files.mjs';
  await writeRemoteDownloader(localScript);
  await run('scp', ['-o', 'BatchMode=yes', localScript, `${remoteHost}:/tmp/import-legacy-library-files.mjs`]);
  await new Promise((resolvePromise, reject) => {
    const child = spawn('ssh', ['-o', 'BatchMode=yes', remoteHost, 'cat > /tmp/legacy-library-manifest.csv'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => code === 0 ? resolvePromise() : reject(new Error(stderr)));
    child.stdin.end(lines.join('\n') + '\n');
  });
  const result = await run('ssh', ['-o', 'BatchMode=yes', remoteHost, `node ${scriptPath}`]);
  console.log(`下载结果 ${result.stdout.trim()}`);
  if (result.stderr) process.stderr.write(result.stderr);
  console.log('同步到本地资料目录');
  await run('rsync', ['-a', `${remoteHost}:/tmp/legacy-library-files/`, `${libraryDir}/`]);
}

async function writeRemoteDownloader(path) {
  const { writeFile } = await import('node:fs/promises');
  await writeFile(path, `import fs from 'node:fs';
import https from 'node:https';
import crypto from 'node:crypto';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const env = fs.readFileSync('/www/wwwroot/mammoth-platform/.env', 'utf8');
const masterLine = env.split(/\\n/).find((line) => line.startsWith('MASTER_KEY='));
if (!masterLine) throw new Error('MASTER_KEY missing');
const master = crypto.createHash('sha256').update(masterLine.slice('MASTER_KEY='.length).trim().replace(/^"|"$/g, '')).digest();
function decrypt(enc) {
  const [iv, tag, body] = String(enc).split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', master, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8');
}
function psql(sql) {
  return execFileSync('docker', ['exec', '-i', 'mammoth-platform-postgres-1', 'psql', '-U', 'mammoth', '-d', 'mammoth', '-At', '-F', '\\t', '-c', sql], { encoding: 'utf8' }).trim();
}
const rows = psql("SELECT key, \\"isSecret\\", value FROM platform_settings WHERE key IN ('oss_ak_id','oss_ak_secret','oss_bucket','oss_endpoint')").split(/\\n/);
const conf = {};
for (const row of rows) {
  const [key, secret, value] = row.split('\\t');
  conf[key] = secret === 't' ? decrypt(value) : value;
}
if (!conf.oss_ak_id || !conf.oss_ak_secret || !conf.oss_bucket || !conf.oss_endpoint) throw new Error('OSS config incomplete');
function signed(key) {
  const expires = String(Math.floor(Date.now() / 1000) + 3600);
  const resource = '/' + conf.oss_bucket + '/' + key;
  const signature = crypto.createHmac('sha1', conf.oss_ak_secret).update('GET\\n\\n\\n' + expires + '\\n' + resource).digest('base64');
  return 'https://' + conf.oss_bucket + '.' + conf.oss_endpoint + '/' + key + '?OSSAccessKeyId=' + encodeURIComponent(conf.oss_ak_id) + '&Expires=' + expires + '&Signature=' + encodeURIComponent(signature);
}
function get(url, file) {
  return new Promise((resolvePromise, reject) => {
    const request = https.get(url, (response) => {
      if (response.statusCode !== 200) { response.resume(); reject(new Error('HTTP ' + response.statusCode)); return; }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const out = fs.createWriteStream(file);
      response.pipe(out);
      out.on('finish', () => resolvePromise());
      out.on('error', reject);
    });
    request.on('error', reject);
  });
}
function parseLine(line) {
  let field = '', row = [], quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"') { if (line[i + 1] === '"') { field += '"'; i += 1; } else quoted = false; }
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else field += char;
  }
  row.push(field);
  return row;
}
const input = fs.readFileSync('/tmp/legacy-library-manifest.csv', 'utf8').split(/\\n/).filter(Boolean);
const dest = '/tmp/legacy-library-files';
let ok = 0, failed = 0;
for (const line of input) {
  const [storageKey, ossKey] = parseLine(line);
  if (!storageKey || !/^knowledge-originals\\/[A-Za-z0-9._-]+$/.test(ossKey)) { failed += 1; continue; }
  const target = dest + '/' + storageKey;
  if (fs.existsSync(target) && fs.statSync(target).size > 0) { ok += 1; continue; }
  try {
    await get(signed(ossKey), target);
    ok += 1;
    if (ok % 25 === 0) process.stderr.write('downloaded ' + ok + '\\n');
  } catch (error) {
    failed += 1;
    process.stderr.write('fail ' + error.message + '\\n');
  }
}
process.stdout.write(ok + ' ' + failed + '\\n');
`);
}

async function hashFiles() {
  console.log('核对文件哈希');
  const list = await localPsql(`COPY (
    SELECT id, storage_key FROM library_version WHERE id IN (SELECT id FROM legacy_import.doc)
  ) TO STDOUT;`);
  const updates = [];
  for (const line of list.split('\n')) {
    if (!line.trim()) continue;
    const tab = line.indexOf('\t');
    const id = line.slice(0, tab);
    const key = line.slice(tab + 1);
    const file = resolve(libraryDir, key);
    let info;
    try { info = await stat(file); } catch {
      await mkdir(dirname(file), { recursive: true });
      const { writeFile } = await import('node:fs/promises');
      await writeFile(file, Buffer.alloc(0));
      info = await stat(file);
    }
    const hash = createHash('sha256');
    await new Promise((resolvePromise, reject) => {
      const stream = createReadStream(file);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('error', reject);
      stream.on('end', resolvePromise);
    });
    updates.push(`${id}\t${info.size}\t${hash.digest('hex')}`);
  }
  if (!updates.length) return;
  await localPsql(`BEGIN;
CREATE TEMP TABLE legacy_file_hash (id text, size_bytes integer, sha256 text) ON COMMIT DROP;
COPY legacy_file_hash FROM STDIN;
${updates.join('\n')}
\\.
UPDATE library_version v
SET size_bytes = h.size_bytes, sha256 = h.sha256
FROM legacy_file_hash h
WHERE v.id = h.id AND h.size_bytes >= 0;
COMMIT;
`);
}

async function verify() {
  const report = await localPsql(`
    SELECT 'folders', count(*) FROM library_node n JOIN legacy_import.lib l ON l.id = n.id WHERE n.kind = 'FOLDER'
    UNION ALL SELECT 'files', count(*) FROM library_node n JOIN legacy_import.doc d ON d.id = n.id WHERE n.kind = 'FILE'
    UNION ALL SELECT 'versions', count(*) FROM library_version v JOIN legacy_import.doc d ON d.id = v.id
    UNION ALL SELECT 'chunks', count(*) FROM library_chunk c JOIN legacy_import.chunk s ON s.id = c.id
    UNION ALL SELECT 'file_without_version', count(*) FROM library_node n JOIN legacy_import.doc d ON d.id = n.id WHERE n.current_version_id IS NULL
    UNION ALL SELECT 'scope_mismatch', count(*) FROM library_node child JOIN library_node parent ON parent.id = child.parent_id WHERE child.scope <> parent.scope AND child.id IN (SELECT id FROM legacy_import.doc)
    UNION ALL SELECT 'cross_tenant', count(*) FROM library_node child JOIN library_node parent ON parent.id = child.parent_id WHERE child.tenant_id <> parent.tenant_id AND child.id IN (SELECT id FROM legacy_import.doc)
    UNION ALL SELECT 'personal_not_private', count(*) FROM library_node n JOIN legacy_import.lib l ON l.id = n.id WHERE l.scope = 'personal' AND n.scope <> 'PRIVATE'
    UNION ALL SELECT 'team_not_enterprise', count(*) FROM library_node n JOIN legacy_import.lib l ON l.id = n.id WHERE l.scope = 'team' AND n.scope <> 'ENTERPRISE'
    UNION ALL SELECT 'owner_not_member', count(*) FROM library_node n JOIN legacy_import.lib l ON l.id = n.id WHERE NOT EXISTS (SELECT 1 FROM org_member m WHERE m.tenant_id = n.tenant_id AND m.user_id = n.owner_user_id)
    UNION ALL SELECT 'team_owner_not_admin', count(*) FROM library_node n JOIN legacy_import.lib l ON l.id = n.id WHERE l.scope = 'team' AND NOT EXISTS (SELECT 1 FROM org_member m WHERE m.tenant_id = n.tenant_id AND m.user_id = n.owner_user_id AND m.role IN ('OWNER','ADMIN'))
    UNION ALL SELECT 'chunk_tenant_mismatch', count(*) FROM library_chunk c JOIN library_version v ON v.id = c.version_id JOIN legacy_import.chunk s ON s.id = c.id WHERE c.tenant_id <> v.tenant_id
    UNION ALL SELECT 'missing_hash', count(*) FROM library_version v JOIN legacy_import.doc d ON d.id = v.id WHERE v.sha256 = repeat('0', 64) AND v.size_bytes > 0
    UNION ALL SELECT 'zero_file_with_chunk', count(*) FROM library_version v JOIN legacy_import.doc d ON d.id = v.id WHERE v.size_bytes = 0 AND EXISTS (SELECT 1 FROM library_chunk c WHERE c.version_id = v.id);
  `);
  console.log(report);
  const rows = [...report.matchAll(/([a-z_]+)\s+\|\s+([0-9]+)/g)];
  const byName = new Map(rows.map((match) => [match[1], Number(match[2])]));
  if (!byName.get('folders') || !byName.get('files') || !byName.get('versions')) throw new Error(`导入行数异常\n${report}`);
  const bad = [...byName.entries()].filter(([name, value]) => !['folders', 'files', 'versions', 'chunks'].includes(name) && value !== 0);
  if (bad.length) throw new Error(`校验未通过：${bad.map(([name, value]) => `${name}=${value}`).join(', ')}`);
}

async function main() {
  await assertLocalDatabase();
  const step = process.argv[2] || 'all';
  if (step === 'all') {
    await stage();
    await load();
    await writeTextFiles();
  }
  if (step === 'all' || step === 'files') {
    await downloadOriginalsFixed();
    await hashFiles();
    await verify();
    await localPsql('DROP SCHEMA IF EXISTS legacy_import CASCADE;');
  }
  console.log('导入完成');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
