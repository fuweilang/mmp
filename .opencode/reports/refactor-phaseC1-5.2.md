# 阶段 C1 · 客户端组件拆分（5.2）

- 仓库：`/Users/fuweilang/Documents/code/mmp`，分支 `5.2`，HEAD `a01b1d59`
- 范围：仅 `mammoth-agent` 三个客户端包；未改测试、未改文案/class/事件时序、未 commit/push/部署、未读 `.env`、未动 Ground
- 日期：2026-11-13（America/Los_Angeles）

## 0. 一句话结论

三个文件全部拆完（3607→7、1902→5、1908→4），导出面与渲染结果不变；三包 `tsc` 0 错误、vitest `859 passed / 11 failed`（失败集合与基线完全一致）。**`pnpm run build --profile local` 从基线 9/1 变成 5 passed / 2 failed，但两项失败均非本次改动**：①`client compiler` 9 条 `TS6307` 全部来自并行会话在 12:56–13:01 新建的 Ground 资料库拆分文件未登记进 `packages/client/ui-enterprise-library/tsconfig.ground-library.json`；②`host aggregate check` 仍是既有 `scripts/ground-web-router.ts:98 TS2412`。

## 1. `TrajectoryTable.tsx`（3607 → 7 文件 / 4102 行）

| 文件 | 行数 | 迁入成员 |
|---|---|---|
| `src/client/TrajectoryTable.tsx`（壳） | 1606 | `TrajectoryTable` 容器（原 `:2095-3607`）、`useStableVirtualRowStructure` 调用、虚拟滚动/选中/键盘/resize、模块常量 `BOTTOM_FOLLOW_THRESHOLD_PX` 等、`DETAILS_RESIZE_STEP`、原公开导出（`TrajectoryTable`、`TrajectoryRequestNumber`、`TrajectoryTableProps`、`TrajectoryUsage`） |
| `src/client/trajectory-table-types.ts` | 252 | `TableRecord` `VirtualRowStructure` `DetailTab` `RecordState` `DetailTabItem` `ParentRecords` `ToolCallTextParts` `SelectedRequest` `DetailsResizeDrag` `TrajectorySplitStyle` `RequestBoundaryStyle` `VirtualSpacerStyle` `OlderLoadAnchor` `TrajectoryTableProps` `TrajectoryRequestNumber(Base)` `TrajectoryUsage` `RecordPresentationValue` `PromptDiffLine` `ParsedToolSchema` |
| `src/client/trajectory-table-format.ts` | 366 | `jsonTreeLabels` `markdownLabels` `formatDurationMs` `formatStartedAt` `clickSelectsText` `totalTime` `ttft` `generationTime` `throughput` `messageSourceLabel` `recordDisplayText` `recordResultText` `toolCallTextParts` `isToolCallOnly` `promptDiffLines` `parseToolSchema` `parseJsonContainer` `clampDetailsWidth` `defaultToolRequestWidth` + 布局宽度常量 |
| `src/client/trajectory-table-view-state.ts` | 405 | `flattenRecords` `filterRecords` `requestKey` `requestIdentity` `indexRequestBoundaries` `sectionLabel` `indexRequestNumbers` `indexRequestBoundaryRuns` `summarizeTurn` `collapseTurnRecords` `assistantToolCalls` `summarizeCalls` `collapseCallRecords` `stateOf` `statusLabel` `requestErrorMessage` `useStableVirtualRowStructure` |
| `src/client/trajectory-table-columns.tsx` | 102 | `KIND_LABEL_KEY` `KIND_ICON` `ToolWrenchIcon` `InformationIcon` `CompactedIcon` `COLLAPSED_SUMMARY_LABEL_KEY` |
| `src/client/TrajectoryTableRows.tsx` | 308 | `RecordPresentation` `RecordListText` `MarkdownFragment` `SourceBlocks` `recordAttachments` `RecordAttachments` `AssistantToolCalls` |
| `src/client/TrajectoryDetailsPanel.tsx` | 1063 | `SYSTEM_PROMPT_TABS` `SYSTEM_UPDATE_TABS` `REQUEST_TABS` `StartedAtValue` `AssistantTimingPanel` `TokenRows` `inputTotal` `UsageRows` `RequestUsagePanel` `RequestOptions` `MessageSource` `isMarkdownRecord` `parentRecords` `markdownSource` `detailTabs` `ToolGlyph` `ToolCatalog` `PromptDiffSection` `SystemPromptDiff` `ToolOutputBlocks` `MarkdownRecordContent` `RecordTiming` `RequestTiming` `RecordPayload` `RecordSchema` `InspectorCopyButton` `ProgramInput` `ProgramOutput` `OverviewSection` |

依赖为单向 DAG：types ← format ← {view-state, columns, rows} ← details ← 壳（壳是唯一 import 方，无循环值依赖）。

### 覆盖率（每文件，% Stmts / % Branch / % Funcs；n=语句数）

| 文件 | Stmts | Branch | Funcs | n |
|---|---|---|---|---|
| `TrajectoryTable.tsx` | 72.41 | 75.89 | 69.23 | 464 |
| `TrajectoryDetailsPanel.tsx` | 75.66 | 73.16 | 75.44 | 189 |
| `TrajectoryTableRows.tsx` | 89.13 | 82.09 | 88.89 | 46 |
| `trajectory-table-format.ts` | 64.71 | 56.30 | 66.67 | 119 |
| `trajectory-table-view-state.ts` | 85.43 | 76.12 | 93.75 | 151 |
| `trajectory-table-columns.tsx` | 100.00 | n/a | 100.00 | 6 |
| `trajectory-table-types.ts` | 无运行时语句（纯类型） | | | 0 |
| 拆分前 `TrajectoryTable.tsx` | 75.05 | 73.82 | 75.63 | — |
| 包整体（前 → 后） | 84.56 → **84.57** | 77.33 → 77.33 | 84.29 → 84.29 | — |

**门禁口径更正（本机实测，非猜测）**：审计 P1-5 说该包有 per-file 100% 门禁，但当前 `mammoth-agent/vitest.config.ts:276` 的 `'packages/client/ui-trajectory/src/*'` 实际排除了整个 `src/client/**`（用仓库原配置全量 include 跑，报告里没有任何 ui-trajectory 行；只有加 `--coverage.exclude` 覆写才会出现）。也就是说该包**当前根本不在覆盖率门禁内**，拆文件不可能使门禁转红；上表是覆写 include 后的实测数字，供趋势对比，总语句覆盖率 +0.01pp（无代码丢失）。

## 2. `PluginManagerPage.tsx`（1902 → 5 文件 / 1985 行）

| 文件 | 行数 | 迁入成员 |
|---|---|---|
| `PluginManagerPage.tsx`（页面容器） | 411 | `PluginManagerPageProps` `RenderConfig` `ResolveText` + `PluginManagerPage` 容器（原 `:1539-1902`） |
| `PluginManagerList.tsx`（列表） | 289 | `AddPluginMenu` `HIGHLIGHT_MS` `PackageArtwork` `RowSwitch` `rowStateText` `rowDotState` `MetadataError` `RuntimeError` `RowsSection` `SourceSection` `EnableSwitch` |
| `PluginManagerDetail.tsx`（详情/卡片） | 463 | `packageStatus` `CardHead` `ListSkeleton` `DetailTop` `versionUpdate` `updatesNote` `updateAvailable` `PackageCard` `ItemCard` `rowRef` `packageRef` `ItemDetail` `RowDetail` `PackageDetail` `ConfirmDialog` |
| `PluginManagerInstall.tsx`（安装流程） | 732 | `INSTALL_TERMINAL_LINES` `terminalLabels` `INPUT_PROBLEM_KEYS` `GuideExample` `GUIDE_EXAMPLES` `FAILURE_KIND_KEYS` `INSTALLED_TAB` `SCREEN_TITLE_KEYS` `SUBJECT_KIND_KEYS` `inputProblemSentence` `registryList` `registryOption` `failureText` `SubjectLines` `SubjectBlock` `SubjectCard` `useInstallComposition` `InstallDialog` |
| `plugin-manager-format.tsx`（工具函数） | 140 | `RowPhase` `rowsRunning` `pinnedToMainList` `optionalBundleRank` `orderOptionalBundles` `toastHoldMs` `PHASE_KEYS` `PHASE_STATES` `partsSummary` `RowToggles` `RowConfigure` `ROW_FILTER_THRESHOLD` `CARD_ARTWORK_SIZE` `ROW_ARTWORK_SIZE` `ITEM_ARTWORK` `itemArtwork` |

覆盖率（per-file）：5 个新文件全部 **100% Stmts / 100% Branch / 100% Funcs**（`PluginManagerPage.tsx` n=129、`List` n=44、`Detail` n=48、`Install` n=160、`plugin-manager-format` n=26）。该包处在上表所述的门禁内，且拆分后逐文件 100%（报告中不再出现这些文件即为满分）。包内唯一未满分文件 `role-access.ts`（70%）本次未改动。

## 3. `StatsTable.tsx`（1908 → 4 文件 / 2066 行）

| 文件 | 行数 | 迁入成员 |
|---|---|---|
| `StatsTable.tsx`（表格壳 / 行渲染） | 1319 | 全部类型（`StatsViewInjected` `StatsViewProps` `ViewState` `StepViewState` 等）、`LOAD_OLDER_THRESHOLD` `COPY_FEEDBACK_MS` `IMAGE_PREVIEW_DELAY_MS`、`callBody` `CopyButton` `clipboardOf` `CallBlock` `scopeMarkers` `PromptImageThumb` `ImagePromptPill` `PromptCell` `stepDidCell` `turnDidCell` `AnswerBody` `stepDetailRow` `moreRows` `eventRow` `compactionRow` `stepRows` `turnRows` `TableButton`，并原样重导出下列移出的公开名 |
| `stats-table-columns.tsx`（列定义） | 306 | `COLUMNS` `NumericColumn` `TOTAL_COLUMNS` `ToolPill` `MixBar` `toolStat` `metricCell` `COLUMN_READ` `COLUMN_FORMAT` `COLUMN_PARTIAL` `COLUMN_DETAIL` `metricsCells` `MetricCells` `ContextCell` `TimeCell` `TotalsRow` |
| `stats-table-data.ts`（数据 hook/派生） | 71 | `EMPTY_STEP_VIEW` `createViewState` `callGroups` `stepGaps` `contextDeltas` `stepsOf` |
| `stats-table-format.tsx`（格式化） | 370 | `STEP_LIMIT` `STEP_GAP_MIN_MS` `CODE_LINE_LIMIT` `DIFF_LINE_LIMIT` `TOOL_TONES` `TONE_CLASSES` `cx` `toneIndex` `toneClass` `isTimeRunning` `totalSpan` `defaultTurnOpen` `at` `splitLines` `textLines` `prettyArguments` `lineDiff` `fileContentOf` `lineClass` `codeBlock` `imageName` `TEAM_FRAME` `AGENT_FRAME` `SUBAGENT_FRAME` `triggerLabelOf` `triggerBodyOf` `triggerLabel` `answerPreview` `eventLabel` `eventReason` `eventAction` `eventSource` `eventApproval` `eventDetail` |

注：`StatsTable.tsx` 原本就不是「壳组件」而是行构建模块（真正的组件在 `StatsView.tsx`），因此以其为壳、用 `export { … } from './stats-table-*.tsx'` 原样重导出 `COLUMNS / EMPTY_STEP_VIEW / TotalsRow / createViewState / defaultTurnOpen / isTimeRunning / totalSpan / turnRows / TableButton` 及类型，`StatsView.tsx` 与 `index.ts` 的导入路径与名字均未改。

覆盖率（per-file，门禁内，全部 **100%**）：`StatsTable.tsx` n=274、`stats-table-columns.tsx` n=92、`stats-table-data.ts` n=34、`stats-table-format.tsx` n=160。

## 4. 验证（命令 + 结果）

| 项 | 命令 | 结果 | 对比基线 |
|---|---|---|---|
| 三包 vitest | `npx vitest run packages/client/ui-trajectory packages/client/ui-plugin-manager packages/experimental/client-ui-stats` | files 27 passed / 1 failed（28）；tests **859 passed / 11 failed / 0 skipped** | 基线同集合（trajectory 拆分前实测 288/11；另两包测试文件未改：356/0、215/0）。11 例仍为 `views.client.spec.tsx` 既有 locale 断言：`:453 :538 :560 :571 :608 :637 :691 :716 :748 :786 :1596` |
| 单包重跑（对照） | `npx vitest run packages/client/ui-trajectory` | 288 passed / 11 failed（14 files） | 与拆分前完全一致 |
| tsc（三包） | `npx tsc -p packages/client/ui-trajectory/tsconfig.client.json --noEmit` 等 3 条 | 0 错误 | 无新增 |
| tsc -b（我这两包） | `npx tsc -b packages/client/ui-trajectory/tsconfig.client.json packages/experimental/client-ui-stats/tsconfig.json` | exit 0 | — |
| 构建门 | `pnpm run build --profile local` | **5 passed / 2 failed / 3 skipped**（基线 9/1） | **回归不来自本次改动**，见 §5 |
| export JSDoc | `npx tsx scripts/verify-export-jsdoc.ts` | 我这 3 包新增文件 **0 条违规**（补文档前为 61 条，全是新导出缺注释）；仓库其余历史违规不变 | 新增 0 |
| oxlint | `npx tsx scripts/run-oxlint.ts <三包 src/client>` | max-len 全部清零；残留 6 条均为**原文件既有**（`css.partsFilter as string`=HEAD `PluginManagerPage.tsx:300`→现 `PluginManagerList.tsx:153`；`css.installDialog/installContent as string`=HEAD `:1105/:1143/:1144/:1363`→现 `PluginManagerInstall.tsx:343/562`；`index.ts:170/172` 未改动） | 新增 0 |

## 5. 构建回归的归属（必须上报，不修）

`pnpm run build --profile local` 两项失败：

1. `FAILED client compiler`（`tsc -b <tsconfig.client.json references>`，9 条 `TS6307`）——全部指向 **Ground** 文件：`../ground/apps/backend/src/library/library.{auth,context,items,read,media,mutate,stats,ask.service}.ts`，报错为「未列入 `mammoth-agent/packages/client/ui-enterprise-library/tsconfig.ground-library.json` 的 files 列表」。这些文件时间戳 12:56–13:01、且 `git status` 为 `??`（未跟踪），是**并行会话的 Ground 资料库拆分**（P1-1）产出；该 tsconfig 的 `include` 未同步扩展。基线时该目录还是单文件 `library.service.ts`，因此基线 9/1 无法在当前工作树上复现。
2. `FAILED host aggregate check`——仅 `scripts/ground-web-router.ts(98,63) TS2412`，即任务书列明的既有基线红。

连带 `client-src / client-bundle / Web build / client aggregate check` 3 项 SKIPPED。按红线我未改 Ground 与该 tsconfig；请 DeepSeek 指派 Ground 拆分归属方补 `tsconfig.ground-library.json` 的 include（或明确由我改该一处 tsconfig，需要授权，因为它在 `packages/client/*` 但服务于 Ground 源码集）。

## 6. 覆盖门禁口径（建议同步给秋池/浪哥）

- `vitest.config.ts:276` 的 `'packages/client/ui-trajectory/src/*'` 在本机 vitest 4.1.11 下实际排除了整个 `src/client/**`（实证：仓库原配置全量跑，报告 0 行 ui-trajectory；加 `--coverage.exclude='nothing/**'` 覆写才出现）。所以 P1-5「搬文件必须同步补测，否则门禁红」的前提不成立；本包当前无 per-file 门禁。若要让门禁真正生效，应把该行收窄为只排除确实缺测的文件，那是一项独立决定，本次未改配置。
- `ui-plugin-manager`、`experimental/client-ui-stats` 不在排除名单内，属真实门禁；本次拆分后两包所有新文件 100%，无需补测迁移。

## 7. 未验 / 风险

| 项 | 原因 |
|---|---|
| `pnpm run build --profile local` 回到 9/1 | 被并行 Ground 拆分造成的 `tsconfig.ground-library.json` 缺登记阻塞；我这两包 `tsc -b` 已 exit 0，剩余编译错误全部在 Ground |
| 完整 `pnpm run test:coverage`（全仓 per-file） | 需全仓覆盖率长跑；仅做了三包 + 覆写 include 的定点测量 |
| 真实 GUI / Electron 桌面窗口刷新 / 真实模型 | 本环境无合法 GUI 会话与云模型凭据；本次为纯搬迁，未触及运行时链路 |
| `role-access.ts` 70% | 本次未改动，属包内既有状态；若全仓门禁绿，说明它在其它套件被覆盖，未单独验证 |

风险：新增文件均为「代码原样搬移 + 显式 import/export」，未改任何 JSX 结构、class、文案或事件顺序；唯一非搬运改动是给 ui-trajectory 新导出补 JSDoc（注释），以及把超 140 列的行拆行（无语义影响）。

## 8. 交接

- 秋池：三包复跑 `npx vitest run …` 与 `npx tsc -p … --noEmit`；11 例 locale 失败属既有基线集合。
- 浪哥：重点看 §5（构建红的归属）与 §6（门禁口径）；如需我补 `tsconfig.ground-library.json` 请由 DeepSeek 授权。
- DeepSeek：Ground 资料库拆分与 `ui-enterprise-library/tsconfig.ground-library.json` 的配套改动需要有归属，否则 `build --profile local` 无法回到 9/1。
