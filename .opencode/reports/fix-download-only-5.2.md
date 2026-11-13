# 修复：DOWNLOAD_ONLY 版本重解析不升级（5.2）

时间：2026-11-13（America/Los_Angeles）· 分支 5.2 · 范围仅 ground 资料库解析重试

## 结论

判定 **A：允许升级为 READY，store 的 `DOWNLOAD_ONLY` 早退是缺陷，测试期望正确**。修 store（内存 + Prisma）；测试未放宽，另补一条 READY 不可变用例。

## 语义依据（path:line）

| 证据 | 内容 |
|---|---|
| `ground/apps/backend/src/library/library.media.ts:169-175` | retryParse 注释明确：*"Retrying it must not silently remap old paragraph/page locators. Download-only versions have no chunks, so a later parser may read them."* 服务层只对 READY 早退，DOWNLOAD_ONLY 会走完整解析 + `commitParseResult`（同文件 180-192）。 |
| `ground/apps/backend/src/library/library.parse.ts:20-28,66-68` | DOWNLOAD_ONLY 的产生条件：视频（不做理解）、图片无 OCR 文字、PDF 无文字且 OCR 失败、未知扩展名、"这台机器没有 Office 转换程序"、ZIP 无可引用文字。全部是**环境/能力不足**，不是不可变事实；OCR 安装、Office 转换器就位后同一份字节本可出字。 |
| `ground/apps/backend/src/library/library.service.ts:126-127` | 公开入口就是重试解析，用户点击"重新解析"的语义是"再试一次能不能读数"，对 DOWNLOAD_ONLY 无重试等于 UI 上死路。 |
| `ground/apps/backend/src/library/README.md`（Parse retry 段） | "Parse retry commits status, chunks and success audit atomically; **successful versions stay immutable**" —— 不可变边界是 READY（成功版本），DOWNLOAD_ONLY 不属成功版本。 |
| `library.store.ts:207` / `library.prisma-store.ts:154` | 早退条件 `parseStatus === 'READY' || === 'DOWNLOAD_ONLY'`，与上述三条相矛盾：服务层放行、store 静默吞掉，返回 `unchanged` 且不写 audit。 |
| `ground/apps/backend/src/library/library.read.ts:176` | DOWNLOAD_ONLY 可读但不可引用，因此升级不清除任何已有引用定位（无 chunk 可失配）。 |

安全性检查：DOWNLOAD_ONLY 版本按正常路径 `prepareVersion`（media.ts:120-155）产生，chunks 恒为空，**不存在可被重映射的段落/页码定位**；READY 早退在 store 与 media 双层保留，重解析不会降级或改定位。ART 场景（管理员把 READY 手动改成 DOWNLOAD_ONLY，`library.admin.dto.ts:14` 可写状态）会重算 chunks，属管理员显式操作，可接受。

## 改法（最小）

1. `ground/apps/backend/src/library/library.store.ts:207-209`：早退仅保留 `READY`，加注释说明 DOWNLOAD_ONLY 无 chunk 可失配。
2. `ground/apps/backend/src/library/library.prisma-store.ts:154-156`：同上，保持两 store 语义一致（含 FOR UPDATE 锁路径不变：状态、chunk 替换、audit 仍在同一事务）。
3. `ground/apps/backend/test/library/library.flow.spec.ts:354-360`：加强已有 DOWNLOAD_ONLY→READY 用例，追加断言 `parseReason` 清空、chunks 恢复出「品名」，证明提交的是完整解析结果而非只改状态。
4. `ground/apps/backend/test/library/library.flow.spec.ts:960-972`：新增 `keeps a ready version and its locators unchanged when parsed again` —— READY 重解析后状态仍 READY、chunk 记录（含 id/locator）逐一相同、不产生 `library_retry_parse` audit。

未改动任何断言期望值，未 skip 用例，未动迁移与 schema。

## 验证

| 命令 | 结果 |
|---|---|
| `pnpm --filter @mammoth/backend test:library` | tests 74 / pass 74 / fail 0（改前 73 例中含失败 1 例；成功数 +1 来自新增用例，原失败例转绿） |
| `cd ground/apps/backend && pnpm exec tsc -p tsconfig.build.json --noEmit` | exit 0，无输出 |
| `pnpm --filter @mammoth/backend build` | exit 0（prisma generate + nest build 成功） |

## 风险 / 未验

- **未跑**：`test:library:db`（Prisma 事务路径里 `commitParseResult` 的同款改动）、`test:library:http`（需起服务）、真实 GUI「重新解析」按钮 —— 均未执行，两条早退逻辑改动一致，但 DB 层仅静态审查 + 类型构建通过，未证明事务行为。
- 行为变化：对 DOWNLOAD_ONLY 点重试若仍解析不出文字，会再写一条 `status: DOWNLOAD_ONLY` 的 `library_retry_parse` audit（此前静默不写）。属可观测性改善，非放大写入；如产品要求审计去重需另定契约。
- 管理员把 READY 手动改为 DOWNLOAD_ONLY 后再重解析，会用新解析的 chunks 覆盖原定位；正常路径不可达，未额外加锁保护。
- 未 commit / 未 push / 未部署；未读 .env、未触生产库（构建时 prisma CLI 自行加载本地 .env，未读取内容）。
