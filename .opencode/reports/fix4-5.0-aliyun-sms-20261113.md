# fix4 · Ground 短信通道支持阿里云（5.0）

时间：2026-11-13（America/Los_Angeles）
范围：Ground 后端 + infra 配置模板。未动 `.github/workflows`、`mammoth-agent/`、Grok 4 文件；未 commit/push、未重启服务、未读 .env/凭据、未真发短信。

## 结论
生产 `SMS_PROVIDER` 现支持 `tencent | aliyun`，沿用原 fail-closed 语义（缺失/mock/未知一律启动失败）；新增阿里云 SendSms（RPC HMAC-SHA1 签名），缺配置或通道失败统一 `SMS_UNAVAILABLE`，不回显凭据/原始响应。腾讯通道、限流、TTL、核销逻辑未改。

## 改动清单
| 项 | 状态 | 文件:line |
|---|---|---|
| provider 联合类型 + 生产 fail-closed 双通道 | 完成 | `ground/apps/backend/src/auth/sms.ts:73`、`:81` |
| 按 provider 列缺失键（只键名） | 完成 | `ground/apps/backend/src/auth/sms.ts:117` |
| 启动断言按 provider 分流 | 完成 | `ground/apps/backend/src/auth/sms.ts:153` |
| 阿里云签名/参数构造（RFC3986、HMAC-SHA1、SendSms 2017-05-25） | 完成 | `ground/apps/backend/src/auth/sms.ts:211-283` |
| 阿里云发送 + 成功判定（2xx 且 Code=OK）+ 错误折叠 | 完成 | `ground/apps/backend/src/auth/sms.ts:285-330` |
| 发送门控改为 provider!=mock，按 provider 选默认通道 | 完成 | `ground/apps/backend/src/auth/sms.ts:386` |
| `--runtime` 支持 aliyun、`--template` 声明 ALIYUN_* | 完成 | `ground/infra/production/check-sms-env.mjs:34-120` |
| env 模板补 ALIYUN_* 占位符（provider=aliyun） | 完成 | `ground/infra/production/production.env.example:13-33` |
| 新增阿里云单测（签名向量/请求体/桩 HTTP/失败路径/启动断言/环境隔离） | 完成 | `ground/apps/backend/test/auth/aliyun-sms.unit.test.ts` |
| test:auth 纳入新用例 | 完成 | `ground/apps/backend/package.json:14` |

## 验证（实际命令/结果）
| 命令 | 结果 |
|---|---|
| `pnpm --filter @mammoth/backend test:auth` | 51 tests / 51 pass / 0 fail（含新增 15 条阿里云用例；腾讯与 startup 全绿） |
| `npx tsc -p tsconfig.build.json --noEmit`（apps/backend） | exit 0 |
| `npx tsc --noEmit -p tsconfig.json`（含测试） | 45 个错误全部在既有无关文件（knowledge-core/library/official-skill 测试），auth/src 0 错误 |
| `node check-sms-env.mjs production.env.example --template` | ok，exit 0 |
| `node check-sms-env.mjs <tmp ok.env(aliyun)> --runtime` | ok，exit 0 |
| aliyun 缺 secret → runtime | 失败并只输出 `ALIYUN_SMS_ACCESS_KEY_SECRET`，exit 1 |
| `SMS_PROVIDER=mock` / `huawei` → runtime | 失败：必须是 tencent 或 aliyun，exit 1 |
| tencent 缺凭据 → runtime | 失败并列出 TENCENT_* 键名，exit 1 |
| 签名固定向量 | `POST&%2F&…` + HMAC-SHA1(test-secret&) = `/MCntR8N55Bk0wVLpuaUSCkgY+s=` 钉死 |

单测内 HTTP 全为桩（`AliyunHttpPost` 注入 / 临时替换 `globalThis.fetch`），无真实短信、无网络。

## 未验与原因
- PeecAI `aliyun-sms.client.ts` / `auth.constants.ts` 只读参考**未读到**：`external_directory` 权限被拒。实现按阿里云官方 RPC 规范（Action=SendSms、Version=2017-05-25、HMAC-SHA1、Code=OK 判成功）落地，签名/参数名/成功判定语义对齐，但**未逐行对照 PeecAI**。
- 未对真实阿里云网关发起请求（禁止真发短信/无凭据），生产首次发码需实测。
- 未跑 release.sh 全链路与宝塔发布（禁用部署）。

## 剩余风险
- 生产 env 模板默认改为 `SMS_PROVIDER=aliyun`；若某环境仍走腾讯，部署前需把 provider 改回 `tencent`（两套键都在模板里，check-sms-env 按 provider 校验）。
- 阿里云 `RegionId` 默认 `cn-hangzhou`、Endpoint 默认 `https://dysmsapi.aliyuncs.com/`；如账号要求其他区域需显式配。
- 阿里云模板变量名默认 `code`，与模板实际占位符不一致时会报 `isv.*` 并折叠为 `SMS_UNAVAILABLE`（不泄露细节）。
- `SMS_UNAVAILABLE` 对用户可重试，但通道侧错误不落日志内容（防泄露），排障需借助阿里云控制台。

## 交接
- 秋池：跑 `pnpm --filter @mammoth/backend test:auth`、`check-sms-env --runtime` 于真实生产 env（只读键名）；生产首条验证码为真实测试点。
- 浪哥：复审签名实现（`sms.ts:211-330`）与 fail-closed 分流（`:81`、`:153`）。
