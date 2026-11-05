# Integration（ground ↔ Octop）

中台（本仓库 `ground`）与智能体运行时（sibling 仓库 `../Octop`，原 Octop）本地联调约定。

## 布局

```
platform/
  ground/   # 猛犸中台（本仓库）
  Octop/    # Octop 白标 fork（sibling）
```

Agent 不在本仓库内；`package.json` 的 `octop`（合并）/ `dev:octop` / `dev:agent` 通过 `../Octop` 调用。

## 本地端口

| 服务 | 端口 | 说明 |
|---|---|---|
| Gateway | **5201** | 浏览器唯一入口 `http://127.0.0.1:5201` |
| Mid API | **3100** | NestJS `@mammoth/backend` |
| Mid Web | **5202** | Vue `@mammoth/frontend` |
| Octop | **8088** | Agent 运行时（`../Octop`） |
| Agent dashboard | **5203** | Octop dashboard Vite（`../Octop/dashboard`） |

## OIDC

- Issuer：`http://127.0.0.1:5201/console/api/oidc`
- `octop` / `dev:octop` 会注入：`OCTOP_MAMMOTH_OIDC_ISSUER=http://127.0.0.1:5201/console/api/oidc`

## 启动顺序（建议）

1. `pnpm db:up`（如需）
2. `pnpm dev`（或拆开 api/web/gateway）
3. `pnpm octop` 或在 Octop 目录 `./dev`
4. 浏览器只开 gateway：**http://127.0.0.1:5201**
