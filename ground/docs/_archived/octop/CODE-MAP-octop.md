# Octop 代码地图

> 生成：2026-10-22。实测数据（find/wc）。仓库根已有很详细的 `AGENTS.md`（分层边界 + 命令 + 模式），**先读它**；本文补它没展开的实现级地图，并标出它与代码的偏差。

## 0. 一句话

腾讯云开源的自托管 AI 助理平台（多用户 + 多 Agent）：单 Python wheel = FastAPI 后端 + React(Vite) dashboard + Click CLI，单进程无外部队列，SQLite(WAL) 或 PostgreSQL 双后端，LLM 运行时靠外部包 `octop-harness`(LangGraph) / `octop-gateway`(IM 渠道) / `octop-browser`。

## 1. 仓库坐标

| 项 | 值 |
|---|---|
| 路径 | `agentPlatform/Octop` |
| HEAD | `dd9dce47` 2026-10-18 `Merge PR #2184 release/1.0.2` |
| 分支/远端 | `main` → `github.com:TencentCloud/Octop` |
| 版本 | `pyproject.toml:7` + `src/octop/__init__.py:7` = **1.1.0**（两处手工同步） |
| tracked 文件 | 4,056 |
| 后端 | `src/octop/` **692 个 .py / 159,149 行**（infra 520/119,029；api 108/32,025；cli 47/6,372；i18n 13/905） |
| 前端 | `dashboard/src/` **1,286 文件 / 241,859 行**（pages 697/186,488） |
| 测试 | 527 个 test 文件（unit 444 / integration 77 / live 6） |
| 本地改动 | **8 个文件，+208/-208**，全是 `Octop` → `猛犸AI` 品牌替换（见 §2） |

## 2. ⚠️ 本地未提交改动 = 半成品，明天第一件事先修

意图是白标/汉化到「猛犸AI」，但 find-replace 波及了 **3 个 i18n key 的名字**，而代码侧引用没同步 → 界面会露裸 key：

| 被改名的 key（en/zh 同步改，所以 parity 测试仍绿） | 引用处（未同步） |
|---|---|
| `common.askOctopHint` → `common.ask猛犸AIHint` | `dashboard/src/pages/Settings/Models/components/LayaLocalInstall.tsx:281`（无 fallback，直接显示裸 key） |
| `common.copyErrorForOctop` → `common.copyErrorFor猛犸AI` | `dashboard/src/pages/Admin/Storage/DockerEnvFooter.tsx:222`（无 fallback） |
| `storage.dockerEnv.sectionOctop` → `storage.dockerEnv.section猛犸AI` | `dashboard/src/pages/Control/RemoteDesktop/DesktopPanel.tsx:843,860`、`dashboard/src/pages/Control/RemoteBrowser/index.tsx:1102,1115`（有硬编码中文 fallback，但文案仍写 Octop） |

其余改动（正常）：`dashboard/index.html`(title/apple title)、`public/manifest.json`(name/short_name)、`public/offline.html`、`src/layouts/Sidebar.tsx`(logo alt)、`src/pages/{Login,Setup}/index.tsx`(alt)、`src/locales/{en,zh}.json`(约 100 处 value)。

**处理原则**
1. 把 3 个 key 名改回原名、只换 value（或同步 6 处 `t()` 调用）；改 key 前必须全库 grep。
2. **只动 value，不动 key** —— 上游 `sync-main-to-develop` 会持续合，locales 大面积冲突不可避免，改名会让冲突更痛。
3. `src/octop/i18n/{en,zh}.json` 零改动 → 服务端文案（错误消息、工具名、斜杠命令回复）仍说 Octop，需要时一并品牌化。
4. **不要动**内部标识：`auth_token`、`octop:active-agent`、antd `prefixCls="octop"`、`octop-boot` DOM id、`octop:*` 事件名（改了会登出/样式崩）。
5. `make build-frontend` 只重写 `src/octop/dashboard/` 产物（gitignore + `emptyOutDir`），**不会覆盖**你的源码改动；但产物绝不手改。

## 3. 怎么跑

```bash
make install-hooks        # 每次 clone 一次：core.hooksPath=.githooks（commit 会跑 make all + dashboard build）
uv sync                   # 装依赖（含 dev group）；永远 uv run pytest，不要裸 pytest
uv run octop init         # 建 ~/.octop + 管理员
uv run octop run          # 前台起服务，默认 127.0.0.1:8088
cd dashboard && npm ci && npm run dev    # Vite dev 5173，/api 代理 → 127.0.0.1:${VITE_API_PORT|8088}（ws:true）
make all                  # 出货标准：format-all + lint + typecheck(mypy --strict) + test
uv run pytest -m "not live"
cd dashboard && npx tsc -b && npm run lint && npm test     # CI 不跑前端，必须手动
make build-frontend       # dashboard/ → src/octop/dashboard/（emptyOutDir 全清重建）
docker compose -f docker/docker-compose.yml up -d          # 单服务 octop:8088，卷 ~/.octop:/data/.octop
docker compose -f docker/docker-compose.postgres.yml up -d # 本地 PG（pgvector/pgvector:pg16, 5432, octop/octop）
```

数据目录 `~/.octop`（`OCTOP_HOME` 可改），布局见 `infra/utils/paths.py:PathLayout`：`octop.db`、`config.json`、`logs/octop.log`、`users/<username>/`、`agents/<agent_id>/`（workspace）、`expert_market/`、`published_experts/`、`skill_packages/`、`knowledge/`、`plugins/`、`tool_guard_rules/`、`backups/`、`ssl/`、`connector_cli/<kind>/<instance_key>/`、`user_avatars/`、`role_avatars/`。另有 `history_v2.sqlite`（分段历史归档，见 §4）。

## 4. 后端：启动链路（逐跳）

`octop run` → `cli/run_cmd.py` → `launch.run_foreground_blocking` → **`launch.py:57 run_foreground()`**：

1. `OctopServer()`（`infra/server.py:319`：`PathLayout.from_env()`、`WizardTokenStore(ttl=300)`）
2. `await srv.start()`
3. `_schedule_linux_bubblewrap_ensure()`（Linux 后台准备 bwrap 沙箱，degraded 只告警）
4. `resolve_tls_paths(srv.paths.root, cfg.tls)` + `build_listen_plan()`（TLS 双端口模式 → 强制 `workers=1` 且禁 reload）
5. `build_app(srv)` → uvicorn `Server`s（HTTPS 时用 `https_config`；另有 `build_http_companion_app` 做 80 端口 ACME/跳转伴随服务）

**`OctopServer.start()`（`infra/server.py:397`）真实顺序**：
`paths.ensure_root()` → `ensure_cli_path()`（把 `~/.npm-global/bin` 加进 PATH，供 wecom-cli/lark-cli 连接器探测）→ `apply_env_file(env_file_path(root))` → `_setup_logging()`（自研 TimedRotating + 100MiB size rollover + delaycompress，文件名 `octop.YYYY-MM-DD.log`）→ `ensure_nofile_limit()` → `install_safe_grep_fallback()` / `install_shell_output_decoding()` → `ensure_mobile_capabilities_probed(config)` → `ExpertCatalog(default_library_root(), extra_roots=[paths.expert_market_dir]).refresh()` → `SubagentCatalog(default_package_root()).refresh()` → `PluginManager(paths.plugins_dir, paths.config).seed_bundled()` + `.load_installed(install_deps=True)` → `_apply_plugin_channels()` → 记 `_started_at`
→ **`should_defer_control_plane_db(config, paths)` 为真则直接 return**（首启向导未选后端时，控制面 DB 延后；只发向导口令）
→ `open_database(config, paths)` → `run_migrations(db)` → `build_shared_services(db, paths, config)` → `auth.captcha.boot_from_services(settings_repo, secret_repo)` → `_ensure_jwt_secret()` → `_boot_runtime(config)` → `_emit_wizard_password(user_count)`

**`_boot_runtime()`（:485）装配顺序**（这就是全局单例图）：
`configure_browser_idle_timeout` → `AgentManager(repos, paths, config, expert_catalog, plugin_manager)` → `TrajectoryStore(trajectory_event_repo)`；若 `history_v2_enabled` 或 `history_v2.sqlite[.required]` 存在 → `HistoryArchive(HistoryStore(archive_path, identity=主库路径), thread_message_repo, trajectory_event_repo)` + `ArchiveTrajectoryStore`（**分段历史目前要求 SQLite 控制面**，PG 会 `ValueError`）→ `TrajectoryService(store, TrajectoryLiveBus())` → `Gateway(agent_manager, repos, trajectory_service, history_archive)` + `await gateway.boot()` → `gateway.set_slash_meta(version, started_at)` → `CronDeliveryService(gateway, agent_manager, repos)` → `CronManager(gateway, delivery_service, repos, timezone).boot()` → `install_auto_renewal_job(cron_mgr, paths)`（TLS 续期挂进 cron）→ `install_auto_backup_job(cron_mgr, server)` → `registry.set_cron_manager / set_team_processor(gateway.processor.teams) / set_hitl_session_store(gateway.processor.hitl_coordinator.session_policies)`（+`replace_repo(thread_repo)`）→ `ProactiveCareService` + `ProactiveCareScheduler` → `registry.set_proactive_scheduler` → **`await registry.boot()`** → `registry.schedule_idle_reclaim_sweep()` → `gateway.refresh_media_backends()` → `UserManager(services).boot()` → `proactive_scheduler.start_all()` → `BridgeManager(bridge_repo, secret_repo, user_repo, advertise_base_url, token_signer=_sign_user_token)` → **`AppRuntime(agent_registry, gateway, cron_manager, user_manager, proactive_scheduler, trajectory_service, history_archive, bridge_manager)`** → knowledge 依赖缺失告警（local embedding / OCR）→ `resume_pending_index_jobs(services)` → `asyncio.create_task(_resume_bridges(), name="bridge-auto-resume")`

`bind_control_plane()`（:457）= 首启向导选好 DB 后再走 open_database → migrations → services → captcha → jwt → `_boot_runtime`；`rebind_control_plane` 仅在 `user_count == 0` 时换库。

**`api/app.py:101 build_app(server)`**：`FastAPI(title="Octop API", version="0.1.0", openapi_url="/api/openapi.json" if enable_api_docs, openapi_tags=OPENAPI_TAGS)` → `configure_openapi` → `app.state.octop_server = server` → `_install_exception_handlers` → CORS（仅当 `cfg.cors_origins`，`expose_headers=[X-Octop-Access-Token]`）→ **`install_bridge_proxy` → `install_jwt_auth` → `install_setup_lockdown`**（Starlette 后加的先执行，所以 bridge proxy 写在最前才能拿到 `request.state.octop_user`）→ `bridge_manager.bind_asgi_app(app, peer_turn_runner=prepare_peer_dashboard_turn, peer_browser_runner=run_browser_stream_session)` → `GET /.well-known/acme-challenge/{token}` → `_mount_routers`（**64 个 mount**）→ `enable_mobile` 时挂 mobile → `enable_api_docs` 时挂 `/api/docs`(Scalar) → `enable_dashboard` 时静态挂 `src/octop/dashboard/`。

## 5. infra/ 规模与职责（实测）

| 子包 | 文件 | 行 | 要点 |
|---|---|---|---|
| `agents/` | 176 | 46,357 | `manager.py`(**4,187 行，Agent 生命周期核心**) + `experts/`(catalog.py 961、skillhub_market.py 1,355、library/ 内置专家含脚本) + `teams/team_manager.py`(2,384) + `providers/ settings/ workspace/ threads/ memory/ subagents/ persona/ security/ middleware/ builtin_skills/ conversation_mode.py` |
| `gateway/` | 59 | 13,857 | `gateway.py`(Gateway 类)、`process/processor.py`(**1,835 行，IM 消息处理主链**)、`slash/`(dispatcher/catalog/parser/runner/handlers/{composite,hitl,memory,platform,session})、`hitl/`、`media/`(tool_media.py 944)、`steer/`、`ws/`、`threads.py`、`plugin_channels.py`、`history_backfill.py`、`channels/`(**只有 dingtalk_registration.py + qr_bind.py**，真正的 channel 实现在外部包 `octop_gateway.channels`，本仓只 re-export `ChannelKind`)、`bot_creators/`(feishu_bot_creator/feishu_runner/yuanbao_bot_creator) |
| `connectors/` | 47 | 9,732 | `catalog.json`(内置连接器元数据 + i18n)、`catalog.py`、`builder.py`、`service.py`、`crypto.py`(凭据加密)、`oauth/`、`gateway/`(含 `cli_install.ensure_cli_path`)、`custom_mcp.py`、`mcp_tool_cache.py`、`probe.py`、`qcc.py`、`mail_servers.py`、`default_open.py` |
| `db/` | 35 | 8,854 | `migrate.py`(**2,110 行**，迁移 + SQLite 无法用 ALTER 表达的重建 helper，必须幂等)、`services.py`(`SharedServices`/`RepoBundle`)、`repos/`(**26 个 repo** + `_base.py`)、`migrations/`(**42 个 sql = 21 版 × {sqlite, pg}**) |
| `utils/` | 34 | 4,838 | `paths.py`(PathLayout)、`locale.py`(resolve_user_locale/resolve_request_locale)、`env_file.py`、`ulid`、`bwrap.py`、`host_dirs.py`、`browser_media.py`、`accept_errors.py` |
| `bridge/` | 10 | 3,778 | `manager.py`(**2,552 行**) Octop↔Octop 实例桥；`transport.py`(BRIDGE_WS_MAX_BYTES) |
| `auth/` | 26 | 3,585 | `tokens.py`(sign_token JWT)、`captcha.py`、`sso/service.py`、`ldap/`(service + throttle) |
| `skills/` | 12 | 3,337 | `skills_hub.py`(1,493) SkillHub HTTP 客户端、skill 包安装/校验 |
| `setup/` | 15 | 3,331 | `service.py`(963) 首启向导、`self_update.py`(1,181)、`tls/`(store/listeners/renewal/challenge/http_companion)、systemd 服务安装 |
| `history/` | 17 | 2,683 | `service.py`(HistoryArchive)、`store.py`(HistoryStore)、`projection.py`(turn 投影)、`trajectory/{store,service,live}.py`、`trajectory_compat.py` |
| `backup/` | 9 | 2,396 | `auto.py`(install_auto_backup_job) + 打包/恢复 |
| `knowledge/` | 17 | 2,325 | 知识库索引作业 `jobs.py`(resume_pending_index_jobs)、`gate.py`(本地 embedding 依赖闸)、`ocr.py` |
| `users/` | 11 | 2,290 | `UserManager`、角色、argon2 口令哈希 |
| `backend/` | 12 | 2,091 | workspace 存储适配：`resolver.py`(从 agent 配置解析 harness `BackendProtocol`)、`adapter.py`、`probe.py`(远端快速列树)、`grep_safety.py`、`shell_output.py`；Docker sandbox 用 `sandbox_scope`+`sandbox_prefix`(默认 `octop_sandbox`) |
| `desktop/` | 5 | 1,919 | **远程桌面功能**（与仓库根 `desktop/` 的 Wails 壳无关）；`setup.py` 1,069 |
| `mobile/` | 10 | 1,885 | 远程安卓（Redroid）能力探测与流 |
| `cron/` | 7 | 1,445 | `manager.py`/`job.py`/`delivery.py`；调度基于 **APScheduler 3.x**（`apscheduler>=3.10,<4`） |
| `voice/` | 5 | 1,113 | TTS（edge-tts）+ voice_providers |
| `proactive/` | 4 | 913 | 主动关怀推送（ProactiveCareService/Scheduler） |
| `browser/` | 2 | 550 | 浏览器会话胶水（Playwright 主体在 `octop-browser`/harness） |
| `agent_mcp/` | 3 | 516 | 把 Agent 暴露成 MCP server |
| `errors.py` / `metrics.py` / `server.py` | — | 810(server) | `OctopError`/`ErrorCode`；`METRICS` 计数器（**热路径懒导入**防循环）；`OctopServer` |

**最大的 15 个文件（改动热点）**：`agents/manager.py` 4187 · `agents/experts/library/clinical-learning-subscription/scripts/clinical_profile.py` 2608 · `bridge/manager.py` 2552 · `agents/teams/team_manager.py` 2384 · `db/migrate.py` 2110 · `gateway/process/processor.py` 1835 · `api/routers/skills.py` 1607 · `api/routers/connectors.py` 1598 · `skills/skills_hub.py` 1493 · `agents/experts/skillhub_market.py` 1355 · `setup/self_update.py` 1181 · `api/routers/channels.py` 1108 · `agents/experts/library/wechat-ops/skills/publisher-multi-platform/scripts/wechat_publish.py` 1097 · `desktop/setup.py` 1069 · `api/routers/chat/serialize.py` 1048

## 6. HTTP API 面

`api/routers/` = **58 个单文件 + 4 个子包**（`browser/{env,harness,record_replay,stream,uninstall}`、`chat/{routes,ws,sse,history,turn,trajectory,models,notify_ws,serialize}`、`desktop/{install,settings,status,stream,uninstall}`、`mobile/{install,shell_ws,status,stream}`）。挂载表在 `api/app.py:224-305`（前缀 + tag）：

| 前缀 | router | tag |
|---|---|---|
| `/api` | setup、preferences、i18n、agent_tools、acp、agent_mcp、chat、slash、connectors、bridge、knowledge_bases、internal_mcp、channels、cron、settings、decision、envs、search、mbti、experts、teams、workspace、agent_files、memory、memory_portable、memory_storage、proactive_care、usage、skill_packages、skills、subagents、terminal、uploads、update、browser、desktop、ollama_models、onnx_models、plugins | 各自 |
| `/api/auth` | auth、auth_oidc、auth_oauth、auth_ldap；`/api/auth/invite` = invites.public_router | auth |
| `/api/health` | health | health |
| `/api/users`、`/api/users/invites`、`/api/users/roles` | users、invites.admin_router、user_roles | users |
| `/api/agents` | agents | agents |
| `/api/providers`、`/api/voice` | providers、voice | providers / voice |
| `/api/admin`、`/api/admin/providers`、`/api/admin/voice/providers`、`/api/admin/observability`、`/api/admin/media-generation`、`/api/admin/tls`、`/api/admin/security`、`/api/admin/storage-backends`、`/api/admin`(backup、usage.admin_router) | admin、providers.admin_router、voice.admin_router、observability、media_generation、tls、security、storage_backends.admin_router、backup | admin/observability/tls/security/providers |
| `/api/storage-backends`、`/api/filesystem` | storage_backends.user_router、filesystem | storage-backends / filesystem |
| `/api`（条件） | mobile（`enable_mobile`） | mobile |

鉴权：JWT（`api/deps.py` 取 `current_user`/`get_server`，`api/middleware/jwt_auth.py` 网关；secret 存 `secrets` 表 key=`jwt`，`access_token_ttl_seconds` 默认 86400）；**滑动续期**靠响应头 `X-Octop-Access-Token`；首启锁定 `api/middleware/setup_lockdown`；错误映射 `api/errors.py`（`OctopError` → status + `{error:{code,message,details}}`，message 走 `to_envelope(locale)` 本地化）。
Agent 作用域：绝大多数走 URL `/api/agents/{agent_id}/…`，少数遗留（MBTI）读 `X-Octop-Agent-Id`；每个 handler 必须 `_assert_agent_owner(row, user)`（admin 可绕）。
流式端点：**WS** `/api/agents/{id}/chat/ws?token=`（主聊天）、`/api/notifications/ws`、mobile `shell_ws`；**SSE** chat `hitl/resume`、`chat/sse.py`、`trajectory`、`desktop/stream`、`browser/stream`、`decision`、voice(`requestStream`)。
API 文档：`enable_api_docs`（默认 **False**）时开 `/api/openapi.json` + `/api/docs`(Scalar)；tag 与介绍文案在 `api/openapi_meta.py`。

## 7. 数据层

- 双后端同一套 schema：SQLite（同步 `sqlite3` + WAL，在 asyncio 里靠 `run_in_executor`/`SqlitePool`）或 PostgreSQL（`psycopg` + `psycopg_pool`）。选择由 `config.json` → `database.driver`（env `OCTOP_DATABASE_DRIVER` / `OCTOP_DATABASE_URL`）。
- **迁移**：`infra/db/migrations/00N_desc.sql` + `00N_desc.pg.sql` 成对；当前 **v21**（`021_skill_package_download`）；改完必须同步 `tests/unit/db/test_db_pool.py:102,226` 的 `assert v == 21`。SQLite 表达不了的重建放 `infra/db/migrate.py` 的 helper，**必须幂等**；未发布的 schema 改动折进当前未发布的 `00N`，不要新开号。
- **表（33 个名字，含重建用的 `users_new`）**：`_schema_version`、`agents`、`audit_log`、`bridge_connections`、`care_push_records`、`channels`、`connector_oauth_states`、`connectors`、`cron_jobs`、`knowledge_base_members`、`knowledge_bases`、`knowledge_documents`、`proactive_care_config`、`providers`、`published_experts`、`secrets`、`sessions`、`settings`、`skill_packages`、`sso_login_states`、`sso_providers`、`storage_backends`、`thread_history_projection`、`thread_messages`、`threads`、`trajectory_events`、`usage_log`、`user_invites`、`user_policies`、`user_role`、`user_sso_identities`、`users`、`voice_providers`
- **repo 约定**：一表一 repo（`infra/db/repos/`，26 个）；资源表双主键 —— 整型 `id` 内部用，公开字符串 `{entity}_id`(ULID) 对外，子表 FK 存**字符串** id；repo 把 `row.id` 映射成公开字符串、整型留 `row.pk`。例外（不要强套）：`users`(整型 user_id)、name-keyed 配置表(`providers`/`voice_providers`/`storage_backends`)、append-only 日志(`usage_log`/`audit_log`/`care_push_records`)、KV(`settings`/`secrets`)、1:1 扩展(`proactive_care_config`)、临时行(`sso_login_states`)。
- 访问入口只有 `server.services.*_repo`（`SharedServices`/`RepoBundle`，`infra/db/services.py`）；**router 不许直接 import `infra/db/repos/*`**。

## 8. 配置面

`src/octop/config.py`（57 个字段，dataclass）：`OctopConfig` 顶层 = `bind_host`(127.0.0.1)、`port`(8088)、`log_level`(info)、`access_token_ttl_seconds`(86400)、`login_max_attempts`(5)、`login_lockout_seconds`(900)、`cors_origins`([])、`default_timezone`(**Asia/Shanghai**)、`enable_dashboard`(True)、`enable_api_docs`(False)、`require_setup_password`(True)、`database`、`database_in_file`、`tls`、`backup`、`capabilities`(.mobile)、`max_upload_mb`、`browser_idle_timeout_minutes`、`history_v2_enabled`。
子配置：`DatabaseConfig`(driver/sqlite_path/host/port/database/user/password/url)、`TlsConfig`(enabled/mode/domains/cert_file/key_file/issued_at/expires_at/acme_staging/http_port=80)、`BackupConfig`(auto_enabled/schedule=`cron:0 4 * * *`/retention_count=7/include_{config,workspaces,skill_packages,plugins,knowledge}=True/include_chats=False)、`MobileCapabilities`(enabled/backend/probed_at/reason)。
环境变量前缀 `OCTOP_`：`BIND_HOST PORT LOG_LEVEL ACCESS_TOKEN_TTL LOGIN_MAX_ATTEMPTS LOGIN_LOCKOUT_SECONDS CORS_ORIGINS DEFAULT_TIMEZONE(旧 CRON_TIMEZONE) ENABLE_DASHBOARD ENABLE_API_DOCS ENABLE_MOBILE REQUIRE_SETUP_PASSWORD MAX_UPLOAD_MB BROWSER_IDLE_TIMEOUT_MINUTES HISTORY_V2_* DATABASE_{DRIVER,SQLITE_PATH,HOST,PORT,NAME,USER,PASSWORD,URL} BACKUP_* `。
**时区规则**：用户可见时间与 cron 默认一律用服务端 `default_timezone`，不是浏览器时区；前端用 `useServerTimezone()` + `formatServerDateTime/formatMessageTime(..., timeZone)`，禁止裸 `toLocaleString()`。语言**不是** config 键（解析链：用户偏好 → `Accept-Language` → 渠道提示 → DEFAULT_LOCALE）。

## 9. 外部依赖（本仓不含实现，改功能前先看是哪一层）

`octop-harness[all]>=1.0.4`(LangGraph agent 运行时 + `BackendWorkspace` + `plugins.PluginManifest`)、`octop-gateway>=1.0.3`(IM 渠道 `ChannelKind`、`MessageEvent.tool_start/end` 读 `tool_hint_text`)、`octop-browser>=1.0.0`(浏览器自动化)、`octop-memory>=1.0.2`(记忆)；另有 `langchain-core>=1.4.8`、`langgraph-checkpoint-postgres`、`mcp>=1.9,<2`、`apscheduler>=3.10,<4`、`playwright`、`lark-oapi`、`acme`+`josepy`(Let's Encrypt)、`argon2-cffi`、`pyjwt`、`cryptography`、`boto3`、`scalar-fastapi`、`edge-tts`、`segno`、`websockets`、`ldap3`、`firecrawl-anydoc`、文档解析 `pypdf/python-docx/python-pptx/openpyxl/xlrd/pillow/pypinyin`。
extras：`browser`(playwright)、`desktop`(mss/pynput)、`local-embedding`(fastembed/onnx)、`knowledge-ocr`(rapidocr+onnxruntime+pymupdf)、`dev`。
**Agent workspace 内容文件读写一律走 `HarnessAgent.workspace`（harness 的 `BackendWorkspace`）**，不要直接用 `agent.backend`/`resolve_harness_backend`/`Path.write_text`，也不要在 Octop 侧按 backend 类型或 `virtual_mode` 分支（路径规则属于 harness）。系统级文件在 `{workspace}/.octop/`（sessions/sqlite、skills、agents、`auth/`），旧 Agent 是 `{workspace}/.octop-auth`。三个入口：HTTP `api/common/workspace.py:require_running_workspace()`、网关 `infra/gateway/process/agent_resolve.py:harness_workspace_for_agent()`、启动播种 `agent.workspace`（`_start_agent` 之后）。路径传 workspace 相对路径；`"."` 与 `"/"`（backend 根）语义不同；dashboard 可能发前导 `/`，由 `workspace_api_path()` 归一化。聊天附件落 `{workspace}/inbound/`（`api/common/attachments.py` + `api/routers/uploads.py`）。

## 10. 新增功能的落点清单

**加一个 IM channel**：渠道实现本体在外部包 `octop-gateway`（本仓 `infra/gateway/channels/` 只有 `dingtalk_registration.py`、`qr_bind.py`）。本仓要动：`infra/gateway/gateway.py`(注册/boot/reload) → 配置面 `api/routers/channels.py`(1,108 行) + `channels` 表 repo → 需要扫码绑定的加 `channels/qr_bind.py` 分支 → 需要建 bot 的加 `infra/gateway/bot_creators/*_bot_creator.py`（参考 `feishu_bot_creator.py` + `feishu_runner.py`）→ 第三方 channel 插件走 `kind=channel` + `infra/gateway/plugin_channels.py:apply_plugin_channels`（文档 `docs/plugin-channels.md`）→ 文案 `src/octop/i18n/{en,zh}.json` 的 `channel.*` + `domains/channel.py`（`channel_tool_hint_start/end`）→ 前端 `dashboard/src/pages/Agent/Channels/components/ChannelDrawer.tsx`(1,946 行) + `api/modules/channel.ts` + locales。**IM 侧工具名/提示必须在 `stream_project.py` 本地化**（传 `tool_name` + 预格式 `tool_hint_text`）。

**加一个 HTTP 端点**：`api/routers/<res>.py` 新建或扩（Pydantic 请求/响应模型 + `summary`/`description` + `response_model`，别返回裸 dict）→ `api/app.py:224` 的 `_RouterMount` 列表加一行（前缀 + 复用 `api/openapi_meta.py` 的 tag）→ 业务写进 `infra/`（router 只做校验/调用/错误映射）→ 需要新错误语义就加 `infra/errors.py:ErrorCode` + `src/octop/i18n/{en,zh}.json` 的 `errors.<CODE>` + `dashboard/src/locales/{en,zh}.json` 的 `apiErrors.<CODE>`（**前后端 key 必须成对，有测试**）→ agent 作用域端点记得 `_assert_agent_owner` → 改完看一眼 `/api/docs` 渲染是否正常。

**加一个 agent 工具/插件**：插件目录 + `plugin.yaml`（`id/version/name/description/icon/kind(tool|skill|hook|channel)/entry(main.py)`，可选 `group`、`ui:{entry,manifest}`）→ 内置市场放 `infra/agents/plugins/bundled/<id>/`（现 **29** 个），开发者示例放仓库根 `plugins/`（6 个 demo：demo-toolkit/demo-greeting-skill/demo-turn-logger/demo-ui-card/bilibili-anime/server-status；**根目录不被服务端扫描**，靠 `octop plugin install ./plugins/demo-toolkit --force` 装到 `~/.octop/plugins`）→ 加载在 `infra/agents/plugins/manager.py`（`_read_plugin_yaml():146`、`PluginManifest.load():345/418/463/498`、`default_bundled_plugins_root:322`）→ HTTP 面 `api/routers/plugins.py` → 带 UI 卡片的在前端 `dashboard/src/plugins/toolRenderers/`（`loader.ts` 用带鉴权 fetch + blob URL 动态 import ESM；大 payload 旁路见 `docs/octop-ui-payload-offload.md`）。

**加一张表**：`infra/db/migrations/00N_desc.sql` + `00N_desc.pg.sql` 成对（未发布就折进当前 00N）→ 需要重建则加 `infra/db/migrate.py` 幂等 helper → `infra/db/repos/<x>.py` 新 repo（遵守双主键约定）→ 在 `infra/db/services.py` 的 `RepoBundle`/`SharedServices` 注册 → 业务 service 放 `infra/<域>/` → bump `tests/unit/db/test_db_pool.py` 的版本断言 → `uv run pytest tests/unit/db -q`。

**加一个 CLI 命令**：`cli/commands/<x>.py` + 在 `cli/registry.py` 注册（`cli/main.py:115 def cli` 是 Click 根，带 `--user/--agent/--json`，由 `cli/support/ctx.py` 解析）→ 选传输层：**offline**（只读写 `~/.octop`，用 `cli/support/db.py:open_cli_services` + `offline_ops.py`）/ **embedded**（需要 harness/gateway 运行时，`cli/support/embedded_ops.py` 起短命 `OctopServer`）/ **embedded-bridge**（只用 `BridgeManager`）/ **external**（直接跟 OS/守护进程打交道，如 `models ollama-*`、渠道扫码、飞书 bot 子进程）→ 交互式用 `cli/repl/`、提问用 `questionary`/`rich` → 域规则**不要**在 CLI 里重写，调 `infra/`。`cli/support/acting.py` 解析 `--user`/pinned 默认，`state.py` 存 `cli_state.json`。注意：没有 `octop user login`（CLI 信任本地文件访问）；`octop run` 在跑时，配置类 CLI 写入要重启才生效（cron/channels 在 boot 时加载）。

**加一条文案**：只 UI chrome → `dashboard/src/locales/{en,zh}.json` 同 ns 同 key；服务端产出（斜杠回复/渠道状态/API 错误/工具名/CLI 输出）→ `src/octop/i18n/{en,zh}.json`（多处用则补 `domains/*.py` helper）；ErrorCode → 后端 `errors` + 前端 `apiErrors` 双改；验证 `uv run pytest tests/unit/i18n -q`。禁 gettext/.po；禁在 `infra/` 硬编码用户可见英文（专家 catalog 的 `label_zh/label_en` 是历史例外）。

## 11. 测试与质量

- `uv run pytest -m "not live"`（527 个 test 文件：unit 444 / integration 77 / live 6）；`uv run pytest tests/unit -x -q`；markers：`slow`、`postgresql`、`live`。
- `make all` = `format-all`(Ruff 写 + Prettier 写) + `lint` + `typecheck`(**mypy --strict src/octop**) + `test`；Ruff `line-length=100`。
- **pre-commit（`make install-hooks` 后）会跑 `make all` + dashboard `npm run build`**，已 staged 的格式化文件会被 re-add；应急绕过 `SKIP_PRECOMMIT=1` 或 `--no-verify`，但不要用它把红测试提上去。
- **CI 只跑后端**（`.github/workflows/ci.yml`：ubuntu py3.12 `quality` + `test-windows` + `live-tests`）→ 前端 lint/tsc/vitest 只能靠 pre-commit 与 release 的 `make build` 兜。**Windows 也是 CI 目标**：POSIX-only 用 `@pytest.mark.skipif(os.name != "posix", ...)`（惯例别名 `posix_only`）；不要硬编码 `/proc`、`/etc`、`~` 之类路径断言，用 `tmp_path` + `pathlib`，桩 `shutil.which` 用 `tests.support.fakes.fake_bin_path("tool")`；materialize `OCTOP_HOME` 的测试必须 `monkeypatch.setenv("OCTOP_HOME", str(tmp_path))`。
- 共享测试工具：`tests/support/{fakes,auth,http,scenarios,app}`、`tests/integration/conftest.py`。

## 12. ⚠️ AGENTS.md 与代码的已知偏差（以代码为准）

| AGENTS.md 说 | 实际 |
|---|---|
| 迁移版本断言 `v == 20` | 已到 **21**（`tests/unit/db/test_db_pool.py:102,226`） |
| `infra/gateway/processor.py`（§5、§9） | 实际是 `infra/gateway/process/processor.py`（1,835 行） |
| §5 的 infra 子包表只列 10 个 | 实际 **21 个**：另有 `agent_mcp/ auth/ backup/ bridge/ browser/ desktop/ knowledge/ mobile/ proactive/ voice/` |
| `cli/*_cmd.py`（run_cmd/init_cmd/backup_cmd） | 实际是 `cli/commands/` + `cli/registry.py` + `cli/repl/` + `cli/support/` |
| §4 树里 `dashboard/` 在 `src/octop/` 下 | 对，但那是**构建产物**（gitignore），源码在仓库根 `dashboard/` |

## 13. 前端 dashboard（Vite 6 + React 18 + TS）

**入口链**：`dashboard/index.html`（内嵌 3 段 classic script：主题首绘 `octop-boot-theme`、boot 骨架屏、stale-chunk 自愈）→ `src/main.tsx`（先 `import "./pwa-prompt"`，`initI18n()` 完成后才 `createRoot(<App/>)`，动态 import `./sw-register`）→ `src/App.tsx`（`BrowserRouter useTransitions={false}` + ErrorBoundary + ThemeProvider + antd `ConfigProvider prefixCls="octop"`）。

**路由**：`App.tsx:134-153` 只有 5 条一级路由（`/login`、`/login/oidc/complete`、`/setup`、`/invite`、`/*` → `AuthGuard → AgentProvider → LayoutModeProvider → VoiceOutputProvider → layouts/MainLayout`）；细粒度表在 `src/routes/index.tsx`（+`prefetch.ts`）：**63 条 = 23 个页面组件 + 6 个 `element:null`（`/chat`×3、`/workbench`×3 由 MainLayout keep-alive 渲染）+ 34 个 Redirect**（含 `/orca/*`、`/octop/*` 旧书签兼容）。`pages/` 下 12 个域目录、38 个 `index.tsx`。全 lazy。

**依赖**：UI = **Ant Design 5.29.1** + `antd-style`（**无 Tailwind**）；图标 `lucide-react`；状态 = **自研模块级 store**（`pages/Chat/hooks/chatStore.ts` **3,837 行**）+ React Context（`src/context/` 8 个：Theme/Agent/LayoutMode/VoiceOutput…）+ `ahooks`；图表 `recharts`；编辑器 `@monaco-editor/react` + 终端 `@xterm/xterm`；Markdown `react-markdown`+`remark-gfm/math`+`rehype-katex`+`react-syntax-highlighter`+`mermaid`；文档预览 `docx-preview`/`react-pdf`/`@aiden0z/pptx-renderer`/`xlsx`；路由 `react-router-dom 7`；i18n `i18next 25` + `react-i18next 16`；PWA `vite-plugin-pwa`。**无 SSE/WS 库**：原生 `fetch`+`getReader()` 手写解析、原生 `WebSocket`。

**目录规模**：pages 697/186,488 · components 123/17,659 · utils 118/10,533 · api 80/9,433 · hooks 61/6,273 · layouts 20/3,953 · plugins 19/1,573 · locales 2/14,024 · styles 10/2,446 · context 8/1,511 · routes 3/484。
**最大文件（重构热点）**：`pages/Chat/hooks/chatStore.ts` 3837 · `pages/KnowledgeBases/index.tsx` 3676 · `pages/Admin/Users/UsersListPanel.tsx` 2860 · `pages/Agent/Connectors/index.tsx` 2493 · `pages/Experts/index.module.less` 2489 · `pages/Admin/Users/index.module.less` 2251 · `pages/Agent/Channels/components/ChannelDrawer.tsx` 1946 · `pages/Chat/index.tsx` 1933 · `pages/KnowledgeBases/index.module.less` 1774 · `pages/Settings/AdvancedSettings/BridgeSettings.tsx` 1713 · `pages/Control/RemoteBrowser/index.tsx` 1612 · `pages/Chat/chatMessages.partial.less` 1594 · `pages/Control/RemoteAndroid/index.tsx` 1562 · `pages/Agent/Workspace/components/WorkspaceDrawer.tsx` 1552 · `pages/Experts/components/EditAgentDrawer.tsx` 1409。

**API 层 `src/api/`**：`request.ts`(683 行) —— token 存 `auth_token`（remember→localStorage，否则 sessionStorage，`setAuthToken:74`）；`buildHeaders:243` 注 `Authorization: Bearer` + `Accept-Language: zh|en`；响应头 `X-Octop-Access-Token:19/104` 自动续期；`activeAgentId` 模块级变量由 AgentProvider 注入，路径匹配 `/agents/<id>/`、`/mbti/*`、`/cron/settings`、`/subagent-catalog` 时自动附 `X-Octop-Agent-Id`(:230-277)；**401** 仅 `AUTH_FAILED/TOKEN_EXPIRED` 视为死会话 → 清 token + 派发可拦截的 `octop:unauthorized` 事件，否则硬跳 `/login`(:303-380)；**403** → `octop:forbidden`；**503+setup_required** → 跳 `/setup` 并熔断后续请求(`SetupRequiredError`:111-184)。变体：`requestBlob:437`(下载+进度)、`probeAuthResource:491`、`requestStream:531`(TTS 分块)、`requestUpload:576`(XHR+进度)。URL 组装 `src/api/config.ts`（`getApiUrl()`、`getWsUrl()`）。`modules/` **57 个 .ts** 与后端 routers 基本一一同名；类型手写于 `api/types/`(16 文件)，**没有 openapi codegen**，改契约要手改两处。
错误信封解析：`src/utils/apiError.ts:parseApiError()` → `apiErrors.<CODE>` 本地化。
**流式消费点**：主聊天 WS 在 `pages/Chat/hooks/chatStore.ts:155`(new WebSocket)/`:2764`(send)，URL 由 `api/modules/wsChat.ts:buildDashboardChatWsUrl()` 拼；通知 `api/modules/wsNotifications.ts`；SSE 解析 `chatStore.ts:consumeSseResponse()`(~:3144) 只服务 `resumeHitl()`(POST `/agents/{id}/chat/hitl/resume`, `Accept: text/event-stream`:3236)；其余流在 `api/modules/{desktop,browser,decision,trajectory,mobile}.ts`；事件 schema 解析集中在 `pages/Chat/hooks/sseHelpers.ts`。

**i18n**：`src/locales/` 只有 `en.json`(382KB)+`zh.json`(371KB)，各 **6,462 个叶子 key**、约 80 个 ns。`src/i18n.ts:initI18n()` 按 `resolveInitialLocale()`（`utils/localePrefs.ts`：存储偏好 → navigator，**无记录默认 zh**）动态 import 单侧 bundle，另一侧作 `fallbackLng` 并 `requestIdleCallback` 预取。每次 `languageChanged` 后 `hydrateServerLabels()` 调 `GET /api/i18n/tools`、`/api/i18n/skills` 用后端 `tools.*`/`skills.*` **覆盖**本地 bundle（失败回落本地）。护栏：`tests/unit/i18n/test_dashboard_locale_keys.py` 强制 en/zh **叶子 key 树完全一致**（但不检查 key 是否被引用 → 改 key 名必须全库 grep，§2 就是这么炸的）。

**样式/主题**：antd token 主题（`App.tsx` 内联 dark token + `createGlobalStyle`）+ **CSS Modules(Less)**（`vite.config.ts`：camelCase、`[name]__[local]__[hash:base64:5]`、`javascriptEnabled`）；自研 token 层 `src/styles/theme-vars.css`（"Octop Design System v3"，`--fn-*` 变量，品牌色 Elegant Rose `#E85D75`）；暗色三态 light/dark/system（持久化 key `theme`，`styles/appearanceStorage.ts`），首绘前由 index.html 的 classic script 写 `html[data-theme]`；8 套色板 `html[data-palette]`（`styles/themePalettes.ts:brandTokensFor()`）+ `components/{PaletteSwitcher,ThemeSwitcher,LanguageSwitcher}.tsx`；字体系统栈 + 唯一自定义 `public/fonts/FSPixelSansUnicode-Regular.ttf`。
**可复用组件**（`src/components/`，81 项）：`AgentSelector`、`OctopSpinner`、`PageLoading`、`Skeleton`、`EmptyState`、`ErrorBoundary/`+`NotFoundPage`+`ForbiddenPage`、`AuthGuard`、`RequirePermission`、`Markdown/`、`MarkdownCopy/`、`DocumentPreviewCore`+`PdfDocumentPreview`、`AuthImage`、`AvatarDropdown`、`CopyableResourceId`、`ResizableTable/`、`EmojiPicker`、`PwaInstallPrompt/`+`PwaUpdatePrompt/`、`StreamConnectingIndicator/`、`StreamEdgeControls/`、`ChromeTabBar/`、`TabLabel/`、`CatalogTypeCard/`、`DesktopWindowControls/`、`ServiceRestartOverlay`、`TokenCountInput`。

**构建**：`make build-frontend` = `cd dashboard && npm ci && NODE_ENV=production NODE_OPTIONS=--max-old-space-size=2048 npm run build`（`tsc -b && vite build`）；`vite.config.ts`：`outDir=../src/octop/dashboard`、**`emptyOutDir:true`**、产物 `assets/[name].[hash].*`、manualChunks `vendor-react/vendor-antd(rc-* 必须并入 antd，否则循环 chunk 崩)/vendor-xterm/vendor-markdown/vendor-icons/vendor-utils`（mermaid 留动态 import）；无 `base`；dev proxy `/api → 127.0.0.1:${VITE_API_PORT|8088}`（`ws:true`、`xfwd:true` 保 OAuth 回调 origin）；`define: BASE_URL`(默认空=同源)、`MOBILE:false`；host 0.0.0.0、端口 `VITE_DEV_PORT|5173`、hmr clientPort 固定（防 Safari reload 循环）+ 自定义插件 `suppressViteDisconnectReload`；PWA `manifest:false`（手维护 `public/manifest.json`）、precache 只含 hashed assets **不缓存 index.html**、runtimeCaching 5 组。
scripts(13)：`dev`、`build`、**`build:docker`（跳过 tsc，镜像用 → 镜像绿不代表类型过）**、`build:prod`/`build:test`、`format`/`format:check`、`lint`(eslint 9 flat)、`test`/`test:watch`/`test:coverage`(vitest)、`preview`/`preview:prod`/`preview:test`。

## 14. 周边

- **`desktop/` = Wails v3（Go 桌面壳），不是 Electron/Tauri**：`desktop/src/`(Go 1.25+，wails v3.0.0-beta.13；`embed_portable.go`/`download.go`/`tray_click.go`/`portable_upgrade.go`；`cmd/devserver`) 负责加载内置 portable zip → 解压 `~/.octop/portable/` → spawn Octop 服务 → 托盘/设置窗；`desktop/portable/`(`bootstrap-runtime.sh`/`vendor-wheels.sh`/`package-linux-docker.sh`/`Makefile green`)；`desktop/package-release.sh` = build dashboard → 造 portable runtime → 嵌入 Wails → 出安装包（Windows 需 NSIS）。CI `octop-desktop.yml` 六平台矩阵（PR 只跑 darwin+windows，tag/dispatch 全跑，用 Node 24）。
- **`fnos/` = 飞牛 fnOS 应用中心 FPK**：`fnos/docker/`（appname=octop、version=1.1.0、service_port **8088**、装时拉 ghcr 同版本镜像；`cmd/{install,uninstall,upgrade,config}_{init,callback}` + `wizard/*` + `app/ui`）与 `fnos/native/`（service_port **8089**、`install_dep_apps=python312`）。构建 `scripts/build-fpk.sh` + `scripts/fnos/{common,slim-site-packages,store_version}.sh`，CI `fnos-build-fpk.yml`。
- **`docker/`**：`docker-compose.yml` **单服务 `octop`**（build 仓库根 + `docker/Dockerfile`，`restart: unless-stopped`，ulimits nofile 65535，端口 `${OCTOP_PORT:-8088}`，卷 `${OCTOP_DATA:-~/.octop}:/data/.octop`，`HOME=/data`，透传 OCTOP_BIND_HOST/PORT/DEFAULT_PASSWORD/ADMIN_USERNAME、DB 变量、OPENAI/DASHSCOPE key、Langfuse）；`docker-compose.cn.yml`（不构建，镜像 `ghcr.nju.edu.cn/tencentcloud/octop:latest`）；`docker-compose.postgres.yml`（pgvector/pg16，`postgres/init-vector.sql` 注 initdb.d）；`docker-compose.mobile.yml`（Redroid，`network_mode: host`，需 `/dev/binder`）；`docker_build.sh`（BuildKit + 腾讯镜像源）；`docker-entrypoint.sh`（校验 `OCTOP_DEFAULT_PASSWORD` ≥8 位含字母数字 + 弱口令黑名单 → `octop init` 建管理员，否则写向导口令到 `/data/.octop/octop-login.txt`；`.initialized` 标记防 PG 重复 init）。Dockerfile 两阶段：`node:20-slim`(`npm ci` + `npm run build:docker`) → `python:3.12-slim`(uv 装 wheel，`UV_LINK_MODE=copy`、`UV_PYTHON_DOWNLOADS=never`)。
- **`scripts/`**：`install.sh`/`install.ps1`/`install.bat`（终端用户一键装：隔离 venv `~/.octop/venv` + `bin/octop` 包装器，支持 `--version/--mirror/--extras browser/--from-source`）、`install-octop.sh`、`wheel_build.sh`/`.ps1`、`build-fpk.sh`、`release_download_links.py`（生成 Release 的 COS 链接段）、`run-discord-local.sh`、`smoke_memory_api.py`、`ci/upload_release_cos.sh`、`fnos/*`。
- **工具链**：`mise.toml` = python 3.12 / node 20 / npm 10 / uv latest（desktop 用 node 24）。
- **CI（10 个 workflow）**：`ci.yml`（quality + test-windows + live-tests，**纯后端**）、`release.yml`（push `v*`：make test → make build → PyPI + GitHub Release，notes 用 awk 从 **CHANGELOG.md** 抽 `## [x.y.z]` 段，缺失则 git tag diff 兜底 + COS 链接）、`auto-tag-on-release.yml`（release PR 合 main 后自动打 tag）、`docker-publish.yml`（ghcr）、`fnos-build-fpk.yml`、`octop-desktop.yml`、`sync-main-to-develop.yml`（release 后 main 合回 develop，冲突开 `chore/sync-develop-after-*` PR）、`codeql.yml`、`anti-spam-issues.yml`、`upload-release-cos.yml`。
- **分支模型**：`feature/* → develop → release/x.y.z →(merge commit) main → tag v* → publish`；hotfix 从 main 出、PR 回 main(+tag) 再 PR 进 develop；**禁止 develop 直接推 main / 禁止 bulk-merge**；release 合 main 用 merge commit 不用 squash。日常 PR 目标 = **develop**。
- **`docs/`（24 md + 2 html + adr/）**：`api.md`(全路由人读版★)、`architecture.md`、`configuration.md`(`~/.octop` 与 config.json★)、`cli.md`、`connectors.md`★/`connectors-qcc.md`★/`connectors-agently-mail.md`、`discord-channel.md`★、`ldap.md`★、`bridge.md`、`acp.md`、`plugin-channels.md`★、`octop-ui-payload-offload.md`★、`expert-teams.md`/`agent-call-agent.md`/`agent-delegation.md`/`agent-interop-mailbox.md`、`personas.md`、`memory-slim.md`、`versioned-history.md`、`agent-backend-file-io.md`(§13 Docker sandbox)、`user-guide.md/.html`、`octop-introduction.html`、`adr/001-single-process-model.md`、`adr/002-database-backends.md`。**没有**反代/TLS 专文（TLS 看 `infra/setup/tls/` + README），也没有飞书/钉钉专文（在 UI 向导 + `infra/gateway/`）。

## 15. 前端坑清单

1. `src/octop/dashboard/` 是产物（gitignore + emptyOutDir），手改必被下次 `make build-frontend`/pre-commit 清掉 → 只改 `dashboard/`。
2. `make all` **不含** eslint/前端 tsc/vitest；CI 也不跑 → 改完 UI 手动 `npx tsc -b`、`npm run lint`、`npm test`。
3. Prettier 3.0.0 **仓库无配置文件**（全默认），`make format-all`/pre-commit 会自动重写并 re-add → 提交 diff 会比你想的"胖"。
4. 前后端契约手写，无 codegen → 改字段要同步 `src/api/types/*.ts` + modules 返回类型。
5. i18n parity 测试只比 key 树、不查引用 → 改 key 名先全库 grep（见 §2）。
6. `build:docker` 跳过 tsc。
7. vite 暗坑（都写在配置注释里）：rc-* 不能与 antd 拆 chunk；esbuild `minifyIdentifiers:false`（xterm bug）；不 precache index.html（否则部署后白屏）；Safari 特权端口 HMR reload 循环靠 `suppressViteDisconnectReload`；`Object.hasOwn` polyfill 给 Chromium ≤91；`octop:chunk-reload` 一次性 reload 标志。
8. 401/403/503 已由 `request.ts` 全局处理（事件 + 硬跳转），页面组件**不要**各自处理登录过期。
9. 找聊天流别按 SSE 找，主通道是 **WS** `/api/agents/{id}/chat/ws?token=`。

## 16. 还没读透的（下次按需深挖）

- `infra/agents/manager.py`(4,187 行) 的 Agent 状态机细节（start/stop/reload/idle reclaim/hitl/teams 交互）——只读了它在 `_boot_runtime` 里的装配点。
- `infra/gateway/process/processor.py`(1,835 行) 的消息处理全链（thread 解析 → steer → hitl_coordinator → teams → stream_project）。
- `infra/bridge/manager.py`(2,552 行) 的桥协议与 peer 转发。
- `infra/agents/experts/library/**`（内置专家及其脚本，含 clinical/wechat-ops 等大文件）。
- `api/routers/` 58 个模块的逐端点清单（只做了前缀/tag 映射；细看用 `/api/openapi.json` 或 `docs/api.md`）。
- `dashboard/src/pages/` 12 个域目录的逐页面职责（只列了路由与最大文件）。
