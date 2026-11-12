# 5.0 桌面第四轮修复（李庚）— 2026-11-12

- 仓库 `/Users/fuweilang/Documents/code/mmp`，分支 `5.0`，HEAD `58ec00c2`。
- 依据 `.opencode/reports/qa3-5.0-desktop-20261112.md` 第 1/2/3 项。
- 只改 `mammoth-agent/**`；未动 `.github/workflows`、`ground/**`、Grok 4 文件；未 commit/stash/重启服务/打包/上传；未读 `.env`/凭据。
- 时间：America/Los_Angeles 2026-11-12 22:48–23:10。

## 结论

| 编号 | 状态 | 一句话 |
|---|---|---|
| 1 P1 编译红 | **已修** | `index.ts:330` 不再读已删的 `message`，改由 `passwordFailureKey()` 按 `code`→`reason` 映射；包 `tsc -p` 由 1 error → 0 error |
| 2 类型门禁盲区 | **已补** | 新增包脚本 `typecheck: tsc --noEmit -p tsconfig.json`；`--listFiles` 证明 `src/client/index.ts` 在 program 内 |
| 3 同类残留 | **无残留** | 全仓再查 `.value.message`：仅 `ui-cordis`、`message-feedback` 两个与 account 无关的领域 |

## 1. P1 编译红（唯一阻断）

根因：`deepseek-account-platform` 删除了失败分支的 `message` 字段（`packages/credentials/deepseek-account/src/types.ts:69-71` 只剩 `reason` + `code?`），`ui-settings-account` 消费方未同步。

改动：

- `packages/client/ui-settings-account/src/client/index.ts:329-330`
  ```ts
  if (!result.ok) throw new Error('loginUnavailable')
  if (!result.value.ok) throw new Error(passwordFailureKey(result.value))
  ```
  传输层失败改抛本地化键（不再抛英文 `unavailable`）；业务失败全部经映射。
- 新文件 `packages/client/ui-settings-account/src/client/password-failure.ts:14-17`
  ```ts
  export function passwordFailureKey(failure: Extract<PasswordSignInResult, { ok: false }>): PasswordFailureKey {
    if (failure.code === 'CLIENT_TOO_OLD') return 'clientTooOld'
    return failure.reason === 'credentials' ? 'credentialsFailed' : 'loginUnavailable'
  }
  ```
  只读 `code`/`reason`；未知 code 走既有 reason 映射，不显示服务端原文。
- `packages/client/ui-settings-account/src/client/SignInDialog.tsx:79-82`：catch 处按注入器抛出的字典键展示，未知键兜底 `loginUnavailable`（不再把任意 message 原样渲染）。
- 8 语言新增 `clientTooOld`（`src/client/locales.ts:51/113/174/230/276/322/368/414`），zh 为「当前版本过旧，请更新到最新版本后继续使用」。

用例：

- `tests/password-failure.client.spec.ts`（新）：6 条映射，含 `CLIENT_TOO_OLD`（credentials/forbidden 两种 reason）、未知 code `SMS_RATE_LIMITED`/`SMS_UNAVAILABLE`、缺 code。
- `tests/sign-in-dialog.client.spec.tsx:217-262`（新 7 条）：en/zh `clientTooOld` 文案、`credentialsFailed`、未知键与**非 Error 拒绝**兜底、成功路径清空密码。
- `tests/apply.client.spec.ts:359-375`（新）：真实组合下 `submitPassword` → `clientTooOld` / `credentialsFailed` / 未知 code `loginUnavailable` / RPC 失败 `loginUnavailable`，共 4 次调用。

验证：

```
$ pnpm exec tsc --noEmit -p packages/client/ui-settings-account/tsconfig.json      # 修前
packages/client/ui-settings-account/src/client/index.ts(329,58): error TS2339: Property 'message' does not exist on type '{ readonly ok: false; readonly reason: "unavailable" | "credentials" | "forbidden"; readonly code?: AccountFailureCode; }'

$ cd packages/client/ui-settings-account && pnpm exec tsc --noEmit -p tsconfig.json  # 修后
EXIT=0

$ pnpm exec vitest run tests/sign-in-dialog.client.spec.tsx tests/password-failure.client.spec.ts
Test Files  2 passed (2) / Tests  37 passed (37)

$ pnpm exec vitest run tests/apply.client.spec.ts -t 'maps a rejected Desktop password'
Test Files  1 passed (1) / Tests  1 passed | 28 skipped

$ pnpm exec vitest run packages/client/ui-settings-account/tests
Test Files  3 failed | 28 passed (31) / Tests  9 failed | 420 passed (429)
```

9 条失败与 qa3 基线逐一同名：`browser-login 1 + onboarding 1 + quota-notice-hold 7`；通过数 406→420（+14 = 本轮新增用例），未新增失败。

## 2. 类型门禁盲区

- 盲区确认：`tsc --noEmit -p tsconfig.client.json` 能查出 `ui-settings-account/tests/**` 的错误（本轮实测：新 spec 少了 `ok:false` 时该 program 报 TS2345），**但不含**该包 `src/client/index.ts`（QA 已用 `--listFiles` 证明 0 命中，本轮修后仍如此，属该聚合配置的既有边界）。
- 补的命令（写进包脚本 `packages/client/ui-settings-account/package.json:45`）：
  ```
  "typecheck": "tsc --noEmit -p tsconfig.json"
  ```
  该包 `tsconfig.json` 的 `include: ["src"]`，program 直接覆盖 src；`--noEmit` 不写 `lib/**`。
- 覆盖证明：
  ```
  $ cd packages/client/ui-settings-account && pnpm exec tsc --noEmit -p tsconfig.json --listFiles | grep -c 'src/client/index.ts'
  1
  $ pnpm --filter @mammoth-ai/mmp-client-ui-settings-account run typecheck
  $ tsc --noEmit -p tsconfig.json    # 无输出 → 0 error
  ```
- 全量聚合（本次实测）：`tsc --noEmit -p tsconfig.client.json --tsBuildInfoFile <临时目录>` → **0 error**（含新测试文件）。未跑 `tsc -b tsconfig.client.json`：会写 `lib/**` 产物，按任务要求不做；门禁等价性由「包 program 0 error + 该包是 `tsconfig.client.json:78` 的 reference」推定，`tsc -b` 会构建同一 program。

## 3. 同类残留核对（逐处）

命令（`mammoth-agent`，排除 `node_modules`/`lib`/`.desktop-build`）：

| 命令 | 结果 |
|---|---|
| `grep -rn "\.value\.message" --include='*.ts' --include='*.tsx' packages apps` | 1 处 account 相关已删；仅 `packages/extensions/ui-cordis/src/client/index.ts:50,55`（`answered.value.message`，问答通道）与 `packages/feedback/message-feedback/tests/...:126`（`edited.value.messageId`），均与 account 结果无关 |
| `grep -rn "readErrorMessage"` | 0（旧 helper 已无引用） |
| `grep -rn "\.message" packages/client/ui-settings-account packages/credentials/deepseek-account{,-platform} apps/desktop/src` | 剩余均为无关用途：avatar 异常文案、`ground-billing.ts:78,101`（HTTP 原始 `message` 字段）、`AccountNotice.tsx:131`（bonus 通知文本）、`bonus-notices.ts:119`（去重比较）、`CloudHistoryDialog.tsx:136`（消息列表）、`ground-history.ts:146,155`（错误串前缀判断） |
| `grep -rn "signInWithPassword\|registerWithPassword\|signInWithSms"`（非 spec） | 消费方 4 处：`index.ts:328`（已修）、`account-controller:77-112` 纯透传、`apps/desktop/src/main.ts:1263-1279` / `welcome-window.ts:118-152` 只转发；无 `.message` 读取 |

结论：account 结果上的 `message` 读取已清零。

## 未验与原因

- **真实 GUI**：`clientTooOld` 文案在真实 Electron/Web 窗口的排版、深色模式未验；仅 jsdom 断言。无合法桌面自动化。
- **真实 Ground / 短信 / 真实 model**：未起服务、未发短信（按约束），`CLIENT_TOO_OLD` 用平台层类型 + mock 结果验证。
- **`tsc -b tsconfig.client.json` 实跑**：按要求不写 `lib/**` 产物，未执行。
- **`pnpm run verify-client-ui-i18n`**：命令仍失败，但报错全为既有中文硬编码（`RechargeDialog.tsx`、`AccountQuotaNotice.tsx`、`AccountSection.tsx`、`ground-billing.ts`），本轮新增/修改文件 0 命中，属预存在问题。
- **electron 构建 / 上传 / 公证**：按约束未执行。

## 剩余风险

1. 桌面密码登录的 `CLIENT_TOO_OLD` 现在正确显示「请更新版本」；若 Ground 未先上线该码，仍回落到 `credentialsFailed`/`loginUnavailable`（信息更泛，无中文泄漏）。
2. 包级 `typecheck` 脚本是**窄检查**，CI 仍只跑根 `typecheck`（`tsc -b`）；本次已确认 `tsc -b` 的 reference 图会覆盖该文件，但今后新增「被 `import type {}` 消除」的入口仍需按包补跑。
3. `SignInDialog` 未知拒绝键统一显示 `loginUnavailable`（不再原样渲染任意 message），行为变化已在用例中固定。

## 交接

- **秋池**：复验 `tsc -p packages/client/ui-settings-account/tsconfig.json`（0 error）、`tsc --noEmit -p tsconfig.client.json`（0 error）、包测试 9 failed/420 passed（同名基线）、`apply.client.spec.ts -t 'maps a rejected Desktop password'`。
- **浪哥**：复审 `password-failure.ts` 的键集合与 `SignInDialog` 兜底是否应共用同一类型（当前为手写三元）。
- **DeepSeek**：桌面 GUI 文案与真实 Ground 联调仍待真机/联调窗口。
