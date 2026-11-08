# t153：新会话未知 composition 事件修复（本地，未发布）

## 根因与最小修复
实际故障日志以 `official-gallery/composition` 为 seq0；这不是需要删掉的历史。t149 已声明三种 SessionEventMap 类型且 Typert descriptor 已认识它们，但原生持久化安全词表 `KNOWN_SESSION_EVENT_TYPES` 和实际 session/lib/index.js 未同步，冷观察路径的 validateStoredEvents 因而拒绝日志。修前用真实 built v4 扫描器 + 原生 admission 成功复现同一拒绝；修后相同压缩原件通过 admission 和 Session 恢复，composition 仍为 version3/managed-documents/standard，不被忽略。

依照仓库已有 `scripts/gen-persistence-catalog.ts` 机制处理：为 composition/receipt/artifact 声明补持久化说明，生成词表/文档/schema，并同步原生 session 与 gallery 两个运行包。**没有**给三事件加 ignorable，没有关闭任何 unknown required 检查，也没有改安全策略或普通标准分支。compositionOf 仍严格解析冻结组合。

生成器开始时另遇两份既存 src/*.d.ts 重复源声明（agent-preset-registry、working-directory）；没有删除这些文件或回退 WIP。仅让事件扫描跳过存在同名 .ts/.tsx 的 emit declaration，独立 ambient .d.ts 继续纳入；添加一个聚焦回归。未修改依赖、tsconfig 或框架版本。

## 实际源码/派生产物
M = /Users/fuweilang/Documents/code/mmp/mammoth-agent
- `M/packages/preset/official-agent-gallery/src/managed-runtime.ts`：仅三条事件的持久化 JSDoc，不改变执行逻辑。
- `M/scripts/persistence-catalog-source.ts`：避免 source + emitted sibling d.ts 双计。
- `M/packages/core/session/src/known-event-types.ts`：原生 generator 生成，新增认识三种 required 事件；既有 bound/source 保留。
- `M/packages/core/session/tests/gen-persistence-catalog.spec.ts`：source/emit/standalone ambient 窄回归。
- `M/packages/preset/official-agent-gallery/tests/managed-business.spec.ts`：原有真实创建/业务用例加入 zstd 落盘 → 新 provider 冷读 → Session.fromRestore；普通、专家、技能在任务前后各一次，校验原事件前缀和冻结组合。只允许原生恢复添加内存 lifecycle marker，不写原日志。
- 原生 generator 刷新 `docs/persistence-catalog.{md,zh.md,i18n.yaml}`、`docs/persistence-schema.json`、`docs/experimental-persistence-catalog.{md,zh.md,i18n.yaml}`（部分内容未变）；不是手工绕过词表。
- 两个目标包 `packages/core/session/lib/*` 与 `packages/preset/official-agent-gallery/lib/*` 的有界 tsc/tsdown 运行工件同步。无 UI/后端业务源码变更。

## 真实验证与限制
最终命令均 exit0：
1. `./node_modules/.bin/tsc -p packages/core/session/tsconfig.json`
2. `./node_modules/.bin/tsc -p packages/preset/official-agent-gallery/tsconfig.json`
3. `./node_modules/.bin/tsdown --filter '@mammoth-ai/mmp-session' --filter '@mammoth-ai/mmp-official-agent-gallery' --no-clean --logLevel error`
4. generator 单一新回归：**1 pass / 0 fail**，其余27没有执行（非全套测试）。
5. `vitest run packages/preset/official-agent-gallery/tests/managed-business.spec.ts packages/session/session-persistence-jsonl/tests/current-event-admission.spec.ts --maxWorkers 1`：**13 pass / 0 fail**。包括普通会话不绑专家、专家/技能实际 Remote create、zstd native provider 冷读/restore、未知非ignorable仍拒绝且原始fixture不截断、技能首请求屏障、工具/附件限制、取消迟到不复活。模型/Ground仍明确mock，真实AgentLoop、工具和附件存储实际运行。
6. `MMP_GALLERY_TEST_BUILT=1 vitest run packages/preset/official-agent-gallery/tests/managed-business.spec.ts --maxWorkers 1`：**9 pass / 0 fail**，重复用实际 gallery lib；不把与源码重跑累计成23项不同测试。
7. `./node_modules/.bin/tsx scripts/gen-persistence-catalog.ts --check`：exit0，全部生成产物一致。
8. 指定用户原故障 `.jsonl.zstd`：实际 built ESM 扫描器、validateStoredEvents、Session 恢复和 strict composition 解析均成功，7个原事件保留。没有LLM或工具副作用。

初次新restore断言曾误以为原生恢复不加 `session/end-seed`，两项失败后按原生契约校正断言，未改运行框架；最终13/0。一次 tsx -e 调查因其CJS/rrule互操作失败，改用实际 built ESM完成回放，不改rrule。详情在 RESULT.json，不能把这些初始失败说成全部一次通过。

## 原历史和运行载入保全
证据目录：`ground/openspec/changes/official-expert-skill-gallery/session-reader-t153-evidence/`：BEFORE/AFTER、REPLAY-BEFORE/AFTER、GENERATOR-TEST、FOCUSED-SOURCE/BUILT、RESULT、RUNTIME-MANIFEST。
指定 session `011bfe5a-d986-4929-8c83-741b6c12bdcb` 压缩文件前后 **1699 bytes**，SHA256 均为：
`b31b109ec76b6b2f6b54b37a35b9c0cf2f59e7597e7e1d46905f3db845bcb13d`。
不删/截断/重建/改写原会话；不读取凭据，不输出会话正文；回放只记录事件类型/数量/组合版本。DB本轮未访问或写入，不冒充已重新核对历史资源数量。

已核 `.desktop-build/development/project/node_modules/@mammoth-ai/{mmp-session,mmp-desktop-host,mmp-official-agent-gallery}` 直链当前工作区。native persistence/jsonl/query/format-catalog/gallery 均解析到重建的同一个 `packages/core/session/lib/index.js`。现有 gallery 与 session-controller Typert host descriptor 已包含三种事件，未引入新 Remote/协议字段，无需重生成；manifest记录实际文件hash及presence。

**用户需要完全退出并按原方式重开开发客户端/DevHost，让缓存ESM的Host重载。** 可用现有根目录 `pnpm run start:desktop`（其已有脚本带 --skip-build），无需全仓build或清理历史。仅刷新renderer可能保留旧Host词表。未杀/重启用户进程。没有改Ground backend，本轮无backend/DB重启或迁移要求。

未做真实登录桌面点击/网关端到端、真实云LLM、全量production standard插件组合、完整resume/fork执行或浏览器验收；本轮做到真实持久化读/恢复与受控业务回归，不宣称全部客户端场景已验收。用户重开后依次普通新会话、召唤专家、使用技能，并可重新打开原故障会话；无需删任何历史。没有commit/push/publish/clone/cloud/DB变更/草稿启用/权限放宽，也未触碰t150弹窗修复。完成即等待用户点检，不展开其他任务。
