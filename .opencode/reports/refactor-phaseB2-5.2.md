# 阶段 B2 重构 · 5.2 实施报告

- 仓库：`/Users/fuweilang/Documents/code/mmp`，分支 `5.2`（未 commit/push/部署）
- 日期：2026-11-13（America/Los_Angeles）
- 依据：`.opencode/reports/refactor-audit-5.2.md` P1-2 / P1-3
- 范围：仅 Ground 后端 `apps/backend/src/admin/**`、`src/official-skill/**` 及对应测试
- 未触碰：前端、`mammoth-agent/`、`llm/**`、Prisma schema/迁移、`.env`、数据库、生产配置

## 0. 结论

| service | 状态 | 新文件 | 行数变化 | 验证 |
|---|---|---|---|---|
| `admin/admin-official-agents.service.ts` | 完成 | 6 个（presenter/draft/publish/preview/discovery/grant） | 1186 → 206（+6 文件 1277 行，合计 1483） | tsc 0 / build 0 / verify 0 / 专家组 54 测试 48 通过 6 失败（与基线同集合） |
| `official-skill/official-skill.service.ts` | 完成 | 5 个（package/lifecycle/public/links/display-translation） | 1141 → 405（+5 文件 1067 行，合计 1472） | tsc 0 / build 0 / verify 0 / 技能组 59 测试 58 通过 1 失败（基线同一例） |
| 新增护栏测试 | 完成 | 2 | — | bulkGrant 部分成功 2/2；翻译端口 3/3 |

纯搬迁：SQL、事务边界（含 `Serializable` 与 `FOR UPDATE`）、权限判断（`assertSuperAdmin`/`adminScope`/`requireActiveAccount`）、错误码与中文文案、返回结构与字段顺序均未改；仅新增内部导出与两个测试文件。

## 1. P1-2：`admin-official-agents.service.ts`（1186 → 206）

| 文件 | 行数 | 迁入成员 |
|---|---|---|
| `admin-official-agents.service.ts`（保留，组合入口） | 206 | `constructor`（签名 `(prisma, support, officialKb, officialSkills, runtime?)` 不变）、`list`、`detail`、`deps()`、20 个 public 方法一行转发 |
| `admin-official-agent.presenter.ts` | 324 | `officialAgentInclude` `OfficialAgentRow`；`load` `presentMany` `present` `presentVersion` `loadPublisherNames` `avatarExplicitByKey` `resolveAvatarUrl`；被多簇复用的纯函数 `stableJson` `hasUnpublishedChanges` `assertPublishable` `frozenStringList` `requireAgentRow` `auditOfficialAgent` |
| `admin-official-agent.draft.service.ts` | 269 | 专家 CRUD：`create` `update` `remove` `uploadAvatar` `removeAvatar`；`normalizeDraft` `normalizeList` `requiredText` |
| `admin-official-agent.publish.service.ts` | 184 | 发布/下线/回滚：`publish` `offline` `rollback` `bulkOffline` |
| `admin-official-agent.preview.service.ts` | 40 | 预览：`createPreview`（`LEGACY_KNOWLEDGE_PREVIEW_REQUIRES_MIGRATION`、`executionProtocol:2` 原文保留） |
| `admin-official-agent.discovery.service.ts` | 199 | 发现与资产：`discovery` `saveDiscovery` `listAssetCatalog` `importAssets`；模块函数 `syncOfficialAgentKb` |
| `admin-official-agent.grant.service.ts` | 261 | 权限与配额：`grant` `revoke` `bulkGrant` `bulkRevoke` |

- 组合方式：门面构造 5 个职责簇（均非 Nest provider，不进 DI 容器，避免 tx 绑定顺序问题）。
- 依赖用 `deps()` **getter** 而非构造快照：`official-agent-admin.service.test.ts:358` 会在构造后覆盖 `(service as any).officialKb`，getter 才能读到新值（该用例 `publishing a built-in key through knowledge-core never resynchronizes the legacy corpus` 通过）。
- 依赖方向：`draft/publish/preview/discovery/grant/presenter → presenter`；`publish → discovery`（仅 `syncOfficialAgentKb`），单向无环。
- 构造签名兼容：7 处按位置 `new` 全部不改（`official-agent-admin.service.test.ts:160`、`official-agent-admin-delete.unit.test.ts:159`、`official-agent-admin-avatar.unit.test.ts:37,183`、`official-agent-admin-list.unit.test.ts:104`、`official-agent-publish-requirements.unit.test.ts:54`、`official-expert/config.unit.test.ts:18`）。public 方法名集合与 HEAD 完全一致（脚本比对 `EXIT=0`）。

### `bulkGrant` 部分成功语义（原样保留）

- 代码：`admin-official-agent.grant.service.ts:99-190`；原实现 `git show HEAD:...admin-official-agents.service.ts:376-482`。
- 保留点：逐企业**串行**、**无整体事务**、单企业失败 `continue` 不影响后续、已写入授权不回滚、`skipped`（ACTIVE 且同版本）不重复 upsert、末尾单条 `admin_bulk_grant_official_agent` 审计 + `summary` 计数。
- 新增断言测试：`test/official-agent-admin-bulk-grant.unit.test.ts`
  1. 输入 `[t-missing, t-platform, t-off, t-skip, t-ok]` → 结果严格为 `error,error,error,skipped,granted`；`upserts === ['t-ok']`（失败 3 家未写库、跳过未重复写、最后一家仍落库）；`summary={granted:1,reactivated:0,upgraded:0,skipped:1,errors:3}`；bulk 审计 `meta` 深比较通过；单条 grant 审计仅 `t-ok`。
  2. 已撤销企业 → `reactivated`；ACTIVE 旧版本 → `upgraded`；`upserts` 顺序与 summary 校验。
- 该测试会在以下改动下失败：给 `bulkGrant` 补整体事务/遇错中断、跳过企业重复 upsert、summary 计数口径变化。

## 2. P1-3：`official-skill.service.ts`（1141 → 405）

| 文件 | 行数 | 迁入成员 |
|---|---|---|
| `official-skill.service.ts`（保留，组合入口） | 405 | `constructor(prisma, llm)` 不变；`adminList` `adminDetail` `discovery` `saveDiscovery` `availability` `catalogFacets` `catalogPage` `catalogDetail` `listEnabledOptions`；内部共享成员 `requireSkill` `presentAdmin` `publicCard` `readInstruction*` `requireActiveAccount` `audit` `auditTx`（原 private，现 internal public）；其余方法一行转发 |
| `official-skill-package.service.ts` | 458 | `validateZip` `createFromZip` `createFromForm` `updateMeta` `replaceZip`；`mutateSkill` `assertEnabledStillComplete`（lifecycle 复用）；`persistNewSkill` `replacePackage` `syncCurrentManifestMeta` `displayFromOverrides` `applyCategories` `resolveCategories` `allocateKey` `assertKeyAvailable`；导出 `skillInclude`/`SkillRow` |
| `official-skill-lifecycle.service.ts` | 121 | `setIcon` `enable` `disable` `remove` `assertPackageReady`（原文件内无调用方的私有方法，一并搬入保持原样） |
| `official-skill-public.service.ts` | 202 | `publicList` `publicContent` `publicResource` `beginSession` |
| `official-skill-links.ts` | 108 | `summarizeEnabledSkills` `setAgentSkillLinks` `listAgentLinkedSkillIds` `snapshotLinkedSkills`（`tx?: Prisma.TransactionClient` 形参与语义一字不差） |
| `official-skill-display-translation.service.ts` | 178 | `translateDisplayBatch` + `SkillDisplayCompletionPort` + `SkillDisplayCompletionRequest` |

### LLM 依赖断环方式：依赖注入接口（未用 forwardRef）

- 端口定义：`official-skill-display-translation.service.ts:25-42`
  ```ts
  export interface SkillDisplayCompletionPort {
    completeOnce(user, tenantId, body: SkillDisplayCompletionRequest): Promise<{ content: string; modelRef: string }>;
  }
  ```
- 装配点：`official-skill.service.ts:71-79`，仅门面持有 `LlmChatGatewayService` 并注入端口；新文件对 `llm/**` **零 import**。
- 选择理由：`OfficialSkillModule ↔ LlmModule` 的 `forwardRef` 已存在（`official-skill.module.ts:8`），`forwardRef` 只推迟解析、不消除依赖边；再让新文件 `import LlmChatGatewayService` 会新增一条真实环边。窄端口把调用面收敛为「一次性补全」，新文件可脱离 llm 模块单测（`display-translation.unit.test.ts` 用 stub 端口）。模块文件保持不变（未新增也未删除 `forwardRef`）。
- 说明：装配处使用 `llm as unknown as SkillDisplayCompletionPort`（`official-skill.service.ts:75-78`），原因是 `completeOnce` 还有可选第 4 参 `attribution`；结构上兼容，不加包装层。
- 新增护栏测试：`test/official-skill/display-translation.unit.test.ts`（3/3）
  - `dryRun` 只算候选：不调端口、不写库、不写审计（审计要求补的 dryRun 快照）；
  - 真实批次：单次端口调用（`tenantId=null`）、只写 `name/summary/displayProvenance/displayLocale/displayModelRef/displaySourceHash`，断言 `data.instruction === undefined`、单条 `admin_translate_official_skill_display` 审计；
  - 非平台管理员：`ForbiddenException` 且端口零调用。

## 3. 验证（实际命令与数字）

| 命令 | exit | 结果 |
|---|---|---|
| `npx tsc -p tsconfig.build.json --noEmit`（apps/backend） | 0 | 0 errors |
| `npx tsc --noEmit -p tsconfig.json`（apps/backend，含 test） | 1 | 46 errors；与基线 `/tmp/be-tsc-5.2.log` 归一化 diff = 完全相同集合（`SAME_SET`），无新增源文件错误 |
| `pnpm --filter @mammoth/backend build` | 0 | `prisma generate && nest build` 通过 |
| `cd ground && pnpm run verify` | 0 | verify:web（shared build + vue-tsc + vite build，3494 modules，3.92s）+ verify:api 全通过 |
| `pnpm --filter @mammoth/backend run test:library` | 1 | **73 tests / 72 pass / 1 fail**；唯一失败 `library.flow.spec.ts:357`（`DOWNLOAD_ONLY` vs `READY`，基线既有），满足 ≥68 通过、≤1 失败 |
| 专家/发布/预览组：`node --import tsx --test test/official-agent-admin*.test.ts test/official-agent-publish*.test.ts test/official-agent-avatar-upload.unit.test.ts test/official-agent-version-presentation.unit.test.ts test/official-expert/config.unit.test.ts test/official-agent-admin-bulk-grant.unit.test.ts` | 1 | **54 tests / 48 pass / 6 fail**；基线同一组（改动前实测）**52 / 46 / 6**，失败集合逐条相同：`批量导入/授权/撤销/下架可审计…`（需真实 DB）、`真实 Admin API…`（需真实 DB+dist）、`official agent avatar upload validation`、`official agent custom avatar path resolution`、`official agent admin time presentation`（后三项读前端 `.vue`，被工作区既有前端改动影响，改名前后一致） |
| 技能组：`node --import tsx --test test/official-skill/*.test.ts test/official-skill/*.spec.ts` | 1 | **59 tests / 58 pass / 1 fail**；改动前 **56 / 55 / 1**；唯一失败 `adversarial-http.unit.test.ts`，原因 `Cannot find module '../../dist/src/official-skill/official-skill.controller.js'`（测试写死 `dist/src/**` 而构建产物在 `dist/**`，基线同样失败，与本次拆分无关）；新增 3 例全绿 |
| `node --import tsx --test test/official-agent-admin-bulk-grant.unit.test.ts` | 0 | 2/2 pass |
| `node --import tsx --test test/official-skill/display-translation.unit.test.ts` | 0 | 3/3 pass |

方法面比对（防止搬运丢方法）：
- 专家门面 public 方法名集合 vs `HEAD` → `diff` 空（`EXIT=0`）。
- 技能门面：无缺失；新增 8 个 `internal` 成员（`requireSkill` `presentAdmin` `publicCard` `readInstructionIfAny` `readInstructionFromPath` `requireActiveAccount` `audit` `auditTx`），全部原为同文件 private，仓内除本目录职责簇外无调用方。

## 4. 未验与原因

| 项 | 原因 |
|---|---|
| `official-agent-admin.api.test.ts`、`official-agent-admin-bulk.api.test.ts` 的 HTTP+DB 断言 | 需真实 Postgres 与 `dist/app.module`，且基线即失败（DB 隔离未确认，按红线不连库） |
| `test:library:db`、`test:*:http` | 同上，未记通过 |
| 真实 GUI / 桌面端 / 真实云模型调用 | 本环境无合法 GUI 会话与云模型凭据；`completeOnce` 仅由 stub 端口在单测中替代（不冒充真实模型） |
| 翻译批次的重试/退避真实网络行为 | 仅单测覆盖，无真实上游 |

## 5. 剩余风险

1. **私有→公开的内部成员**：技能服务 8 个原 private 成员变为 internal public（供职责簇调用），扩大同包可见面；已注明 `internal` 且无外部调用方。专家服务无此变化。
2. **门面自引用**：职责簇持有 `host`（技能）与 `deps()` getter（专家）。若未来给职责簇加 `@Injectable()`，`emitDecoratorMetadata` 会让 `design:paramtypes` 触发运行期 import，可能形成模块环——当前职责簇均无装饰器，`tsc -p tsconfig.build.json` 与 `nest build` 均通过。
3. **`presenter` 承载非展示函数**（`assertPublishable`/`frozenStringList`/`requireAgentRow`/`auditOfficialAgent`）：沿用审计 P1-2 §4.2 的放置建议，发布/预览单向依赖；若后续再拆需保持单向。
4. **`syncOfficialAgentKb` 放在 discovery 文件**：发布簇单向引用；`deps.officialKb` 在调用点求值，测试覆盖 `officialKb` 的用例仍生效。
5. **行数增长**：专家 1186→1483（+25%）、技能 1141→1472（+29%），搬迁税（头部 import 与函数签名重复），属预期。
6. 既有失败 6 例（avatar/time presentation 读前端 `.vue`、2 例需 DB、adversarial-http 的 `dist/src` 路径）仍然存在，未修（不在本次范围）。

## 6. 交接

- 秋池：可直接用上表命令复验；两个新测试文件是本次拆分的专项护栏（部分成功语义、翻译端口 dryRun）。
- 浪哥：审点集中在 `official-skill.service.ts:71-79`（端口装配）、`admin-official-agent.grant.service.ts:99-190`（部分成功）、`presenter.ts` 的 `hasUnpublishedChanges`/`assertPublishable` 逐行一致性。
- 未改动 DI 注册：`admin.module.ts`、`official-skill.module.ts` 均未编辑。
