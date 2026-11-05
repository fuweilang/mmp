# coze-studio 代码地图

> 生成：2026-10-22。基于实测（行数/文件数为 find+wc 实测）。接手前先读本文 + 仓库根 `CLAUDE.md`。

## 0. 一句话

字节开源的 Coze Studio 全栈版：Go(Hertz+DDD) 单二进制后端 + Rush.js 259 包 React 前端 + Thrift IDL 契约，Docker Compose 一键起（MySQL/Redis/ES/Milvus/MinIO/NSQ/etcd）。

## 1. 仓库坐标

| 项 | 值 |
|---|---|
| 路径 | `agentPlatform/coze-studio` |
| HEAD | `fefb05ff` 2026-07-29 `fix(infra): align statefulset servicename` |
| 分支/远端 | `main` → `github.com/coze-dev/coze-studio` |
| tracked 文件 | 15,305 |
| 本地改动 | 仅 `docker/docker-compose.yml`（+26/-66），未跟踪 `docker/es-build/` |
| 前端 | 259 个 rush 包；9,125 个 ts/tsx ≈ **1,024,152 行** |
| 后端 | 1,013 个 .go = **703,515 行**；其中生成码 224 文件/536,550 行 → **手写 789 文件/166,965 行** |

### 本地 docker-compose.yml 改了什么（未提交）

1. mysql/redis/es/minio/etcd/milvus 六处 `./data/...` bind mount → 命名卷（`mysql-data` 等）。副作用：`make clean` 的 `rm -rf docker/data` 清不掉，要 `docker compose down -v`。
2. ES 镜像 `bitnamilegacy/elasticsearch:8.18.0` → `docker.1ms.run/library/elasticsearch:8.18.0`（国内加速），改 `discovery.type=single-node`、`xpack.security.enabled=false`、堆 1G，smartcn 插件走 `docker/es-build/` 产出的 zip（`file:///tmp/analysis-smartcn.zip`）。

意图：国内网络能拉镜像 + 降内存。**续做时别 revert。**

## 2. 怎么跑

```bash
# 全量（推荐，8888 出前端 nginx）
cd docker && cp .env.example .env && cd .. && make web

# 本地开发：中间件 + Go 后端 + 前端 dev
make middleware          # docker compose debug profile：MySQL/Redis/ES/Milvus/MinIO/NSQ/etcd
make sync_db             # atlas migrate apply（一次性 mysql-setup 容器）
make server              # 会先 make fe 再编 Go；产物 backend/bin/server，从 bin/ 跑
cd frontend && rush update && rush build --to @coze-studio/app
cd frontend/apps/coze-studio && rushx dev    # http://localhost:8080（strictPort），/api → :8888
```

端口：后端 `LISTEN_ADDR=:8888`；前端 dev 8080；compose 里 `coze-web` 8888→nginx:80。
**Node 版本坑**：`.nvmrc` = `lts/iron`(20)，但 `rush.json:5` 要求 `>=21`，CI 用 22.16.0 → **用 Node 22**，按 .nvmrc 装会被 rush 拒。

## 3. 后端（Go）

### 入口与中间件

`backend/main.go`(156 行)：`setCrashOutput → loadEnv(.env/.env.$APP_ENV) → setLogLevel → application.Init(ctx) → startHttpServer`。
中间件顺序（`main.go:93-101`，顺序敏感）：`ContextCacheMW`(必须第一) → `RequestInspectorMW`(必须第二，判定 WebAPI/OpenAPI 认证) → `SetHostMW` → `SetLogIDMW` → CORS → `AccessLogMW` → `OpenapiAuthMW` → `SessionAuthMW` → `I18nMW`。
路由：`api/router/register.go` 的 `GeneratedRegister()` = 生成的 `api/router/coze/api.go`(246 条) + 静态资源（`/`、`/static` → `resources/static/index.html`；`/admin` → `resources/conf`）。

### 分层与规模

| 目录 | 文件/行 | 手写行 | 职责 |
|---|---|---|---|
| `api/` | 81 / 506,682 | ~600 | handler(16 个 service, 10,433 行) + router(纯生成) + model(thrift DTO, 全生成) + middleware(7 个手写) |
| `application/` | 68 / 26,094 | 全部 | 用例层，18 子目录；`application.go:128 Init()` 是唯一装配根 |
| `domain/` | 540 / 125,564 | 98,877 | 业务域；生成部分 = 各域 `internal/dal/{model,query}/*.gen.go` |
| `crossdomain/` | 71 / 9,227 | 7,926 | 跨域桥：`contract.go` + `impl/` + `model/` + mock；`SetDefaultSVC/DefaultSVC()` |
| `infra/` | 151 / 21,453 | 全部 | 技术设施 |
| `bizpkg/` | 28 / 3,485 | 2,927 | `config/modelmgr`(模型配置)、`llm/modelbuilder`(provider 建模) |
| `pkg/` | 34 / 2,653 | 全部 | ctxcache/errorx/logs/safego/sonic/taskgroup/saasapi |
| `types/` | 17 / 2,293 | 全部 | `consts/`、`errno/`(分域错误码)、`ddl/gen_orm_query.go`(gorm gen 驱动) |
| `conf/` | — | — | 运行期资源：model/plugin/prompt/workflow/admin |

依赖方向：`api → application → domain → dal`；跨域只能 `crossdomain/y.DefaultSVC()`；**domain 之间禁止直接 import**。无 wire/fx，手写三段式 Init（`initBasicServices/initPrimaryServices/initComplexServices`）。

### 17 个业务域

`agent`(bot 草稿/版本/发布 + eino ReAct 运行时) · `app`(应用/intelligence 配置、发布、会话模板) · `connector` · `conversation`(会话/消息/agentrun) · `datacopy` · `knowledge`(dataset/文档/切片/审核 + 双索引) · `memory`(database 自定义表 + variables) · `openauth`(OpenAPI api_key) · `permission`(资源级鉴权) · `plugin`(插件/工具/OAuth/OpenAPI 解析/执行) · `prompt` · `search`(ES) · `shortcutcmd` · `template` · `upload` · `user`(passport/session/space) · **`workflow`(189 文件/55,533 行，最大)**

### 关键模块定位

| 能力 | 位置 |
|---|---|
| Agent 运行时 | `domain/agent/singleagent/internal/agentflow/agent_flow_builder.go:173`（eino `react.NewAgent`）；节点 `node_chat_prompt.go`/`node_persona_render.go`/`node_retriever.go`/`node_suggest_graph.go` |
| Chat 流式 | **纯 SSE，无 websocket**。`api/handler/coze/agent_run_service.go:56`（hertz-contrib/sse + `infra/sse/impl`）；消息落 `message` 表 |
| Workflow 引擎 | `domain/workflow/internal/compose/workflow.go:83 NewWorkflow()` = eino `compose.Graph`；`:318 Compile()`；节点构建 `compose/node_builder.go:83 switch s.Type`；**40 种节点类型**枚举在 `entity/node_meta.go:150-189`；实现按 `internal/nodes/<type>/`（21 个目录） |
| 中断续跑 | `internal/nodes/qa/question_answer.go:406-714`（`compose.InterruptAndRerun`）+ `infra/checkpoint/redis.go` |
| 代码沙箱 | `infra/coderunner/impl/{direct,sandbox}`；sandbox = **deno**（`sandbox/runner.go:40-46` 白名单）；Python 侧 `impl/script/sandbox.py` |
| 插件执行链 | `internal/nodes/plugin/exec.go:38 ExecutePlugin` → `crossplugin.DefaultSVC().ExecuteTool` → `domain/plugin/service/exec_tool.go:45`（:96 取 OAuth token，:143 buildToolExecutor）→ `service/tool/invocation_{http,mcp,saas,custom_call}.go` |
| 插件类型/鉴权 | `crossdomain/plugin/consts/consts.go:21-42`：`openapi`/`coze-studio-mcp`/`coze-studio-custom`；auth none/oauth/service api_key |
| 官方插件模板 | `backend/conf/plugin/pluginproduct/*.yaml`（19 个）+ `plugin_meta.yaml`；加载器 `domain/plugin/conf/load_plugin.go:134` |
| RAG 检索 | `domain/knowledge/service/retrieve.go:54 Retrieve` → queryRewrite:180 → 向量:203 / ES 全文:227 / NL2SQL:313 → rerank:517（`infra/document/rerank/impl/{rrf,vikingdb}`） |
| 文档解析 | `infra/document/parser/impl/builtin/`（csv/json/md/text/image Go 原生）；**pdf/docx 走 Python 子进程** `parse_pdf.py`/`parse_docx.py` + `py_parser_protocol.go:76`；OCR `infra/document/ocr/impl/{ppocr,veocr}` |
| 模型配置 | `conf/model/model_meta.json` + `conf/model/template/*.yaml`（22 个：ark×13/byteplus×2/openai/claude/gemini/qwen/deepseek/ollama/basic）；加载 `bizpkg/config/modelmgr/`（env 覆盖 `BUILTIN_MODEL_<TYPE>_API_KEY`）；用户配置存 `model_meta/model_instance/model_entity` 三表，`/api/admin/model/{create,delete,list}` |
| LLM 封装 | `bizpkg/llm/modelbuilder/{ark,openai,claude,gemini,qwen,deepseek,ollama}.go` → eino `BaseChatModel` |
| 认证 | session cookie → `api/middleware/session.go:42 SessionAuthMW`（Redis session）；OpenAPI Bearer → `api/middleware/openapi_auth.go:113`；Admin = `AdminAuthMW`(session.go:78) + `baseConf.AdminEmails` |
| 多租户 | `space`/`space_user` 表；注册即建空间（`domain/user/service/user_impl.go:334`）；资源表普遍带 `space_id`；资源级鉴权 `domain/permission/{authz_checker.go,resource_queryiers.go}` |

> 注：**本仓无 OpenUI/卡片子系统**（全库 grep `openui` 无命中）。

### 数据层

- GORM + `gorm.io/gen`；生成驱动是手写文件 **`backend/types/ddl/gen_orm_query.go`**（`path2Table2Columns2Model` 登记"目录→表→JSON 大字段列→Go 类型"）。**新表有 JSON 大字段不登记就退化成 []byte。**
- 迁移 = **Atlas**，全在 `docker/atlas/`：权威 schema `opencoze_latest_schema.hcl`(**55 表**)、`migrations/`(**17** 个时间戳 SQL + `atlas.sum`)、手册 `docker/atlas/README.md`。
- 表分组：用户空间 `user/space/space_user`；Agent `single_agent_{draft,version,publish}/agent_to_database/agent_tool_{draft,version}/{draft,online}_database_info/variables_meta/variable_instance`；应用 `app_draft/app_release_record/app_{dynamic,static}_conversation_{draft,online}/app_conversation_template_{draft,online}/chat_flow_role_config/app_connector_release_ref/connector_workflow_version`；会话 `conversation/message/run_record`；插件 `plugin/plugin_draft/plugin_version/tool/tool_draft/tool_version/plugin_oauth_auth/api_key`；工作流 `workflow_meta/workflow_draft/workflow_version/workflow_snapshot/workflow_execution/node_execution`；知识 `knowledge/knowledge_document/knowledge_document_slice/knowledge_document_review`；模型 `model_entity/model_instance/model_meta`；其它 `files/prompt_resource/shortcut_command/template/data_copy_task/kv_entries`
- Makefile：`make sync_db`(:48) / `make sql_init`(:57) 都跑 `docker compose -f docker/docker-compose-debug.yml --profile mysql-setup up -d`；`make dump_db`(:52) = `dump_sql_schema` + `scripts/setup/db_migrate_dump.sh`；`dump_sql_schema`(:95) = atlas schema inspect → 加 `CREATE TABLE IF NOT EXISTS` → 拼 `sql_init.sql` → 拷 helm；`atlas-hash` = `atlas migrate hash`。

### 运行时组件与用途

| 组件 | 端口 | 代码里的真实用途 |
|---|---|---|
| MySQL | 3306 | 主库 `opencoze`，`infra/orm/impl/mysql`（`application/base/appinfra/app_infra.go:75`） |
| Redis | 6379 | session/缓存/**发号**(`infra/idgen/impl`)/workflow checkpoint(`infra/checkpoint/redis.go`) |
| Elasticsearch | 9200 | 资源搜索(`domain/search`) + 知识全文(`infra/document/searchstore/impl/elasticsearch`) |
| Milvus | 19530 | 知识向量（`VECTOR_STORE_TYPE=milvus`，备选 oceanbase/vikingdb/es，`searchstore/impl/impl.go:56-67`） |
| MinIO | 9000/9001 | 对象存储 `infra/storage/impl/storage.go:38`（可切 s3/tos） |
| NSQ | 4150/4151/4160/4171 | 事件总线默认 MQ（`COZE_MQ_TYPE=nsq`），3 条总线：资源事件/项目事件/知识索引（`infra/eventbus/impl/eventbus.go:35,86,97,107`）；支持 kafka/rmq/pulsar/nats |
| etcd | 2379/2380 | **只给 Milvus 当元数据存储**，后端不直连（`infra/dynconf` 只有接口 + static 实现） |
| deno / python | — | 代码沙箱 / pdf·docx 解析，`scripts/setup/server.sh`、`scripts/setup/python.sh` 自动装 |

### 新增一个 HTTP CRUD 接口（按序）

1. `idl/<域>/<svc>.thrift`：struct + `validate` 注解 + `api.post="/api/xxx"`；新 service 还要在 `idl/api.thrift` 加 include + `service X extends ...`
2. `hz update -I idl -idl idl/api.thrift`（**仓库无 make 目标**，用上游 hertz 工具）→ 重生成 `api/model/**`、`api/router/coze/{api.go,middleware.go}`、新 handler 骨架
3. `api/handler/coze/<svc>.go`：BindAndValidate → 调 `application/<域>` → 错误统一走 `api/handler/coze/base.go` + `api/internal/httputil`
4. `application/<域>/`：加用例方法（DTO ↔ domain vo）；需要新依赖就改 `application/application.go` 的 init 链与 `to*ServiceComponents`
5. `domain/<域>/{service,repository,internal/dal}`
6. 表变更：改 `docker/atlas/opencoze_latest_schema.hcl` → `atlas migrate diff` → `make sync_db` → `make dump_db` → JSON 列登记进 `types/ddl/gen_orm_query.go` 重新生成 dal
7. 要给别的域调：`crossdomain/<域>/contract.go` + `impl/`
8. 错误码：`types/errno/<域>.go`（workflow 段 7207xxxxx，兜底 777777xxx），`errorx.New(errno.ErrXxx, errorx.KV(...))`
9. 测试 `domain/<域>/service/*_test.go`
10. 前端 rush `idl2ts` 重生成 client

### 测试与坑

- `cd backend && go test ./...`；CI 姿势（`.github/workflows/ci@backend.yml:83-88`）：`go test -race -v -coverprofile=coverage.out -gcflags="all=-l -N" ./...` —— **`-l -N` 必须**，否则 bytedance/mockey patch 失败。
- 73 个 `*_test.go` / 789 手写文件 ≈ 9%。热点：`infra/document/parser/impl/builtin`(7)、`domain/knowledge/service`(5)、`domain/workflow/internal/compose/test`(4)。最大 `api/handler/coze/workflow_service_test.go`(3,319 行)。mock：mockgen + mockey + miniredis + go-sqlmock（**无 testcontainers**，本地单测不需 docker）。
- 二进制必须从 `backend/bin/` 跑（`.env` 与 `resources/{static,conf}` 是相对路径）。没 Redis 连启动都过不去。
- `go.mod:7 replace github.com/apache/thrift => v0.13.0` 钉死，用高版本 thrift 特性会编译炸。
- JSON 一律 `pkg/sonic`；日志 `pkg/logs.CtxInfof`（logID 由 SetLogIDMW 注入）；HTTP 出参固定 `{code,msg,data}`。
- 生成码边界：`api/router|model` 手改必被 `hz update` 覆盖；`api/handler/coze/*.go` 带生成头但**含真实业务**（`agent_run_service.go`/`base.go`/`message_service.go` 甚至无生成头 = 纯手写），别当纯生成删。
- 官方插件/模型模板是**运行时资源**（改 yaml 不用重编译，但要重跑 `make server` 拷进 `bin/resources`）。

## 4. 前端（Rush monorepo）

### 机制

- `rush.json`：**259 个包**（frontend/packages 239、infra 12、config 7、apps 1）；rush 5.147.1 + pnpm 8.15.8；`projectFolderMinDepth 3/MaxDepth 6`。
- 分组靠 **tags**：`team-{arch,studio,automation,data,devops,community,builder,qa,fullcode-app}` + `level-1..4`；CI 用 `rush install --to tag:core`。
- **Subspaces 启用**，3 个：`default`/`e2e`/`e2e-opencoze`，但只有 `@coze-data/e2e` 声明了 subspace。lock 在 `common/config/subspaces/<name>/pnpm-lock.yaml`（含 `common-versions.json` 约束 semi-ui `[2.49.2,2.61.0]`、4 个 pnpm-patches）。
- 无 cyclical 豁免配置；靠分层 + `-base/-interface/-adapter/-shared` 拆包消环，插件 `@coze-arch/rush-dep-level-check-plugin` 在 install/update 时强制校验层级。
- `build-cache.json` enabled=false；`version-policies.json` 是空数组。
- git hooks：`common/git-hooks/pre-commit` → `rush -q lint-staged`（按包并行 eslint --fix，>16 个包跳过）；`commit-msg` → commitlint。
- `eventHooks.postRushInstall` = `scripts/hooks/post-rush-install.sh`（license 头注入 + 生成 `.vscode/settings.json`）。
- **必须 `rush update`**：根没有 package.json/node_modules，链接由 rush 在 `common/temp/<subspace>/` 生成，`forbidPhantomResolvableNodeModulesFolders: true` 会拦游离 node_modules。

### 包分组（数字 = rush.json 注册包数）

| 组 | 包数 | 代表包 |
|---|---|---|
| `agent-ide/` | 53 | `entry`(BotEditor 主体)、`layout(-adapter)`、`bot-config-area(-adapter)`、`chat-debug-area`+`chat-area-provider`、`prompt(-adapter)`、`tool`/`tool-config`/`plugin-*`、`model-manager`、`bot-editor-context-store`、`space-bot`、`bot-plugin/{entry,tools,mock-set,export}`、`workflow-modal`、`agent-publish`、`memory-tool-pane-adapter`、`onboarding` |
| `arch/` | 37 | `bot-api`(service 聚合)、`bot-http`(axios)、`idl`(idl2ts 产物)、`api-schema`、`i18n`、`resources/studio-i18n-resource(-adapter)`、`bot-error`、`bot-flags`、`bot-env(-adapter)`、`fetch-stream`(SSE)、`bot-hooks`、`bot-store`、`foundation-sdk`、`bot-monaco-editor`、`bot-md-box-adapter`、`tea`/`slardar` |
| `common/` | 30 | `chat-area/{chat-core,chat-uikit,chat-area,hooks,utils,chat-workflow-render,plugin-*}`、`flowgram-adapter/{free-layout-editor,fixed-layout-editor,common}`、`auth(-adapter)`、`biz-components`、`prompt-kit/{main,base,adapter}`、`md-editor-adapter`、`websocket-manager-adapter`、`uploader-adapter` |
| `studio/` | 29 | `workspace/{entry-base,entry-adapter}`、`stores/{bot-detail,bot-plugin}`、`user-store`、`autosave`、`plugin-form-adapter`、`mockset-editor(-adapter)`、`open-platform/{open-chat,open-auth,chat-app-sdk}`、`project-publish`、`premium/*` |
| `workflow/` | 21 | `playground`(画布主场)、`base`(类型/枚举/registry)、`nodes`(节点表单)、`setters`(属性面板)、`components`、`render`、`variable`、`history`、`fabric-canvas`、`test-run(-next)`、`adapter/{playground,nodes,base,resources,code-editor}` |
| `data/` | 23 | `knowledge/{knowledge-modal-base,-adapter,knowledge-ide-base,-adapter,common/*}`、`memory/{database,database-creator,database-v2-main,-base,-adapter,llm-plugins,variables}` |
| `foundation/` | 16 | `account-{base,adapter,ui-base,ui-adapter}`、`space-{store,store-adapter,ui-base,ui-adapter}`、`global(-adapter)`、`global-store`、`layout`、`local-storage` |
| `project-ide/` | 13 | `main`/`view`/`core`/`client`/`framework`/`biz-*`（inversify DI） |
| `components/` | 10 | `bot-semi`(Semi 二封)、`bot-icons`、`resource-tree`、`virtual-list`、`table-view`、`json-viewer` |
| `devops/` | 5 | `debug/debug-panel`、`testset-manage`、`mockset-manage` |
| `community/` | 2 | `explore`、`component` |
| `frontend/config/` | 7 | `eslint-config`、`stylelint-config`、`ts-config`、`vitest-config`、`tailwind-config`、`postcss-config`、`rsbuild-config` |
| `frontend/infra/` | 12 | `eslint-plugin`(自定义规则)、`idl/{idl-parser,idl2ts-cli,generator,helper,plugin,runtime}`、`plugins/*`、`utils/*` |
| `frontend/apps/` | 1 | `coze-studio` = `@coze-studio/app`（level-4，唯一 app） |

**`-base`/`-adapter` 模式**：`-base`/`-interface` 放纯类型与默认实现（低 level），`-adapter` 是宿主注入点 —— app 只 import `-adapter`，换实现不动业务码。这也是消循环依赖的主要手段。

### app 入口与路由

`frontend/apps/coze-studio/src/index.tsx`（`initI18nInstance` + `pullFeatureFlags` + createRoot）→ `src/app.tsx` → **路由表 `src/routes/index.tsx`**（createBrowserRouter）→ 懒加载 `src/routes/async-components.tsx`。外壳 `src/layout.tsx` → `GlobalLayout`/`useAppInit`(`@coze-foundation/global-adapter`)；`SpaceLayout` + `SpaceIdLayout`；Agent IDE 外壳 `@coze-agent-ide/layout-adapter`。路由 `loader()` 返回 `{hasSider, requireAuth, subMenu}`。

| path | 实现 |
|---|---|
| `/` → `/space`；`/docs/*`、`/open/docs/*` | `src/pages/redirect.tsx`（跳 coze.cn） |
| `/sign`、`/oauth/confirm` | `account-ui-adapter` / `@coze-studio/open-auth` |
| `/space/:space_id/develop` | `src/pages/develop.tsx` → `workspace-adapter/develop` |
| `/space/:space_id/bot/:bot_id`(+`/publish`) | `@coze-agent-ide/entry-adapter`(BotEditor) / `agent-publish` |
| `/space/:space_id/project-ide/:project_id/*` | `@coze-project-ide/main` / `project-publish` |
| `/space/:space_id/library` | `src/pages/library.tsx` → `workspace-adapter/library` |
| `/space/:space_id/knowledge/:dataset_id`(+`/upload`)、`/database/:table_id` | `workspace-base/knowledge-preview` 等 |
| `/space/:space_id/plugin/:plugin_id`(+`tool/:tool_id`) | `src/pages/plugin/*` + `@coze-studio/bot-plugin-store` |
| `/work_flow` | `@coze-workflow/playground-adapter`（hasSider:false，全屏） |
| `/search/:word`、`/explore/{plugin,template}` | `@coze-community/explore` |

构建 = **Rsbuild(Rspack)**：app 配置 `rsbuild.config.ts`，公共 preset `@coze-arch/rsbuild-config`（`frontend/config/rsbuild-config/src/index.ts`：react/less/sass/svgr、`SemiRspackPlugin`、split-by-size）。**dev 端口 8080 硬编码**（rsbuild-config/src/index.ts:60），代理 `/api`、`/v1` → `http://localhost:${WEB_SERVER_PORT||8888}`。

### 状态 / API / 流式

- **Zustand ^4.4.7**（全仓统一）。代表 store：`@coze-arch/bot-studio-store`、`@coze-foundation/global-store`、`@coze-studio/{bot-detail,bot-plugin,user}-store`、`@coze-agent-ide/bot-editor-context-store`。project-ide 用 inversify DI。
- 契约：`ROOT/idl/`(**49 个 thrift**) → `@coze-arch/idl2ts-*` 生成 → 产物在 `@coze-arch/idl`(`frontend/packages/arch/idl/src/auto-generated/<domain>`) → 聚合封装 `@coze-arch/bot-api`（每域一个 service 单例 + `axios.ts` 统一 Toast.error，可用 `__disableErrorToast` 关；请求头 `Agw-Js-Conv: str`）→ 传输/错误 `@coze-arch/bot-http`（`ApiError`；**401 → 读 body `data.redirect_uri` 自动跳登录**）。
- 登录态：`@coze-foundation/foundation-sdk`(`src/{passport,user,space}.ts`) + `account-base/-adapter`。
- **SSE**：`@coze-arch/fetch-stream`(`src/fetch-stream.ts`，fetch + TransformStream + web-streams-polyfill)。聊天流协议在 `@coze-common/chat-core`(`src/chat-sdk/index.ts` 的 `chunkProcessor.streamBuffer` 增量合并、`request-manager/`、`events/`)。消费方：chat-uikit / `agent-ide/space-bot` / `studio/open-platform/open-chat` / `project-ide/main`。

### UI 体系

Semi Design `@douyinfe/semi-ui ~2.72.3`（经 `@coze-arch/bot-semi` 再导出）+ `@coze-arch/coze-design`；主题 `@coze-arch/semi-theme-hand01`（SemiRspackPlugin 注入，rsbuild-config ~L115-135）；Tailwind 3.3（preset `@coze-arch/tailwind-config`，design-token 与 Semi 打通）；图标 `@coze-arch/bot-icons` + semi-icons。
**i18n**：引擎 `@coze-arch/i18n`（全局单例 `I18n.t('key')`，语言存 `localStorage['i18next']`）；文案资源 `@coze-studio/studio-i18n-resource-adapter` → `frontend/packages/arch/resources/studio-i18n-resource/src/locales/{zh-CN.json,en.json}`（约 **14,368 key**）。加一条文案 = 两个 json 同步加 key + `I18n.t('your_key')`。

### 常见需求的改动落点

| 需求 | 落点 |
|---|---|
| Agent 编辑器右侧配置/资源面板 | `frontend/packages/agent-ide/bot-config-area/` |
| 调试预览聊天 | `agent-ide/chat-debug-area/` + `chat-area-provider/` |
| 人设 prompt 编辑 | `agent-ide/prompt/`（接 `common/prompt-kit`、`bot-monaco-editor`） |
| 插件挂载到 Agent | `agent-ide/{tool,tool-config,plugin-content/setting/area/modal-adapter}` |
| Chat 消息渲染 | `common/chat-area/chat-uikit/src/components/`；流程 `chat-area/`；能力插件 `plugin-chat-shortcuts`/`plugin-message-grab`/`plugin-resume`/`chat-area-plugin-reasoning`/`chat-workflow-render` |
| Workflow 画布 | 图库 = **Flowgram.ai 0.1.28**（free-layout），封装在 `common/flowgram-adapter/free-layout-editor`；主场 `workflow/playground/src/`（`components/node-panel`、`node-render`、`node-side-sheet`、`problem-panel`、`test-run-kit`）；调试域 `workflow/test-run-next/{main,form,trace,shared}` |
| 加一种 Workflow 节点 | 枚举 `workflow/base/src/types/{node-type.ts,registry.ts}`(StandardNodeType) → `workflow/playground/src/node-registries/<node>/`（+`src/nodes-v2/`）→ 表单 `workflow/nodes` → setter `workflow/setters` → 后端 `domain/workflow/internal/nodes/<type>/` + `entity/node_meta.go` 枚举 |
| 知识库/资源库页面 | `studio/workspace/entry-base/src/pages/{library,knowledge-preview,knowledge-upload,database}` + `data/knowledge/*` |
| 插件详情页/调试 | `studio/workspace/entry-base/src/pages/{plugin,tool}` + `@coze-studio/bot-plugin-store`；调试 `agent-ide/bot-plugin/{entry,tools,mock-set}` + `devops/debug/debug-panel` + `mockset-editor` |

### 工程化命令

```bash
rush update | rush install --to tag:core
rush build | rush rebuild -o @coze-studio/app
rush lint | rush test | rush test:cov | rush ts-check
rush lint-staged | rush commit            # conventional commits
rush increment --action {build|test:cov|lint|ts-check|package-audit} -p changed-files.json   # CI 增量
rush init-project                          # 用 common/_templates 建包
cd <pkg> && rushx dev|build|lint|test|test:cov
```

- 覆盖率门禁在 `frontend/rushx-config.json` 的 `codecov` 段：默认 20%/增量 80%；level-1 80%/90%；level-2 30%/60%；level-3/4 0%。（CI 里 codecov 上传被注释，属软门禁。）
- Vitest ~3.0.5，preset `@coze-arch/vitest-config`（forks 池 maxForks 32）。
- CI：`.github/workflows/ci.yml`（PR，Node 22.16.0，jobs = setup→build/test:cov/lint/ts-check/package-audit）、`ci@main.yml`、`ci@backend.yml`、`idl.yaml`（thriftgo 0.4.1 + kitex 0.13.1 语法校验）、`license-check.yaml`、`semantic-pull-request.yaml`、`claude.yml`；文件体积检查 `.github/scripts/check-file-size.sh`。
- 构建产物：`make fe` → `scripts/build_fe.sh` = `rush rebuild -o @coze-studio/app` → `frontend/apps/coze-studio/dist/` → 拷到 `backend/static/` 和 `bin/resources/static/`（Go 直接托管）。Docker 形态：`frontend/Dockerfile`（node:22-alpine 构建 → **nginx:1.25-alpine**）→ 服务 `coze-web`，`docker/nginx/conf.d/default.conf`：SPA fallback + `/(api|v1-3|admin)` → `coze-server:8888` + `/local_storage/` → minio:9000。

### 前端坑清单

1. 用 npm/pnpm install 而非 `rush update` → phantom node_modules 被拦。
2. Node < 21（`.nvmrc` 误导）。
3. 单包构建要先 build 依赖 → 用 `rush build --to <pkg>`。
4. 切分支 lockfile 过期（install 走 frozen lockfile）→ 重跑 `rush update`。
5. 没跑 `rush update` 导致 autoinstallers(plugins/lint-staged) 缺失 → pre-commit 卡死。
6. 改 IDL 后没重新 idl2ts → `@coze-arch/idl` 类型缺字段。
7. dev 8080 `strictPort` + 代理固定 localhost:8888，后端没起就全 502。
8. rsbuild `watchOptions.poll=true` + include `../../packages` → CPU 高属预期。
9. 新增包必须：改 `rush.json` projects（packageName/projectFolder/tags）→ `rush update`；目录深度 3~6；备齐 `config/rush-project.json`、`eslint.config.js`（缺了 package-audit 报 error）、`tsconfig.json`、`README.md`、`vitest.config.ts`。
10. 内部依赖一律 `"workspace:*"`（禁写版本号，`no-duplicated-deps` 会报）；三方版本统一在 `common/config/subspaces/default/common-versions.json`。
11. 自定义 lint（`@coze-arch/eslint-plugin`）：`no-pkg-dir-import`、`no-batch-import-or-export`、`no-deep-relative-import`、`package-disallow-deps`、`max-lines-per-function`、`tsx-no-leaked-render`。

## 5. 其它值得知道的

- `docs/`（仓库根）只有 6 篇，全是后端集成指南：`nats-eventbus-integration-guide.md(-en)`、`pulsar-eventbus-integration-guide.md(-en)`、`oceanbase-integration-guide.md(-en)`。
- `.claude/agents/frontend-infrastructure-expert.md`（子代理定义）、`.mcp.json`（GitHub MCP，Bearer `${GITHUB_PAT}`）、`.vscode/settings.template.json`。
- `helm/charts/opencoze/files/mysql/` 与 `docker/volumes/mysql/schema.sql` 是同一份 schema 的两处拷贝，改表要一起同步。

## 6. 还没读透的（下次需要时再深挖）

- `domain/workflow/internal/nodes/*` 21 个节点实现的逐个细节（只读了枚举与 compose 主链）。
- `application/` 18 个子目录各自的 Service 方法清单。
- `api/handler/coze/*` 16 个 service handler 的逐个端点映射。
- 前端 259 个包只列了代表包，未逐包读。
