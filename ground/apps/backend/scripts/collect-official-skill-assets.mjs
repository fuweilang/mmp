#!/usr/bin/env node
/**
 * Collect + adapt licensed public skills into managed skill packages.
 * Does NOT clone repos. Fetches individual files via raw.githubusercontent.com.
 * Output: src/official-skill/assets/v1/packages/<key>/ + SOURCE-MAP.json
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, cpSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(__dirname, '..');
const outRoot = join(backendRoot, 'src/official-skill/assets/v1');
const packagesRoot = join(outRoot, 'packages');
const licensesRoot = join(outRoot, 'licenses');

const ALLOWED_EXT = new Set(['.md', '.txt', '.json', '.csv', '.png', '.jpg', '.jpeg', '.webp']);
const MAX_FILES = 48; // leave room for skill.json + SKILL.md
const MAX_RESOURCE_BYTES = 1 * 1024 * 1024;
const MAX_SKILL_MD = 100 * 1024;
const MAX_TOTAL = 10 * 1024 * 1024;
const KEY_RE = /^[a-z][a-z0-9-]{1,63}$/;

const CATEGORY = {
  // system enums only
  common: 'common',
  content: 'content',
  business: 'business',
  expertise: 'expertise',
};

const USER_LABEL = {
  common: '通用协作',
  content: '中文写作/内容',
  business: '运营增长/业务',
  expertise: '设计前端/专业',
};

const sourceMap = {
  generatedAt: new Date().toISOString(),
  candidates: [],
  importedPackages: [],
  skipped: [],
};

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'mmp-official-skill-collector/1.0', Accept: 'application/vnd.github.raw+json, text/plain, */*' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

async function fetchBytes(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'mmp-official-skill-collector/1.0' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

function rawUrl(owner, repo, ref, path) {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

function apiContentsUrl(owner, repo, path, ref) {
  return `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`;
}

const treeCache = new Map();

async function loadRepoTree(owner, repo, ref) {
  const cacheKey = `${owner}/${repo}@${ref}`;
  if (treeCache.has(cacheKey)) return treeCache.get(cacheKey);
  // Prefer local index written from cursor-github get_git_tree
  const localIndex = join(outRoot, 'trees', `${owner.replace(/\W/g,'_')}-${repo}-skills.json`);
  // also known aliases
  const aliases = [
    localIndex,
    join(outRoot, 'trees', 'anthropics-skills.json'),
    join(outRoot, 'trees', 'modelstudio-skills.json'),
    join(outRoot, 'trees', 'trae-skills.json'),
    join(outRoot, 'trees', 'tencent-skillhub.json'),
  ];
  // Always fetch git trees API (works without Contents API auth)
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'mmp-official-skill-collector/1.0', Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`tree HTTP ${res.status} ${owner}/${repo}`);
  const data = await res.json();
  const by = new Map();
  for (const p of data.tree || []) {
    if (p.type !== 'blob') continue;
    if (!p.path.startsWith('skills/')) continue;
    const parts = p.path.split('/');
    if (parts.length < 3) continue;
    const skill = parts[1];
    if (!by.has(skill)) by.set(skill, []);
    by.get(skill).push({ path: p.path, size: p.size || 0, download_url: rawUrl(owner, repo, ref, p.path) });
  }
  treeCache.set(cacheKey, by);
  // persist compact index
  ensureDir(join(outRoot, 'trees'));
  const obj = Object.fromEntries([...by.entries()]);
  writeFileSync(join(outRoot, 'trees', `${owner.replace(/\W/g,'_')}-${repo}-skills.json`), JSON.stringify(obj, null, 2));
  return by;
}

async function walkFiles(owner, repo, skillDir, ref) {
  const skillName = skillDir.split('/').pop();
  const by = await loadRepoTree(owner, repo, ref);
  const files = by.get(skillName) || [];
  // Only files under this skillDir
  return files.filter((f) => f.path === skillDir || f.path.startsWith(skillDir + '/'));
}

function extOf(path) {
  const base = path.split('/').pop() || '';
  const i = base.lastIndexOf('.');
  return i < 0 ? '' : base.slice(i).toLowerCase();
}

function isScriptPath(rel) {
  if (/\/scripts?\//i.test(rel) || /^scripts?\//i.test(rel)) return true;
  const ext = extOf(rel);
  return ['.py', '.sh', '.bash', '.zsh', '.js', '.ts', '.mjs', '.cjs', '.rb', '.go', '.rs', '.java', '.ps1'].includes(ext);
}

function truncateSummary(s, max = 140) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  const chars = [...t];
  if (chars.length <= max) return t;
  return chars.slice(0, max - 1).join('') + '…';
}

function truncateName(s, max = 40) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  const chars = [...t];
  if (chars.length <= max) return t;
  return chars.slice(0, max).join('');
}

function parseFrontmatter(md) {
  if (!md.startsWith('---')) return { meta: {}, body: md };
  const end = md.indexOf('\n---', 3);
  if (end < 0) return { meta: {}, body: md };
  const fm = md.slice(3, end).trim();
  const body = md.slice(end + 4).replace(/^\n/, '');
  const meta = {};
  for (const line of fm.split('\n')) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    meta[m[1]] = v;
  }
  return { meta, body };
}

function chineseNameFallback(key, metaName) {
  const map = {
    'frontend-design': '前端界面设计',
    'brand-guidelines': '品牌视觉规范',
    'canvas-design': '画布视觉设计',
    'internal-comms': '内部沟通文案',
    'theme-factory': '主题配色工厂',
    'algorithmic-art': '算法艺术创作',
    'skill-creator': '技能编写指南',
    'academy-guide': '学院学习指南',
    'discernment-nudge': '审慎判断提醒',
    'cn-punctuation-checker': '中文标点校对',
    'daily-trend-writer': '热点内容写作',
    'git-commit-generator': '提交信息生成',
    'kz-article-deep-analysis': '文章深度解读',
    'web-design-teroop': '网页设计指导',
    'wechat-mini-program-development': '微信小程序开发',
    'cycle-delivery': '周期交付协作',
    'find-skill-skillhub': 'SkillHub 技能检索',
    'skillhub-trace-evaluator': '技能轨迹评估',
    'financial-expert': '财务分析专家',
    'novel-game': '互动小说游戏',
    'office-docx-zh': 'Word 文档处理',
    'office-pptx-zh': 'PPT 演示文稿',
    'office-xlsx-zh': 'Excel 表格处理',
    'office-router-zh': '办公文档总览',
  };
  return map[key] || metaName || key;
}

function rewriteSkillMd(body, { notice, adaptationNotes }) {
  const header = [
    '<!-- Adapted for 猛犸 managed skill package. Scripts/executables removed. -->',
    notice ? `<!-- ${notice} -->` : '',
    adaptationNotes ? `<!-- Adaptation: ${adaptationNotes} -->` : '',
    '',
  ].filter(Boolean).join('\n');
  // Soften hard script-run instructions without deleting the skill body.
  let out = body
    .replace(/\brun\s+`?python[^`\n]*`?/gi, '按说明完成（本环境不执行原仓库脚本）')
    .replace(/\bpython3?\s+[^\n]+/gi, (m) => `（已省略脚本命令：${m.slice(0, 80)}）`);
  // Remove fenced python/bash blocks that are clearly executable recipes? Keep them as reference text —
  // they are instructional. Do not execute. OK to keep.
  return `${header}\n${out}`.trim() + '\n';
}

function skip(candidate, reason) {
  sourceMap.skipped.push({ ...candidate, reason });
  console.log('SKIP', candidate.key || candidate.sourcePath, '-', reason);
}

function accept(pkgMeta) {
  sourceMap.importedPackages.push(pkgMeta);
  console.log('PKG', pkgMeta.key, pkgMeta.userCategoryLabel, pkgMeta.license);
}

async function materializePackage({
  key,
  name,
  summary,
  category,
  userCategoryLabel,
  instruction,
  references = {}, // relPath under references/ -> Buffer/string
  licenseId,
  licenseText,
  source,
  adaptation,
  notice,
}) {
  if (!KEY_RE.test(key)) throw new Error(`invalid key ${key}`);
  const dir = join(packagesRoot, key);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  ensureDir(join(dir, 'references'));

  const nameFinal = truncateName(name);
  const summaryFinal = truncateSummary(summary);
  const instructionFinal = rewriteSkillMd(instruction, {
    notice: notice || `${source.owner}/${source.repo}@${source.ref} ${source.path}`,
    adaptationNotes: adaptation,
  });
  const skillMdBuf = Buffer.from(instructionFinal, 'utf8');
  if (skillMdBuf.length > MAX_SKILL_MD) throw new Error(`SKILL.md too large for ${key}`);

  const refEntries = [];
  let total = skillMdBuf.length;
  for (const [rel, content] of Object.entries(references)) {
    const clean = rel.replace(/^references\//, '');
    if (!clean || clean.includes('..')) continue;
    const path = `references/${clean}`;
    const ext = extOf(path);
    if (!ALLOWED_EXT.has(ext)) continue;
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8');
    if (buf.length > MAX_RESOURCE_BYTES) continue;
    total += buf.length;
    if (refEntries.length >= MAX_FILES) break;
    if (total > MAX_TOTAL) break;
    refEntries.push({ path, buf });
  }

  // Always include license text as reference
  if (licenseText) {
    const licBuf = Buffer.from(licenseText, 'utf8');
    if (licBuf.length <= MAX_RESOURCE_BYTES) {
      refEntries.push({ path: 'references/LICENSE.txt', buf: licBuf });
      writeFileSync(join(licensesRoot, `${key}.LICENSE.txt`), licBuf);
    }
  }
  const noticeText = [
    `Source: ${source.immutableRef}`,
    `License: ${licenseId}`,
    `Adaptation: ${adaptation}`,
    `Original path: ${source.path}`,
    'No third-party scripts are executed or shipped in this managed package.',
  ].join('\n') + '\n';
  refEntries.push({ path: 'references/NOTICE.txt', buf: Buffer.from(noticeText, 'utf8') });

  // dedupe by path
  const seen = new Set();
  const uniqueRefs = [];
  for (const item of refEntries) {
    if (seen.has(item.path)) continue;
    seen.add(item.path);
    uniqueRefs.push(item);
  }

  const manifest = {
    key,
    name: nameFinal,
    description: summaryFinal,
    entry: 'SKILL.md',
    category,
    references: uniqueRefs.map((r) => ({ path: r.path })),
  };
  writeFileSync(join(dir, 'skill.json'), JSON.stringify(manifest, null, 2));
  writeFileSync(join(dir, 'SKILL.md'), skillMdBuf);
  for (const item of uniqueRefs) {
    const abs = join(dir, item.path);
    ensureDir(dirname(abs));
    writeFileSync(abs, item.buf);
  }
  writeFileSync(
    join(dir, 'ORIGIN.json'),
    JSON.stringify(
      {
        key,
        name: nameFinal,
        summary: summaryFinal,
        category,
        userCategoryLabel,
        license: licenseId,
        adaptation,
        source,
        officialVsAdapted: adaptation === 'official-passthrough' ? 'official' : 'adapted',
      },
      null,
      2,
    ),
  );

  accept({
    key,
    name: nameFinal,
    summary: summaryFinal,
    category,
    userCategoryLabel,
    license: licenseId,
    adaptation,
    source,
    fileCount: 2 + uniqueRefs.length,
  });
}

async function collectGithubSkillDir({
  owner,
  repo,
  ref,
  skillDir, // e.g. skills/frontend-design
  key,
  category,
  userCategoryLabel,
  licenseId,
  licensePath, // relative in skill dir or repo
  licenseTextPrefetched,
  renameTo,
  summaryOverride,
  adaptation = 'strip-scripts-keep-instructions',
  requireNoSecretHints = true,
}) {
  const candidate = {
    key,
    sourcePath: `${owner}/${repo}/${skillDir}`,
    licenseId,
  };
  sourceMap.candidates.push(candidate);
  try {
    const files = await walkFiles(owner, repo, skillDir, ref);
    const skillMd = files.find((f) => f.path === `${skillDir}/SKILL.md` || f.path.endsWith('/SKILL.md') && f.path.split('/').slice(-2)[0] === skillDir.split('/').pop());
    if (!skillMd) {
      skip(candidate, 'missing SKILL.md');
      return;
    }
    let licenseText = licenseTextPrefetched || '';
    if (!licenseText && licensePath) {
      licenseText = await fetchText(rawUrl(owner, repo, ref, licensePath));
    }
    if (!licenseText) {
      skip(candidate, 'no license text available');
      return;
    }
    const allowedLic = /MIT|Apache License|Apache-2\.0/i.test(licenseText) && !/ADDITIONAL RESTRICTIONS|All rights reserved\./i.test(licenseText.split('\n').slice(0, 5).join('\n'));
    // Anthropic proprietary starts with © and All rights reserved
    if (/ADDITIONAL RESTRICTIONS/i.test(licenseText) || (/All rights reserved/i.test(licenseText) && !/MIT License/i.test(licenseText) && !/Apache License/i.test(licenseText))) {
      skip(candidate, 'proprietary or non-redistributable license');
      return;
    }
    if (!/MIT License|Apache License/i.test(licenseText)) {
      skip(candidate, 'license not MIT/Apache');
      return;
    }

    const mdText = await fetchText(skillMd.download_url || rawUrl(owner, repo, ref, skillMd.path));
    const { meta, body } = parseFrontmatter(mdText);
    if (requireNoSecretHints) {
      const blob = (mdText + '\n' + body).toLowerCase();
      if (/(api[_-]?key|secret[_-]?key|access[_-]?token|bearer token|dashscope|openai_api_key|需要.*密钥|配置.*密钥)/i.test(blob) && /(export |process\.env|getenv|os\.environ|填入|申请 key)/i.test(blob)) {
        skip(candidate, 'appears to require third-party secrets to run');
        return;
      }
    }

    const references = {};
    let skippedScripts = 0;
    let skippedType = 0;
    for (const f of files) {
      const relFromSkill = f.path.slice(skillDir.length + 1);
      if (!relFromSkill || relFromSkill === 'SKILL.md') continue;
      if (/^LICENSE(\.txt|\.md)?$/i.test(relFromSkill.split('/').pop())) continue;
      if (isScriptPath(relFromSkill)) {
        skippedScripts++;
        continue;
      }
      // map resources/, examples/, templates/, references/, assets/, subskills/ -> references/
      let mapped;
      if (relFromSkill.startsWith('references/')) mapped = relFromSkill;
      else if (relFromSkill.startsWith('resources/')) {
        const rest = relFromSkill.slice('resources/'.length);
        if (isScriptPath(rest)) {
          skippedScripts++;
          continue;
        }
        mapped = `references/${rest}`;
      } else if (relFromSkill.startsWith('examples/')) mapped = `references/examples/${relFromSkill.slice('examples/'.length)}`;
      else if (relFromSkill.startsWith('templates/')) mapped = `references/templates/${relFromSkill.slice('templates/'.length)}`;
      else if (relFromSkill.startsWith('assets/')) mapped = `references/assets/${relFromSkill.slice('assets/'.length)}`;
      else if (relFromSkill.startsWith('subskills/')) mapped = `references/subskills/${relFromSkill.slice('subskills/'.length)}`;
      else if (ALLOWED_EXT.has(extOf(relFromSkill)) && !relFromSkill.includes('/')) {
        mapped = `references/${relFromSkill}`;
      } else {
        skippedType++;
        continue;
      }
      if (!ALLOWED_EXT.has(extOf(mapped))) {
        skippedType++;
        continue;
      }
      if ((f.size || 0) > MAX_RESOURCE_BYTES) {
        skippedType++;
        continue;
      }
      try {
        const bytes = await fetchBytes(f.download_url || rawUrl(owner, repo, ref, f.path));
        if (bytes.length > MAX_RESOURCE_BYTES) continue;
        references[mapped] = bytes;
      } catch {
        skippedType++;
      }
    }

    const finalKey = renameTo || key;
    const display = chineseNameFallback(finalKey, meta.name || key);
    const summary =
      summaryOverride ||
      truncateSummary(meta.description || `${display}：来自 ${owner}/${repo} 的可复用技能说明`);

    const shaShort = createHash('sha1').update(`${owner}/${repo}@${ref}:${skillDir}`).digest('hex').slice(0, 12);
    await materializePackage({
      key: finalKey,
      name: display,
      summary,
      category,
      userCategoryLabel,
      instruction: body.trim() ? `# ${display}\n\n${body.trim()}\n` : mdText,
      references,
      licenseId,
      licenseText,
      source: {
        owner,
        repo,
        ref,
        path: skillDir,
        immutableRef: `github:${owner}/${repo}@${ref}:${skillDir}#${shaShort}`,
      },
      adaptation: `${adaptation}; strippedScripts=${skippedScripts}; droppedOther=${skippedType}`,
    });
  } catch (err) {
    skip(candidate, `collect error: ${err.message}`);
  }
}

async function collectLocalOffice() {
  const officeRoot = join(
    backendRoot,
    '../../../mammoth-agent/packages/skill/skill-office/assets',
  );
  const licensePath = join(backendRoot, '../../../mammoth-agent/LICENSE');
  const licenseText = existsSync(licensePath)
    ? readFileSync(licensePath, 'utf8')
    : 'MIT License\nCopyright (c) 2026 DeepSeek\n';
  const items = [
    {
      dir: 'office',
      key: 'office-router-zh',
      name: '办公文档总览',
      category: CATEGORY.expertise,
      userCategoryLabel: '办公协作',
      summary: '按需选择 Word/PPT/Excel/PDF 办公处理流程，适配猛犸本地办公引擎。',
    },
    {
      dir: 'office-docx',
      key: 'office-docx-zh',
      name: 'Word 文档处理',
      category: CATEGORY.expertise,
      userCategoryLabel: '办公协作',
      summary: '创建、阅读、编辑与校验 Word 文档，优先使用本地办公引擎能力。',
    },
    {
      dir: 'office-pptx',
      key: 'office-pptx-zh',
      name: 'PPT 演示文稿',
      category: CATEGORY.expertise,
      userCategoryLabel: '办公协作',
      summary: '创建与编辑演示文稿，保持版式清晰，优先使用本地办公引擎。',
    },
    {
      dir: 'office-xlsx',
      key: 'office-xlsx-zh',
      name: 'Excel 表格处理',
      category: CATEGORY.expertise,
      userCategoryLabel: '办公协作',
      summary: '创建、分析与编辑电子表格，优先使用本地办公引擎能力。',
    },
  ];
  for (const item of items) {
    const candidate = { key: item.key, sourcePath: `local:mammoth-agent/packages/skill/skill-office/assets/${item.dir}`, licenseId: 'MIT' };
    sourceMap.candidates.push(candidate);
    const skillMdPath = join(officeRoot, item.dir, 'SKILL.md');
    if (!existsSync(skillMdPath)) {
      skip(candidate, 'local SKILL.md missing');
      continue;
    }
    const md = readFileSync(skillMdPath, 'utf8');
    const { body } = parseFrontmatter(md);
    const zhIntro = [
      `# ${item.name}`,
      '',
      '> 本技能基于 DeepSeek Harness / 猛犸本地 `skill-office`（MIT）说明改编，不附带可执行脚本；请使用当前环境已有办公能力完成任务。',
      '',
      body.trim(),
      '',
    ].join('\n');
    await materializePackage({
      key: item.key,
      name: item.name,
      summary: item.summary,
      category: item.category,
      userCategoryLabel: item.userCategoryLabel,
      instruction: zhIntro,
      references: {},
      licenseId: 'MIT',
      licenseText,
      source: {
        owner: 'local',
        repo: 'mammoth-agent',
        ref: 'workspace',
        path: `packages/skill/skill-office/assets/${item.dir}`,
        immutableRef: `local:mammoth-agent/packages/skill/skill-office/assets/${item.dir}`,
      },
      adaptation: 'local-dsh-office-chinese-wrapper',
      notice: 'Derived from local MIT skill-office assets; no proprietary Anthropic document skills included.',
    });
  }
}

async function main() {
  ensureDir(packagesRoot);
  ensureDir(licensesRoot);

  // ---- Anthropic Apache example skills (skip proprietary office) ----
  const anthropicApache = [
    ['frontend-design', CATEGORY.expertise, '设计前端'],
    ['brand-guidelines', CATEGORY.content, '中文写作/内容'],
    ['canvas-design', CATEGORY.expertise, '设计前端'],
    ['internal-comms', CATEGORY.content, '中文写作/内容'],
    ['theme-factory', CATEGORY.expertise, '设计前端'],
    ['algorithmic-art', CATEGORY.expertise, '设计前端'],
    ['skill-creator', CATEGORY.common, '通用协作'],
    ['academy-guide', CATEGORY.common, '通用协作'],
    ['discernment-nudge', CATEGORY.common, '通用协作'],
  ];
  // skip claude-api (vendor specific), mcp-builder/webapp-testing/web-artifacts/slack-gif if too script-heavy — still try script-stripped
  const anthropicMaybe = [
    ['mcp-builder', CATEGORY.expertise, '设计前端'],
    ['web-artifacts-builder', CATEGORY.expertise, '设计前端'],
  ];
  for (const [name, cat, label] of [...anthropicApache, ...anthropicMaybe]) {
    await collectGithubSkillDir({
      owner: 'anthropics',
      repo: 'skills',
      ref: 'main',
      skillDir: `skills/${name}`,
      key: name,
      category: cat,
      userCategoryLabel: label,
      licenseId: 'Apache-2.0',
      licensePath: `skills/${name}/LICENSE.txt`,
      renameTo: name,
      adaptation: 'anthropic-apache-strip-scripts',
      requireNoSecretHints: true,
    });
  }
  // record proprietary skips
  for (const name of ['docx', 'pdf', 'pptx', 'xlsx']) {
    skip(
      { key: name, sourcePath: `anthropics/skills/skills/${name}`, licenseId: 'Anthropic-source-available' },
      'proprietary Anthropic document skill; not redistributable',
    );
  }
  skip({ key: 'doc-coauthoring', sourcePath: 'anthropics/skills/skills/doc-coauthoring', licenseId: 'none' }, 'no per-skill LICENSE.txt');

  // ---- Tencent SkillHub MIT ----
  const tencentLicense = await fetchText(rawUrl('Tencent', 'skillhub', 'main', 'LICENSE'));
  for (const [name, cat, label] of [
    ['find-skill-skillhub', CATEGORY.common, '检索研究'],
    ['skillhub-trace-evaluator', CATEGORY.expertise, '通用协作'],
  ]) {
    await collectGithubSkillDir({
      owner: 'Tencent',
      repo: 'skillhub',
      ref: 'main',
      skillDir: `skills/${name}`,
      key: name,
      category: cat,
      userCategoryLabel: label,
      licenseId: 'MIT',
      licenseTextPrefetched: tencentLicense,
      adaptation: 'tencent-skillhub-mit-strip-scripts',
    });
  }

  // ---- Alibaba Model Studio Apache ----
  const msLicense = await fetchText(rawUrl('modelstudioai', 'skills', 'main', 'LICENSE'));
  for (const [name, cat, label] of [
    ['financial-expert', CATEGORY.business, '数据/业务'],
    ['novel-game', CATEGORY.content, '中文写作/内容'],
    ['bailian-docs-llm-wiki', CATEGORY.common, '检索研究'],
    ['bailian-model-recommend', CATEGORY.common, '检索研究'],
  ]) {
    await collectGithubSkillDir({
      owner: 'modelstudioai',
      repo: 'skills',
      ref: 'main',
      skillDir: `skills/${name}`,
      key: name,
      category: cat,
      userCategoryLabel: label,
      licenseId: 'Apache-2.0',
      licenseTextPrefetched: msLicense,
      adaptation: 'modelstudio-apache-strip-scripts',
      requireNoSecretHints: true,
    });
  }
  for (const name of ['bailian-train-deploy', 'happyhorse-prompt-studio', 'spark-video', 'vox-video-director']) {
    // still attempt; secret filter may skip
    await collectGithubSkillDir({
      owner: 'modelstudioai',
      repo: 'skills',
      ref: 'main',
      skillDir: `skills/${name}`,
      key: name,
      category: CATEGORY.expertise,
      userCategoryLabel: '设计前端',
      licenseId: 'Apache-2.0',
      licenseTextPrefetched: msLicense,
      adaptation: 'modelstudio-apache-strip-scripts',
      requireNoSecretHints: true,
    });
  }

  // ---- TRAE community MIT ----
  const traeLicense = await fetchText(rawUrl('trae-community', 'trae-skills', 'main', 'LICENSE'));
  const traeList = [
    ['cn-punctuation-checker', CATEGORY.content, '中文写作/内容'],
    ['daily-trend-writer', CATEGORY.content, '运营增长'],
    ['git-commit-generator', CATEGORY.common, '通用协作'],
    ['kz-article-deep-analysis', CATEGORY.content, '检索研究'],
    ['web-design-teroop', CATEGORY.expertise, '设计前端'],
    ['wechat-mini-program-development', CATEGORY.expertise, '设计前端'],
    ['cycle-delivery', CATEGORY.business, '运营增长'],
    ['gbr-pair', CATEGORY.common, '通用协作'],
    ['entropy-box-zh', CATEGORY.common, '检索研究'],
  ];
  for (const [name, cat, label] of traeList) {
    await collectGithubSkillDir({
      owner: 'trae-community',
      repo: 'trae-skills',
      ref: 'main',
      skillDir: `skills/${name}`,
      key: name,
      category: cat,
      userCategoryLabel: label,
      licenseId: 'MIT',
      licenseTextPrefetched: traeLicense,
      adaptation: 'trae-community-mit-strip-scripts',
    });
  }
  for (const name of ['daily-hot-news', 'video-to-keyframes', 'project-governance', 'cloudbase', 'trae-claw-install', 'docx-diff-comment', 'zopia_ai_skills']) {
    // try collect; many will be adapted or secret-skipped
    await collectGithubSkillDir({
      owner: 'trae-community',
      repo: 'trae-skills',
      ref: 'main',
      skillDir: `skills/${name}`,
      key: name.replace(/_/g, '-'),
      category: CATEGORY.common,
      userCategoryLabel: '通用协作',
      licenseId: 'MIT',
      licenseTextPrefetched: traeLicense,
      adaptation: 'trae-community-mit-strip-scripts',
    });
  }

  // ---- Local DSH office MIT wrappers ----
  await collectLocalOffice();

  writeFileSync(join(outRoot, 'SOURCE-MAP.json'), JSON.stringify(sourceMap, null, 2));
  const md = [
    '# Official Skill SOURCE-MAP',
    '',
    `generatedAt: ${sourceMap.generatedAt}`,
    `candidates: ${sourceMap.candidates.length}`,
    `packages: ${sourceMap.importedPackages.length}`,
    `skipped: ${sourceMap.skipped.length}`,
    '',
    '## Packages',
    ...sourceMap.importedPackages.map(
      (p) => `- **${p.key}**｜${p.name}｜${p.userCategoryLabel}/${p.category}｜${p.license}｜${p.source.immutableRef}`,
    ),
    '',
    '## Skipped',
    ...sourceMap.skipped.map((s) => `- ${s.key || s.sourcePath}: ${s.reason}`),
    '',
  ].join('\n');
  writeFileSync(join(outRoot, 'SOURCE-MAP.md'), md);
  console.log('\nDONE packages=', sourceMap.importedPackages.length, 'skipped=', sourceMap.skipped.length);
}

export { materializePackage, parseFrontmatter, rawUrl };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e); process.exitCode = 1; });
}
