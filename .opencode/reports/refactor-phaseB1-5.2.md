# 阶段 B1 重构 · 5.2 实施报告

- 仓库：`/Users/fuweilang/Documents/code/mmp`，分支 `5.2`，HEAD `a01b1d59`（未 commit/push/部署）
- 日期：2026-11-13（America/Los_Angeles）
- 范围：`ground/apps/backend/src/library/**`、`ground/apps/backend/src/knowledge/lexical-query.ts`、`official-agent/official-kb.service.ts`、`knowledge/knowledge.service.ts` 及对应测试
- 未触碰：`mammoth-agent/`、前端、`wallet.service.ts`、`.env`、数据库、Prisma 迁移

## 0. 结论

| 步骤 | 状态 | 新文件 | 行数变化 | 验证 |
|---|---|---|---|---|
| 第 0 步 `LibraryContext` | 完成 | `library/library.context.ts`(51) | `library.service.ts` 事务入口 1 处，`new LibraryService` 22 处 → 1 处工厂 | `test:library` 73 tests / 72 pass / 1 fail（基线 69/68/1） |
| 第 1 步 拆 6 类 | 完成 | auth/read/mutate/ask/media/stats + items | 1465 → 200（主类），新增 8 文件 1639 行 | 同上；`tsc -p tsconfig.build.json` 0 |
| 第 2 步 去重 lexical 检索 | 完成 | `knowledge/lexical-query.ts`(72) | 两处各 -68/+2 行 | `test:knowledge-core` 34/34、`test:knowledge-retrieval` 18/18、`official-kb-query` 11/11 |

## 1. `LibraryContext` 设计（P0-1）

`src/library/library.context.ts`

```ts
type LibraryContext = { store: LibraryStore; limits: LibraryLimits; now: () => number; writing: boolean };
createLibraryContext(input)                 // 唯一 ctx 构造
assertTenantActor(actor)                    // 原私有 requireTenantActor
withWrite(ctx, actor, work)                 // 唯一开事务入口
```

- 事务句柄只从 `ctx.store.withTenantWrite` 取得；`work` 收到的是 `{...ctx, store: txStore, writing: true}`。
- `PrismaLibraryStore.withTenantWrite` 在 store 已包裹 `TransactionClient` 时不新开事务（复用外层），内存 store 用 AsyncLocalStorage 重入保护 —— 两条路径都不会嵌套第二个事务。
- `LibraryService` 构造签名**未变**（`store, limits?, now?, writing=false`），内部只做 `this.ctx = createLibraryContext(...)`。
- 新增 `createLibraryService(input)`；仓内 `new LibraryService(...)` 全部改调工厂：

| 位置 | 之前 | 之后 |
|---|---|---|
| `library-domain.module.ts:10` | `new LibraryService(store)` | `createLibraryService({ store })` |
| `library.admin.service.ts:38` | `new LibraryService(new PrismaLibraryStore(this.prisma))` | `createLibraryService({ store: … })` |
| `library.admin.service.ts:66` | `new LibraryService(new PrismaLibraryStore(tx))` | `createLibraryService({ store: … })` |
| `library.admin.service.ts:82` | `new LibraryService(store, undefined, () => Math.max(…))` | `createLibraryService({ store, now: () => Math.max(…) })` |
| `library.admin.service.ts:116` | `new LibraryService(new PrismaLibraryStore(tx))` | `createLibraryService({ store: … })` |
| 测试 7 文件 17 处 | 位置参数 | `createLibraryService({ store[, limits][, now] })` |

`grep -rn "new LibraryService" ground` 仅剩工厂内 1 处（`library.service.ts:199`）。

## 2. 六个职责文件

| 文件 | 行数 | 迁入成员 |
|---|---|---|
| `library.service.ts`（保留，兼 barrel） | 200 | `constructor`、34 个 public 方法一行转发、`createLibraryService`；重导出 `ModelComplete` / `LibrarySearchHit` / `libraryFileTypeKey` |
| `library.auth.ts` | 201 | 鉴权与代管：`requireMember` `requireTenantActor` `requireVisible` `requireVisibleFolder` `requireManage` `custodiesFor` `auditCustodyRead` `touch` `writeAudit` `sweep` `custodyView` `grantCustody` `revokeCustody` `managedActor` `listCustody` |
| `library.read.ts` | 254 | 读与呈现：`catalog` `list` `searchQuotes` `versions` + 私有 `isRootForView` `catalogPath` `breadcrumb` |
| `library.mutate.ts` | 461 | 写与树：`createFolder` `createOwnedFolder` `createLink` `upload` `uploadOwned` `replaceVersion` `rename` `move` `scopeImpact` `setScope` `recycle` `restore` `purge` `batch` + `write`（唯一事务入口）+ 树工具 `creationTarget` `scopeTree` `treeRevision` `checkTreeRevision` `applyScope` `assertCreation` `blankNode` `scopeOrThrow` `purgeStored` `recycledSubtree` `isDescendant` |
| `library.ask.service.ts` | 180 | 问答：`ask` `openCitation` `readRetrievalVersion` `markUsed`；`ModelComplete` |
| `library.media.ts` | 197 | 媒体与解析：`preview` `download` `retryParse` + `prepareVersion` `chunkRows`（被 mutate 复用的内部 API） |
| `library.stats.ts` | 110 | 统计：`limitsView` `config` `ownerCounts` `adminStats` `assertQuota` + 私有 `usedBytes` |
| `library.items.ts` | 185 | 被多类复用的共享内部函数：`libraryFileTypeKey` `versionBrief` `versionStatus` `toLibraryItem` `joinedExcerpt` `citationExcerpt` `quotableInChat` `excerptAround` `openLibraryBytes`（原 media/ask 各一份 → 现一份）+ 检索常量 |

- 组合方式：主类持有 6 个子模块实例并转发；子模块只接收 `LibraryContext`（+ 需要的兄弟模块），**不在 DI 容器注册**，也**不互相 new**——`rebind(ctx)` 由外层传入同一个 ctx。
- `write()` 的语义保留：进入 `withWrite` 后用同一 ctx 重建本次写操作的 mutate 实例；`uploadOwned`/`replaceVersion` 的回调改为在该事务实例上取 `creationTarget` / `assertCreation` / `store` / `writeAudit` / `toItem`，参数、判断、错误码与原来逐行对应。
- 私有方法随唯一调用方迁走（`isRootForView`、`catalogPath`、`breadcrumb` → read；树工具 → mutate）；被多处调用的提升为共享函数（`toLibraryItem`、`versionStatus`、`openLibraryBytes`、excerpt 组）。
- 无行为改动：SQL、事务边界（`withTenantWrite` 位置不变）、鉴权判断（`canSee`/`canKnow`/`canManage` 组合不变）、错误码（`BAD_PAGE`/`SCOPE_CONFLICT`/`VERSION_CONFLICT`/`SOURCE_GONE` 等原文保留）、返回字段原样。

## 3. 事务生效证据

新增 `test/library/library.context.spec.ts`（4 例，已并入 `test:library`）：

| 用例 | 断言 |
|---|---|
| 一次写只开一个事务 | `ProbeStore.opens === 1`，`txNodeUpdates === 1`（更新确实落在事务句柄上），改名生效 |
| 事务内后续步骤失败 → 整体回滚 | 让 `audit` 抛错后 `rename` 失败：节点名回滚为原名、`library_rename` 审计为 0 条 |
| 外层已开事务被复用，不嵌套 | 手工 `store.withTenantWrite` 内用 `writing=false` 的服务改名并读回（同一事务内可见）；外层抛错后名字回滚，`opens === 1`；同一 store 上普通调用仍各自开事务（`opens === 2`） |
| `withWrite` 上下文透传 | `writing=true`、`now()` 与 limits 原样透传；`tenantId` 为空时抛 `NO_TENANT`（`缺少企业上下文`） |

## 4. 第 2 步：`lexicalQueryVariants` / `snippetOf` 去重

- 新文件 `src/knowledge/lexical-query.ts`（72 行）。
- 原文核对：`git show HEAD:...official-kb.service.ts:606-673` 与 `...knowledge.service.ts:423-490` **逐字节相同**；新文件与旧块 diff 仅 `snippetOf` 前者为 `function`、新文件为 `export function`。
- `official-kb.service.ts`：改为 `import { lexicalQueryVariants, snippetOf } from '../knowledge/lexical-query'`，并保留 `export { lexicalQueryVariants } from '../knowledge/lexical-query'`（测试导入点不变）。
- `knowledge.service.ts`：同上，保留 `export { lexicalQueryVariants } from './lexical-query'`。
- 两侧合计 -132 行（各 -68/+2）。
- 说明：`test/official-kb-query.unit.test.ts` 原本比的是"两份实现当前相同"，现在比的是"同一个函数被两侧引用"（11/11 通过）——护栏从"同步检查"变成"唯一所有者"，比较价值下降属预期。

## 5. 验证（命令与数字）

| 命令 | exit | 结果 |
|---|---|---|
| `pnpm --filter @mammoth/backend test:library` | 1 | **73 tests / 72 pass / 1 fail**；唯一失败仍为 `test/library/library.flow.spec.ts:357`（`DOWNLOAD_ONLY` vs `READY`，基线既有）。基线 69/68/1 |
| `pnpm --filter @mammoth/backend test:knowledge-core` | 0 | 34 / 34 / 0（基线 34/34） |
| `pnpm --filter @mammoth/backend test:knowledge-retrieval` | 0 | 18 / 18 / 0（基线 18/18） |
| `node --import tsx --test test/official-kb-query.unit.test.ts` | 0 | 11 / 11 / 0 |
| `npx tsc --noEmit -p apps/backend/tsconfig.build.json` | 0 | 0 errors（基线 0） |
| `npx tsc --noEmit -p apps/backend/tsconfig.json` | 1 | 46 errors，全部 `test/**`（基线 46，集合一致；无 `src/**` 错误） |
| `pnpm --filter @mammoth/backend build` | 0 | `dist/library/library.{context,items,auth,read,mutate,ask.service,media,stats}.js` 均已产出 |
| `cd ground && pnpm run verify` | 0 | shared build + vue-tsc + vite build + nest build 全通过；`index-BkQFU0FL.js` **1,079.98 kB / gzip 356.39 kB**，>500 kB chunk 仍 1 个（基线 1,081.51 / 357.00，未回涨） |

日志：`/tmp/b1-lib-base.log`（基线复现）、`/tmp/b1-lib-step0.log`、`/tmp/b1-lib-final.log`、`/tmp/b1-test:knowledge-core.log`、`/tmp/b1-test:knowledge-retrieval.log`、`/tmp/b1-tsc-test2.log`、`/tmp/b1-build.log`、`/tmp/b1-verify.log`。

## 6. 未做项与原因

1. **`wallet.service.ts`（P0-3）本轮不动**：`adjustWallet` 的幂等键查重 → `$transaction` → `increment` → ledger → 事务外 audit，与 `creditQrTopup` 的差异是"方向/类型/备注/tx 归属"；抽公共 `postLedgerEntry` 时若把 `updateMany({balanceCoins:{gte}})` 换成 `update` 会并发超扣，若把 audit 挪进事务会在回滚时丢审计，若漏幂等键唯一语义会重放双记账。现网资损风险高于本轮收益，且缺少并发双花用例（余额 10 并发扣 8+8）作护栏。留到下一轮，先补该用例再抽 `wallet-ledger.ts`。
2. `library.admin.service.ts` 自带的 `brief()`/`fileType()` 与库内 `brief`/`libraryFileTypeKey` 仍是两套（审计 P2-4）。本轮只搬迁、不动管理端返回字段，未合并。
3. `test:library:db` / `test:*:http` / 真实 GUI 未跑：需要已确认隔离的 DB/HTTP fixture 与真实身份，按红线未连库。
4. 前端与 mammoth-agent 未触碰（Phase A 已完成的部分保持原状）。

## 7. 剩余风险

1. `write()` 回调参数由 `LibraryService` 变成"本次事务的 `LibraryMutateService`"；这是私有方法的内部契约变化，外部不可见。今后若有人把某方法改成在回调里调用**外层** `this.write`，仍会重入（`ctx.writing` 判断在方法入口，未变）。
2. `library.items.ts` 的 `openLibraryBytes` 合并了原先 media 与 ask 各自的一份；合并前两份实现已确认逐字一致（`canKnow`，不是 `canSee`），若后续要按用途分层，需保留 `canKnow` 语义。
3. `library.service.ts` 现在同时是"主类 + barrel"，若再新增领域导出，应继续从这里重导出，避免调用方改 import 路径（`library.controller.ts`、`knowledge-core/library-source.adapter.ts` 均按原路径引用）。
4. `test/library/library.backup.test.cjs` 读取的是 `dist/`，已改用 `createLibraryService`；跑 `test:library:backup` 前必须重新 build（本次已 build，但该用例需 Docker + DB，未验）。
5. `package.json` 的 `test:library` 新增 1 个测试文件，属测试脚本变更（非业务代码）。
6. 拆分后每文件行数虽降到 110–461，但 `library.mutate.ts` 仍聚合"写 + 树"，若后续要按乐观锁再拆，需先把 `treeRevision`/`scopeTree` 的调用面收敛。

## 8. 交接

- 验收：秋池（`test:library` 73/72/1、`test:knowledge-*`、`ground verify`、`tsc` 三档）
- 复审：浪哥（`withWrite` 是否唯一事务入口、回调契约、`library.items.ts` 的 ACL 断言、d.ts 公开面）
- 主会话定稿：DeepSeek
