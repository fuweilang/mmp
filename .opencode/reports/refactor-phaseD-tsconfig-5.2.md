# Phase D · 修 `tsconfig.ground-library.json` 未登记 B1 新文件（5.2）

时间：2026-11-13 America/Los_Angeles · 分支 `5.2` · 未 commit/push

## 结论

B1 拆分后 `client compiler` 的 9 条 `TS6307` 已消除；`pnpm run build --profile local` 回到 **9 passed / 1 failed**，唯一失败仍是既有 `scripts/ground-web-router.ts(98,63) TS2412`（与 B1/Phase D 无关）。

## 改动清单

| 文件 | 改动 |
|---|---|
| `mammoth-agent/packages/client/ui-enterprise-library/tsconfig.ground-library.json:12-35` | `include` 显式白名单新增 8 个 B1 新文件，保持原有逐文件写法与字母序，不加通配符、不加目录 |

新增条目（均为 `library.service.ts` 传递依赖闭包内的文件）：

- `library.ask.service.ts`、`library.auth.ts`、`library.context.ts`、`library.items.ts`、`library.media.ts`、`library.mutate.ts`、`library.read.ts`、`library.stats.ts`

未新增：`library.prisma-store.ts` / `library.{admin,module}*.ts` / `library.controller.ts` / `library.dto.ts` —— 均不在该程序的 import 闭包内（依赖 `@nestjs/common`、`@prisma/client`、`../prisma/prisma.service`），按“不扩大 include 范围”要求不登记。
`rootDir: .../src/library` 保持不变；新增文件全部在其下，无 `TS6059`。

### include 闭包核对（脚本遍历相对 import，从 12 个旧条目出发）

闭包共 20 个文件 = 旧 12 + 新 8，**且新 8 个就是旧 include 漏掉的 8 个**（无第二处漏项）。因此 9 条 `TS6307` 与 C1/C2 报告的“`library.{auth,context,items,read,media,mutate,stats,ask.service}.ts`”完全对应（第 9 条为同一文件在客户/客户端两个 program 里的重复报出）。

## 需求 2：`ground/apps/backend/src/knowledge/lexical-query.ts` 的覆盖判定

结论：**该文件不属于本 tsconfig 的程序，不需要（也不能）登记**。

- 引用方只有 Ground NestJS 侧：`ground/apps/backend/src/official-agent/official-kb.service.ts:11` / `:607`、`ground/apps/backend/src/knowledge/knowledge.service.ts:13` / `:424`；`mammoth-agent` 全仓无 import（`grep -rn "lexical-query"` 仅命中 ground 源与 `dist` 产物）。
- 任何 `mammoth-agent` tsconfig 都未 include `ground/apps/backend/src/knowledge/**`（全仓仅 `tsconfig.ground-library.json` 引用 ground 源码，且只到 `src/library`）。
- 若硬加进来会违反本项目的 `rootDir: ../../../../ground/apps/backend/src/library`（`TS6059`），并会改变 `outDir` 布局 —— 属扩大范围，不做。
- 其真实编译覆盖在 Ground 自己的程序里：`cd ground/apps/backend && npx tsc -p tsconfig.build.json --noEmit` → **exit 0**（该 program 含 `knowledge/lexical-query.ts`）。

## 验证命令与结果

| 命令 | 结果 |
|---|---|
| 旧 include 闭包遍历脚本（node，上表口径） | 漏项 = 8，恰为新增的 8 个；无其他漏项 |
| `node node_modules/typescript/bin/tsc -p packages/client/ui-enterprise-library/tsconfig.ground-library.json` | exit 0，无 `TS6307` |
| `rm -f .../lib/ground-library.tsbuildinfo && node node_modules/typescript/bin/tsc -b .../tsconfig.ground-library.json`（冷构建，排除增量缓存假绿） | exit 0；产出 `lib/ground-library/*.js` = **20** 个，与闭包 20 文件一致 |
| `cd ground/apps/backend && npx tsc -p tsconfig.build.json --noEmit` | exit 0 |
| `cd mammoth-agent && pnpm run build --profile local` | **9 passed, 1 failed, 0 skipped in 47.34s**；唯一失败 `host aggregate check`：`scripts/ground-web-router.ts(98,63): error TS2412: Type 'undefined' is not assignable to type 'Timeout' with 'exactOptionalPropertyTypes: true'`；`client compiler` / `client aggregate check` / `Client bundle` / `Web build` 全 PASS |

9/1 之外的失败项：无（`0 skipped`）。

## 未验与风险

- `ground-web-router.ts:98` 的 `TS2412` 未修：属既有基线（Phase C1/C2 报告同一行同一码），不在本次范围；修复方式为把 `slot.timer` 显式放宽为 `Timeout | undefined` 或用 `delete slot.timer`，需另派。
- 该 tsconfig 采用显式白名单，后续 Ground `library/` 再拆分仍会 `TS6307`；若要长期免维护可改 `".../src/library/library.*.ts"` 通配（当前 20 个文件全部匹配该通配，已验证无遗漏），但会一并纳入 `prisma-store` 等依赖 Nest/Prisma 的文件，故本次不动。
- 未做真实 GUI/服务端联调：本次仅编译器清单修复，无运行时行为变化；`lib/ground-library` 产物由 `tsc -p` 冷构建重新生成。

## 交接

- 浪哥：只看 `tsconfig.ground-library.json` 的 8 条新增是否与 B1 闭包一致（上表可复算）。
- DeepSeek：`ground-web-router.ts:98` 的基线 `TS2412` 是否另开修复，等你裁决。
