#!/usr/bin/env node
/** Append-only curated expansion. Reuses v1 materializer; never rewrites old package keys.
 * Run collector, inspect SOURCE-MAP/EXPANSION-REPORT, then importer --enable --create-only <keys>.
 * Index: provider-read Git trees + repo metadata, not a cloned checkout. No upstream code runs.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { materializePackage, parseFrontmatter, rawUrl } from './collect-official-skill-assets.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '../src/official-skill/assets/v1');
const index = JSON.parse(readFileSync(join(root, 'trees/expansion-index.json'), 'utf8'));
const oldMap = JSON.parse(readFileSync(join(root, 'SOURCE-MAP.json'), 'utf8'));
const report = { generatedAt: new Date().toISOString(), priorPackages: oldMap.importedPackages.length, quality: 'Upstream community selection only; no execution, stability tests or user ratings performed.', candidates: [], added: [], skipped: [] };
const categories = { common:'效率工具', content:'内容创作', business:'运营增长', expertise:'开发设计', analytics:'数据分析', office:'办公协作', education:'知识学习', ecommerce:'电商经营', sales:'客户销售', hr:'人力行政', legal:'财税法务', finance:'金融投研', consulting:'企业咨询', research:'行业研究', files:'文件处理', search:'网页检索', writing:'翻译写作', lifestyle:'个人生活' };
const selections = [];
function add(repo, base, prefix, category, lines) {
 for (const line of lines.trim().split('\n')) {
  const [slug, name, summary] = line.split('|');
  selections.push({ repo, path: `${base}/${slug}`, key: `${prefix}${slug}`, name, summary, category });
 }
}
add('deepseek-ai/deepseek-harness', '.agents/skills', '', 'expertise', `
agent-experience|DSH 智能体交互设计|梳理智能体可用性、可观测性与人机协作体验。
dsh-client-ui-ux|DSH 客户端体验规范|按 DSH 客户端结构审视界面与交互改进。
dsh-code-review|DSH 代码审查|针对 DSH 插件与框架给出代码审查清单。
dsh-error-handling|DSH 错误处理|指导错误传播、用户提示与日志处理的设计。
dsh-find-simplifications|代码简化分析|定位重复结构与不必要复杂度，提出可审查的简化方案。
dsh-prose-standard|技术文档表达规范|依据 DSH 文档风格改进技术表述与结构。
dsh-responsive-ui|响应式界面设计|指导 DSH 界面跨屏布局与响应式交互。
dsh-speed-up-perf|性能瓶颈优化指导|按测量与定位流程组织性能优化，不承诺自动运行专用工具。
dsh-translate-docs|DSH 文档翻译|根据文档结构与术语规范翻译 DSH 技术资料。
dsh-trim-cot-leakage|推理泄露检查|检查面向用户的回复中是否混入内部推理与实现细节。
dsh-pr-description|变更说明撰写|根据实际代码改动组织 PR 描述、背景和风险说明。
dsh-doc|DSH 技术文档维护|指导框架文档、示例与实际接口保持一致。`);
add('hackerFish/awesome-dsh-skills', 'skills', 'community-', 'expertise', `
dsh-plugin-dev|DSH 社区插件开发|梳理插件结构、服务与事件契约；依赖目标项目已有 DSH 工具链。
dsh-plugin-client|DSH 插件客户端开发|指导插件客户端组件、入口与宿主集成。
dsh-plugin-i18n|DSH 插件国际化|组织多语言资源与插件文本国际化流程。
dsh-preset-authoring|DSH 预设编写|指导组织可复用预设与插件组合，需目标项目环境。
dsh-skill-adapter|DSH 技能适配|检查技能指令与当前 Host 的工具、目录和权限契约。
dsh-debug-session|DSH 会话排障|根据用户提供的日志和会话状态定位问题，不读取未授权数据。`);
add('openai/plugins', 'plugins/superpowers/skills', 'superpowers-', 'expertise', `
brainstorming|开发方案头脑风暴|先澄清问题和约束，再形成可讨论的设计方案。
executing-plans|分步实施计划|按已确认计划分批执行并记录阻塞与结果。
receiving-code-review|代码评审意见处理|核实评审建议的技术依据再决定修改方案。
requesting-code-review|代码送审准备|组织差异、风险、验证记录与审查重点。
systematic-debugging|系统化问题排查|复现、形成假设、收集证据，再进行最小修复。
test-driven-development|测试驱动开发指南|按红绿重构流程组织开发；测试执行依赖项目环境。
verification-before-completion|完成前证据检查|避免无依据宣称完成，核对实际验证记录。
writing-plans|实现计划编写|将设计转为可追踪的实施步骤和验收条件。
writing-skills|技能写作与迭代|编写可复用技能说明并评估触发条件和边界。`);
add('openai/skills', 'skills/.curated', 'codex-', 'expertise', `
cli-creator|命令行工具设计|指导可供人和智能体使用的 CLI 结构、输入输出与错误契约。
security-best-practices|安全编码实践|按语言和框架检查代码安全风险与修复建议。
security-threat-model|应用威胁建模|梳理资产、信任边界、攻击路径与缓解措施。`);
add('openai/skills', 'skills/.curated', 'codex-', 'files', `
pdf|PDF 文档处理指南|阅读、生成和检查 PDF；相关 Python 库或渲染工具需当前环境具备。`);
add('openai/skills', 'skills/.curated', 'codex-', 'analytics', `
jupyter-notebook|Notebook 分析流程|组织实验与教学 Notebook；运行需已有 Python/Jupyter 环境。`);
add('openai/skills', 'skills/.curated', 'codex-', 'common', `
define-goal|目标定义与验收|澄清目标、可交付物与可检查的成功条件。`);
add('anthropics/knowledge-work-plugins', 'legal/skills', 'industry-legal-', 'legal', `
review-contract|合同风险审阅|整理合同条款、偏离点和风险清单，仅作辅助审阅，不替代律师。
triage-nda|保密协议初筛|按协议条款标出需进一步法律复核的问题。
compliance-check|合规检查整理|依据用户提供的规则和材料组织合规核对表，不作合规保证。
legal-risk-assessment|法律风险辅助分析|梳理事实、风险等级和升级建议，需专业人员复核。`);
add('anthropics/knowledge-work-plugins', 'finance/skills', 'industry-accounting-', 'legal', `
audit-support|审计材料整理|按用户提供材料整理审计证据和工作底稿，需审计人员复核。
close-management|财务结账流程|组织月结任务、依赖与问题清单，不自动记账。
financial-statements|财务报表整理|依据已提供账务数据整理报表草案并提示异常。
reconciliation|财务对账辅助|比对用户提供的账表、识别差异并组织对账说明。
variance-analysis|财务差异分析|梳理实际与预算差异及可能原因，不作投资结论。`);
add('anthropics/knowledge-work-plugins', 'human-resources/skills', 'industry-hr-', 'hr', `
interview-prep|招聘面试准备|按岗位要求组织面试问题、评价维度和记录模板。
onboarding|员工入职计划|整理入职材料、协作角色与阶段安排。
performance-review|绩效回顾草案|依据已提供事实形成公平、可追溯的绩效反馈草案。
org-planning|组织规划辅助|梳理岗位职责、团队结构和人员规划备选方案。`);
add('anthropics/knowledge-work-plugins', 'data/skills', 'industry-data-', 'analytics', `
explore-data|探索性数据分析|梳理数据结构、分布、缺失值与后续分析问题。
sql-queries|SQL 查询编写|按数据库方言编写并解释查询；仅在授权环境执行。
statistical-analysis|统计分析指导|选择适当统计方法，说明假设、局限与不确定性。
validate-data|数据结果校验|检查数据分析中的口径、计算、偏差和结论证据。
data-visualization|数据图表设计|根据数据类型选择图表并检查可读性与误导风险。`);
add('anthropics/knowledge-work-plugins', 'customer-support/skills', 'industry-support-', 'sales', `
ticket-triage|客户工单分流|对提供的工单整理优先级、分类与处理建议，不自动发出。
draft-response|客户答复草拟|根据客户问题与已知资料起草清晰、有依据的答复。
kb-article|客服知识文章|把解决过程整理成可检索的知识库文章草稿。`);
add('anthropics/knowledge-work-plugins', 'operations/skills', 'industry-ops-', 'consulting', `
process-optimization|业务流程优化|梳理流程瓶颈、改进选项与衡量指标。
risk-assessment|经营风险梳理|根据已提供事实组织风险矩阵、应对措施与责任人。
capacity-plan|业务容量规划|梳理需求、资源与容量缺口，形成规划备选方案。
runbook|操作手册编写|将已确认业务流程转为清晰的操作步骤与升级机制。`);
add('anthropics/knowledge-work-plugins', 'small-business/skills', 'industry-smb-', 'legal', `
tax-prep|税务资料准备|按适用地区和年度整理税务材料与待核实问题；不是税务申报或税务意见。
tax-season-organizer|报税季材料清单|整理收入、费用与凭证材料，交由专业人员复核，不自动提交。`);
add('anthropics/knowledge-work-plugins', 'small-business/skills', 'industry-commerce-', 'ecommerce', `
inventory-planner|库存规划辅助|根据用户提供库存和销量规划补货与周转，不自动采购。
restock|补货清单草拟|整理库存缺口、数量依据与待确认的补货建议，不自动下单。`);
add('anthropics/knowledge-work-plugins', 'product-management/skills', 'industry-product-', 'consulting', `
write-spec|产品规格编写|把用户需求整理成范围、交互、约束与验收条件。
synthesize-research|用户研究归纳|根据提供的访谈与研究资料提炼主题、证据和产品启示。`);
add('anthropics/knowledge-work-plugins', 'design/skills', 'industry-design-', 'expertise', `
accessibility-review|无障碍设计审阅|按界面材料检查无障碍问题与改进方向。
user-research|用户研究方案|组织研究问题、方法、访谈提纲和分析计划。`);
add('coreyhaines31/marketingskills', 'skills', 'marketing-', 'business', `
marketing-plan|营销计划制定|梳理目标人群、定位、渠道与阶段行动计划。
marketing-psychology|营销心理学应用|用行为原理审视营销内容与用户决策，不作效果保证。
content-strategy|内容策略规划|组织目标受众、内容主题、分发渠道和衡量方式。
seo-audit|SEO 诊断清单|审视站点资料中的技术与内容 SEO 问题，外部指标需另行提供。
pricing|定价策略分析|组织价值、分层、竞争信息与定价实验方案。
customer-research|客户需求研究|基于已提供访谈和市场材料提炼需求与购买因素。
ab-testing|A/B 实验设计|组织实验假设、指标、样本与结果判定规则。
churn-prevention|客户流失预防|梳理流失信号、挽留方案与续费体验改进。
launch|产品发布策划|规划发布定位、渠道、节奏和执行清单，不自动发布。
referrals|推荐增长方案|设计推荐激励、传播路径和效果衡量方案。
community-marketing|社群营销规划|梳理社群价值、互动节奏和增长策略。
copywriting|营销文案写作|根据定位和客户价值撰写清晰的营销文案。`);
const cache = new Map();
function gitHash(bytes) { return createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex'); }
async function getFile(repo, path) {
 const data = index[repo]; const item = data.files.find(f => f.path === path);
 if (!item) throw Error('Not in provider tree: ' + repo + '/' + path);
 const k = repo + ':' + path;
 if (!cache.has(k)) cache.set(k, (async () => {
  const r = await fetch(rawUrl(data.owner, data.repo, data.ref, path), { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw Error(`HTTP ${r.status} ${path}`);
  const bytes = Buffer.from(await r.arrayBuffer());
  if (gitHash(bytes) !== item.sha) throw Error('Upstream changed since indexed; do not silently import: ' + path);
  return bytes;
 })());
 return cache.get(k);
}
function licensesFor(repo, path) {
 const fs = index[repo].files;
 const dirs = path.split('/').slice(0,-1); const found = [];
 for (let n = dirs.length; n >= 0; n--) {
  const parent = dirs.slice(0,n).join('/');
  const f = fs.filter(f => posix.dirname(f.path) === (parent || '.') && /^licen[cs]e(?:\.(?:txt|md))?$/i.test(posix.basename(f.path)));
  if (f.length) { found.push(...f); break; }
 }
 return found;
}
const hashes = new Set();
async function collect(s) {
 const candidate = { key:s.key, sourcePath: `${s.repo}/${s.path}`, category:s.category };
 report.candidates.push(candidate);
 try {
  const dir = join(root,'packages',s.key);
  if (existsSync(dir)) { report.skipped.push({...candidate,reason:'existing key preserved'}); return; }
  if (oldMap.importedPackages.some(p => `${p.source.owner}/${p.source.repo}` === s.repo && p.source.path === s.path)) throw Error('Existing upstream package; not a new skill');
  const mdpath = s.path + '/SKILL.md';
  const mdBytes = await getFile(s.repo, mdpath); const md=mdBytes.toString('utf8');
  const {meta,body} = parseFrontmatter(md);
  if (Buffer.byteLength(body) < 180) throw Error('Insufficient substantive instructions');
  const normalizedHash = createHash('sha256').update(body.replace(/\s+/g,' ').trim()).digest('hex');
  if (hashes.has(normalizedHash)) throw Error('Duplicate instruction body');
  const licenseFiles=licensesFor(s.repo,mdpath);
  if (!licenseFiles.length) throw Error('No explicit applicable license');
  const licenseTexts = await Promise.all(licenseFiles.map(async f => (await getFile(s.repo,f.path)).toString('utf8')));
  const licenseText=licenseTexts.join('\n\n');
  if (/ADDITIONAL RESTRICTIONS|non.?commercial|not.*redistribut/i.test(licenseText)) throw Error('Restricted license');
  const licenseId = /MIT License/.test(licenseText) ? 'MIT' : /Apache License/.test(licenseText) ? 'Apache-2.0' : null;
  if (!licenseId) throw Error('License is not approved MIT/Apache');
  if (meta.license && !/MIT|Apache|LICENSE/i.test(meta.license)) throw Error('Per-skill license metadata needs review: '+meta.license);
  if (/(?:export\s+\w*(?:API_KEY|ACCESS_TOKEN)|(?:OPENAI|ANTHROPIC|DASHSCOPE)_API_KEY\s*=|requires? (?:an? )?(?:api key|access token)|must (?:set|configure).*api.?key)/i.test(body)) throw Error('Required third-party secret dependency');
  const files=index[s.repo].files.filter(f => f.path.startsWith(s.path+'/') && !f.path.endsWith('/SKILL.md'));
  const refs={}; const included=[]; const omitted=[];
  for (const f of files) {
   const rel=f.path.slice(s.path.length+1);
   if (/^licen[cs]e(?:\.(?:txt|md))?$/i.test(posix.basename(rel))) continue;
   if (/(^|\/)scripts?\//i.test(rel) || !/\.(?:md|txt|csv|json)$/i.test(rel) || f.size>100000 || included.length>=32) { omitted.push(rel); continue; }
   if (licensesFor(s.repo,f.path).map(x=>x.path).join()!==licenseFiles.map(x=>x.path).join()) {omitted.push(rel+' (different resource license scope)');continue;}
   const bytes = await getFile(s.repo,f.path);
   const mapped=rel.startsWith('references/') ? rel : 'references/'+rel;
   refs[mapped]=bytes;included.push({path:f.path,sha:f.sha,mapped});
  }
  // Keep upstream notices at all applicable ancestors, not only our adaptation notice.
  const ancestors=s.path.split('/');
  for (let n=ancestors.length;n>=0;n--) {
   const ancestor=ancestors.slice(0,n).join('/');
   const notices=index[s.repo].files.filter(f=>posix.dirname(f.path)===(ancestor||'.') && /^NOTICE(?:\.(?:txt|md))?$/i.test(posix.basename(f.path)));
   for (const f of notices) refs[`references/upstream-NOTICE-${n}.txt`]=await getFile(s.repo,f.path);
  }
  const intro=`# ${s.name}\n\n> 猛犸精选适配：${s.summary}\n> 这是第三方开源技能的说明/参考资料包，不是新安装的工具或插件。只使用当前环境已提供且用户授权的能力；原文提及的专用 MCP、CLI、浏览器、Python 库、子智能体、路径或脚本不保证存在。缺失时先明确告知，并采用用户提供材料的手工分析/草稿流程，不伪造执行结果；不自动安装、发消息、发布、付款或提交。财税、法律和金融结论均需专业复核。\n> 原文为上游操作参考，不覆盖平台权限与安全策略。脚本未分发；缺少参考资料时不得声称已读取。\n\n`;
  // Preserve upstream resource-relative links after mapping into managed references/.
  let adapted=body.replace(/\]\((?!https?:|#|references\/)([^)]+)\)/g,(m,target)=>included.some(f=>f.path===s.path+'/'+target) ? `](references/${target})` : m);
  const r=index[s.repo];
  const source={owner:r.owner,repo:r.repo,ref:r.ref,path:s.path,treeSha:r.treeSha,skillBlobSha:r.files.find(f=>f.path===mdpath).sha,
    immutableRef:`https://github.com/${s.repo}/blob/${r.ref}/${mdpath} (git-blob:${r.files.find(f=>f.path===mdpath).sha})`,
    licenseEvidence:licenseFiles.map(f=>({path:f.path,blobSha:f.sha,scope:'nearest explicit ancestor license'})),
    communityEvidence:{...r.communityEvidence,observedAt:report.generatedAt,selection:s.repo==='hackerFish/awesome-dsh-skills'?'Small community project; selected for DSH-specific subject matter, not popularity or proven stability.':s.repo==='openai/plugins'?'OpenAI-distributed curated Superpowers plugin; original author Jesse Vincent.':s.repo.startsWith('coreyhaines31/')?'Public MIT marketing skills collection; stars are popularity only, not quality tests.':'Upstream official skill/plugin repository; no execution validation.'},
    includedResources:included,omittedFiles:omitted,originalBodySha256:normalizedHash};
  await materializePackage({key:s.key,name:s.name,summary:s.summary,category:s.category,userCategoryLabel:categories[s.category],instruction:intro+adapted,references:refs,licenseId,licenseText,source,adaptation:`instructions-only; no scripts, secrets, or tool installation; omittedFiles=${omitted.length}`});
  hashes.add(normalizedHash);
  const origin=JSON.parse(readFileSync(join(dir,'ORIGIN.json'),'utf8'));
  report.added.push({...origin,fileCount:2+included.length+2});
 } catch(e) { report.skipped.push({...candidate,reason:e.message}); console.log('SKIP',s.key,e.message); }
}
mkdirSync(join(root,'licenses'),{recursive:true});
// Limit network fan-out, each read is bounded and source hash verified.
for(let i=0;i<selections.length;i+=4) await Promise.all(selections.slice(i,i+4).map(collect));
writeFileSync(join(root,'EXPANSION-REPORT.json'),JSON.stringify(report,null,2));
writeFileSync(join(root,'EXPANSION-KEYS.json'),JSON.stringify(report.added.map(p=>p.key),null,2));
const merged={...oldMap,generatedAt:report.generatedAt,candidates:[...(oldMap.candidates||[]),...report.candidates],importedPackages:[...oldMap.importedPackages,...report.added],skipped:[...(oldMap.skipped||[]),...report.skipped]};
writeFileSync(join(root,'SOURCE-MAP.json'),JSON.stringify(merged,null,2));
const markdown=['# Official Skill SOURCE-MAP','',`Packages: ${merged.importedPackages.length}; expansion: ${report.added.length}; previous: ${report.priorPackages}`,'','## Evidence and limits','All new packages retain the applicable per-directory/ancestor MIT or Apache license, original file git-blob hash, source repo tree hash and upstream notices. Existing 39 assets are unchanged.','Community metrics are upstream popularity at collection time, NOT a rating, execution test, stability certification or guarantee. Instructions-only adaptation does not add missing tools.','WorkBuddy/marketplace listings without a per-package license are not imported. No duplicate translations, AGENTS.md or fabricated skills count toward totals.','', '## Source selection',...Object.entries(index).map(([repo,r])=>`- ${repo}: ${r.communityEvidence.stargazers_count} GitHub stars; ${r.communityEvidence.html_url}; ${r.communityEvidence.archived?'archived':'not archived'}; observed ${report.generatedAt}`),'','## Packages',...merged.importedPackages.map(p=>`- **${p.key}** | ${p.name} | ${p.userCategoryLabel}/${p.category} | ${p.license} | ${p.source.immutableRef}`),'','## Skipped',...merged.skipped.map(p=>`- ${p.key||p.sourcePath}: ${p.reason}`),''];
writeFileSync(join(root,'SOURCE-MAP.md'),markdown.join('\n'));
console.log('EXPANSION added',report.added.length,'assets total',merged.importedPackages.length,'skipped',report.skipped.length);
