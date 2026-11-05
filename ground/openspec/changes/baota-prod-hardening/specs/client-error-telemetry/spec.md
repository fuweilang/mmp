# client-error-telemetry

## Requirement: client-error 遥测可达

### Scenario: 经 nginx 转发仍 200

- **Given** 桌面/Web 客户端经公网 nginx 访问生产（带 `X-Real-IP` / `X-Forwarded-For`，非 loopback）
- **When** `POST /api/client-error`（及与 client-log 一致策略的同源接口）
- **Then** 响应 200（在限流阈值内）
- **And** SHALL NOT 仅因「非 loopback」或「经反代」而 403

### Scenario: JWT-exempt + 限流

- **Given** 未携带用户 JWT 的最小合法 JSON body
- **When** POST client-error
- **Then** 仍可上报（JWT-exempt）
- **And** 超过限流时被拒绝（429 或产品约定），而非改回 loopback 门禁
