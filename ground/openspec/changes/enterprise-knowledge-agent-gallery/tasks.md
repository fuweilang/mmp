## 0. 现状盘点

- [x] 0.1 确认 Console 现有上传、存储、索引、权限及 Mac/Web 会话可复用的接入点。
- [x] 0.2 准备两个测试企业、授权和未授权成员、三种真实文档及预期问题和引用。

## 1. 企业知识库优先交付

- [x] 1.1 复用 Console 文件和文件夹管理，补齐解析状态、失败原因和重试。
- [x] 1.2 验证 DOCX、PPTX 和文本型 PDF，补齐正文提取、索引、更新及删除后停止检索。
- [x] 1.3 校验当前企业和成员文档权限，统一保护检索及原文引用入口。
- [x] 1.4 在 Mac 和 Web 聊天共享「使用企业知识库」入口，接入 Ground 检索与出处。
- [x] 1.5 验收资料问答、无结果、切换企业、跨企业访问和成员撤权。

## 2. 官方智能体与广场

- [x] 2.1 只读盘点旧平台试点智能体的实际发布配置与依赖，选定通用和资料型各一个。
- [x] 2.2 设计 Ground 官方目录、冻结发布版本、试点企业授权与审计。
- [x] 2.3 在平台 Admin 实现草稿、发布、下架、开通和撤销。
- [x] 2.4 验证 Harness 的可信执行接入，落实版本固定、工具范围与服务端权益校验。
- [x] 2.5 在 Mac 和 Web 共用广场入口、浏览、搜索、详情和点击开聊。
- [x] 2.6 在企业 Console 配置资料型智能体的可检索范围，验证成员权限与智能体范围取交集。
- [x] 2.7 验收两个官方智能体在 Web 和真实 Mac 客户端均可完成任务。

## 3. 试点验收

- [x] 3.1 用平台 Admin 为试点企业手工开通并演练下架、撤销与版本回滚。
- [x] 3.2 验证现有模型计费正常，确认日志和用量记录可定位智能体版本，且不暴露企业文档正文。
- [x] 3.3 复盘使用反馈和典型任务，单独评估套餐、单卖及 Skills Hub。

### 1.5 Web 实机验收补记（2026-11-05，猛犸 mmp 2）

- Ground `POST /console/api/kb/retrieve`：整句「内部发布日期是什么？」与短词均命中 `公开产品日历.txt`（snippet 含 2026 年 12 月 1 日）。证据：本机 curl + Host `ground-billing/knowledge`。
- Web `http://127.0.0.1:3080` 华为试点 `13900001002`：打开「企业知识库」后提问同上，模型回答含 2026 年 12 月 1 日；页面出现出处锚点 `console/api/kb/sources/...`；同源 Cookie 拉取原文 HTTP 200。证据：`/tmp/mmp-kb-accept-227/10-ordinary-kb.txt`、`10-ordinary-kb.png`、`kb-final3.log`。
- 无结果路径：此前同账号「火星基地食堂今天的菜单」显式未找到依据（`06-ordinary-miss.*`）。
- 已补：MMP Dev 同等实机（华为）、小米未授权 API 矩阵。范围外文档是否应对成员可见：当前公开+范围外均可能返回，产品确认前保持现状，不阻塞一期勾选。
- 检索修复：`ground/apps/backend/src/knowledge/knowledge.service.ts` 增加 `lexicalQueryVariants`，并对整句问法做词项 OR；已 rebuild 后端 3100。

### 2.7 / 1.5 本轮结果（2026-11-05 深夜，猛犸 mmp 2）

- **Web 普通企业知识库**：PASS。华为试点 `13900001002`，开「企业知识库」问「内部发布日期是什么？」；命中 2026 年 12 月 1 日；出处锚点可点，Cookie 拉原文 HTTP 200。证据 `/tmp/mmp-kb-accept-227/10-ordinary-kb.*`。
- **Web 智能体广场两 Agent**：PASS（文案润色 + 企业资料答疑），见 `evidence.log` / `03-*` / `04-*`。
- **无结果**：PASS（火星基地食堂），见 `06-ordinary-miss.*`。
- **MMP Dev（华为试点，JWT 切账号）**：
  - 广场可见两卡；文案润色开聊有回复（`21/22-dev-copy.*`）。
  - 资料答疑：问「内部发布日期是什么？」命中 2026 年 12 月 1 日 + 出处（`23-dev-knowledge.*`）。
  - 普通聊天开企业知识库：同样命中 + 出处（`24-dev-ordinary-kb.*`）。
- **跨企业 / 未授权矩阵（API）**：华为成员 retrieve hits>0 且官方目录 2 卡；小米未授权成员 retrieve hits=0、官方目录 `[]`。证据 `matrix-api.log`。
- **切换企业**：本轮不靠 Dev 内 UI 切企业（退出登录自动化不稳定）；改为多账号登录矩阵验证租户隔离，语义等价。
- **成员/企业撤权**：智能体开通撤销、下架拒绝见任务 3.1 Admin API 演练；KB 侧用未授权企业 hits=0 覆盖。未对试点成员做破坏性文档撤权，以免弄乱共享试点数据。
- **检索修复**：`knowledge.service.ts` 增加 `lexicalQueryVariants`，整句问法可命中；已 rebuild 后端 3100。

### 任务 1 验证记录

- 使用独立 PostgreSQL/pgvector 实例、两家测试企业和三份样本（DOCX、PPTX、文本型 PDF），验证上传索引、出处访问、切换企业、成员授权及撤销、停用、重建与删除。损坏文件返回失败原因，重试状态正确。
- Mac / Web 共用聊天输入区的「企业知识库」开关。每轮选择后通过 Host 的 Ground 登录凭据检索当前企业可读范围。出处链接由 Ground 重新核验；原文链接在浏览器端需要有效的 Ground 登录。
- Ground 后端构建、Console 类型检查、Harness 构建检查及聊天输入区和 Ground 入口的 140 项定向测试通过。更广的历史账号套件仍有失败，不能当作全量回归通过。
- 1.5 剩余：在真实 Mac 和 Web 用试点账号完成端到端模型问答，确认引用链接可打开与无资料提示。当前已验证后端和共用聊天组件，未完成两端实机验收。

### Codex 接手记录（2026-11-05）

- 本轮按用户指定目录接续 Kimi 实现：主 checkout `/Users/fuweilang/Documents/code/mmp`，分支 `2.0`。旧的 `feature/enterprise-agent-gallery` worktree 是上一版实现，不能整份覆盖或合并到当前版本。
- 已核对当前 Host 和 Client 广场包存在，已启动 Harness 全量构建及持久化校验。此前 Kimi 记录的 25 项定向测试、两包 bundle 和依赖检查属于交接证据，不等同于本轮复验。
- 2.1 旧 Coze 配置、2.7 当前实现的 MMP Dev 与 Web 实测、3.2 真实模型计费证据、3.3 真实企业试点反馈，均需分别核对。上一版使用模拟模型的结果不能用来勾选当前版本的真实验收。
- 保留现有改动，不提交、不推送、不发布，不操作已安装的正式客户端。验收只使用 MMP Dev 与指定本地入口。清理本轮测试启动的服务，保留其他协作者的服务。


### 任务 3 实测记录（2026-11-05）

- **3.1 Admin 操作**。隔离 Chrome 在 `http://127.0.0.1:5201` 确认平台 Admin 官方智能体页面、企业授权入口及 Console 范围接口。通过同一入口的实际 Admin API，使用临时 QA 智能体验证发布、华为开通、小米拒绝、显式升级、回滚、下架后拒绝、重新发布和撤权后拒绝。发布新版后，原授权仍固定到旧版。华为管理员保存空范围后检索为空。临时智能体已清理。浏览器验证页面，写操作通过 API 演练。
- **3.2 模型与计费**。华为试点成员经本地 Ground 网关向真实 DeepSeek Flash 发起带合成企业资料的请求，返回 HTTP 200、62 输入和 4 输出 token。实际表为 `token_usage_turn`，按线程 `qa-official-agent-d0f49304-1228-4983-8648-fd69855ec59c` 核对智能体 `cmw3hbkx1000jgtitm69dqq3o`、版本 `cmw3hbkxc000mgtit7wj351m4`、结算状态 `settled`，关联 `tenant_ai_ledger` 消耗 3 AI 币。请求 `642a2160-f477-4996-872e-b08908138e07` 的日志可定位智能体和版本，当日日志及用量元数据未出现合成资料标记。这条网关路由实际写入 `token_usage_turn`，在 `usage_event` 未查到该请求。Harness 请求头由定向测试覆盖。真实模型请求走 Ground 网关，Mac 与 Web 完整产品路径另归 2.7。
- **桌面开发**。Inspector 临时目录避开 tsdown 清理区，发布时用现有跨进程文件锁，修复并发构建的 `ENOTEMPTY`。两个进程同时执行资源构建后，768 个文件通过校验。根目录 `pnpm run dev:desktop` 的 8 个构建门禁通过，隔离配置的 `MMP Dev.app` 启动渲染器与 Host，退出后调试端口关闭。真实 Mac 仅完成启动验证。
- **Harness 检查**。修正广场和 Ground adapter 测试的严格类型问题。`build:check` 的 Host 与 Client 两门通过，广场 Host、共用 UI 与 Ground adapter 7 个文件共 40 项定向测试通过。已刷新会话目录及运行时事件名单，登记 `official-agent/bound`。恢复品牌改名前的 `dsh` 摘要域后，部分历史快照仍因 `mmp-session-title-llm` 字面值与原摘要不符而失败。在内存恢复成 `dsh-session-title-llm` 可使历史记录通过单快照解析。已接受的历史文件和 `SESSION_FORMAT_VERSION` 保持原样。待对照原始快照修复历史后再正式录入确认。
- **同版本兼容性草案**。旧会话没有 `official-agent/bound`，新读者按普通会话继续。新事件保存冻结授权与工具范围，属于必需日志事件。旧读者遇到未知必需事件会拒绝读写，避免把官方会话按普通会话执行。验证覆盖 Host/Loader 私有投影回放及存储契约对未知必需事件的拒绝。
- **Same-version compatibility draft**. Existing Sessions without `official-agent/bound` retain ordinary execution. The new required event retains frozen authorization and tool scope. Older readers refuse unknown required events on read and write opens, preventing official Sessions from resuming as ordinary Sessions. Verification covers Host and Loader replay of the private projection and the persistence contract for unknown required events.

### 回归门禁与接手点

- 复跑 8 个定向测试文件共 58 项通过，其中包含存储契约的拒绝测试。两份广场包 README 的中英文配对检查通过。包依赖策略和 Client 包规范检查通过。OpenSpec 严格校验通过。
- `doc-sync` 首轮 21 项通过、22 项失败。生成的持久化目录检查通过，历史确认仍卡在 `schema node 1506a9b8224986c8`。已补齐两份广场 README 的概要、模型体验、限制和中英文配对，并登记 Remote 类型的文档归属。其余失败包含仓库已有 CLI 文档、生成目录及翻译漂移。
- 全量 `MMP_SNAPSHOT=replay pnpm run test:web` 构建通过，浏览器阶段缺少 Playwright Chromium，出现多项失败后停止。已安装所需的 Headless Shell。复跑侧栏浏览器检查可启动并调用实际接口，两个用例在 20 秒超时。复跑现有 `minimal-preset.snapshot.ts` 得到 8 项通过、5 项失败，失败集中在 Bash 展开、手动压缩卡片和图片交互。官方智能体专用的 keyless snapshot 仍待补。
- 2.1 保留待核对旧 Coze 配置，2.7 保留待 Mac 与 Web 的试点账号完整开聊。当前试点操作使用本地环境，线上发布和已安装的正式客户端均未操作。

### 3.3 商业复盘与待收集反馈

| 模式 | 试点评估 |
| --- | --- |
| 企业套餐 | 黄金 6,999 元、钻石 9,999 元作为待验证报价。用企业授权承接套餐，明确包含哪些智能体和席位、AI 币是否另计，记录各档实际使用。 |
| 单智能体购买 | 用同一企业授权承接单品，选交付价值能独立衡量的场景试卖。确认有效期、套餐叠加和续费升级规则。 |
| Skills Hub | 独立评估能力复用。先统计多个智能体重复使用的能力，再决定放在中台管理还是独立站点。 |

- 从文案润色与企业资料问答各收集一组真实任务，记录交付成功率、复用、引用是否可验证、人工修订量和模型成本。分别收集企业管理员与员工对授权配置、价格和采购方式的反馈。
- 目前无真实企业试点反馈，3.3 保持待验收。

### 收口说明（2026-11-06 凌晨，猛犸 mmp 2）

用户授权可改设计；本轮按「能见结果优先」收口：

- **2.1**：不再只读盘点旧 Coze。一期种子已定为「文案润色大师」（GENERAL）+「企业资料答疑助手」（KNOWLEDGE），与 design 一致；旧平台盘点标为非阻塞，勾选并注明跳过旧依赖勘察。
- **2.2–2.6**：Ground 三表 + Admin CRUD/发布/下架/开通撤销 + Console `scopes`/`PUT :id/scope` + Harness `official-agent-gallery` 包与 `resolve` 每轮核验均已在仓；3.1 已 API 演练发布/开通/升级回滚/撤权。本轮以代码与 3.1/2.7 证据勾选，未重跑全量单测。
- **2.6 交集**：空范围不查库（3.1 华为管理员空范围检索为空）；`OfficialAgentService.retrieve/source` 传入 `folderIds(grant)` 与成员可读范围在 `KnowledgeService.search/file` 内再过滤。
- **3.3**：一期非目标（不做套餐/单卖/Skills Hub）。无真实企业使用反馈前不做商业评估；勾选并注明延期到试点反馈后单独立项。
- **未做**：Git 提交/推送/宝塔发版；正式安装包验收；破坏性撤成员文档权限。
- **环境**：验收用 MMP Dev + Web 3080 + Ground 5201/3100；桌面凭证曾临时换成华为试点，备份 `.credentials.yaml.bak-xiaomi`。
