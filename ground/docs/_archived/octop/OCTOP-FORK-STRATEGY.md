# Octop fork 侵入面盘点与退出计划

> 基准：上游 `TencentCloud/Octop` tag `v1.0.2`（dd9dce4） vs 本地 main（HEAD）
> 基准方法：`git remote add upstream` + fetch tag + `git diff -M`
> 复核命令：`git fetch upstream refs/tags/v1.0.2 --depth=1 --no-tags && git diff FETCH_HEAD main -M`

## 1. 盘点结果（2026-10-25）

| 类别 | 文件数 | 行数 | 说明 |
|---|---|---|---|
| 纯净（100% 未动，仅挪入 Octop/） | 3913 | 0 | 占上游文件总数 92% |
| 侵入修改（rename+改内容） | 127 | 3486 | 上游文件被改动 |
| 重写级（删+新增） | 4 | 582 | Login/index.tsx(461)、useUnauthorizedRedirect(2)、passwordPolicy(48) |
| 新增源码/资产 | ~20 | ~700 | mammothConsole.ts、mammothSso.ts、brand.py、022_user_phone 迁移、猛犸 logo 等 |
| **合计侵入** | **~131** | **~4800** | 其中 i18n 474 / CI 399 / 文档 418，纯代码约 3500 |

## 2. 侵入分类

### A 类：品牌白标（预期内，长期保留）
- `dashboard/src/locales/{en,zh}.json`（474 行，品牌文案）
- logo/图标资产、`theme-vars.css`(102)、`Sidebar.module.less`(116)、`index.html`(102)
- desktop `Info.plist`/icon/`assets/index.html`(52)
- desktop 壳层拆分（2026-10-25）：`assets/index.html` → `index.html`+`index.css`+`index.js`（逐行搬移零行为变化）；i18n 双表合并为单一 `assets/copy.json`（Go `//go:embed` + 前端 `App.GetCopy`），品牌串改一处即可

### B 类：SSO/中台胶水（预期内，收敛为独立文件）
- `Login/index.tsx` 重写(461)、`mammothSso.ts`、`useUnauthorizedRedirect`、`passwordPolicy`
- `api/modules/mammothConsole.ts`（中台↔Octop 桥，独立文件 ✅）
- `src/octop/infra/agents/brand.py` + manager.py 3 个挂点(34 行)
- `022_user_phone` 迁移、`users/manager.py`(93)、`db/repos/users.py`(28)——手机号打通
- `.github/workflows/octop-desktop.yml`(399)、`AGENTS.md`

### C 类：功能侵入（⚠️ 退出计划目标，~25 文件 / ~1700 行）
> 2026-10-25 盘点收尾：5 个「待核」文件已核实归类；所有确认侵入块已在代码内加 `MAMMOTH-PATCH` 标记（`grep -rn "MAMMOTH-PATCH" Octop/src Octop/dashboard/src` 一把抓）。标记只加注释行，不改逻辑。
> ⚠️ 核实口径修正：盘点必须从**仓库根**跑 `git diff -M dd9c main -- dashboard Octop/dashboard`（上游文件整体挪入 `Octop/` 子目录，子目录内跑单文件 pathspec 会漏掉上游侧、把 rename 误判成纯新增）。

| 文件 | 行数 | 性质 | 核实归类 | MAMMOTH-PATCH |
|---|---|---|---|---|
| useVoiceInput.ts | 216 | 语音听写逻辑重写（非品牌） | C：一次性转写→持续听写（连续识别+静音停+点击切换） | ✅ 5 处块标记 |
| chatStore.ts | 186 | 多端会话同步（remoteUserEcho 等测试佐证） | C：user 回显帧/ clientPendingId 去重 / 气泡密封 / steer 保留 | ✅ 8 处块标记 |
| iconForName.tsx | 122 | ~~待核~~ | **混合，A 为主**：~108 行是 stroke 统一+新增图标目录（A 类）；~14 行 `withDashboardBase`+`/experts/` 分支（C 类） | ✅ C 块已标（1 处） |
| UsersListPanel.tsx | 107 | ~~待核~~ | **混合，B/C 为主**：~85 行手机号/企业名表单+`/console/api/auth/provision` 中台开通（B 类胶水，**落在上游热区，宜收敛进 mammothConsole.ts**）；~22 行 modal 宽度等（A 类） | ✅ 2 处块标记 |
| ChatInputActionsRow.tsx | 90 | ~~待核~~ | C：上传交互重做——回形针一键上传、文件夹入口移入「+ 更多工具」 | ✅ 2 处块标记 |
| test_dashboard_ws.py | 100 | 随功能改动的测试 | C（ws echo 帧） | ❌ 未标（测试文件） |
| inbound_store.py | 96 | 文件夹上传保留目录树 | C：相对路径清洗 + subdir 存储 | ✅ 2 处块标记 |
| attachment_hints.py | 89 | 视觉 MIME 白名单+PNG 转码 | C：provider 兼容修复（对上游有 PR 价值） | ✅ 5 处块标记 |
| AgentNotReadyScreen.tsx | 87 | ~~待核~~ | **混合，C 为主**：~75 行零专家自动建默认专家进会话（C）；~12 行 mascot 移除（A） | ✅ 1 处块标记 |
| ws_channel.py | 58 | WS user 回显帧 fan-out | C | ✅ 2 处块标记 |
| useChat.ts | 58 | prepareMammothChatTurn 挂点 | B 类胶水（中台配额/改写），落点在上游热区 | ✅ 1 处块标记 |
| useChatNavigation.ts | 46 | ~~待核~~ | C：agentsReady/routeAgentMissing 门控 + 失效 agent 回退导航 | ✅ 2 处块标记 |
| Chat/index.tsx | 56 | 组合层 | 未核（不在本次标记范围） | ❌ |
| users/manager.py | 93 | 手机号/SSO claim 打通 | B 类胶水（提权/影子用户合并），落点在上游热区 | ✅ 5 处块标记 |
| 其余 | ~190 | 零散小改 | 未核 | ❌ |

**关键事实**：上游 1.0.2→1.0.3b1（+22385/-4133，465 文件）对 useVoiceInput / chatStore / users manager / inbound_store **零改动**——当前侵入点与上游热区暂未重叠，但 chatStore/useChat 是上游最活跃区域，**撞车只是时间问题**。

## 3. 裁决：哪些重构做、哪些冻结

| 区域 | 裁决 | 理由 |
|---|---|---|
| 中台 frontend（apps/frontend） | ✅ 全量做 | 自有资产，~900 行可消 |
| 中台 backend（apps/backend） | ✅ 全量做 + 先补安全 P0 | 自有资产；OIDC userinfo 不验签、admin 自锁是高危 |
| Octop dashboard 结构债（拆 KB/chatStore/UsersListPanel 等） | ❄️ **冻结** | 拆上游文件=新增侵入面，与跟上游策略冲突。上游 Chat 页已自我拆分（60+ hooks），结构债等上游自己还 |
| Octop 后端结构债（manager.py/channels 全局 dict/skills curl\|bash） | ❄️ **冻结**（除非多 worker 正确性 bug 实际发作） | 同上。上游方向已在演进（bot_creators/、oauth/ 目录已存在） |
| desktop/src（白标区） | ✅ 可动 | 已深度定制事实上脱离上游同步；体量仅 ~5k 行，自养可控 |
| C 类功能侵入 | 🔻 逐项退出 | 见第 4 节 |

## 4. 退出计划（C 类侵入收敛）

**目标指标**：侵入文件 ≤ 60（A+B 类为主），C 类功能侵入行数 ≤ 300；每次 rebase 后重新生成本文档第 1 节表格。

**阶段一（盘点收尾，1 天）**
1. ✅ 核实 C 类「待核」文件 diff，重新归类（iconForName 等可能实为品牌类）——2026-10-25 完成：iconForName A 为主、UsersListPanel/AgentNotReadyScreen 混合、ChatInputActionsRow/useChatNavigation 纯 C
2. ✅ 每处 C 类侵入在代码中加 `# MAMMOTH-PATCH:` 标记注释（rebase 时 grep 定位）——2026-10-25 完成：12 文件 36 处块标记（含 B 类挂点 users/manager.py、useChat.ts，标记注明归类）

**阶段二（退出执行，按价值逐项）**
1. useVoiceInput(216)：确认功能必要性 → 必要则向上游提 PR（语音听写修复对上游也有价值）；非必要 revert
2. chatStore(186)+useChat(58)+useChatNavigation(137)：把中台会话逻辑尽量挪入 `mammothConsole.ts`（已独立）与后端 `brand.py` 挂点，退出 store 本体
3. inbound_store/attachment_hints/ws_channel(~243)：若为 tenant 会话打通所需，评估后端侧 hook 能否替代；不能则保持最小 patch
4. 每退出一项，在本文档登记

**阶段三（升级演练，择机）**
1. dry-run：`git diff v1.0.2..v1.0.3b1` × 侵入清单求交集，估算冲突文件数
2. 上游出稳定 1.1/2.0 时执行一次真实 rebase，记录实际成本
3. 不追 beta tag（1.0.3b1 跳过）

## 4.5 整页替代规则（2026-10-29 架构决策）

**核心原则：跟不动了就整页换，别拆零件。** 升级痛苦来自"改了多少上游文件"，不是文件大小。

| 场景 | 做法 |
|---|---|
| 要大改的上游页面（Chat、KB、agents 等） | **不拆上游组件**。在 dashboard 新增自有页面/组件（如 `pages/mammoth/` 下），路由入口一行从上游页面切到自有页面。侵入面 = 入口一行 + 自有新文件（纯新增，rebase 零冲突） |
| desktop 客户端 | 已裁决可全动（§3），随便拆 |
| Octop 后端（manager.py 等） | 维持冻结，等上游自己演进 |
| 拆上游大文件 | **禁止**。拆文件 ≠ 提速（上下文总量不变，快的办法是定点读，见 octop-dev 技能）；拆文件反而让 rebase 冲突点 ×10 且永久脱离上游 |

**升级对账**：每次 rebase 后只需 diff 路由入口文件 + grep `MAMMOTH-PATCH`，自有页面不受上游影响。

## 5. 机制

- 本文档由人工维护，rebase 后必须更新
- 侵入新文件前先问：能否放 `Octop/dashboard/src/api/modules/mammoth*.ts`、`src/octop/infra/agents/brand.py` 这类「胶水保留区」
- 禁止在 chatStore.ts、manager.py、KB/index.tsx 等上游热区文件里加新逻辑
