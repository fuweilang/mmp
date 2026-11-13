---
name: baota-release
description: >-
  用户说「发布猛犸宝塔」「发宝塔」「发版猛犸」「上线 mmai.vip」「回滚宝塔」时必须先读本 Skill 全文再执行；
  也用于排查宝塔发版慢、构建失败、镜像/网络、nginx 切流、发版后验收与回滚。适用于任意 AI 模型（DeepSeek / Kimi / ChatGPT / OpenCode）。
---

# 猛犸宝塔发版（MMP：ground + mammoth-agent）

## 0A. 授权门禁与本轮全栈/双Mac计划（2026-11-08新增，优先于下方历史默认）

**讨论、整理材料、完善Skill、预检，不等于构建/发布授权。** 只有用户明确批准执行路线、最终版本/通道、源码快照、生产窗口后才进入执行阶段。下方“一句话授权”、开跑命令及并行建议不适用于仅讨论/只读预检；第一阶段禁止运行发布/打包/doctor/smoke脚本，连dry-run也先读源码。不得因聊天历史曾发版就自动执行。

本轮用户已确认范围：**3.0全部新版代码**，包括Ground API、Admin/Console前端、mammoth-agent终端Web，以及mac-arm64和mac-x64两款桌面客户端；**Windows不构建、不上传、不删除旧包、不更新Windows feed/manifest子项**。不是“只发两个DMG、不更新中台”。此处是计划范围，不是现在发布授权。林杰/浪哥/秋池/李庚/王总/甜甜的审查任务不在本次自动投递范围；DeepSeek收到文案后也先报告等批准。

### 源码冻结与当前事实
- 最新事实补充（2026-11-08，Asia/Shanghai）：用户t65u报告已自行将3.0最新代码push到GitHub，代码备份已完成，不再要求先push。本轮只读本机HEAD与现有refs/remotes/origin/3.0，二者均为43bd7f6d898687cc11d4d50a84073d0e18b866eb；3.0未配置upstream。此为本机追踪ref一致，不是独立远端live核实；未fetch/pull或连接远端。两份发布文档的本轮补充仍分别是tracked修改和untracked新文件，未包含于当前HEAD，不能称已一并推送。已有GitHub备份不代表CI可用，也不授权dispatch/tag/再次push/部署；最终发布commit仍须在版本与阻塞处理后冻结。
- 2026-11-08静态核对：mmp是单Git仓库；ground与mammoth-agent没有独立.git/.gitmodules。分支3.0，候选HEAD `43bd7f6d898687cc11d4d50a84073d0e18b866eb`；编辑本补充前工作区干净，不能继续沿用旧95a1a61/37 dirty结论。2.0 `88656a65352752429e3be91d149b06261e47fec5`及云端资料库 `a612da7e…`均为该HEAD祖先。
- 发布前重新核对HEAD/完整dirty/untracked及所有权；最终版本或发布阻塞修复后必须重新冻结。记录release SHA、文件清单/sha、两份lockfile、工具链、迁移清单/校验和、构建参数、镜像digest和两架构制品hash。禁止无记录直接发dirty tree，也不能仅用git HEAD标签掩盖打包了未提交改动。
- 本地固定SHA归档/用户另行批准的本地commit可以建立可复现来源；用户已自行push完成GitHub代码备份，不需重复push。后续commit/再次push/打tag/dispatch仍分别需授权，已有备份不等于CI就绪或部署许可。也不得从GitHub旧分支取源码漏掉本地修复。

### 数据库不是MySQL；迁移和文件备份是一组门禁
- `ground/apps/backend/prisma/schema.prisma:5-7`为postgresql；production/compose.yml使用pgvector/pgvector:pg16、mammoth_core和prod_pg卷。宝塔装MySQL并不说明本产品连接MySQL。本轮没有SSH/读取实际生产连接，**线上实际引擎、扩展版本、schema与迁移状态仍待授权核实**；若真是MySQL立即停，不能直接套PG迁移。
- 仓库45项迁移。历史20261024180000_kb_search_usage要求vector和pg_trgm，含vector(64)；init-db.sh只在新卷首启创建vector，不会补救已有卷。资料库新增表本身不含向量列，但不能因此删掉全产品的pgvector要求。
- 核对专家广场相关官方专家/版本/授权/知识文档、managed_expert_definition、gallery_discovery_detail等及20261108040000_enterprise_library；是否待应用只能对线上_prisma_migrations/校验和判断，不能拿分支比较或“开发库已应用”推断生产。当前2.0..候选HEAD没有Prisma目录差异，说明这些定义亦在本地2.0基线，不说明生产已更新。
- Dockerfile.api:27 **启动即prisma migrate deploy**，release deploy执行compose up即可能改schema，不是纯换镜像。现脚本备份.env/静态页但没有完整DB备份/恢复演练门禁；先取得PG一致性备份、角色/扩展/迁移信息、隔离恢复验证与回滚兼容结论，才允许启动新API。只增量migrate deploy；禁reset、db push、migrate dev、改已应用SQL、生产seed。
- 必须覆盖prod_pg、data/library原文件/版本、data/uploads、data/api-state、真实MMP_WEB_HOST_DATA_ROOT（身份/会话/工作区/运行态）和只由受保护备份机制处理的secrets。DB与文件要有一致恢复点，记录恢复演练和可接受RPO/RTO。禁止rsync --delete针对部署根/data/downloads或删除卷；发布脚本中的静态页清空仅能命中middle-web、临时源码同步仅能命中该RELEASE_ID临时目录。
- 终端会话SQLite的单调SCHEMA_VERSION与released Session代际也要核对（mammoth-agent/AGENTS.md:8-10）；新数据不保证可被旧程序读，不能只验证PG迁移就宣称可降级。
- 回滚旧应用镜像不回滚数据库。若旧应用/旧客户端不兼容新schema/API，先设计expand/contract与灰度；无法证明兼容就停发。恢复生产数据另需用户明确确认，不能当普通镜像回滚顺手做。

### 当前静态发现的发布阻塞（尚未修脚本，不能照抄历史命令）
| 证据 | 风险与门槛 |
|---|---|
| production/release.sh:245-246 | dirty仅WARN，不是冻结门禁，主操必须额外拦截 |
| release.sh:230-311、doctor.sh:123-186 | preflight会SSH；release预检还会pull/tag基础镜像，doctor --network也会pull；不是本轮许可的纯文档动作 |
| ground/scripts/check-version.mjs:31-76及sync-mammoth-version.mjs | 仍查旧Octop且check读取.env；不能验证mammoth-agent桌面版本，也不适合本阶段“禁止读.env”直接运行 |
| production/preflight-local.sh:16-18 | ✅已修（2026-11-08）：默认要求 darwin-arm64+darwin-amd64，逐个校验 manifest 文件/大小/sha256，Windows 条目只保留不删除 |
| production/smoke.sh:9-14 | ✅已修（2026-11-08）：按 manifest 遍历所有平台做真实 GET + 大小 + sha256；探活用 Range，feed 存在时校验其引用 |
| scripts/collect-baota-desktop.ts:35-36、57-65 | ✅已修（2026-11-08）：manifest 改为合并（保留 Windows/其它架构），unsigned 支持 arm64+x64 并做 lipo 架构断言 |
| apps/desktop/scripts/upload-target.ts:125-143、desktop-release-tag.ts:64-69 | 普通production upload会向COS写文件并创建/推送desktop-v标签；不是单纯宝塔传包。当前禁止push时不可调用 |
| mammoth-agent/.github/workflows/{macos-package,macos-intel-package,desktop-publish}.yml | 文件在单仓子目录，根.github/workflows不存在；workflow内部仍假设checkout根是mammoth-agent，production source限制master或mmp-v*，Publish指向COS且会推tag。未核实远端根工作流/runner，不能说“推3.0就能原样CI发宝塔” |
| release.sh:137-139、491-498、545-559 | 历史done旧note未清仍在；回滚记录的nginx时间戳与实际切流备份时间须对照，不把state.done当已验收 |

### 双Mac打包与正式更新
- 实际Node本机v24.22.2/arm64；Ground声明Node>=22、pnpm10.32.1；mammoth-agent声明Node>=24.9、pnpm11.28.5，两份lockfile分别frozen，不能一套pnpm强行覆盖另一套。未实际跑依赖安装/构建检查。
- **2026-11-08 实测基线**：已发布 Ground `3.0.0` / 桌面 `0.3.0`（unsigned，两架构）；unsigned 包 bundle id 为 `com.deepseek.harness`（与线上 0.2.2-alpha.2 一致，`com.tencent.octop` 才禁止）；`unsigned-artifacts/` 下 arm64 的 `.app` 在 `mac-arm64/`、x64 在 `mac/`，DMG 为 `mammoth-ai-0.3.0-mac-<arch>-unsigned.dmg`。mmp 家族 379 个 manifest 必须同一版本，核心包 `@mammoth-ai/mmp` 在 `apps/cli`、Desktop Host 在 `apps/desktop-host`。
- 当前Ground版本2.0.0；mammoth-agent及apps/desktop版本0.2.2-alpha.2。二者不是现脚本已自动同步的单一桌面版本；须确认最终中台/桌面版本、API兼容和nightly/latest。mammoth-agent/apps/desktop/scripts/electron-builder-config.mjs:105拒绝带预发布后缀的latest；不要把alpha强塞latest或中途静默bump。
- 只选mac-arm64、mac-x64。package-target.ts支持Apple Silicon原生arm64和Rosetta下x64准备；两者共享ARM自托管CI runner并不等于真Intel实机验收。x64主程序、Electron/Node/Python/runtime、system.node及其它原生模块都必须逐个file/lipo及运行确认；registry兜底须版本匹配，文件名不能证明架构。两target隔离输出，同机串行避免共享产物/CPU竞争。
- 正式签名、公证、stapling与现有bundle ID/Team ID/用户数据目录、钥匙串/SSO回调身份连续性必须验证；不要从旧文强行套com.mammoth或把com.tencent.octop旧包上线。签名/公证只走受保护的正常工具流程，不读取/输出私钥、证书密码、Keychain秘密。旧文unsigned仅内部测试，不能冒充正式分发/自动更新。
- 正式产物在.desktop-build/targets/<target>/artifacts，unsigned-artifacts和unnotarized-artifacts不合格；pack命令显式--publish never，上传另一步批准。实际artifactName以构建记录/目录为准，不按旧硬编码DMG路径取包。
- 不只是DMG：正式自动更新还要ZIP、ZIP.blockmap、对应nightly-mac.yml/latest-mac.yml、release record和sha512/size；production feed分架构位于https://www.mmai.vip/downloads/mmp-desk/feeds/mac-{arm64,x64}/，二进制位于相应bin目录。兼容下载页mammoth-latest.json与mmp-latest-macos-*.dmg固定入口必须分别核对，不能拿旧shell manifest代替electron updater feed。
- 先上传版本化文件并本地/服务器/公网真实GET三处校验，再最后原子更新各架构feed及兼容manifest/固定别名；保留上一版和原Windows子项/文件/更新元数据，禁止全downloads同步删除，也不顺手提高Windows最低版本或强更规则；旧Windows与新API须兼容。确认nginx/CDN/COS实际路由到同一批准来源；未核实时不能假设同域名同存储。旧客户端与新API、旧App升级保数据、渠道不串、双Mac首轮真实会话/模型/权限/引用均需验收。

### 推荐路线与批准点
本轮优先建议：**本机固定源码快照→两Mac签名公证打包→按批准的宝塔下载目录发布**；GitHub代码备份已由用户自行push完成，不必把打包地点与备份地点绑死，也不要求再次push。全栈仍按当前production链路：本地Ground前端/API镜像，mammoth-agent Web在原生amd64服务器临时目录构建，完成后清理源码。旧mmPlatform“全在本地构建/禁服务器build”的规则不适用于现mmp Web；本轮尚未执行。

GitHub代码备份已完成；CI路线仍需另行批准并补齐单仓workflow路径/版本tag约束、自托管runner、签名公证、仅Mac目标与宝塔发布目的地；现有desktop-publish是COS+Git标签链路，不是现成宝塔发布。两条路线都不自动获得commit/push/tag/部署权限。

用户只需先决策：①本地冻结打包（推荐）还是经适配的GitHub CI；②最终Ground/桌面版本与nightly/latest、正式签名公证及既有App身份延续；③预检阻塞关闭后另行批准执行及生产窗口（全栈+双Mac范围已确认，无需再次选择）。未批准前只提交预检报告和待修清单，不构建、不SSH、不迁移、不上传、不通知DeepSeek。

### 0B. 2026-11-08 全栈+双Mac 复盘：2h04m 的时间分布与固化门禁

实测：19:11 用户 HEAD → 21:15 验收通过。必要耗时约 35 分钟，返工约 60 分钟。

| 耗时节点 | 实测 | 性质 | 固化动作 |
|---|---|---|---|
| 类型/构建门禁 212 个 TS 错误 | 31 min | 源码不可发版 | 排期前先跑 `pnpm --dir mammoth-agent run build --profile local` |
| Web 镜像反复重建 6 次 | 累计 ~40 min | 与 ground 源码耦合 | 见 4E 第 3 条；先在服务器试构建一次 |
| 桌面 x64 打包 | 17 min | 必要 | 保留缓存，串行，勿并行双 target |
| 改 tsconfig 的弯路 | 15 min | 人为返工 | 先 `git stash` 验证 HEAD 是否本来就绿，再动配置 |
| 桌面 arm64 打包 | 9 min | 必要 | 与中台并行，先开最慢的 |
| 备份+恢复演练+生产核查 | 8 min | 必要 | 已固化 |
| 家族版本一致性返工 2 次 | 5 min | 规则不了解 | 见 4E 第 2 条 |
| 部署+15 迁移+nginx+smoke | 5 min | 必要 | 已固化 |

**发版前 10 分钟门禁（全绿才排期，任一失败先修）**

1. `cd mammoth-agent && pnpm run build --profile local` → 必须 `10 passed, 0 failed`。3.0 曾在首跑就以 212 个错误失败，白等 31 分钟。
2. 家族版本一致：`packages/*/*/package.json`、`apps/*/package.json`、根 `package.json` 的 version 必须全等；核心包 `@mammoth-ai/mmp` 在 `apps/cli`，Desktop Host 在 `apps/desktop-host`。`bump.ts` 只能从"已一致"状态前进，混合状态会直接抛错。
3. 超管登录真实 200：`release-private/admin-credentials.txt` 可能过期（本次 401，账号 active 但密码被改）。凭据不通就不要排期，否则登录后的验收全做不了。
4. 服务器：磁盘 ≥40G、无 `.release.lock`、`downloads/` 现有 manifest 与 Windows 资产已落到 state 里。
5. 记下当前 `MMP_API_IMAGE`/`MMP_WEB_IMAGE` 与上一版镜像 tag，作为回滚基线。
6. **下载指针一致性**：manifest 的 `file` 必须是本次产物；两个固定别名必须同步替换，否则页面显示新版本、用户下到旧包。
7. **nginx 白名单**：新增 Ground 公共路径（如 `official-agents`）要同步进 `/api/(...)` 代理正则，否则头像/静态资源 401。
8. **目录数据行数**：后台专家/技能/知识库页面先查 `official_*` 行数，空表是数据问题不是代码问题。
9. **仓库不得有数据导出**：`git ls-files | grep -E '\.(sql|dump)$'` 必须为空（3.1 曾把 2.2MB 的 `_backups/*.sql` 连同 `public."user"` 推到 GitHub）。
10. **API 产物路径**：构建后 `test -f ground/apps/backend/dist/main.js`。新增 `apps/backend/scripts/` 后 Nest 共同根会上移，输出变成 `dist/src/main.js`，容器直接 `MODULE_NOT_FOUND`。
11. **签名能力**：`security find-identity -v -p codesigning` 为 0 时只能出 unsigned，manifest 必须保持 `signed:false`、`automatic_updates:false`，并在验收里写明"首次打开需右键"。
12. **版本同步**：改完 `ground/config/version.json` 必须跑 `pnpm --dir ground run version:sync`，并核对 `packages/shared/src/version.ts` 已变；否则接口/前端仍是旧版本（4K 坑 5）。
13. **环境文件**：业务键只写 `/www/mmp-prod/production.env`（compose `env_file`）；`.env` 只放镜像 tag 与 `POSTGRES_PASSWORD`（4K 坑 4）。
14. **短信通道对齐**：`node ground/infra/production/check-sms-env.mjs <production.env> --runtime` 必须通过；provider 必须是代码支持的那个（tencent/aliyun），不许 mock 回落（4K 坑 6）。
15. **基础镜像在位**：`docker images | grep -E 'node:24-bookworm|docker:28-cli'`，缺则本机 `save|ssh load` + `docker tag hub.rat.dev/library/...`；**不要 `docker image prune -af`**（4K 坑 1/2/3）。
16. **镜像导出可信**：`docker save` 后必须验证 tar（本地 `docker load -i` 试一次，或对端 load 无 `unpack layer` 报错）；多架构镜像优先 digest 精确拉取（4K 坑 2）。
17. **校验脚本化**：公网 size/sha 校验用 `python3` 或显式变量，禁止 `set -- $var` 靠 zsh 拆分（4K 坑 8）。

**本次结果基线**：`3.0.0-20261108-1930`；api `mmp-api:3.0.0-20261108-1930`、web `mmp-web:3.0.0-20261108-r6`；迁移 45/45（发布前 30/45）；arm64 `532040d0…93b000` 268030061B、x64 `2557015f…1e90c9` 289439357B；`state.json` 落在 `release/3.0.0-20261108-1930/`。验收缺口只有"登录后业务验收"（凭据过期）与"真 Intel 实机"。

---

## 0. 一句话授权

用户说 **「发布猛犸宝塔」** = 授权按本 Skill 执行。

**一键入口**：`ground/infra/production/release.sh --yes`（详见第 4 节方式 A）。

默认范围：**中台 api + web + pg**，只替换 `https://www.mmai.vip`。
默认不做：Octop、客户端 dmg、GitHub PR、commit/push。

只有用户明确说“发客户端 / 发 dmg / 发安装包”才处理客户端。

## 1. 红线（违反即停）

| # | 红线 |
|---|---|
| 1 | **单主操**：同一时间只允许一个会话发版。发版前必须拿 `/www/mmp-prod/.release.lock`；锁存在且未过期 → 停止并问人 |
| 2 | **只动 `www.mmai.vip` 和 `/www/mmp-prod`**。`/www/mammoth`、宝塔其他站点、其他容器一律不碰 |
| 3 | **禁止在 Apple Silicon 上构建 web 镜像**（不要用 `--platform linux/amd64` 跑 mammoth-agent web）；web 镜像必须在服务器原生构建 |
| 4 | 宝塔只留镜像 + `middle-web/` + `downloads/` + `secrets/` + `data/`，**不留源码树** |
| 5 | 不打印明文密码/密钥；凭据只放 `release-private/`，权限 600 |
| 6 | 不擅自 commit/push；不改 mammoth-agent 业务代码（修发版阻塞除外，需单独说明） |
| 7 | 不用 `--no-cache`；不执行 `docker system prune -a`；不重启整台服务器 |
| 8 | nginx 只 `reload`，不 `restart`，避免影响同机其他站点 |
| 9 | 发版未跑 smoke + 验收清单，不得说“发布完成” |
| 10 | 发版结束必须释放锁、写 state、汇报镜像 tag 与回滚方式 |
| 11 | **所有网络下载必须带超时，并校验实际字节/镜像**；HTTP 200/302 不算成功 |
| 12 | **能跑 `release.sh` 就不要手工拼命令**；手工步骤只在脚本报错排障时用 |

## 2. 环境事实

| 项 | 值 |
|---|---|
| 本机仓库 | `/Users/fuweilang/Documents/code/mmp`（`ground/` + `mammoth-agent/`） |
| 服务器 | `root@124.223.179.250`（SSH key，`BatchMode=yes` 可用） |
| 宝塔面板 | `https://124.223.179.250:18888/39af4bfb`（密码不进文档） |
| 新栈目录 | `/www/mmp-prod` |
| compose 项目 | `mmp-prod-v1` |
| api | `127.0.0.1:33100 → 3100` |
| web | host 网络 `33080` |
| pg | 容器内 `5432`，库 `mammoth_core`，卷 `prod_pg` |
| 站点配置 | `/www/server/panel/vhost/nginx/www.mmai.vip.conf` + `extension/www.mmai.vip/mammoth.conf` |
| 静态包 | `/www/mmp-prod/middle-web/` |
| 客户端包 | `/www/mmp-prod/downloads/`（本轮可空） |
| 旧栈（勿动） | `/www/mammoth`，`mammoth-api:3100`、`mammoth-octop:8088` |
| 超管 | `13800000001`，密码见 `release-private/admin-credentials.txt` |

## 3. 版本与命名

唯一版本源：`ground/config/version.json`。分支名 ≠ 版本号。

```bash
cd /Users/fuweilang/Documents/code/mmp
export VERSION="$(node -p "require('./ground/config/version.json').version")"
export RELEASE_ID="$VERSION-$(date +%Y%m%d-%H%M)"
export RELEASE_DIR="$PWD/release/$RELEASE_ID"
export HOST=root@124.223.179.250
mkdir -p "$RELEASE_DIR"
```

镜像 tag、release 目录、state 文件全部用同一个 `RELEASE_ID`。禁止再出现 `20261104` 目录配 `20261105` 镜像的情况。

## 4. 发版流程（按顺序，不许跳）

### 方式 A：一键脚本（推荐，任意模型优先用）

```bash
cd /Users/fuweilang/Documents/code/mmp
./ground/infra/production/doctor.sh              # 只读体检（可选，建议先跑）
./ground/infra/production/release.sh --dry-run   # 先看计划
./ground/infra/production/release.sh --yes       # 正式发版
```

脚本内部就是下面 Step 0–9：抢锁、写 state、本机构建前端/api、服务器构建 web、
上传部署、切 nginx、smoke，并在退出时释放锁。中断后按提示续跑：

```bash
./ground/infra/production/release.sh --release-id <ID> --from web --yes
```

只有在脚本报错需要排障、或需要改脚本时，才按方式 B 手工执行。

### 方式 B：手工步骤（排障/兜底）

### Step 0 预检 + 抢锁 + 建 state

```bash
pnpm --dir ground run version:check
git status --short
git -C mammoth-agent rev-parse HEAD
ssh "$HOST" 'df -h / | tail -1; docker --version; docker compose version'
```

磁盘剩余必须 ≥ 30G。

抢锁（文件存在就停）：

```bash
ssh "$HOST" 'mkdir -p /www/mmp-prod; test ! -f /www/mmp-prod/.release.lock || { echo "LOCKED:"; cat /www/mmp-prod/.release.lock; exit 3; }'
printf 'release=%s\nsession=%s\nstarted=%s\n' "$RELEASE_ID" "${OPENCODE_SESSION_ID:-local}" "$(date -Is)" \
  | ssh "$HOST" 'cat > /www/mmp-prod/.release.lock'
```

锁一旦拿到，后续无论成功失败都要释放（见 Step 9）。

建 `$RELEASE_DIR/state.json`，字段见第 8 节。每完成一步就更新，换模型/断线可续。

### Step 1 构建前端（本机，快）

```bash
cd ground
VITE_AGENT_WEB_URL=https://www.mmai.vip/ pnpm --filter @mammoth/shared build
VITE_AGENT_WEB_URL=https://www.mmai.vip/ pnpm --filter @mammoth/frontend build
tar -C apps/frontend/dist -czf "$RELEASE_DIR/middle-web.tar.gz" .
```

### Step 2 构建 API 镜像（本机，可接受）

```bash
cd /Users/fuweilang/Documents/code/mmp/ground
docker build --platform linux/amd64 -f infra/production/Dockerfile.api -t "mmp-api:$RELEASE_ID" .
```

**必须立刻验依赖**，不通过就不许发：

```bash
docker run --rm --platform linux/amd64 "mmp-api:$RELEASE_ID" \
  node -e "require.resolve('express'); console.log('deps ok')"
docker save "mmp-api:$RELEASE_ID" | gzip -1 > "$RELEASE_DIR/mmp-api-image.tar.gz"
```

### Step 3 构建 web 镜像（必须在服务器，原生 amd64）

同步源码。**不要排除 `*/lib`、`scripts/release`**：

```bash
cd /Users/fuweilang/Documents/code/mmp
rsync -az --delete \
  --exclude node_modules --exclude .git --exclude .desktop-build \
  --exclude release --exclude releases \
  mammoth-agent/ "$HOST:/tmp/mmp-web-build/"
```

生成服务器专用 Dockerfile（只换基础镜像源），并确认关键文件存在：

```bash
COMMIT="$(git -C mammoth-agent rev-parse HEAD)"
ssh "$HOST" 'cd /tmp/mmp-web-build \
  && sed "s|^FROM node:24-bookworm|FROM hub.rat.dev/library/node:24-bookworm|; s|^FROM docker:28-cli|FROM hub.rat.dev/library/docker:28-cli|" \
       infra/production/Dockerfile > Dockerfile.server \
  && sed -i "s|^\*\*/lib$|# **/lib|" .dockerignore \
  && test -s scripts/release/process.ts \
  && test -s packages/llm/llm-ground/lib/types/index.js \
  && echo source-ok'
```

启动构建（后台 + 日志）：

```bash
ssh "$HOST" "cd /tmp/mmp-web-build && setsid nohup docker build --platform linux/amd64 \
  --build-arg MMP_CLIENT_COMMIT_HASH=$COMMIT \
  -f Dockerfile.server -t mmp-web:$RELEASE_ID . \
  > /tmp/mmp-web-build.log 2>&1 < /dev/null & echo started"
```

轮询，禁止盲等超过 5 分钟：

```bash
ssh "$HOST" 'tail -6 /tmp/mmp-web-build.log; pgrep -f "docker build" >/dev/null && echo RUNNING || echo DONE'
```

- 正常：约 10–20 分钟。
- 超过 25 分钟仍在同一阶段：看最后 40 行，按第 7 节排查，不要继续睡等。

### Step 4 准备并上传发布包

`production.env` 不在仓库里。首次从 `production.env.example` 生成；已存在则**只备份、不覆盖**：

```bash
cd "$RELEASE_DIR"
cp /Users/fuweilang/Documents/code/mmp/ground/infra/production/{compose.yml,nginx-mmai.conf,proxy-common.conf,init-db.sh} .
# production.env 不在仓库：首次从 example 生成后填密钥；已有则从服务器拉回，禁止覆盖
test -f production.env || cp /Users/fuweilang/Documents/code/mmp/ground/infra/production/production.env.example production.env
ssh "$HOST" 'mkdir -p /tmp/mmp-release'
scp compose.yml production.env nginx-mmai.conf proxy-common.conf init-db.sh middle-web.tar.gz "$HOST:/tmp/mmp-release/"
```

服务器落位（先备份）：

```bash
ssh "$HOST" 'set -e; TS=$(date +%Y%m%d-%H%M%S); cd /www/mmp-prod \
  && cp -a .env .env.bak-$TS \
  && cp -a middle-web middle-web.bak-$TS \
  && rm -rf middle-web/* \
  && tar -xzf /tmp/mmp-release/middle-web.tar.gz -C middle-web \
  && cp /tmp/mmp-release/{compose.yml,nginx-mmai.conf,proxy-common.conf,init-db.sh} . \
  && echo "backup=$TS"'
```

### Step 5 载入镜像并启动

```bash
gunzip -c "$RELEASE_DIR/mmp-api-image.tar.gz" | ssh "$HOST" 'docker load'
```

原子更新 `.env` 后启动：

```bash
ssh "$HOST" "cd /www/mmp-prod \
  && sed -e 's|^MMP_API_IMAGE=.*|MMP_API_IMAGE=mmp-api:$RELEASE_ID|' \
         -e 's|^MMP_WEB_IMAGE=.*|MMP_WEB_IMAGE=mmp-web:$RELEASE_ID|' \
         .env > .env.new && mv .env.new .env \
  && docker compose up -d \
  && sleep 15 && docker compose ps"
```

检查 api 日志：必须看到 migrate 完成 + `Nest application successfully started`；**不能有** `Cannot find module` / `MODULE_NOT_FOUND`。

### Step 6 超管（仅首次或密码重置）

```bash
curl -s -X POST https://www.mmai.vip/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"phone":"13800000001","password":"<见 release-private/admin-credentials.txt>"}'
```

要求 200 且返回用户信息。若权限不全，检查 `user_role` 是否有 `super_admin`。

### Step 7 切 nginx（只 reload）

```bash
ssh "$HOST" 'set -e; TS=$(date +%Y%m%d-%H%M%S); \
  cp -a /www/server/panel/vhost/nginx/www.mmai.vip.conf /www/server/panel/vhost/nginx/www.mmai.vip.conf.bak-$TS; \
  cp -a /www/server/panel/vhost/nginx/extension/www.mmai.vip/mammoth.conf /www/server/panel/vhost/nginx/extension/www.mmai.vip/mammoth.conf.bak-$TS; \
  cp /www/mmp-prod/nginx-mmai.conf /www/server/panel/vhost/nginx/extension/www.mmai.vip/mammoth.conf; \
  nginx -t && nginx -s reload && echo nginx-ok'
```

`nginx -t` 失败立即还原备份，不得强行 reload。

必须确认配置里有这两条，否则后台页面会报“接口未就绪：返回的不是 JSON”：

```nginx
location ^~ /console/api/ { proxy_pass http://127.0.0.1:33100/api/; ... }
location ^~ /admin/api/   { proxy_pass http://127.0.0.1:33100/api/admin/; ... }
```

### Step 8 smoke + 验收

```bash
cd /Users/fuweilang/Documents/code/mmp
./ground/infra/production/smoke.sh https://www.mmai.vip
```

再逐项：

| 检查 | 期望 |
|---|---|
| `GET /` | 303 → `/login`，页面含“猛犸” |
| `GET /agent` | 410 |
| `GET /login` `/console/` `/admin/` | 200 |
| `GET /api/health` | 200 `{"ok":true}` |
| `GET /api/version` | 200，版本 = `version.json` |
| `GET /admin/api/users`（带登录 cookie） | 200，`application/json` |
| `GET /console/api/version` | 200 JSON |
| 真实登录 | 200，能进 `/console/` |
| `docker compose ps` | api/web/pg 均 Up，`RestartCount=0` |
| web 日志 | 无 `No usable native binding`、无 `failed to map segment` |
| 下载页 | 无包时明确提示，不报 500 |

### Step 9 收尾

```bash
ssh "$HOST" 'rm -rf /tmp/mmp-web-build /tmp/mmp-web-build.log /tmp/mmp-release; rm -f /www/mmp-prod/.release.lock; df -h / | tail -1'
```

镜像保留策略：当前版本 + 上一个版本，其余删除；删除前先 `docker images` 列出来给用户确认。

更新 `state.json` 为 `done`，按第 9 节格式汇报。

## 4A. 提速与并行（2026-11-05 起建议照做）

### 两条独立流水线，并行跑

| 流水线 | 内容 | 是否占发布锁 | 依赖 |
|---|---|---|---|
| A：中台 + web | `release.sh`（Step 0–9） | 占 | 无 |
| B：客户端安装包 | 本机打 dmg/exe | 不占 | 无，只有最后传 `downloads/` 才碰服务器 |

客户端打包起步就是 30–60 分钟，**先把它在后台开跑，再发中台**；总时长 ≈ max(A, B) + 传 latest.json，而不是 A + B。

### 流水线 A 内部的并行点（方式 B 手工时）

1. **Step 1（本机前端构建）与 Step 3（服务器 web 镜像）互不依赖**：rsync 完源码立刻在服务器后台启动 `docker build`，回本机接着做前端和 api 镜像，别串行傻等。
2. **Step 2（api 镜像 docker build）与 Step 1（pnpm build）可并行**，两个进程互不等。
3. **api 镜像 `docker save | gzip` 上传与服务器 web build 并行**：一个吃本机上行带宽，一个吃服务器 CPU。

### 流水线 B（客户端三包）的打法

- 三个 target 的产物目录互相隔离（`.desktop-build/targets/<name>/`），但**不要三开**；本机建议只开一个 desktop target 与 `release.sh` 并行。
- 打包是 CPU 密集型；本机核心数不多时：**客户端串行打包、中台并行**——出一个包校验一个，传的同时打下一个。
- **Windows 包不能在 macOS 上打**：`package-target.ts` 明确要求 `win-x64` 使用 Windows x64 构建机；走 `.github/workflows/windows-package.yml`（发布必须 signed），本轮不打就在下载页显示“暂未提供”。
- flock 平台包已内建进打包流程（`package-target.ts` 优先本地 cross-compiled 平台包，缺失才回退 registry），缺失会直接在 `prepare:packages` 报错，不会出坏包。
- **别清 `.desktop-build/`**（Electron/pnpm store 缓存）和服务器 docker 层缓存，重复打包提速主要靠这两处。

### 顺序总原则

1. **先开客户端最慢的 target（mac-arm64）**，再跑中台 + web；客户端上传放最后，避开 api 镜像上传。
2. 客户端包最后走 `downloads/`；`mammoth-latest.json` **永远最后传**（先传产物、备份旧 json、再改指针）。
3. 任何一条流水线炸了，另一条不受影响，各自独立回滚。

### 时间预期

| 范围 | 顺利 | 踩坑 |
|---|---|---|
| 仅中台 + web | 20–40 分钟 | 1 小时 |
| 全量（含三包 + 上传） | 1–1.5 小时（并行后） | 2–3 小时 |

大头永远是客户端打包和安装包上传（取决于本机上行带宽），中台本身很快。

## 4B. 2026-11-05 复盘：今天踩过并已解决的坑

| # | 现象 | 根因 | 处理 | 以后规避 |
|---|---|---|---|---|
| 1 | web 镜像构建报 `ERR_MODULE_NOT_FOUND .../scripts/release/process.ts` | rsync 的 `--exclude release` 把嵌套的 `scripts/release/` 也排掉了 | 改成锚定根目录：`--exclude '/release' --exclude '/releases'`，重新同步 | 所有 rsync 排除根目录必须带 `/`；构建前 `test -s .../scripts/release/process.ts` |
| 2 | 容器起来后本机 `curl` 健康检查 404/421 | 没带公网 Host，web 按 Host 路由 | 健康检查加 `-H 'Host: www.mmai.vip'` | 容器内检查也必须带 Host；最终以公网 smoke 为准 |
| 3 | 跨架构 desktop 构建 TS 报找不到 `pack-registry-package` 类型 | 只有 `.mjs`，缺 `.d.mts` 声明 | 补 `apps/desktop/scripts/pack-registry-package.d.mts`，import 使用声明 | 新增 `.mjs` 同步补 `.d.mts`；跨架构打包前先跑 `pnpm --dir apps/desktop run build` |
| 4 | 已装客户端第一轮会话报 `Cannot find module '@mammoth-ai/node-addon-system-<platform>-<arch>'` | 只打了入口包，目标平台原生包缺失；跨架构还可能优先拿到 registry 旧包 | `package-target.ts` 补打目标平台包；优先本地 cross-compiled addon，registry 兜底；`prepare-package-set.ts` 缺包直接报错 | 出包后检查 `app.asar.unpacked/.../node-addon-system-<platform>-<arch>`；首轮会话必须实测 |
| 5 | 上传 x64 时容易拿到 `release/desktop/` 里的旧包（旧 `2f1e…` vs 当次 `dc2f…`） | 两套产物目录并存，按目录名取文件会拿错 | 只从 `.desktop-build/targets/mac-x64/unsigned-artifacts/` 取当次文件，重传并更新 manifest | 禁止从 `release/desktop/` 旧目录上传；state 记录 source path + sha256 + size |
| 6 | 单平台重打后，manifest 里另一个平台仍可能指旧包 | 只重建了 arm64，没有逐个核对 x64 指针 | 重打所有对外平台，或只保留当次重打的平台并同步页面 | “一个平台重打，所有平台都核对 sha”；manifest 最后传 |
| 7 | 本轮没出 Windows 包，页面/manifest 若保留 Windows 入口就会 404 | manifest 只有 darwin-arm64/darwin-amd64，没有 `windows-amd64` | 页面对 Windows 显示“暂未提供”，不生成可点链接 | 页面平台列表必须由 manifest 生成；smoke 逐个 GET manifest 里的文件 |
| 8 | `mammoth-latest.json` 更新后客户端下载 404/旧包 | 先改指针后传产物，或旧 json 覆盖新 json | 先传产物并校验，备份旧 json，最后原子替换 json | 指针永远最后；保留 `.prev`，写清回滚命令 |
| 9 | `release/*/state.json` 停在 `deploying` | 手工静态部署（middle-web-only）没有收尾 | 补 `status=done/failed`、`finished_at`、note | 任何部署都建 state 并收尾；新会话先读 `release/*/state.json` |
| 10 | deploy 显示 done 但 `note=exit=1` | 上一次失败 note 残留，`state_update done` 未清空 | 以 status + smoke 为准，补写成功 note | `state_update done` 未传 note 时删除旧 note（脚本待补）；每次状态变更都写 note |
| 11 | web-only 热修后默认工作区/首屏仍不对 | 容器 HOME、默认工作目录、冷启动路径未一起设置 | 设置 `HOME` + `default-workspace`，加 warmup splash；验证 657ms/3419ms | web-only 也要验收 `defaultWorkspaceId`、冷启动、`RestartCount=0` |
| 12 | desktop 上传 state 已 done，之后又重传 arm64 但 state 没变 | 重传没有新建记录 | 新建 reupload step 或新 release id，更新 `finished_at` | 任何重传都必须留痕；manifest 的 `updated_at` 与 state 对得上 |
| 13 | 客户端打包/上传时本机 CPU、上行被中台构建抢满 | 两条流水线同时抢本机资源 | 桌面只开一个 target，等中台到服务器 web build 再开下一个；上传错开 api 镜像 | 同一时间只跑一个 desktop target；大文件上传串行 |

> 未闭环：今天 API 发版后，控制台权限 migration 是否已完全应用尚未单独复核；下次接手中台先查。

## 4C. 并行发版执行卡（客户端 + 中台）

> 2026-11-08 起以 **4F** 为准（含时间线、变更集裁剪、上传与部署错层）；本节保留为"只发客户端"场景的简版。

**结论：可以并行。** 客户端打包不占 `/www/mmp-prod/.release.lock`，也不依赖中台镜像；只有最后写 `downloads/` 时才碰服务器。

### 推荐时间线

| 阶段 | 本机 | 服务器 | 目的 |
|---|---|---|---|
| T0 | 后台开 `mac-arm64`（最慢） | — | 先让最慢的跑起来 |
| T0+1m | `release.sh --yes` | 抢锁、构建 | 两条独立流水线 |
| 中台进入 `web-image` | 开 `mac-x64` | 服务器 build web | 本机让出 CPU，避免和 api 构建互抢 |
| 中台 `deploy/smoke` | 继续 x64 / 准备上传 | 切流、验收 | 不要这时传大文件 |
| 中台完成 | 传 DMG → 校验 → 最后传 json | 只读校验 | 避开 api 镜像上传带宽 |

### 开跑命令

```bash
# 终端 1：客户端先开一个 target，别三开
cd /Users/fuweilang/Documents/code/mmp/mammoth-agent
export PATH="$HOME/.nvm/versions/node/v24.22.2/bin:$PATH"
nohup caffeinate -dimsu pnpm --dir apps/desktop run package:mac:arm64:unsigned \
  > /tmp/mmp-desktop-arm64.log 2>&1 &
echo $! > /tmp/mmp-desktop-arm64.pid
tail -f /tmp/mmp-desktop-arm64.log
```

```bash
# 终端 2：中台同时发
cd /Users/fuweilang/Documents/code/mmp
./ground/infra/production/release.sh --yes
```

```bash
# 中台进入 web-image 后，再开 x64；win-x64 不在 macOS 上打
cd /Users/fuweilang/Documents/code/mmp/mammoth-agent
pnpm --dir apps/desktop run package:mac:x64:unsigned
```

### 并行边界

| 可以并行 | 不要并行 |
|---|---|
| 客户端打包 vs `release.sh` | 两个 `release.sh` / 两个 nginx reload / 两个 `compose up` |
| 本机前端构建 vs 服务器 web 镜像 | 三个 desktop target 同时开 |
| api 镜像 docker build vs 本机前端构建 | DMG 上传 vs api 镜像上传 |
| 下一个 target 打包 vs 上一个 target 校验 | `mammoth-latest.json` 先于产物上传 |

### 资源竞争

| 资源 | 风险 | 建议 |
|---|---|---|
| CPU | Electron/asar 与本地 Docker build 互抢 | 同一时间只开一个 desktop target；中台到服务器构建后再开下一个 |
| 内存 | Colima + Electron + 打包缓存 | 至少留 8G；不够就先发中台，客户端排队 |
| 上行 | DMG 200–300MB，api tar 约 300MB | 大文件串行；中台 smoke 通过后再传 DMG |
| 磁盘 | 三包 + Electron 缓存约 2–3G | 打包前 `df -h`，别清 `.desktop-build` |
| 休眠 | 合盖杀进程 | `caffeinate -dimsu`，长任务放独立终端 |

## 4D. 其他可优化点（按优先级）

| 优先级 | 建议 | 收益 | 落点 |
|---|---|---|---|
| P0 | 上传先写 `.tmp`，服务器 `mv` 原子替换；json 同样 | 客户端不会下到半个文件 | 第 6 节命令 |
| P0 | `downloads/` 上传单独串行，或加 `.downloads.lock` | 防止两个会话互相覆盖 | `release.sh` / 客户端上传脚本 |
| P0 | `state_update done` 未传 note 时清空旧 note，并补 `finished_at` | 不再出现 done + `exit=1` 的误导 | `release.sh`（待改） |
| P0 | smoke 按 manifest 遍历所有平台，校验文件存在 + sha/大小 | Windows/arm64 漏传能立刻发现 | `smoke.sh` |
| P1 | `release.sh --with-desktop`（建议新增）：自动后台开 mac-arm64，主流程结束后等待并上传 | 一条命令完成并行，不靠人记 | 新 wrapper 或 `release.sh` 开关 |
| P1 | 废弃 `release/desktop/` 作为上传源，只认 `.desktop-build/targets/` | 消灭“旧包/新包”混用 | 文档 + 上传脚本 |
| P1 | 下载页平台列表从 manifest 生成；无包平台显示“暂未提供” | 不再出现死链接 | 前端下载组件 |
| P1 | 出包自动检查 `file`/`lipo` 架构 + `app.asar.unpacked` 原生包 | 跨架构坏包在打包阶段暴露 | `package-target.ts` / 校验脚本 |
| P2 | manifest 增加可选 `bytes`、`built_at`；客户端忽略未知字段 | 大小一致性可机器校验 | schema v3 兼容 |
| P2 | 桌面包保留上一版 + 一键回滚（DMG + json） | 客户端回滚不用手拼 | `downloads/` 备份 + 脚本 |

## 4E. 2026-11-08 新坑与规避（全栈+双Mac，已实测）

| # | 现象 | 根因 | 处理 | 以后规避 |
|---|---|---|---|---|
| 1 | 桌面打包第一步失败：`run-gates: 8 passed, 2 failed`，212 个 TS 错误 | 3.0 分支从未完整跑过类型门禁：78×TS6307 文件不在项目清单、23×TS6142 host 程序编 `.tsx`、ui-conversation 真实类型、测试陈旧、`503` 不在联合类型 | 由 mammoth-agent 负责人修：client-face 测试改名 `.client.spec`、补齐清单、隔离 Ground library 项目、测试跟随真实类型 | 排期前先跑 `build --profile local`；失败就停，不要边发边修 |
| 2 | `@mammoth-ai/mmp@0.2.2-alpha.2 does not match Desktop 0.3.0`，接着 `mmp release members must share one version` | 只改了根/desktop；核心包在 `apps/cli`，Host 在 `apps/desktop-host`，家族共 379 个 manifest 必须同版本 | 批量把家族 manifest 统一到目标版本 + `pnpm install --lockfile-only` + 提交 | 改版本前先扫家族；`scripts/release/bump.ts` 只能从一致状态前进，不要指望它自救 |
| 3 | Web 镜像 `build:artifacts` 失败：先 `TS18003 No inputs`（`tsconfig.ground-library.json`），补目录后 `TS2307` 找不到 `jszip`/`pdf-parse`/`fast-xml-parser` | 镜像 build context 只有 `mammoth-agent/`，但 client 聚合引用了 `../ground/apps/backend/src/library` 及其依赖 | 只在**镜像内**打补丁：生成 `Dockerfile.server` 时去掉 `tsconfig.client.json` 里的 ground-library 引用并排除对应 spec；正式门禁保持 10/10 | Web 镜像改动先在服务器试构建一次，再排发布窗口 |
| 4 | 自己改 tsconfig 后冒出新的 TS6307，反复 3 轮 | host 聚合 `include` 为 `packages/*/*/tests/**/*.ts` 且只排除 `*.client.*`；把测试改成 `.ground.spec.ts` 反而被 host 吃回去 | `git stash` 验证 HEAD 本来 10/10，再回退到正确方案 | 动聚合配置前先 stash 对照；改名必须保留 `.client.` 段 |
| 5 | collect 报 `Unexpected application identity` / `Missing .app bundle` | 脚本硬编码 `com.mammoth.ai.desktop`、只支持 arm64、`.app` 路径写死 `input/<target>/` | 实际身份是 `com.deepseek.harness`（与线上 0.2.2 一致）；x64 的 `.app` 在 `unsigned-artifacts/mac/`，arm64 在 `mac-arm64/`；改为递归找 `.app` + `lipo` 断言架构 | 身份只校验"不是 `com.tencent.octop`"且为 `com.mammoth.*`/`com.deepseek.*`；产物目录用搜索不要硬编码 |
| 6 | `docker compose up` 报 `invalid reference format: mmp-web:mmp-web:...`，且错误值已写进 `.env` | 我给脚本传了 `mmp-web:tag`，脚本自己又拼前缀 | 手工改回 `.env` 后重跑 | 传参只传 tag；脚本内联校验镜像名格式 |
| 7 | smoke 首跑 `SMOKE_EXIT=28` | 探活用 30s 全量 GET，268MB 包必然超时 | 探活改 Range `-r 0-0`（200/206 均可），真实下载仍做全量 GET + size + sha256 | 大文件探活一律 Range；timeout 与体积挂钩 |
| 8 | 资料库接口 404 | nginx 新配置多了 `/api/(auth\|billing\|v1\|session-history\|oidc\|library)` 前缀 | 备份后替换 `extension/.../mammoth.conf` 并 `nginx -t && nginx -s reload` | 每次发版都 diff nginx 模板；有 diff 就必须切 |
| 9 | 服务器磁盘 92%（32G） | 每个 Web 镜像 3.67GB，多次重建叠加 | 删除被取代的中间镜像，只留当前+上一版 | 重建前先 `docker images` 盘点；构建目录放 `/tmp` 并清理 |
| 10 | `timeout: command not found`、`date -Is: invalid argument 's'` | macOS 自带工具与 Linux 不同 | 用 `perl`/`gtimeout` 或直接后台+轮询；时间戳写 `new Date().toISOString()` | 脚本不要依赖 GNU coreutils |
| 11 | ssh 命令 120s 超时但远端构建仍在跑 | `setsid nohup ... &` 后 ssh 会话不释放 | 以"日志出现 started + 远端 pgrep"为准 | 后台启动后加 `</dev/null` 并立即回显标记，不等待会话 |
| 12 | 生产库 30/45 迁移，发布即真实改 schema | 上次发版后 15 个迁移未应用 | 发布前 PG dump + 隔离恢复演练（31 表/6 用户通过）后再启动 | 迁移数量差异写进预检结论；禁止把"后端启动自动迁移"当无风险换镜像 |
| 13 | 超管登录 401 | `release-private` 里的密码已被改，账号 active | 按约定不改账号，报告并等待新凭据 | 预检阶段先验证登录，再排窗口 |
| 14 | 两份 release 文档导致 dirty | 文档改动不属于发布快照 | 在 state 里显式记录"排除项" | 冻结时写清纳入/排除清单，不用 tag 掩盖 |

**并行优化（本次验证有效）**：桌面 arm64 先开 → 中台前端/API 并行 → Web 镜像在服务器构建（不占本机）→ arm64 完成后立刻开 x64 → 部署与 smoke 期间不要传大文件 → 最后传 DMG 并切 manifest。本次关键路径 70 分钟，其余为返工。

## 4F. 并行与提速（2026-11-08 实测版）

### 4F.1 临界路径公式

```
墙钟 ≈ max(桌面 arm64 + x64 串行, 前端 + API 镜像 + Web 镜像) + 部署 + 验收
     ≈ max(9 + 17, 1.5 + 5 + 9) + 4 + 4 ≈ 26 + 8 ≈ 34 分钟
```

桌面两架构**必须串行**（8 核机器并行会互相抢 CPU，实测更慢），但"串行"只约束桌面包本身；其余都可以塞进这 26 分钟的窗口里。

### 4F.2 推荐时间线（全栈 + 双 Mac，目标 35 分钟）

| 时刻 | 本机 | 服务器 | 说明 |
|---|---|---|---|
| T+0 | 冻结 SHA、家族版本扫描、`build --profile local` | 无锁确认、磁盘≥40G | 门禁 2 分钟 |
| T+2 | **开 mac-arm64**（后台）+ 前端构建 + API 镜像构建 | `pg_dump` + 隔离恢复演练 | 备份与构建同时开始 |
| T+2 | rsync 源码（与桌面无关） | **开 Web 镜像构建** | 服务器 CPU 与本机互不抢 |
| T+3 | 前端产物打包 middle-web.tar.gz | — | 5 秒 |
| T+11 | arm64 出包 → **立刻上传**（版本化文件名） | — | 上传不占 CPU |
| T+12 | **开 mac-x64** | Web 镜像给结果 | 上传与 x64 并行 |
| T+13 | API 镜像 `save \| ssh load` 流式上传 | 载入镜像 | 不落中间 tar |
| T+18 | — | 部署静态页 + compose up（迁移）+ nginx reload | 3 分钟 |
| T+21 | 基础 smoke（路由/健康/版本，30 秒） | — | 先确认没白屏 |
| T+22 | 后台开始 530MB 双包 GET + sha 校验 | — | 与 x64 打包并行 |
| T+28 | x64 出包 → 上传 → 合并 manifest（最后切指针） | — | 指针永远最后 |
| T+31 | 全量 smoke（含双架构真实下载） | — | 3 分钟 |
| T+34 | 收尾：解锁、state、清 `/tmp` | — | — |

### 4F.3 可并行 / 不可并行

| 可以并行（已验证） | 不可并行 |
|---|---|
| 桌面 arm64/x64 与中台前端、API 镜像 | 两个 desktop target 同时跑（抢 CPU） |
| Server Web 镜像构建 与 本机所有构建 | 两个 `compose up` / 两次 nginx reload |
| DMG 上传 与 下一个 target 打包 | 两个大文件上传同时跑（抢上行） |
| API 镜像流式上传 与 Web 镜像构建 | 先切 manifest 再传产物 |
| 双包真实 GET 校验 与 部署/迁移 | 两个会话同时发版（锁） |
| 数据库 dump/恢复演练 与 构建 | 数据库恢复与其他写操作并行 |

### 4F.4 按变更集裁剪（省时间最多的一招）

发布前用 `git diff --name-only <上次发布 SHA>..HEAD` 判断，只做必要步骤：

| 变更范围 | 可跳过 | 省时 |
|---|---|---|
| 只有 `ground/`（API/Admin/Console） | 双 Mac 打包、DMG 上传、manifest、Web 镜像 | ~35 min |
| 只有 `ground/apps/frontend` | 双 Mac、API 镜像、Web 镜像 | ~30 min |
| 只有 `mammoth-agent/`（终端 Web/桌面） | API 镜像、middle-web | ~6 min |
| 只有文档/`.opencode` | 全部构建，只发文档或干脆不发版 | ~40 min |
| 只有 Windows 相关 | Mac 双架构全部跳过（Windows 本轮不发） | 按需 |

### 4F.5 七条具体提速手段

1. **每出一个包立刻传**：不要等两个都打完才传；arm64 出包即上传，x64 继续打。省 2–3 分钟尾部。
2. **上传/校验与部署错层**：DMG 用版本化文件名先落盘，nginx 立即可下载；指针（manifest/feed）最后切。这样"下载校验"能与"迁移+nginx 切换"并行。
3. **镜像流式传输**：`docker save | gzip | ssh 'gunzip | docker load'`，不写本地 tar（省磁盘与一次 IO）。
4. **预拉基础镜像**：`node:24-bookworm`、`docker:28-cli`、`pgvector:pg16` 在预检阶段确认缓存，避免构建中卡 5–10 分钟。
5. **保留缓存永不清理**：`.desktop-build`（Electron/pnpm store）、服务器 docker 层、`ground/node_modules`。重复发布时 arm64 可从 9 分钟降到 6–7 分钟。
6. **manifest 预生成**：本地按产物算好 sha256/bytes 写模板，上传后只做替换与校验，避免手工拼 JSON 出错返工。
7. **门禁前移**：类型门禁、家族版本、超管登录三条放到"排期前"，失败就不占发布窗口（本次 31 分钟就是这么浪费的）。

### 4F.6 反模式（别做）

- 为了"并行"同时开两个 desktop target → CPU 抢占，两个都变慢。
- 边发版边修业务代码 → 快照失效，需要重新冻结、重新打包。
- 用 `--no-cache` / `docker system prune -a` 追求"干净" → 冷缓存反而多花 10 分钟以上。
- 先切 manifest 再传包 → 客户端下到 404 / 半个文件。
- 在发布窗口里跑全量测试套件 → 与打包抢 CPU，且不是发版门禁。
- 把"未签名包"塞进 latest feed → Gatekeeper 拦截 + 更新链路污染。

## 4G. 2026-11-08 第二轮：客户端返工、数据导入、下载链路（必读）

这一轮暴露的问题都不在"打包"本身，而在**发布指针、nginx 路由和数据资产**。下次按 4G 的顺序核对。

### 4G.1 新坑清单

| # | 现象 | 根因 | 处理 | 以后规避 |
|---|---|---|---|---|
| 1 | 下载弹窗写"最新版本 v0.3.0"，装完却是 0.2.2，没有资料库/专家广场 | 前端 `CLIENT_FILES` 写死固定别名 `/downloads/mammoth-agent-mac-*.dmg`，别名文件仍是上一版 | 立即把别名替换为新包；代码改为优先用 manifest 的 `file` | **每次发布必须同时更新 manifest 和两个固定别名**；不要只改 manifest |
| 2 | 加了 `Cache-Control: no-store` 却不生效 | `location ^~ /downloads/` 是 `^~` 前缀，优先级高于正则 location，正则里的缓存规则被忽略 | 用 `location = /downloads/<精确文件>`（精确匹配优先级最高） | 改完必须 `curl -sI` 看响应头，不能只看配置文件 |
| 3 | 老用户清缓存后仍拿到旧包 | 固定别名同名覆盖，中间层/浏览器可能保留旧实体 | 版本化文件名带提交号（`…-0.3.0-<sha>.dmg`），别名只做兼容 | 指针、别名 no-store；产物名唯一 |
| 4 | 后台专家/技能头像全部裂图，看着像"图片没导" | nginx 只代理 `auth|billing|v1|session-history|oidc|library`，`/api/official-agents/avatars/*` 被转发到 agent web，RPC 层返回 401 | 把 `official-agents|official-skills|official-knowledge` 加入 Ground API 白名单 | 新增任何 Ground 公共路径都要同步 nginx 白名单，并 `curl` 头像验证 200 |
| 5 | 后台三个页面空白，怀疑代码 bug | 生产 `official_*` 表全是 0 行，迁移成功但目录数据从未导入 | 先 `select count(*)` 再谈代码 | 空页面先查数据量/接口状态码，不要先改代码 |
| 6 | 导入 `official_*` 时 `relation … does not exist` | `pg_dump --data-only` 文件里有 `set_config('search_path','',false)`，`\i` 之后未限定 schema 的语句找不到表 | 导入脚本里 `SET search_path = public;` 或全部 schema 限定 | 数据导入一律 schema 限定 + 单事务 |
| 7 | 专家↔版本、技能↔包互相外键，无法按顺序插入 | 循环外键 | `SET session_replication_role = replica` 后插入，再校验完整性 | 导入后必须跑"孤儿行"检查（见 4G.3） |
| 8 | 本地租户 ID 在生产的授权表里不存在 | 本地/生产 `tenant` 是不同 ID | 按租户名映射（华为/小米），`granted_by_user_id` 置空 | 跨环境导入禁止直接搬用户/租户 ID |
| 9 | 知识库/技能文件导入后打不开 | 只导了数据库，没导 `uploads/official*` | rsync 三个目录，逐个 `storage_path` 校验存在 | 数据+文件必须同批，校验缺失数=0 |
| 10 | 资料库所有接口 403 `NO_TENANT` | 平台超管 `tenantId=null`，资料库按企业隔离 | 后端 `config` 返回 `enabled:false` 引导；临时用控制台"进入企业" | 平台账号的验收必须先切企业；不要把 403 当接口坏 |
| 11 | Intel 包打包最后一步失败：`LibreOffice conversion timed out` | 成品运行时自检里的 DOCX→PDF 在 Rosetta 下偶发超时，DMG 已生成且有效 | 只重跑 `smoke-packaged-runtime.ts`，不要重打 20 分钟 | `MMP_DESKTOP_TARGET_PLATFORM=darwin MMP_DESKTOP_TARGET_ARCH=x64 npx tsx apps/desktop/scripts/smoke-packaged-runtime.ts --unsigned` |
| 12 | rsync 源码报 `read errors mapping apps/web/dist/...map` | 桌面打包正在重写 `apps/web/dist`，rsync 读到半写文件 | 加排除后重传 | 同步源码时排除 `apps/web/dist`、`apps/desktop/dist` |
| 13 | Web 镜像构建报 `TS18003` / 找不到 `jszip` | 镜像 build context 只有 `mammoth-agent/`，但 client 类型检查引用 `../ground/apps/backend/src/library` 及其依赖 | 生成 `Dockerfile.server` 时：`COPY __ground_library__ /ground/apps/backend/src/library`，并只在镜像内剔除 ground-library 项目与对应 spec | 正式门禁保持 10/10；镜像内适配写进构建脚本 |
| 14 | `pgrep -f "docker build"` 显示在跑但镜像早已完成 | 匹配到其他进程/字符串 | 以 `docker images | grep <tag>` 为准 | 判断构建完成用镜像 tag + 日志尾部 |
| 15 | 部署后怀疑会话丢失 | 实际 `/api/auth/me` 仍 200 | 用真实请求验证，不靠猜测 | 发布后抽查线上会话接口 |

### 4G.2 下载发布检查单（每次发客户端必做）

1. 产物文件名带版本+提交号，两个架构分别计算 `sha256` 与字节数。
2. 先传版本化文件（`.tmp` → `mv`），服务器 `sha256sum` 与本地一致。
3. 公网 `curl -L` 真实下载，sha256 与大小一致（不能只 HEAD）。
4. 更新 manifest（两个平台、`file`/`sha256`/`bytes`）。
5. **同步替换两个固定别名**（`mammoth-agent-mac-arm64.dmg` / `-x64.dmg`），保留 `.prev-<ts>`。
6. `curl -sI` 校验：manifest 与别名均为 `no-store`，`content-length` 与产物一致。
7. 下载页实际点一次两个架构，确认安装后版本号与功能（资料库/专家广场）都在。

### 4G.3 数据导入检查单（跨环境搬目录数据）

1. 目标表行数先记录；事务内导入，失败即回滚。
2. 导出：`pg_dump --data-only --column-inserts --no-owner --no-acl --table=…`。
3. 导入：`BEGIN; SET session_replication_role = replica; … SET search_path=public; … COMMIT;`
4. 关联表按名称映射（如 `tenant.name`），不要搬本地用户/租户 ID。
5. 文件：`rsync` 对应 `uploads/*` 子目录，**不加 `--delete`**。
6. 校验（全部必须为 0）：在线版本↔专家、版本↔专家、文档↔专家、分块↔文档、授权↔租户、缺失文件数。
7. 导入前后各做一次 `pg_dump` 备份，并记录路径。

## 4H. 2026-11-09 复盘：把坑固化成门禁（下一轮直接照此优化）

### 4H.1 已落地（本轮已改代码，下次自动生效）

| 改动 | 防住的坑 |
|---|---|
| `smoke.sh` 增加**别名大小校验**：固定别名 `content-length` 必须等于 manifest 的 `bytes` | "页面显示新版本、实际下到旧包" |
| `smoke.sh` 增加**Ground 资产路由校验**：`/api/official-agents/avatars/*` 必须 200 | nginx 白名单漏配导致头像 401 |
| 下载页按 manifest `file` 解析，不再写死别名 | 别名漂移 |
| manifest 与两个别名 `no-store`（精确 `location =`） | 指针/别名被缓存 |
| 平台超管可在资料库面板内选择企业并切换 | 平台账号 NO_TENANT 死路 |

### 4H.2 建议补的自动化（按收益排序）

| 优先级 | 项 | 做法 | 收益 |
|---|---|---|---|
| P0 | 一键门禁 `scripts/preflight-release.mjs` | 一条命令检查：git 干净且 SHA 固定、家族版本全等、`build --profile local` 10/10、nginx `/api` 白名单覆盖前端用到的前缀、downloads 别名=manifest、`official_*` 行数、磁盘≥40G、无 `.release.lock` | 把 6 类坑挡在排期前，省 30 min+ |
| P0 | 发版基线文件 `release/last-release.json` | 记录 commit、manifest sha、镜像 tag、产物 sha；下次 `git diff <sha>..HEAD -- <目录>` 自动决定跳过哪些构建（4F.4） | 无客户端改动时省 30–35 min |
| P1 | 单脚本时间线（4F 的 T 表） | arm64 先开 → api/web 并行 → 每包即传 → x64 → 部署 → 全量 smoke，脚本内固定参数（镜像名只传 tag） | 少手工失误（本轮 deploy 传参就挂过一次） |
| P1 | `smoke.sh --quick` | 仅路由/健康/版本/别名大小，约 30 秒；切流前跑；全量下载 hash 放切流后 | 切流提前 3–4 min |
| P1 | 桌面成品自检自动重试 | `smoke-packaged-runtime.ts` 对 LibreOffice 超时重试 1 次，仍失败才报错 | 避免因 1 次超时重打 20 min |
| P2 | 发布验收账号 | `release-private/` 维护一个企业验收账号（不进仓库、不进聊天） | 登录后验收不再被凭据阻塞 |
| P2 | nginx 白名单自动对齐 | 从后端 Controller 前缀生成待代理清单，与 nginx regex 比对 | 结构性防止 401 类问题 |

### 4H.3 流程层（不写代码也能省时间）

1. **发布前 24 小时**先跑一遍完整门禁，不要在发布窗口里修类型/版本问题（本轮 31 min 就这么花的）。
2. 窗口内只做"构建 → 部署 → 验收"；任何代码修复都另开一次发布。
3. 客户端产物**每出一个就传一个**，不要等两个都打完（尾部省 2–3 min）。
4. 部署顺序固定：API 健康 → Web 起来 → nginx reload → 快速 smoke → 全量 smoke。
5. 每次收尾把新坑补进 4E/4G，并在 0B 增加对应门禁；不复盘等于白踩。
6. 发布结束写 `state.json` + `release/last-release.json`，下一个会话先读基线再决定构建范围。

## 4I. 2026-11-10 3.1 实发复盘：52 分钟、7 个坑、可落地的提速项

> 本轮范围：Ground API/Admin/Console + mammoth-agent Web 镜像 + mac-arm64 / mac-x64 unsigned DMG（Windows 不发）。
> 结果：52 分钟上线，历史 2–3 小时。其中**返工约 16 分钟**，其余为必要耗时。

### 4I.1 实测耗时（决定优化优先级）

| 节点 | 实测 | 是否关键路径 |
|---|---|---|
| 门禁（首跑失败 + 修 5 个测试类型错误 + 重跑） | ~6 min | 返工 |
| 版本 bump + 磁盘清理 + PG 备份/恢复演练 | ~4 min | 返工（本应前移） |
| 桌面 mac-arm64 打包 | 7.3 min | 否（与中台并行） |
| 服务器 web 镜像 | 首次 6 min 失败 + 重建 **10.4 min** | **是** |
| API 镜像 | 3.5 min（冷）/ 0.5 min（改 tsconfig 后重建） | 否 |
| 桌面 mac-x64 打包 | **17 min** | **是** |
| 部署 + 迁移 | 2 min（失败一次后重部署 +2 min） | 是 |
| nginx reload | 1 s | — |
| smoke（含双包真实 GET + sha） | 3 min | 是 |
| DMG 上传 532MB + 公网 sha 校验 | ~5 min | 是 |
| **合计** | **52 min** | 关键路径 ≈ max(17, 10) + 10 |

### 4I.2 本轮踩的 7 个坑

| # | 现象 | 根因 | 损失 | 处理 / 以后规避 |
|---|---|---|---|---|
| 1 | 客户端类型门禁 5 个 TS 错误（`.client.spec`） | 测试仍用旧契约：`{ok:true}`、Lexical 未收窄、`CatalogDetail` 缺 `kind`、`retain(string)` | ~5 min | 修测试类型（`kind:'success'`、`$isElementNode`、`kind:'expert'`、`SessionId(id)`），不删测试 |
| 2 | web 镜像 `TS18003 No inputs: tsconfig.ground-library.json` | 镜像 build context 只有 `mammoth-agent/`，Ground 源码不存在 | 6 min + 重建 10 min | `release.sh` 镜像内 `sed -i '/tsconfig.ground-library.json/d' tsconfig.client.json` 并删除两个引用 Ground 的 spec |
| 3 | API 容器 `Cannot find module '/app/apps/backend/dist/main.js'` | 新增 `apps/backend/scripts/` 未排除 → 共同根上移 → 输出 `dist/src/main.js` | ~4 min | `tsconfig.build.json` exclude 加 `scripts`；门禁 10 断言 `dist/main.js` |
| 4 | 服务器磁盘 98%（仅 11G free） | 历史镜像 + build cache 堆积（reclaimable 72G） | ~4 min，且清缓存拖慢后续 web 构建 | 排期前保证 ≥40G；保留当前+上一版镜像；`docker builder prune --filter until=72h` |
| 5 | `_backups/mammoth_core_*.sql`（2.2MB，含 `public."user"`）已提交并 push | 本地导库后误提交 | ~1 min | `git rm --cached` + `.gitignore` 加 `_backups/`；门禁 9 扫描 `.sql/.dump` |
| 6 | 超管登录 401 | `release-private/admin-credentials.txt`（11-05）已过期 | 阻塞登录后业务验收 | 门禁 3 必须真实登录 200；凭据过期就换 |
| 7 | 桌面日志打印 `deepseek-harness-0.3.1-*.dmg`，实际产物是 `mammoth-ai-0.3.1-*.dmg` | 日志路径来自打包器内部命名，产物名由 electron-builder 配置决定 | 0（脚本扫描兜住） | 取包只认目录扫描（版本+架构匹配），不信日志路径 |

### 4I.3 优化清单（按收益排序）

| 优先级 | 优化 | 预计省 | 落地方式 | 状态 |
|---|---|---|---|---|
| P0 | 门禁提前到发版前 24h 跑完整版（客户端 tsc + `ground verify`） | **10–15 min** | 窗口内只做构建/部署/验收，任何代码修复另开一次发布 | 流程，未固化 |
| P0 | 两处构建补丁固化：web 镜像剔除 ground-library、`tsconfig.build` 排除 `scripts` | **9 min** | 已改 `release.sh` / `tsconfig.build.json` | ✅ 已落地（仅 3.1 分支） |
| P0 | 磁盘门禁 + 预清理 | **4 min** 且避免缓存变冷 | 预检先查 ≥40G；只留当前+上一版镜像；`docker builder prune --filter until=72h` | 部分（0B 第 4 条） |
| P0 | API 产物断言 `dist/main.js` | **4 min**（省一次部署失败） | 构建后、打镜像前断言；已写入门禁 10 | ✅ 文档已固化 |
| P1 | **web 镜像分层 + pnpm store cache mount** | **6–8 min**（10.4 → 2–3 min） | `COPY package.json → pnpm install` 独立层；`RUN --mount=type=cache,target=/pnpm-store` | 待做（下一轮最大收益） |
| P1 | 桌面 x64 自检瘦身：跳过 DOCX→PDF 的 LibreOffice 转换 | **3–5 min** | 出包只验启动/版本/原生模块；文档转换放到上传后异步 | 待做 |
| P1 | `smoke.sh --quick`（30s）+ 全量 hash 异步 | **2.5 min** | 切流后 30s 先放行路由/健康/别名长度 | 待做 |
| P1 | 桌面产物"出一个传一个" | 2–3 min | 版本化文件名先落盘，manifest/别名最后原子切 | 可选（本轮按用户要求等齐再传） |
| P2 | `release/last-release.json` 基线 + `git diff` 裁剪步骤 | 15–35 min（单侧改动时） | 记录 commit/镜像 tag/产物 sha；下次自动决定跳过哪些构建 | 待做 |
| P2 | 长期验收账号 | 解锁登录后验收 | `release-private/` 维护有效凭据，不进仓库/聊天 | 待做 |
| P2 | 时间戳统一 ISO 带时区 | 0 | `state.json` 避免 UTC/本地混写 | 待做 |

### 4I.4 下次发版照此执行

1. **T-24h**：跑门禁 1–11（含 `build --profile local`、`ground verify`、登录 200、`.sql` 扫描、`dist/main.js`、磁盘 ≥40G）。
2. **T-10min**：定版本（Ground minor / 桌面家族 patch），本地 commit；确认 4I.3 的 P0 补丁在分支上（4.0 需先 cherry-pick 或重做）。
3. **T0**：桌面 arm64 后台开跑；同时 PG 备份 + 隔离恢复演练。
4. **T+2**：`release.sh` 前端 + API 镜像；服务器 web 镜像（已固化补丁）。
5. arm64 出包后立刻开 x64（**禁止双开**）。
6. **T+~30**：部署 + 迁移 → API 健康 → nginx reload → `smoke --quick` 放行。
7. DMG 两个齐了再传（或按批准改为出一个传一个）；**manifest 与固定别名最后切**，`curl -sI` 验 `no-store`。
8. 全量 smoke（双架构真实 GET + sha256）→ 登录后业务验收（专家广场/技能/资料库）。
9. 收尾：解锁、写 `state.json`（注意清掉旧 `exit=1` 残留）、清 `/tmp`、只留当前+上一版镜像。

### 4I.5 本轮基线（3.1.0-20261110-0005）

| 项 | 值 |
|---|---|
| 源码 | base `97de4358`；release `cd7137d4`；桌面家族 `0.3.1` |
| 镜像 | api `mmp-api:3.1.0-20261110-0005`、web `mmp-web:3.1.0-20261110-0005`；上一版 api `3.0.0-20261108-2155`、web `3.0.0-20261108-r8` |
| DB | 备份 `/www/mmp-prod/backups/20261110-000511/mammoth_core.dump`；演练 45 表/45 迁移/9 用户/46 专家/115 技能；发布后 49/49 |
| 桌面 | arm64 268383853B `cb086f90…28962c`；x64 289841213B `81b7c070…cf1f2d`；unsigned；别名与 manifest 最后切，公网 GET + sha256 已验 |
| 下载备份 | `downloads/*.prev-20261110-004244` |
| 回滚注意 | `categories` 迁移删除了 `official_skill.category`，**只回滚镜像会挂**，必须先恢复备份再切旧镜像 |

> 分支提醒：4I.3 的两个 P0 补丁（`release.sh` web 镜像剔除、`tsconfig.build` 排除 scripts）目前只在 3.1 的本地提交里；4.0 若要发版需先 cherry-pick 或重做。

## 4J. 2026-11-11 3.2 中台单发复盘：26 分钟，web 镜像是唯一瓶颈

> 范围：只发 Ground api + web + pg，**桌面 DMG 由协调方明确要求不发**。
> 结果：从代码 push 完成到 smoke 通过 **26 分钟**（11-10 全栈为 52 分钟）。

### 4J.1 实测拆解

| 阶段 | 耗时 | 说明 |
|---|---|---|
| 稳定性确认 + 版本 bump（3.2.0） | ~3.5 min | 每隔 3 分钟 fetch，确认 `origin/5.0` 不再前进 |
| 门禁（`ground verify` ∥ `build --profile local`） | ~2.5 min | 并行跑 |
| 类型修复 + 门禁重跑 | ~3 min | 协调方代码 6 个类型错误（见 4J.2） |
| PG 备份 + 隔离恢复演练 | ~1 min | |
| **release.sh 全流程** | **18.3 min** | 下方拆解 |
| 登录后验收 + state 收尾 | ~3 min | |

| release.sh 内部 | 耗时 | 占比 |
|---|---|---|
| 预检 + 前端 dist | 13 s | 1% |
| API 镜像 | 83 s | 8% |
| rsync 源码 | 22 s | 2% |
| **服务器 web 镜像** | **617 s** | **56%** |
| 上传发布包 + 载入 API 镜像 | 142 s | 13% |
| compose up + 49 迁移 + 健康 | 24 s | 2% |
| nginx reload | 1 s | 0% |
| smoke（含下载/资产路由） | 187 s | 17% |

### 4J.2 本轮新坑 / 注意点

| # | 现象 | 根因 | 处理 | 以后规避 |
|---|---|---|---|---|
| 1 | 协调方（Grok）要求"只发中台、不发桌面"，与业主先前"要发双 Mac 包"冲突 | 两个信源 | 按**更新的明确指令 + 少发**执行，并在报告里显式写差异 | 冲突时永远选"少发"，把差异写进报告等业主确认；不要自行扩大范围 |
| 2 | 门禁 6 个类型错误（`Modal`/`Input` 的 `className`/`icon`、`LibraryTree.revealIds`、测试 mock 签名） | `exactOptionalPropertyTypes` 下可选属性不接收 `undefined`；mock 无参导致 `[]` 元组解构 | 只补 `| undefined` 与 mock 参数类型，不改逻辑 | 门禁必须前移到排期前；"这次应该没问题"是幻觉 |
| 3 | 备份演练后 `DROP DATABASE drill_20261111-004812` 报语法错 | 库名含连字符 | 用 `DROP DATABASE "drill_..."` 加双引号 | 演练库名直接用下划线，或一律加引号 |
| 4 | 平台超管验收资料库一直 `NO_TENANT` | cookie 里的租户上下文不被 library 采用 | `POST /api/library/context {tenantId}` 拿返回 `token`，再用 `Authorization: Bearer` 调 `items/search/config` | 平台账号验收资料库必须走 context token，不要用 cookie 反复试 |
| 5 | `state.json` 的 `web-image` note 带上一版镜像 tag | state 复用了旧 note | 收尾重写 steps/note | 每次收尾核对 note 里的 tag 与本次 RELEASE_ID 一致 |

### 4J.3 优化优先级（2026-11-11 实测后更新）

| 优先级 | 项 | 实测/预计 | 状态 |
|---|---|---|---|
| **P0** | **`--reuse-web <tag>`：本次没改 `mammoth-agent/` 就复用上一版 web 镜像** | **省 ~10 min**（整段 web 构建跳过） | ✅ 已实现（`release.sh`） |
| **P0** | web 镜像依赖分层 + pnpm store cache mount | 617s → **526s**（省 ~1.5 min，不是原估的 7 min） | ✅ 已实现（`Dockerfile`） |
| P0 | 门禁前移到排期前 | 3 min + 消除返工 | 流程 |
| P0 | 冲突范围以"少发"为准并立即报告 | 0 min，防误发 | 流程 |
| P1 | smoke 拆 `--quick`（30s）+ 全量 hash 异步 | 2.5 min | 未做 |
| P1 | 上传与 smoke 错层 | 中台单发收益有限（325MB） | 未做 |
| P2 | `release/last-release.json` 基线 | 自动提示"可用 --reuse-web" | ✅ 已实现（每次 deploy+smoke 成功后写） |
| P2 | 备份演练脚本化 | 0.5 min + 防手误 | 未做 |

> 关键修正：web 镜像 617s 里 **install 只占 ~70–90s，其余 ~8.5 min 是 `build:artifacts`（tsc -b 401 个项目 + tsdown）和 `build:web`**。所以：
> - 依赖分层只能省 1–1.5 min（已做，别再指望它省 7 min）；
> - 真正的大头是"**没改客户端就别重建 web**"，即 `--reuse-web`（省 ~10 min）；
> - 中台单发且只改 `ground/` 时的实际路径 ≈ 8 min（前端 5s + api 83s + 部署/验收 6–7 min）。

### 4J.4 实现记录（2026-11-11，已提交代码）

| 改动 | 文件 | 验证 |
|---|---|---|
| `--reuse-web <tag>`：跳过 web 构建，部署时沿用该 tag | `ground/infra/production/release.sh` | `--dry-run --reuse-web` 输出正确；服务器镜像存在性校验 |
| 预检自动提示：`release/last-release.json` 的 commit 之后 `mammoth-agent/` 无改动 → 打印"可用 --reuse-web" | 同上 | 靠上一次 deploy+smoke 成功后写基线 |
| 每次成功发布写 `release/last-release.json`（release_id / commit / 镜像 tag） | 同上 | — |
| web 镜像依赖层：把 workspace 的 `package.json` / `pnpm-lock.yaml` / `pnpm-workspace.yaml` / `patches/**` 预staged 到 `__manifests__/`，先 `COPY` 再 `pnpm install --ignore-scripts`，`COPY . .` 后再补跑一次 install 执行生命周期脚本 | `mammoth-agent/infra/production/Dockerfile` + `release.sh` 的 staging 步骤 | 冷缓存 649s，源码变更后重建 **526s** |

实现中踩到的两个坑：

| 现象 | 根因 | 处理 |
|---|---|---|
| `ERR_PNPM_PATCH_NOT_FOUND patches/@botiverse__oar@0.67.0.patch` | 依赖层只 stage 了 manifests，`patchedDependencies` 需要的 patch 文件不在上下文 | staging 的 `find` 增加 `-path "./patches/*"` |
| `Cannot find module .../scripts/ensure-spawn-helper.mjs` | 部分包的 postinstall 读取源码 | 依赖层用 `--ignore-scripts`；`COPY . .` 后再跑一次 `pnpm install`（store 已热，只执行待跑脚本） |
| rsh 里 `-path './patches/*'` 直接把外层单引号截断 | 脚本通过单引号 heredoc 传给远端 | 远端脚本内部一律用双引号 |
| `REUSE_WEB（: unbound variable` | bash 在 UTF-8 locale 下把全角括号当成变量名字符 | 变量后紧跟中文标点时写 `${VAR}` |

### 4J.5 本轮基线（3.2.0-20261111-0048）

| 项 | 值 |
|---|---|
| 源码 | base `5d74eb6f`（origin/5.0）+ 本地 `2b3c8513`（3.2.0）、`f3e0bfad`（类型修复，未 push） |
| 镜像 | api `mmp-api:3.2.0-20261111-0048`、web `mmp-web:3.2.0-20261111-0048`；上一版 `3.1.0-20261110-0005` |
| DB | 备份 `/www/mmp-prod/backups/20261111-004812/mammoth_core.dump`；演练 45 表/49 迁移/9 用户/46 专家/115 技能；发布后 49/49 |
| 桌面 | **本轮未发**，下载 manifest 仍指 0.3.1（arm64/x64 可正常下载） |
| 验收 | 登录 `13800000001` super_admin/22 权限；`/console/api/version` 200；`official-agents` 200；资料库 context/items/search/config 全 200 |
| 磁盘 | 发布后 54G 可用；镜像只留当前+上一版 |

## 4K. 2026-11-13 全栈 + 三平台发版复盘（3.4.0 / 桌面 0.3.3 含 Windows）

> 范围：Ground api+web+pg、mac-arm64、mac-x64、win-x64（unsigned）。结果上线成功，但返工集中在**镜像、版本号、环境文件、短信通道**四处。

### 4K.1 本轮 11 个坑（已固化为门禁）

| # | 现象 | 根因 | 损失 | 固化动作 |
|---|---|---|---|---|
| 1 | 服务器拉 `node:24-bookworm` 19MB 层 9 分钟 | 镜像源限速 + 预检清空了构建缓存 | ~15 min | 预检只 `builder prune --filter until=72h`；**不要 `image prune -af`**，会删掉基础镜像 |
| 2 | 本机 `docker save` 产出残缺包，服务器 `load` 报 `unpack layer ... not found` | 本机对多架构镜像存储缺 blob，`save` 静默返回 0 | ~20 min | 取镜像用 digest（`docker buildx imagetools inspect` 拿 amd64 digest → `docker pull node@sha256:…`）；或 `buildx build --load` 重落盘；**save 后必须验证 tar 可 load**（本地 `docker load -i` 试一次或看 size 合理） |
| 3 | web 构建卡在拉 `node:24-bookworm{,-slim}` + `docker:28-cli` | 三个基础镜像服务器都没缓存 | 同上 | 预检先 `docker images | grep` 三件；缺就本机 `save|ssh load` 并 `docker tag hub.rat.dev/library/...` |
| 4 | `.env` 写了短信键，api 仍 crash-loop | compose 用 `env_file: production.env`；`.env` 只做变量替换 | 一轮重启 | **业务键只写 `production.env`**；`.env` 只放 `MMP_API_IMAGE`/`MMP_WEB_IMAGE`/`POSTGRES_PASSWORD` |
| 5 | 上线后 `/api/version` 仍旧版 | 手改 `config/version.json` 没跑 `version:sync`，`packages/shared/src/version.ts` 里是硬编码 | 前端+api 各重打一次 ~8 min | 版本只走 `pnpm --dir ground run version:sync`；门禁断言 `/api/version` == 目标版本 |
| 6 | 代码只支持 tencent，生产实际 aliyun | 需求假设错 | ~25 min | 预检断言「`SMS_PROVIDER` ∈ 代码支持集合」，且 provider 对应键齐全 |
| 7 | 磁盘 30G（门禁 ≥40G） | 历史镜像 + 构建缓存 | 5 min | 预检硬拦；只留当前+上一版 |
| 8 | 公网下载校验「假通过」 | zsh 不做单词分割，`sha`/`size` 比的是空值 | 险漏检 | 校验一律用 `python3` 脚本或显式变量，禁止 `set -- $var` 靠 shell 拆分 |
| 9 | 超管登录 401 | `release-private/admin-credentials.txt` 过期 | 登录后业务验收全缺 | 门禁 3 前移；凭据过期先更新再排期 |
| 10 | server 端 `tar` 刷 xattr 警告 | macOS BSD tar 写入 `LIBARCHIVE.xattr.*` | 噪音 | 打包用 `tar --no-xattrs -czf` |
| 11 | Windows 按钮点不了 | 前端靠 manifest 有无 `windows-amd64` 判断 | 0 | 发布脚本自动写三平台条目（见 6.2） |

### 4K.2 本轮基线（`3.4.0-20261112-2334`）

| 项 | 值 |
|---|---|
| 源码 | base `725c2c65`（origin/5.0）+ `ce7e89b7`(桌面 0.3.3) + `fecb4aa0`(Ground 3.4.0) + `33130519`(aliyun sms) |
| 镜像 | api `mmp-api:3.4.0-20261112-2334`、web `mmp-web:3.4.0-20261112-2334`；上一版 `3.3.0-20261112-0119` |
| DB | 备份 `backups/20261112-234255/mammoth_core.dump`（92M）；演练 59 表/10 用户；迁移 56 → 59（`user_avatar`、`sms_verification_code`、`sms_code_hardening`） |
| 桌面 | arm64 268,548,608B `4e6184f8…`；x64 290,051,731B `bb0ba424…`；win 314,369,394B `cb39f292…`；全部 unsigned |
| 短信 | 生产 `SMS_PROVIDER=aliyun`（与 PeecAI 同通道，签名「猛犸世纪」） |
| 验收缺口 | 超管登录 401（凭据过期）；真实短信、真实 GUI/桌面、真 Intel 实机未验 |

## 5. 网络与下载（最容易吃掉几小时）

> 2026-11-04 这次发版，10h47m 里至少 3h 花在“拉文件”：GitHub 0 字节、Docker Hub 超时、
> 镜像站挂起、apt TLS 失败。以下规则和源表是按实测结果写的，换模型也照此执行。

### 5.1 四条铁律

| # | 规则 |
|---|---|
| 1 | **先选源，再下载**：不要先直连等 10 分钟再换源 |
| 2 | **每个下载都必须有超时**：`timeout 180`、`curl --max-time 600`；禁止无超时裸跑 |
| 3 | **成功与否看实际产物**：文件看字节数，镜像看 `docker pull`/`docker images`；HTTP 200/302 不算成功 |
| 4 | **单源失败立刻换下一个**：最多试 3 个源，不要对同一个源反复重试 |

### 5.2 已实测源表（2026-11-05）

| 资源 | 首选 | 可用备选 | 实测不可用 | 验证方式 |
|---|---|---|---|---|
| Electron | `https://npmmirror.com/mirrors/electron/` | 本机缓存 | GitHub `release-assets.githubusercontent.com`：`content-length: 0` | `curl -sSIL` 看 content-length（应为 130394296） |
| npm / pnpm | `https://registry.npmmirror.com` | `https://mirrors.cloud.tencent.com/npm/` | 官方源慢 | 实际安装或 `npm view pnpm version` |
| Debian apt | `https://mirrors.aliyun.com/debian` | 官方 `deb.debian.org` | 腾讯云 apt 源：TLS 证书校验失败 | `apt-get update` 真正跑通 |
| Docker 基础镜像（本机） | `hub.rat.dev` | `dockerhub.icu` | `docker.1ms.run` 挂起 >15m；`dockerproxy.net` 429；`docker.xuanyuan.me`/`docker.1panel.live`/`docker.nju.edu.cn` 403 | 实际 `docker pull` 一个小镜像 |
| Docker 基础镜像（腾讯云服务器） | `mirror.ccs.tencentyun.com`（内网） | `hub.rat.dev` | 本机访问腾讯云内网镜像返回 `000` | 在服务器上 `docker pull` |
| GitHub Release 大文件 | 对应项目的国内镜像 / 预下载 | 代理 | 直连常见 302 后 0 字节 | 下载后 `ls -lh` 校验字节 |

**实测镜像站状态码（仅作参考，不能代替 pull）：**

| 镜像站 | `/v2/` 或 manifest | 实际 pull |
|---|---|---|
| `hub.rat.dev` | 302 | ✅ 可用 |
| `dockerhub.icu` | 200 | ✅ 可用 |
| `dockerproxy.net` | 200 | ⚠️ node 可用，docker:28-cli 报 429 |
| `docker.1ms.run` | 401 | ❌ 挂起超 900s |
| `docker.xuanyuan.me` / `docker.1panel.live` / `docker.nju.edu.cn` | 403 | ❌ |
| `docker.m.daocloud.io` | 401 | ❌ |
| `mirror.ccs.tencentyun.com` | 000（本机） | ❌ 本机不可达 |

### 5.3 腾讯云专项

- **腾讯云 npm 镜像可用**：`https://mirrors.cloud.tencent.com/npm/` 根路径返回 404，但作为 registry 正常；不要把根路径 404 当成不可用。
- **腾讯云 apt 镜像曾 TLS 失败**：`Certificate verification failed ... issuer is unknown`，换官方源或阿里云。
- **腾讯云 Docker 内网镜像只在内网可用**：`mirror.ccs.tencentyun.com` 在本机返回 `000`；在腾讯云服务器上才快。
- 服务器本身就是腾讯云（`VM-0-16-ubuntu`）：**能在服务器构建的，优先在服务器构建**，既快又避免本机断网/休眠。

### 5.4 下载验证模板

```bash
# 1) 文件：必须看最终 content-length 和实际字节
curl -sSIL -m 20 "URL" | grep -iE '^HTTP|content-length|location'
curl -L --fail --max-time 600 -o /tmp/artifact "URL" && ls -lh /tmp/artifact

# 2) Docker：必须实际 pull，不能只看 /v2/ 状态码
timeout 180 docker pull hub.rat.dev/library/node:24-bookworm-slim \
  || timeout 180 docker pull dockerhub.icu/library/node:24-bookworm-slim \
  || echo "ALL MIRRORS FAILED"

# 3) 容器内网络：node 镜像没有 curl，用 fetch
docker run --rm node:22-bookworm-slim node -e \
  "fetch('https://registry.npmmirror.com/pnpm').then(r=>console.log(r.status))"
```

常见误判：

- GitHub 返回 `302` 就以为成功，实际资源域 `content-length: 0`。
- 镜像站 `/v2/` 返回 200/302/401，实际 blob 拉取 429/403。
- 腾讯云 npm 根路径 404，就以为整个源不可用。
- `curl -I` 成功，但 `GET` 被代理拦截；必须下真实文件。

### 5.5 长任务与断线

```bash
# 服务器/本机统一：后台 + 日志 + 独立临时目录
BUILD_DIR="/tmp/mmp-build-$RELEASE_ID"
setsid nohup bash -c '...' > "$BUILD_DIR.log" 2>&1 < /dev/null &
```

- 轮询间隔 **60–120 秒**，不要 `sleep 600` 以上；长时间等待会掩盖卡死。
- 本机跑长构建时用 `caffeinate -dimsu`，或直接放服务器；**笔记本休眠/断电会杀掉构建**。
- 每次发版用独立 `/tmp/mmp-build-$RELEASE_ID`，不要复用，避免两个会话互相覆盖。
- 工具超时（如 900s）会杀掉前台命令；长命令必须后台化。

### 5.6 传输与完整性

```bash
# 镜像：边压边传，不落中间 tar
docker save "mmp-api:$RELEASE_ID" | gzip -1 | ssh "$HOST" 'gunzip | docker load'

# 大文件：可续传、有进度
rsync -avP --partial middle-web.tar.gz "$HOST:/tmp/mmp-release/"
```

- macOS `tar` 会带 xattr，Linux 解包出现 `LIBARCHIVE.xattr.com.apple.provenance` 警告；用 `COPYFILE_DISABLE=1 tar ...` 或忽略。
- 传完必须校验：`docker images | grep <tag>`、`ls -lh`、`shasum -a 256`。
- `scp` 大文件无进度、断线要重来；优先 `rsync`。

### 5.7 构建环境

- 服务器磁盘 ≥ 30G（web 镜像约 3.5–6G，构建缓存另算）；这次发版后服务器已用 84%。
- `release.sh` 预检会自动预拉 `node:24-bookworm`、`node:24-bookworm-slim`、`docker:28-cli`、`pgvector:pg16`，并补打 `hub.rat.dev` 标签；冷缓存不再等到构建时才暴露。
- 本机 Colima 若用于 API 构建，至少 `--cpu 8 --memory 12`；不要用它构建 web。
- Docker daemon 的 mirror 配在 **Colima VM 内**（`colima ssh` 改 `/etc/docker/daemon.json`），不是 macOS 的 `~/.docker/daemon.json`；改完重启 Docker 会停掉本地容器，记得 `docker start`。
- 容器内没有 `.git`，web 构建必须显式传 `MMP_CLIENT_COMMIT_HASH`。
- 不要用 `${img%%:*}${img#*:}` 拼镜像名（少冒号会得到 `node22-bookworm-slim`）；直接写 `name:tag`。

## 6. 客户端（可选，默认不发）

只有用户明确要求才做。打包命令（本机 macOS arm64）：

```bash
cd /Users/fuweilang/Documents/code/mmp/mammoth-agent
export PATH="$HOME/.nvm/versions/node/v24.22.2/bin:$PATH"
pnpm --dir apps/desktop run package:mac:arm64:unsigned   # 本机架构，本地编译原生模块
pnpm --dir apps/desktop run package:mac:x64:unsigned     # 跨架构，优先本地 cross-compiled darwin-x64，缺了才回退 registry
# win-x64 不能在 macOS 上打：package-target.ts 要求 Windows x64 构建机
# 走 .github/workflows/windows-package.yml（条件签名；发布见 6.2）
# 未配 CSC_LINK/CSC_KEY_PASSWORD 时为 unsigned，只能手工下载、无自动更新
```

### 6.1 三 target 对照表

| target | 在哪打 | 本地产物（`.desktop-build/targets/<target>/unsigned-artifacts/`） | 服务器文件名 | manifest key |
|---|---|---|---|---|
| `mac-arm64` | 本机 Apple Silicon | `mammoth-ai-<version>-mac-arm64-unsigned.dmg` | `mammoth-agent-mac-arm64.dmg` | `darwin-arm64` |
| `mac-x64` | 本机 Apple Silicon 跨架构 | `mammoth-ai-<version>-mac-x64-unsigned.dmg` | `mammoth-agent-mac-x64.dmg` | `darwin-amd64` |
| `win-x64` | Windows x64 构建机/CI | `mammoth-ai-<version>-win-x64-unsigned.exe`（发布用 signed） | `mammoth-agent-win.exe` | `windows-amd64` |

**只认 `.desktop-build/targets/<target>/unsigned-artifacts/` 下的当次产物。** `release/desktop/` 里的旧 DMG 只能用于对比/回滚，禁止上传。

### 6.2 出包后先验本地（Mac）

```bash
cd /Users/fuweilang/Documents/code/mmp/mammoth-agent
VERSION="$(node -p "require('./apps/desktop/package.json').version")"
TARGET=mac-arm64
ARCH=arm64   # mac-x64 用 x64
SRC="apps/desktop/.desktop-build/targets/$TARGET/unsigned-artifacts/mammoth-ai-$VERSION-$TARGET-unsigned.dmg"
APP="apps/desktop/.desktop-build/targets/$TARGET/unsigned-artifacts/mac/猛犸智能体.app"

shasum -a 256 "$SRC"
stat -f%z "$SRC"
file "$APP/Contents/MacOS/猛犸智能体"
file "$APP/Contents/Resources/app.asar.unpacked/mmp/node_modules/@mammoth-ai/node-addon-system-darwin-$ARCH/bin/system.node"
/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Contents/Info.plist"
```

- 架构必须匹配：x64 包主程序和 `system.node` 都应是 `x86_64`，arm64 包都应是 `arm64`。
- bundle id **不能是 `com.tencent.octop`**（废弃包）。
- `system.node` 缺失或架构不对，直接重打，不要上传。

### 6.3 Windows 发布（GitHub Actions → 一条命令落盘）

**不能在本机 Mac 打**（`package-target.ts:183` 要求 Windows x64 构建机）。流程：

```bash
# 1) 触发（源码必须在远端，CI 按 source_ref checkout）
gh workflow run windows-package.yml -f source_ref=5.0
gh run watch

# 2) 取产物（含 exe / blockmap / latest.yml(签名时) / installer.json）
gh run download <run-id> -n mammoth-agent-win-x64-unsigned -D /tmp/win-out   # 签名时有 secret 则 artifact 名为 -signed
```

**签名**：配置 `secrets.CSC_LINK`（PFX base64）与 `secrets.CSC_KEY_PASSWORD` 后自动走签名分支，并用 `Get-AuthenticodeSignature` 校验必须 `Valid`；未配置则维持 unsigned 并输出 `SIGNED=false`。**unsigned 包 `automatic_updates` 强制 false**（脚本会拦）。

```bash
# 3) 发布（默认 dry-run，用 --yes 才写远端）
cd mammoth-agent
node --experimental-strip-types scripts/publish-desktop-downloads.ts \
  --platform win-x64 --input /tmp/win-out --version 0.3.3 --dry-run   # 先看 diff
node --experimental-strip-types scripts/publish-desktop-downloads.ts \
  --platform win-x64 --input /tmp/win-out --version 0.3.3 --yes
```

脚本做的事：命名/架构校验 → sha256+bytes → 版本化文件名 → 固定别名 `mammoth-agent-win.exe` → `latest.yml`+`.blockmap` 上传到 `downloads/mmp-desk/feeds/win-x64/`（仅签名时）→ 原子更新 `mammoth-latest.json` 的 `windows-amd64` → 公网 GET 校验 size+sha → 失败回滚 manifest/别名（保留 `.prev-<UTC>`）。

**别踩**：
- NSIS 安装器是 32 位 stub（PE=0x14c）属正常，架构以 electron-builder target 为准，不是 PE 机器字段。
- Windows 按钮由 manifest 的 `windows-amd64` 键驱动；**manifest 没写就等于页面显示「暂未提供」**。
- 下载页 alias 是 `mammoth-agent-win.exe`（`nginx-mmai.conf` 已有精确 `no-store` location），manifest 指向版本化文件名。

### 6.4 应用内更新闭环（签名 → feed → 指针）

> **没有签名就没有应用内更新。** 客户端 `update-coordinator.ts:71` 的判定是
> `isPackaged && 平台支持 && resources/app-update.yml 存在`；unsigned 包不生成该文件，
> 设置页会显示「当前构建不支持应用内更新」，连检查都不会发。
> 老版本（0.3.3/0.3.4 这类 unsigned 包）**永远收不到更新**，必须手动装一次签名版才能闭环。

| 环节 | 现状 | 触发条件 |
|---|---|---|
| 签名 | Windows 走 `CSC_LINK`+`CSC_KEY_PASSWORD`；mac 需 Developer ID + notarization | 配了证书 |
| 产物 | signed 时 mac 出 `dmg`+`zip`；win 出 `exe`+`.blockmap`+`latest.yml` | `!unsigned` |
| 内嵌更新源 | `electron-builder-config.mjs:100` 调 `resolveDesktopAutoUpdateConfig`，生成 `app-update.yml` | 非 unsigned 且 `MMP_DESKTOP_AUTO_UPDATE_ENV=production` |
| feed 名 | mac `latest-mac.yml` / `nightly-mac.yml`；win `latest.yml` / `nightly.yml` | 由 channel 决定 |
| 发布 | `publish-desktop-downloads.ts --feed --channel <latest\|nightly>` | 见下 |

```bash
# 签名包发布（mac 示例，zip 必须与 dmg 同目录）
node --experimental-strip-types scripts/publish-desktop-downloads.ts \
  --platform mac-arm64 --input <artifacts> --version 0.3.x --feed --channel latest \
  --signed --dry-run      # 先看 diff
# 确认后去掉 --dry-run，加 --yes
```

**规则**
- `automatic_updates = signed && feed`；unsigned 或没 feed 一律 `false`（脚本强制）。
- mac 的 signed 判定：有 `installer.json` 用其 `signed`；否则必须显式 `--signed` **且** 同目录有 `.zip`，缺 zip 直接报错。
- 打包侧断言：signed 非 `--dir` 分支会校验 `app-update.yml` 已打进包（mac `Contents/Resources/`、win `win-unpacked/resources/`），provider/url/channel 不符即失败。
- 服务端目录：`downloads/mmp-desk/feeds/<platform>/`（nginx 已配 `no-store`），`<platform>` ∈ `mac-arm64|mac-x64|win-x64`。
- 顺序：**版本化产物 → 别名 → feed（yml 的 sha512/size 必须与产物一致）→ manifest 指针**；任一步失败回滚 manifest/别名。

### 6.5 上传与三重校验

```bash
# 1) 先传临时名，再原子改名，避免客户端下到半个文件
DEST=mammoth-agent-mac-arm64.dmg
rsync -avP --partial "$SRC" "$HOST:/www/mmp-prod/downloads/.$DEST.tmp"
ssh "$HOST" "mv '/www/mmp-prod/downloads/.$DEST.tmp' '/www/mmp-prod/downloads/$DEST'"

# 2) 服务器校验
ssh "$HOST" "sha256sum '/www/mmp-prod/downloads/$DEST'; stat -c%s '/www/mmp-prod/downloads/$DEST'"

# 3) 公网校验（必须真下，不能只看 HEAD）
curl -L --fail --max-time 600 -o "/tmp/$DEST" "https://www.mmai.vip/downloads/$DEST"
shasum -a 256 "/tmp/$DEST"
stat -f%z "/tmp/$DEST"
```

本地、服务器、公网三处 sha256 和字节数必须完全一致；不一致就重传，不要改 manifest 去“适配”。如果服务器对、公网不对，先怀疑 CDN/EdgeOne 缓存，purge 后重试。

### 6.7 `mammoth-latest.json` 最后传

1. 三个（或本轮实际构建的）安装包全部上传并三重校验。
2. 备份旧 json：`mammoth-latest.prev-<ts>.json`。
3. 按实际文件生成新 json，只写已上传的平台；Windows 没包就不要写 `windows-amd64`，页面显示“暂未提供”。
4. 同样先传 `.tmp` 再 `mv`，最后再 `curl` 拉一次，解析 `file` + `sha256` 是否与服务器文件一致。

```bash
# 示例：只保留本轮实际有的平台
cat > /tmp/mammoth-latest.json <<'JSON'
{
  "product": "mammoth-agent",
  "schema_version": 2,
  "updated_at": "2026-11-05T11:38:22Z",
  "platforms": {
    "darwin-arm64": {
      "shell": { "version": "0.2.2-alpha.2" },
      "file": "mammoth-agent-mac-arm64.dmg",
      "sha256": "<本地/服务器/公网一致的 sha256>",
      "signed": false,
      "automatic_updates": false
    }
  }
}
JSON
```

回滚只改指针：

```bash
ssh "$HOST" 'cd /www/mmp-prod/downloads && cp mammoth-latest.prev-<ts>.json mammoth-latest.json'
```

发之前必须检查 dmg 的 bundle id，**`com.tencent.octop` 是废弃包，禁止上线**。

**固定别名必须同步（2026-11-08 踩坑）**：下载页的兼容入口仍是 `/downloads/mammoth-agent-mac-arm64.dmg`、`-x64.dmg`。manifest 改了但别名没换，用户仍会下到上一版（页面显示新版本、装完是旧版）。每次发布：

```bash
cd /www/mmp-prod/downloads
cp -a mammoth-agent-mac-arm64.dmg mammoth-agent-mac-arm64.prev-$(date +%Y%m%d-%H%M%S).dmg
cp mammoth-agent-mac-arm64-<版本>-<sha>.dmg .mammoth-agent-mac-arm64.dmg.tmp
mv .mammoth-agent-mac-arm64.dmg.tmp mammoth-agent-mac-arm64.dmg
# x64 同理
curl -sI https://www.mmai.vip/downloads/mammoth-agent-mac-x64.dmg | grep -iE 'cache-control|content-length'
```

同时确认 nginx：manifest 与两个别名必须 `no-store`（用 `location =` 精确匹配，`^~` 前缀会让正则失效）。

无客户端时：`/agent` 返回 410，`downloads/` 可为空，preflight/smoke 跳过下载项，不阻塞中台发版。

## 7. 故障速查

| 现象 | 根因 | 处理 |
|---|---|---|
| Electron 下载卡住 / 0 字节 | GitHub 直连失败 | `ELECTRON_MIRROR=npmmirror` |
| `failed to resolve source metadata ... docker.io` | Docker Hub 不通 | 配镜像源；服务器用 `hub.rat.dev` |
| `Certificate verification failed`（apt） | 腾讯云源证书链问题 | 换官方 Debian 源或阿里云 |
| `ERR_PNPM_OUTDATED_LOCKFILE` | lockfile 与 package.json 不一致 | `pnpm install` 更新后重试 |
| `status: 128` 取 commit 失败 | 镜像内无 `.git` | 传 `MMP_CLIENT_COMMIT_HASH` |
| `UNRESOLVED_ENTRY lib/types/index.js` | `*/lib` 被 rsync / `.dockerignore` 排除 | 去掉排除，重新同步 |
| `ERR_MODULE_NOT_FOUND .../scripts/release/process.ts` | rsync `--exclude release` 误排嵌套的 `scripts/release/` | 改 `--exclude '/release' --exclude '/releases'`，重同步并 `test -s` |
| web 容器健康检查 404/421 | `curl 127.0.0.1:33080` 没带公网 Host | 加 `-H 'Host: www.mmai.vip'`；最终以公网 smoke 为准 |
| `Cannot find module 'express'` | API 镜像依赖不全 | 重建 API 镜像；`require.resolve('express')` 验证 |
| 首页白屏 / `failed to map segment` | 容器 `/tmp` `noexec`，原生模块无法执行 | tmpfs 加 `exec`，重建 web 镜像 |
| `/admin` 报“返回的不是 JSON” | nginx 缺 `/admin/api/` | 补 location 后 reload |
| 首次登录强制选工作区 / 默认目录不对 | 容器无 `xdg-user-dir`、HOME/默认工作目录未设 | 加 shim，默认 `~/Documents/...`；web-only 也验 `defaultWorkspaceId` |
| 跨架构 desktop TS 报缺少 `pack-registry-package` 类型 | 只有 `.mjs`，缺 `.d.mts` 声明 | 补 `pack-registry-package.d.mts`，重跑 `apps/desktop` build |
| 本机打 win-x64 报 `requires a Windows x64 build host` | Windows 包不能从 macOS 交叉构建 | 用 `.github/workflows/windows-package.yml` / Windows x64 机器；本轮不打就页面隐藏 |
| 客户端报 `Cannot find module '@mammoth-ai/node-addon-system-<platform>-<arch>'` | 未打目标平台原生包，或跨架构拿了 registry 旧包 | 优先本地 cross-compiled addon；缺包守卫直接报错；重打并查 `app.asar.unpacked` |
| `/downloads/mammoth-latest.json` 404 | 本轮无客户端包 | 正常；页面提示即可 |
| 下载页 Windows 入口 404 | 没构建/上传 win-x64，但页面或 manifest 写了 `windows-amd64` | 页面按 manifest 显示；无包写“暂未提供” |
| 上传后 manifest sha 不对 / 仍下旧包 | 从 `release/desktop/` 旧目录取了文件，或先传 json | 只从 `.desktop-build/targets/` 取；本地/服务器/公网三处 sha 对齐；json 最后传 |
| 客户端安装包下到半个文件 | 直接覆盖正式文件名 | 先传 `.tmp`，服务器 `mv` 原子替换 |
| `release/*/state.json` 停在 `deploying` | 手工 middle-web 静态部署没写收尾 | 补 `status/finished_at/note`；任何部署都建 state |
| state 显示 done 但 `note=exit=1` | 上次失败 note 残留 | `state_update done` 清空旧 note；以 smoke 结果为准 |
| 重传安装包后 state 没变 | 重传没有新建记录 | 加 reupload step 或新 release id，更新 `finished_at` |
| `docker compose up` 后 api 反复重启 | 镜像/依赖/env 错误 | `docker logs` 看第一个异常，不要反复 `up` |
| GitHub 返回 302 但下载 0 字节 | 资源域被墙/代理空响应 | 换国内镜像；校验 `content-length` |
| `docker pull` 卡十几分钟 | 镜像站挂起且命令无超时 | `timeout 180`，按源表换源 |
| `unexpected status ... 429` | 镜像站限流 | 换 `hub.rat.dev` / `dockerhub.icu` |
| 容器内 `curl: not found` | node 基础镜像不含 curl | 用 `node -e "fetch(...)"` 测网络 |
| `scp` 大文件中途断开 | 无续传 | `rsync -avP --partial` |
| `tar: LIBARCHIVE.xattr...` | macOS 扩展属性 | `COPYFILE_DISABLE=1 tar ...` |
| 本机构建突然停住 | 笔记本休眠/断电 | 服务器构建，或 `caffeinate -dimsu` |
| 两个会话互相覆盖 | 共用 `/tmp`、`.env`、镜像 tag | 独立构建目录 + 锁 + 唯一 tag |
| `docker compose up` 没换镜像 | tag 没变或容器未重建 | 换 tag 或 `up -d --force-recreate` |
| 宝塔面板保存后配置被覆盖 | 面板重写 vhost | 改 `extension/` 文件，保存后 `nginx -t` + 复查 |
| release 目录日期与镜像日期不一致 | `date -u` 与本地时区不同 | 统一本地时区或显式 `TZ=Asia/Shanghai` |
| `release.sh` 报“发版锁已存在” | 另一会话在发版，或上次异常退出 | 先看锁内容；确认无人发版再加 `--force-lock` |
| `release.sh` 中途失败 | 某一步报错，state 已记录 | 看日志，修好后 `--release-id <ID> --from <step>` |
| `doctor.sh` 有 FAIL | 工具/SSH/磁盘/镜像源不满足 | 先处理 FAIL；WARN 可继续 |
| `rollback.sh` 找不到 `.env` 备份 | 备份被清理或名字不对 | `--list` 查看，或按第 10 节手工回滚 |
| 下载页显示新版本、装完是旧版 | manifest 改了，固定别名没换 | 同步替换别名并保留 `.prev-<ts>`；见 6.4 |
| 加了 no-store 但响应仍可缓存 | `location ^~` 前缀压过正则 location | 改用 `location =` 精确匹配，`curl -sI` 复验 |
| 后台头像全裂 | `/api/official-agents/*` 未进 Ground 白名单，被 agent web 401 | nginx 增加 `official-agents|official-skills|official-knowledge` 并 reload |
| 后台列表全空 | 表里 0 行（数据从未导入） | 先 `select count(*)`，再谈代码 |
| 导入报 `relation … does not exist` | `pg_dump` 的 `search_path=''` 生效 | `SET search_path=public` 或全限定表名 |
| Intel 包尾检 `LibreOffice conversion timed out` | Rosetta 下 DOCX 转换偶发超时，DMG 有效 | 单独重跑 `smoke-packaged-runtime.ts`，不重打整包 |
| rsync 源码报 `read errors mapping .../web/dist` | 桌面打包正在写 dist | 排除 `apps/web/dist`、`apps/desktop/dist` 后重传 |

## 8. 状态文件

发版目录下 `state.json`：

```json
{
  "release_id": "2.0.0-20261105-1200",
  "version": "2.0.0",
  "commits": { "ground": "<sha>", "mammoth-agent": "<sha>" },
  "started_at": "2026-11-05T12:00:00+08:00",
  "finished_at": null,
  "steps": [
    { "name": "preflight", "status": "done", "started_at": "...", "ended_at": "...", "note": "" },
    { "name": "frontend", "status": "done" },
    { "name": "api-image", "status": "done" },
    { "name": "web-image", "status": "running" },
    { "name": "deploy", "status": "pending" },
    { "name": "nginx", "status": "pending" },
    { "name": "smoke", "status": "pending" }
  ],
  "images": { "api": "mmp-api:<id>", "web": "mmp-web:<id>" },
  "rollback": { "nginx_backup": "<ts>", "previous_env": ".env.bak-<ts>" }
}
```

新会话接手：先读 `release/*/state.json` + 服务器锁，再决定继续还是重来。禁止在不知道别人进度的前提下重新构建。

> 2026-11-05 起：`state_update done` 必须清空旧 `note`；middle-web-only/静态部署也要建 state 并收尾；安装包重传必须新增记录，不能只改 `finished_at`。

## 9. 汇报格式

```markdown
上线完成：https://www.mmai.vip

| 项 | 结果 |
|---|---|
| 版本 / RELEASE_ID | 2.0.0 / 2.0.0-20261105-1200 |
| api / web / pg | Up，RestartCount=0 |
| /、/login、/console/、/admin/ | 200（/ 为 303 → /login） |
| /api/health、/api/version | 200 |
| 超管登录 | 200 |
| 客户端 | 本轮无包（/agent 410） |
| 旧栈 | 未动 |
| 回滚 | nginx 备份 <ts>；.env.bak-<ts>；上一版镜像 <tag> |
| 遗留 | 历史镜像 xxG；是否清理待确认 |
```

## 10. 回滚

优先用脚本（会读 state 里的备份名并跑 smoke）：

```bash
./ground/infra/production/rollback.sh --list
./ground/infra/production/rollback.sh --release-id <ID> --yes
# 静态包也回滚：加 --restore-web
# 旧备份的 nginx 时间戳可能和 .env 不同：加 --nginx-ts <ts>
```

手工兜底：

```bash
# 1) nginx
ssh "$HOST" 'cp -a /www/server/panel/vhost/nginx/extension/www.mmai.vip/mammoth.conf.bak-<ts> \
  /www/server/panel/vhost/nginx/extension/www.mmai.vip/mammoth.conf && nginx -t && nginx -s reload'

# 2) 镜像
ssh "$HOST" 'cd /www/mmp-prod && cp .env.bak-<ts> .env && docker compose up -d'

# 3) 静态包
ssh "$HOST" 'cd /www/mmp-prod && rm -rf middle-web && cp -a middle-web.bak-<ts> middle-web'
```

数据库迁移是向前的，不回滚 schema；只有确认不兼容时才恢复备份，且必须先让用户确认。

## 11. 禁止

- 禁止并行发版（两个 `release.sh`、两个 nginx reload、两个 `compose up`）；客户端打包不算发版，但同一时间只跑一个 desktop target，上传串行。
- 禁止不拿锁就构建/上传中台产物；客户端写 `downloads/` 也必须串行，禁止两个会话同时覆盖。
- 禁止从 `release/desktop/` 旧目录上传安装包；只认 `.desktop-build/targets/<target>/unsigned-artifacts/` 当次产物。
- 禁止先传 `mammoth-latest.json` 再传安装包；禁止把未构建的平台写进 manifest。
- 禁止在 Apple Silicon 上构建 web 镜像。
- 禁止把源码树、`.git`、`node_modules` 留在服务器。
- 禁止把 `com.tencent.octop` 包当成新客户端发布。
- 禁止在 smoke 未通过时宣布完成。
- 禁止把明文密码写进文档、日志、聊天回复。