# pay-secrets-mount

## Requirement: real 支付依赖 secrets 挂载

### Scenario: 生产 real 模式

- **Given** `PAY_PROVIDER=real`
- **When** api 容器启动或支付渠道探测
- **Then** 必须挂载 `./secrets:/app/secrets:ro`（或等价路径）
- **And** 支付宝/微信相关 PEM（或现行文件名通配）齐全
- **And** 渠道状态可显示为已配置（configured），而非因缺文件导致的运行时崩/静默失败

### Scenario: 本地默认 mock

- **Given** 本地开发环境
- **When** 未显式配置 real 支付
- **Then** 默认 `PAY_PROVIDER=mock`（或等价），不强制宿主机 PEM
- **And** 文档/Skill「本地 vs 生产差异」与此一致
