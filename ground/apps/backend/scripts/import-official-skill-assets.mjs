#!/usr/bin/env node
/**
 * Idempotent import of managed skill packages from assets/v1/packages into Admin DB.
 * Usage:
 *   node scripts/import-official-skill-assets.mjs
 *   node scripts/import-official-skill-assets.mjs --enable
 *   node scripts/import-official-skill-assets.mjs --enable frontend-design cn-punctuation-checker
 * --create-only skips existing keys without altering revisions or enable state.
 * Does not delete existing skills. Upserts only catalog keys present under assets/v1/packages.
 */
import { createRequire } from 'node:module';
import { readFileSync, existsSync, readdirSync, mkdirSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(__dirname, '..');
const require = createRequire(join(backendRoot, 'package.json'));

for (const name of ['.env', '.env.local']) {
  const p = join(backendRoot, name);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const args = process.argv.slice(2);
const enable = args.includes('--enable');
const createOnly = args.includes('--create-only');
const enableExisting = args.includes('--enable-existing');
const keysFilter = args.filter((a) => !a.startsWith('--'));
if (enableExisting && !keysFilter.length) throw new Error('--enable-existing requires explicit package keys');

const assetsRoot = join(backendRoot, 'src/official-skill/assets/v1');
const packagesRoot = join(assetsRoot, 'packages');
const uploadRoot = process.env.UPLOAD_DIR || join(backendRoot, 'uploads');

function loadPackages() {
  if (!existsSync(packagesRoot)) throw new Error('missing ' + packagesRoot);
  const keys = readdirSync(packagesRoot).filter((n) => !n.startsWith('.'));
  const out = [];
  for (const key of keys) {
    if (keysFilter.length && !keysFilter.includes(key)) continue;
    const dir = join(packagesRoot, key);
    const manifest = JSON.parse(readFileSync(join(dir, 'skill.json'), 'utf8'));
    const instruction = readFileSync(join(dir, 'SKILL.md'), 'utf8');
    const origin = existsSync(join(dir, 'ORIGIN.json'))
      ? JSON.parse(readFileSync(join(dir, 'ORIGIN.json'), 'utf8'))
      : {};
    const files = [];
    function walk(rel = '') {
      const abs = join(dir, rel);
      for (const name of readdirSync(abs, { withFileTypes: true })) {
        if (name.name === 'ORIGIN.json') continue;
        const child = rel ? `${rel}/${name.name}` : name.name;
        if (name.isDirectory()) walk(child);
        else files.push(child.replace(/\\/g, '/'));
      }
    }
    walk();
    out.push({ key: manifest.key || key, manifest, instruction, origin, dir, files });
  }
  return out;
}

async function platformAdminId() {
  const admin = await prisma.user.findFirst({
    where: { isPlatformAdmin: true, status: 'active' },
    orderBy: { createdAt: 'asc' },
  });
  if (!admin) throw new Error('no platform admin');
  return admin.id;
}

function writePackageFiles(skillId, revision, pkg) {
  const relDir = `official-skills/${skillId}/r${revision}`;
  const absDir = join(uploadRoot, relDir);
  rmSync(absDir, { recursive: true, force: true });
  mkdirSync(absDir, { recursive: true });
  for (const rel of pkg.files) {
    if (rel === 'ORIGIN.json') continue;
    const src = join(pkg.dir, rel);
    const dest = join(absDir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest);
  }
  return relDir.replace(/\\/g, '/');
}

async function upsert(pkg, actorUserId) {
  const key = pkg.key;
  const name = String(pkg.manifest.name || key).trim();
  const summary = String(pkg.manifest.description || '').trim();
  const categories = pkg.manifest.category ? [pkg.manifest.category] : [];
  const existing = await prisma.officialSkill.findUnique({ where: { key } });

  if (!existing) {
    const created = await prisma.officialSkill.create({
      data: { key, name, summary, categories, enabledAt: null, currentRevision: 0 },
    });
    const storagePath = writePackageFiles(created.id, 1, pkg);
    const packageRow = await prisma.officialSkillPackage.create({
      data: {
        skillId: created.id,
        revision: 1,
        storagePath,
        manifest: pkg.manifest,
        instructionBytes: Buffer.byteLength(pkg.instruction, 'utf8'),
        resourceCount: (pkg.manifest.references || []).length,
      },
    });
    await prisma.officialSkill.update({
      where: { id: created.id },
      data: { currentRevision: 1, currentPackageId: packageRow.id, name, summary, categories },
    });
    await prisma.auditLog.create({
      data: {
        userId: actorUserId,
        action: 'admin_create_official_skill',
        meta: { skillId: created.id, key, revision: 1, via: 'import-official-skill-assets' },
      },
    });
    console.log('created', key, created.id);
    return created.id;
  }

  if (createOnly) {
    console.log('preserved existing', key);
    return enableExisting ? existing.id : null;
  }

  // Upsert package content for known catalog keys; do not wipe enabledAt unless enabling later.
  const revision = (existing.currentRevision || 0) + 1;
  const storagePath = writePackageFiles(existing.id, revision, pkg);
  const packageRow = await prisma.officialSkillPackage.create({
    data: {
      skillId: existing.id,
      revision,
      storagePath,
      manifest: pkg.manifest,
      instructionBytes: Buffer.byteLength(pkg.instruction, 'utf8'),
      resourceCount: (pkg.manifest.references || []).length,
    },
  });
  await prisma.officialSkill.update({
    where: { id: existing.id },
    data: {
      currentRevision: revision,
      currentPackageId: packageRow.id,
      name,
      summary,
      categories,
    },
  });
  await prisma.auditLog.create({
    data: {
      userId: actorUserId,
      action: 'admin_replace_official_skill_package',
      meta: { skillId: existing.id, key, revision, via: 'import-official-skill-assets' },
    },
  });
  console.log('updated', key, 'r' + revision, existing.id);
  return existing.id;
}

async function enableSkill(id, actorUserId) {
  const row = await prisma.officialSkill.findUnique({ where: { id } });
  if (!row) return;
  if (row.enabledAt) {
    console.log('already enabled', row.key);
    return;
  }
  await prisma.officialSkill.update({ where: { id }, data: { enabledAt: new Date() } });
  await prisma.auditLog.create({
    data: {
      userId: actorUserId,
      action: 'admin_enable_official_skill',
      meta: { skillId: id, key: row.key, via: 'import-official-skill-assets' },
    },
  });
  console.log('enabled', row.key);
}

async function main() {
  const actor = await platformAdminId();
  const packages = loadPackages();
  console.log('loading', packages.length, 'packages from', packagesRoot);
  const ids = [];
  for (const pkg of packages) {
    const id = await upsert(pkg, actor);
    if (id) ids.push(id);
  }
  if (enable) {
    for (const id of ids) await enableSkill(id, actor);
  }
  const all = await prisma.officialSkill.findMany({
    select: { key: true, name: true, categories: true, enabledAt: true, currentRevision: true },
    orderBy: { key: 'asc' },
  });
  console.log('DB skills', all.length);
  for (const s of all) {
    console.log('-', s.key, s.name, (s.categories && s.categories[0]) || '-', s.enabledAt ? 'ENABLED' : 'disabled', 'r' + s.currentRevision);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
