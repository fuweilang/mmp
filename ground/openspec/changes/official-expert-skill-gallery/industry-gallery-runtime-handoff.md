# 行业分类运行产物同步交接

- 数据：上一批 39 + 新增 76 = 115；本轮不访问或修改 DB。
- UI：现有 `dev:web --poll` 正在监视广场 UI，`lib/client.js` / `.map` 已于 2026-11-07 00:17:39 Asia/Shanghai 自动更新，包含效率工具、财税法务、人力行政、电商经营等一层分类；只展示实际有技能的类别。未另开 UI bundle 以免与 watcher 竞争。
- Host：原 `lib/index.js` 仍是旧版；现仅在 `packages/preset/official-agent-gallery` 执行 `pnpm exec tsdown`，20ms 完成。直接使用 watcher 已更新的 `lib/types`，未运行 package 的递归 `prebundle: tsc -b --force`。
- 新 Host 请求：`GET /api/official-skills?taxonomy=industry`，不是 Admin `/admin/api`。当前 Ground `dist/official-skill/official-skill.service.js` 和 DTO 已有 industry 分支。
- 网关：`ground/scripts/dev-gateway.mjs` `/api/*` → Nest :3100，不改 query；因此 industry 参数不会被吞。Admin `/admin/api/*` → `/api/admin/*` 为独立路径。
- 兼容：无 taxonomy 的旧客户端仍得到原四类；新 Host 显式 opt-in 后收到实际行业分类。专家/技能来源和会话行为不改。
- 当前磁盘没有找到名为 `public-api-base` 的源码/文件，本轮不改 API 基址与其他 agent 的 WIP。
- 用户可刷新 Web 终端查看；若现有 Host 进程已缓存旧 ESM，请双击本地 DevHost 刷新/重启使其重新载入。此处没有替用户操作 UI 或重启服务，不能声称界面已验收通过。
- 本轮直接写入：`mammoth-agent/packages/preset/official-agent-gallery/lib/index.js`、本交接文档、资产目录 `IMPORTED-SKILLS.md` 的运行说明。未做测试、E2E、浏览器、QA、全量构建、commit、push、发布。
