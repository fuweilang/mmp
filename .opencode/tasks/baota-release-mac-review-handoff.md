# 给DeepSeek：猛犸3.0全栈＋双Mac发版前预检（现在不发布）

请先完整阅读本机mmp/.opencode/skills/baota-release/SKILL.md，尤其新增0A和历史4B踩坑记录，并遵守适用AGENTS。本次先讨论和准备材料，不是执行发版。不要因Skill旧“一句话授权”、以往聊天发过版、看到--yes/并行示例就自行开跑。

## 一、已批准范围与本阶段权限
用户已明确：3.0全部新版代码均要发布，包括Ground API、Admin、Console、mammoth-agent终端Web和桌面客户端；桌面只Mac Intel x64与Apple Silicon arm64。Windows本轮不构建、不上传、不删除旧包、不更新其feed/manifest子项。范围已经确定，不必再问“是否一起发中台/Web”。
但现在只允许本机只读预检及必要发布文档整理。禁止打包、安装依赖、签名公证、Docker build/pull/tag/load、SSH生产巡检、上传、nginx/compose动作、生产迁移、commit/push/tag/CI dispatch，也不要运行发布/doctor/smoke/preflight脚本（包括dry-run/--check，先审脚本副作用）。不读取.env、release-private、私钥/证书内容、Keychain秘密或token，不向模型输出账号口令。此文只由用户复制给你，接入方没有替用户投递。
完成第一阶段报告后停止，等待用户明确批准路线、版本/通道、冻结源码与执行窗口。预检发现需要改脚本也先报方案，不擅改业务/发布脚本或借“修阻塞”取得部署权限。

## 二、真实源码与分支冻结
最新事实补充（2026-11-08，Asia/Shanghai）：用户t65u报告已自行将3.0最新代码push到GitHub，代码备份已完成，不再要求先push。本轮只读本机HEAD与现有refs/remotes/origin/3.0，二者均为43bd7f6d898687cc11d4d50a84073d0e18b866eb；3.0未配置upstream。此为本机追踪ref一致，不是独立远端live核实；未fetch/pull或连接远端。两份发布文档的本轮补充仍分别是tracked修改和untracked新文件，未包含于当前HEAD，不能称已一并推送。已有GitHub备份不代表CI可用，也不授权dispatch/tag/再次push/部署；最终发布commit仍须在版本与阻塞处理后冻结。
工作区/Users/fuweilang/Documents/code/mmp。2026-11-08核对为单Git仓库，ground/、mammoth-agent/没有独立.git；分支3.0，候选HEAD 43bd7f6d898687cc11d4d50a84073d0e18b866eb。2.0的88656a65352752429e3be91d149b06261e47fec5和云端资料库a612da7ea20bbfabc4758835ae4da53c6ac7072f均为其祖先，指定合并已包含。修改本次发布文档前工作区干净；现在新增/修改的Skill和此任务文案会使文档变dirty，启动时请重查，不沿用旧95a1a61/37文件。
列当前分支/HEAD、完整dirty及untracked、unmerged、source tree与lockfile校验清单，标出本次专家广场/资料库内容已在哪个冻结快照。不要从GitHub旧源码漏本机增量，也不要无记录发布dirty tree。最终版本或脚本修复后重新冻结最终release SHA/归档hash；用户此次已自行push完成GitHub备份，不再要求先push；后续本地新commit、再次push、tag与CI分别需明确批准，不能先做再说。保留2.0，不fetch/pull/merge/rebase/reset/stash/restore/clean，不覆盖并发改动。

## 三、数据库：先纠正MySQL假设，再谈迁移
Prisma datasource provider实际是postgresql；现production/compose.yml为pgvector/pgvector:pg16、mammoth_core、prod_pg卷。宝塔装有MySQL不代表此业务用它。本阶段未连生产，线上实际引擎/版本/扩展/连接目标/迁移完成情况都未确认；若授权核实后真是MySQL，立即停止并说明架构差异，绝不能直接执行PG SQL。
仓库现45项迁移：历史KB迁移要求vector、pg_trgm及vector(64)，init-db.sh只在新卷首启创建vector，已有生产卷不能靠重启补扩展。资料库library_node/version/chunk/recent/custody本身不用向量列，但全产品旧KB仍有扩展要求。梳理专家定义、官方专家版本/企业授权/知识文档/广场详情、enterprise_library全部相关迁移及依赖/索引/外键/枚举/JSONB；不能只看最新一项。
本地2.0..该HEAD没有Prisma目录差异，不代表生产已迁；开发库曾应用也不代表生产。生产核实需另行授权后通过正常DB工具，仅报告引擎/扩展/迁移名与校验和等非敏感事实，不输出连接串。只允许增量prisma migrate deploy；禁reset、db push、migrate dev、生产seed、改已应用SQL、盲目resolve失败迁移。
重点风险：Dockerfile.api启动命令已经自动migrate deploy，release.sh的compose up即可能迁移，不是单纯换镜像。现脚本没有完整DB备份与恢复演练门禁。实际执行前必须取得PG一致性备份、必要角色/扩展信息、隔离恢复验证证据，并核查旧应用/旧客户端对新schema/API兼容性；破坏性或不兼容迁移停发，另报expand/contract/灰度方案。
同时备份并验证prod_pg、data/library原文件与版本、data/uploads、data/api-state、真实MMP_WEB_HOST_DATA_ROOT中的身份/工作区/会话等持久数据；secrets只由受保护机制备份，不让模型读内容。DB和文件要有一致恢复点、RPO/RTO、存储容量和可恢复证据。禁止rsync --delete指向部署根/data/downloads、禁止清卷。回滚镜像不会回滚schema；终端Web/desktop会话SQLite的单调SCHEMA_VERSION和released Session代际也要核查（mammoth-agent/AGENTS.md:8-10），新数据不保证能被旧程序读取。生产数据恢复需用户单独确认，不能自动覆盖新写入。

## 四、实际全栈发布链路，不套旧Octop流程
当前来源是mmp/ground/infra/production/，生产目标文件写明https://www.mmai.vip、/www/mmp-prod，旧/www/mammoth不动。Ground前端静态落middle-web，API镜像本地linux/amd64构建，mammoth-agent Web按当前规程在服务器原生amd64临时目录构建，最终镜像运行、不长期留源码；不是旧mmPlatform/ground+Octop的infra/baota fast-release --mid octop。
先静态读release.sh、doctor.sh、preflight-local.sh、smoke.sh、rollback.sh、compose.yml、Dockerfile.api、mammoth-agent/infra/production/Dockerfile和nginx-mmai.conf。不要执行。标出远程副作用、版本依赖、读秘密、自动迁移、删除、锁/备份/回滚行为，提出安全执行计划。
已发现需你复核的源码事实（不是已修复/测试通过）：
- release.sh工作区dirty只WARN；preflight会SSH/pull/tag，doctor也会SSH，--network会pull；不能当本阶段纯只读命令直接跑。
- release.sh自动备份.env与middle-web，不等于数据库/资料文件/运行态已备份。锁是检查后写入，仍要单主操，不开双会话抢发；不擅自force-lock/no-lock。
- preflight-local.sh:18硬编码Apple Silicon only，拒绝darwin-amd64；双Mac发布前须另行批准适配门禁，不能删除Intel子项来蒙混。
- smoke.sh只查arm64且用HEAD，不覆盖双架构下载/全部feed/GET内容hash/真实登录与新功能；不能称“smoke绿所以全栈验收完成”。
- release.sh历史done旧note未清、state回滚nginx时间戳与实际切流时间可能不同，需对照真实备份，不凭state完成字样断言可回滚。
- rsync临时源码的排除必须根锚定/release、/releases，不能漏scripts/release/process.ts或必要lib；清空静态页只准middle-web，资料与下载目录不得受影响。保持此前依赖express、Host路由、tmpfs exec、native module、defaultWorkspace与冷启动等踩坑门禁。

## 五、双Mac打包、版本、签名、公证与旧安装兼容
本机是arm64，Node v24.22.2；Ground声明Node>=22/pnpm10.32.1，mammoth-agent声明Node>=24.9/pnpm11.28.5，分别保留对应lockfile/frozen安装。当前Ground版本2.0.0，mammoth-agent根与desktop均0.2.2-alpha.2。ground的version:check/sync仍查旧Octop、没有覆盖桌面，check还读取.env，不能在本阶段直接运行或据其通过声称双端一致。
请报告最终中台/桌面版本策略及协议/API兼容，等待用户批准，不擅自同步/bump。nightly/latest和test/production是不同维度；latest拒绝带alpha预发布后缀，不能把当前alpha强塞latest；两Mac必须同一批准版本/渠道/源码，不串包。
只选mac-arm64、mac-x64。package-target.ts确认支持Apple Silicon原生arm64及Rosetta下x64准备；x64跨架构产出/在ARM上Rosetta运行不等于真Intel实机验收。检查Electron、Node/Python/runtime、system.node等所有目标原生模块、ABI/最低系统版本；用file/lipo和原生运行证据，不能凭DMG名。缺目标原生模块时registry兜底也要同版本，不可混旧包。
正式分发走现有受保护的签名、公证、stapling工具，检查现有bundle ID/Team ID/SSO回调/用户数据目录连续性、Gatekeeper、从旧版本升级保留账户/会话/资料。不得读证书秘密、Keychain密码或索取Key；缺条件就报告，不静默改unsigned/skip-notarization。unsigned仅内部测试，不能冒充正式包或自动更新。
读取package-target/electron-builder-config/desktop-build-paths确认实际路径：正式artifacts与unsigned-artifacts/unnotarized-artifacts隔离，不能按旧目录硬编码找包。构建显式--publish never，只代表打包不上传；其它upload脚本是否推tag另查。同机两个target串行，保留缓存，不杀已有dev/桌面进程。

## 六、宝塔下载与自动更新，不碰Windows旧资产
正式Mac更新不是只两DMG：还包含两架构ZIP、ZIP.blockmap、相应nightly-mac.yml/latest-mac.yml、release record、size/sha512/sha256。production updater URL由源码生成到https://www.mmai.vip/downloads/mmp-desk/feeds/mac-arm64/和mac-x64/，二进制对应bin目录。下载页旧mammoth-latest.json、mammoth-agent-mac-*.dmg与mmp-latest-macos-*.dmg固定入口也须分别兼容核对。
旧Skill的“只认unsigned-artifacts”“Windows本次没打就移除manifest”不能套本轮正式发布。scripts/collect-baota-desktop.ts会按本地收集项重建manifest，可能丢既有Windows；不要覆盖。上传前保留原manifest/feed和原Windows子项/文件，双Mac新条目合并，其余不动；禁全downloads --delete，也不得顺手提高Windows最低版本/强更规则；保留旧Windows对新API兼容性。先版本化文件上传、三处真实GET/size/hash验证，再原子切各架构feed和兼容manifest/固定指针，保留上一版可退。
现nginx模板/downloads指向宝塔本地目录，但普通desktop upload/desktop-publish链路走COS/EdgeOne，并会创建、push desktop-v标签；不是同一部署动作。未核实实际CDN/下载路由，不能假设同域名就同存储；不调用这类脚本绕过“不push/只宝塔”授权。

## 七、两条路线的判断，请先报告不执行
A（目前推荐）：在本机批准后的固定源码快照构建两Mac正式包，按宝塔发布计划部署全栈并上传已校验双Mac产物。用户已自行push完成GitHub代码备份，与打包位置分开；不要求为了本地打包重复push。需冻结源码、签名公证可用、门禁修复、Intel运行验收和完整回滚证据。
B：使用用户已push的代码，在最终发布commit冻结并另行批准后使用经适配的CI；如后续有改动，其再次commit/push另行授权，现在不要求重复push。当前相关workflow在mammoth-agent/.github/workflows而非单仓根；checkout脚本又假设mammoth-agent位于仓库根；production source仅master或mmp-v*，不能直接填3.0/SHA，desktop publish还限制master且走COS/推tag；两个Mac工作流同为ARM自托管runner，不是GitHub替你凭空提供Intel机器。远端根workflow、runner、签名身份未核实，不能说“推GitHub即能发宝塔”。需另批准单仓CI适配和准确ref/目的地后才可选，不能现在擅自改代码或dispatch。
请给出费用/时间/可追溯/回滚条件比较，不将GitHub备份、GitHub托管runner、自托管Mac runner、本地DeepSeek四件事混在一起。DeepSeek运行在哪里不决定制品源码与发布目的地。

## 八、第一阶段交付与停止点
请输出：
1. 实际分支/HEAD/dirty、拟冻结SHA及文件/lockfile/迁移清单；所有读过的发布文件和path:line依据。
2. PG业务事实、生产尚未知项、数据库与文件备份恢复方案、迁移/旧版本兼容与停发条件。
3. 全栈部署与双Mac打包/签名/渠道/更新源/Windows保护计划；现脚本阻塞与最小修复建议。
4. A/B路线推荐及需要用户决策的最少项：路线、最终Ground/桌面版本与通道/既有签名身份延续、阻塞关闭后的明确执行窗口。全栈+双Mac范围已确认，不重复问。
5. 后续获授权后的分阶段执行、只影响本产品的变更/回滚/检查清单：Admin/Console/终端Web、两Mac真实安装升级、专家广场发布/应用、资料私有→共享→撤销、审批/回收/旧版本引用、正式会话持久化和真实Ground云池回答。模型只走Ground超管池/resolved配置，不新增BYOK/Ollama、不读Key。
6. 明确哪些仅静态核查、哪些未执行；不能把老测试、HTTP200/HEAD、mock或磁盘产物当生产/GUI/真实模型已通过。
第一阶段到此停止。用户书面明确批准后才能开始构建；生产只读巡检、真正上传/迁移/切流和再次push/tag也必须在明确授权范围内分别落实。没有批准就不要执行任何后续命令。
