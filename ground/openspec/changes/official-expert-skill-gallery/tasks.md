# Tasks（仅实施登记，当前不执行）

## Owner boundary

- **猛犸mmp3**：统筹本 change 与 task ownership；负责 Host 核心会话加载和冻结/恢复插手，不将 Hub 包列表拉成现有 plugin registry。
- **李庚**：Ground 技能包/API/Admin，以及 Web 与客户端目录和新建页面。仅下列明列项，不触碰 Host core 与既有知识库实现。
- **甜甜**：统一两 Tab、卡片、管理表单、来源头和异常状态的现有 UI 规范及交付说明，不自行决定 package schema。

**Work not assigned**：本阶段不派 QA、不做测试、构建、浏览器验收、Git、发布。任务 1–3 已在本地落地代码（见下方 Implementation notes），任务 4 未实施；勾选仅表示代码已提交到工作区，**不是**验收通过证据。技能「使用技能」在任务 3 仅为 pending 占位，**未**创建 Host 会话/来源头。

## Task list

- [x] 1. **Ground package API**：李庚新增 skill manifest / ZIP / form 统一规范存储、启停与读取接口，按 `design.md §2–3` 的字段和拒绝规则处理；建立专家关联和启停控制。
  - 接口输入/输出：`GET /api/official-agents`、`GET/POST /api/official-skills`、`POST /api/official-skills/:id/sessions`、`GET .../:id/content`；原 admin expert CRUD 仅扩展。
  - Done when：ZIP 与表单生成同规范内容；公共仅启用摘要；错误 code 和 revision 明确。

- [x] 2. **Admin management**：李庚复用现有官方智能体 CRUD，增加分类、启停、技能与知识引用；新增 ZIP/表单技能的简单管理页。
  - 不做工具注册页、沙箱声明、私有权限、审核/评分/版本编排。
  - Done when：管理动作不改变历史 session；官方与企业知识关联不串。

- [x] 3. **Web / client gallery entry**：李庚接入同 Ground 公开目录，建立两 Tab 卡片、少量搜索/分类、空/loading/error；专家入口复用既有 `startAgent`；技能入口 Task3 仅 pending 契约（Host 绑定留任务 4）。
  - Done when（代码落地，非验收）：两 Tab 只读启用摘要；双端共用 `ui-official-agent-gallery`；不各自藏 prompt 或包内容。技能新建会话/来源头属任务 4。

- [ ] 4. **Host session provider**：猛犸mmp3 只在 Host 扩展点接 Ground resolution、scope 限制与会话冻结事件，结合 `tool-skill` 显式加载选定包；保留标准模式、文件、终端、联网。
  - Done when：无选择则无正文，专家连带仅关联摘要，旧 session 读原 bound；修改/停用不漂移；加载失败不虚构技能使用。

- [ ] 5. **Pause for acceptance decision**：猛犸mmp3 后续确认是否、何时、由谁登记录制和验收。若未获批准，不安排测试/QA，不勾选 1–4。

## Hand-off and interpretations

1. 「技能运行沙箱声明」是底层运行安全和审批话题；不落到技能 ZIP manifest 或超管表单的安全字段。
2. 「启用官方内容全员可见」是目录/新建入口权限，不改变受保护知识访问，也不复活旧企业 grant 即可见规则。
3. 所有核心路径仍统一现有 LLM 使用与登录底稿；旧系统只筛选内容名，第一版不承诺旧数据/API/权限/包格式兼容。


## Implementation notes（任务 1–2 Ground/Admin，2026-11-06）

- 李庚已在本地 `ground` 落地官方技能模型 / Admin CRUD / ZIP+表单受管包 / 公开目录与 content·resources·sessions 契约，以及官方智能体关联技能；**未** apply 迁移、未跑构建/测试/浏览器，未做广场 UI / DSH Host 绑定（任务 3–4）。
- 新建技能默认 `enabledAt=null`（按 `design.md`；与 UI 摘要「默认启用」冲突，以 design 为准）。
- 迁移文件：`apps/backend/prisma/migrations/20261106210000_official_skills/`（**un-applied**）。
- Host 对接契约见公开 API：`GET /api/official-skills`、`POST /api/official-skills/:id/sessions`、`GET .../content`、`GET .../resources?path=`，以及 `GET/POST /api/official-agents` resolve 返回的 `linkedSkills` 摘要。

## Implementation notes（任务 3 Web/桌面专家广场，2026-11-06）

- 李庚演进 `mammoth-agent/packages/client/ui-official-agent-gallery`：标题「专家广场」、Tab「专家/技能」、极简卡、搜索防抖、空分类 chip 隐藏、去掉详情区/版本/能力标签/开场问题。
- Host `official-agent-gallery` 增加公开 `listSkills` → Ground `GET /api/official-skills`；`list`/`resolve` schema 兼容 `linkedSkills`（避免 Task2 严格校验失败）。
- 技能按钮 `requestSkill(skillId)` 返回 `pending`，文案含 skillId；**不**调用 `POST /api/official-skills/:id/sessions`，**不** `openSession`，**不**改旧会话。
- **未**跑测试/构建/E2E/浏览器；`ui-official-agent-gallery/lib/client.js` 需后续 package bundle 才进运行时；Host `lib/` 与 typert remote 已手工同步 `listSkills`/`linkedSkills`（下次 `generate-typert`/bundle 应复核）。
- 任务 4 契约：Client 将 `requestSkill` 换成 Host remote → Ground sessions → 新建标准会话冻结 `sessionSource` → `openSession`；会话头「技能 · {name}」与来源头由 Host/会话壳完成。

## Implementation notes（任务 5 Host 技能按需加载，2026-11-06）

- 猛犸mmp3 在 `official-agent-gallery` 注册会话作用域 `SkillProvider`，复用 DSH `tool-skill`/`skill` 工具与 SkillRow；Ground content/resources 支持冻结 revision 在停用后继续读取。
- 局部 bundle：`@mammoth-ai/mmp-official-agent-gallery`、`@mammoth-ai/mmp-client-ui-official-agent-gallery`（`lib/client.js`）。
- **未**跑 tests/全仓构建/E2E/浏览器；未 commit/push/发布。交接见 `host-skill-loader-handoff.md`。


## t122 approved unified experts workstream
- [x] Read real schema/services/import/Host contracts; capture non-destructive baseline.
- [x] Add compatible normalized expert metadata and incremental migration; preserve legacy IDs/config/status/version.
- [x] Complete Admin role/profile/linked-skill preview and consistent Expert copy; preserve skill page.
- [x] Fetch 20–30 licensed upstream expert roles at immutable refs; Chinese substantive adaptation and managed source map.
- [x] Idempotently import new drafts only; reuse existing skills, preserve old rows/versions/skill packages.
- [x] Sync bounded Host/UI resources; record real counts/names/licenses/restart and unverified boundary.

本轮实际结果/未验边界详见 managed-experts-t122-handoff.md；24新增均为草稿，并未发布。


## t128 approved gallery/icons/paging
- [x] Capture46/115 preservation evidence and guarded description/role taxonomy inventory.
- [x] Add secure skill icon storage and reuse expert upload/remove with staged Admin save.
- [x] Implement visible server paging/filter/facets and additive compatible Host Remote contracts.
- [x] Implement shared compact expert / roomier skill UI and stable functional icons with per-tab state and incremental loading.
- [x] Sync bounded resources and document counts, restart requirements and unverified boundaries.

上述t128勾选仅表示本地代码/有界资源落地，不是验收通过；数量与未验边界详见gallery-v2-t128-handoff.md。Admin默认10沿用t123，历史20记录不再适用。


## t146 approved eight-task implementation (in progress, not acceptance)
- [x] Fresh DB baseline: 46 experts/22 published/24 draft,47 versions,115 enabled skills,44 links,14 grants. Hashes in enhancement-v2/BASELINE.json.
- [x] Inspected schema: expertDefinition JSON exists on parent/version; openingQuestions exists; customAvatarPath exists on parent expert/skill, display-only (not published avatar snapshot). Skill has no discovery JSON.
- [ ] Add nullable-compatible/default-empty skill discovery_detail JSON; metadata-only saves guarded by updatedAt; expert detail freezes through existing publish.
- [ ] P0 feasibility: current Mac Seatbelt profile allows default reads/network; enhanced execution MUST remain fail-closed until a verifiable executor/identity/grant exists. Do not remove expert restrictions first.
- [ ] Admin public discovery editor/preview, independent of role/package content.
- [ ] Public whitelist details, shared gallery details/direct buttons, starter prefill only.
- [ ] Standard/load/event/host enforcement: report actual gates and blocked capabilities, not scaffold completion.
- [ ] Bounded compilation/resource sync, focused safety evidence, DB preservation and handoff.


## t146 本轮实际状态（以 enhancement-v2-t146-handoff.md 为准）
- [x] 任务一：fresh基线、字段实查、非破坏migration与契约。
- [x] 任务二的spike与保守关闭接线；**P0真实强制能力未通过，不能打勾开放执行**。
- [x] 任务三：独立Admin广场详情编辑/预览（新建先存再编辑详情），保留默认10。
- [x] 任务四：公开详情DTO/新Remote，旧list/page20不改。
- [x] 任务五：共享双端主体详情+独立CTA+草稿；创建实际被P0拒绝，未浏览器验收。
- [ ] 任务六：standard composition/final-context load barrier；blocked，不解绑旧限制。
- [ ] 任务七：真实receipts/cancel/side effects/artifact；仅input/header绑定关闭标签完成。
- [x] 任务八允许范围：四项有界源码编译、target bundles、8项窄检查及六表保全；非全套运行验收。
- [ ] P0可信Host/范围/TOCTOU/子进程网络/单审批并发等真验证，及三拓扑/最终context/load/cancel/artifact验收；相关执行继续closed。


## t148/t149 usable-loop delta (not full eight-task acceptance)
- [x] Fresh full-field six-table baseline/result preserved incl discoveryDetail; 46experts/22published24draft,115enabled skills; no migration or DB writes.
- [x] Replace all-reject admission with native managed-documents profile for NEW standard expert/skill sessions; legacy no new tools; ordinary unchanged.
- [x] Suppress managed AGENTS/private skill discovery before reads; actual native tool identity/scope guards and current authorization; no shell/network/MCP/subtask capability.
- [x] Explicit skill host-first assembly/frozen hash/full final-request/body-budget wire check; role append, associated first-use loading and same-revision recovery hash.
- [x] Real native prepare/context/turn terminal receipts; cancel late terminal ignored; immutable serialized document create/readback/download; factual input/header UI.
- [x] 9 focused REAL native-loop/store checks with MOCK Ground/model, actual Ground adapter post-budget HTTP-mock boundary; fixture artifacts and fingerprints retained. Five related typechecks and target bundles synchronized.
- [ ] Real logged-in cloud + production full-standard plugin mount + browser upload/download and 3 Host topologies; compaction/resume/fork end-to-end.
- [ ] Arbitrary filesystem/shell/network/TOCTOU isolation, verified Host handshake/expiry grant and dangerous single-consume approvals: not implemented/accepted; those capabilities remain closed, not a reason to reject managed document work.
See business-v3-t149-handoff.md for exact paths/commands/limits; no 8/8 or stable-all115 claim.


## t150 focused shared-detail modal regression
- [x] Inspect actual native dialog/CSS/real theme/old runtime bundle; missing bg-elevated token confirmed, module styles existed.
- [x] Opaque theme-aware surface+solid light/dark fallback; independent mask; fixed header/footer and one scroll body; existing start/starter semantics retained.
- [x] Native top-layer/ESC retained; outside dismissal, scroll cleanup, focus return; shared UI bounded tsc+client bundle exit0.
- [x] 16 source/real compiled CSS/token checks pass; BEFORE/STATIC-CSS-RESULT and extracted compiled CSS retained.
- [ ] Real browser/light-dark/narrow-window and keyboard interaction point-check. No claim of visual acceptance.
See modal-t150-handoff.md. No Admin/DB/auth/model changes.

## t166 task workflow implementation
- [x] Task wording + new standard-only creation; legacy mode retained.
- [x] Canonical archive/delete with terminal/lease/ownership checks; isolated fixtures only.
- [x] Settings data-management archive metadata/history pages + toast; sidebar archive removed.
- [ ] Arbitrary different-directory/Host restore migration: not implemented; immutable original cwd/Host only.
- [x] Scoped recent/favourites, removable expert/skill metadata, per-attempt protocol and empty-draft starter.
- [x] Native final-request load/budget/revision barrier; epoch/cancel/revoke; required events through native generator/catalog/lib.
- [x] t168 strict owner-only LiveShare classification/prompt borrow denial:4 selected checks passed.
- [x] 74 bounded emit/target bundle commands + backend emit exit0;28 built business/KB checks passed;6table DB hashes preserved.
- [ ] Real account/cloud, full production compaction/fork/model-switch/browser/user acceptance not claimed.
See task-workstream-t166-handoff.md/evidence; shared physical artifact GC intentionally not performed.
