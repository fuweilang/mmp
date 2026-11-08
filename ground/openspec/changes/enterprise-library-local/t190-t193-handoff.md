# t190–t193 最终交接

完成记录：2026-11-08 18:22 Asia/Shanghai（UTC+8）。本机唯一WIP增量，不是commit/生产发布。保留其他代理WIP，未kill/restart用户进程。

## 真实交付
- t190终端根标题直接展示根文件/文件夹，独立根箭头从组件移除，不是CSS藏；子目录箭头初始收起、按需查询，标题选择目录，分类往返不清子分支。
- t191 Console保留四个二级菜单但不渲染我的资料树；mine flat=1全层级服务端20条分页/名称搜索（本人所有含本人共享），文件类型依据kind/版本MIME，未知显示其他；可见祖先路径区分同名，folder行只做管理不伪装文件预览。原接口目录语义保持终端兼容，不扩企管/跨租户权限。旧LibraryNavTree源文件作为前轮WIP保留但AppShell不再引用。
- t192四页白底、page15px；本次补掉workspace20px叠加，只在四条Console资料路由置0，不影响其他页面。资料库限定Dialog/MessageBox居中/安全间距/正文滚动、header/footer保留；预览使用Dialog，媒体适配并可下载回退。
- t193新资料上传先进入实底居中弹窗，拖拽文件/多选，最多50项串行，逐项结果、手动只重试失败项、重复点击锁定；新资料默认私人不变。XHR字节进度是真实transport反馈，其他fetch入口不造百分比。活跃上传不假装取消，卸载后停止下一未发项但已发请求可保存，不再刷新卸载组件。
- 覆盖原生共享Web/desktop资料库、Console资料库、Console企业知识材料、Admin官方知识资料；AdminLibrary统计页无上传，不造入口。React/Vue仅共享设计，不引新库。替换版本明示单选以保持单目标契约；Admin仍20MB/原MD/TXT/PDF/DOCX/PPTX范围，Console知识材料原格式/成员范围保留。头像/ZIP导入未改。
- 上传成功表示保存，不保证解析/索引或AI可读；已保存但索引失败用列表既有重试索引，不自动再传一份。网络结果未知提示刷新核对后手动重试，不宣称客户端能保证网络层exactly-once。

## 验证（真实与fixture边界）
- 断线前609999已核对exit0：目标tsc+React23+tsdown；610000已核对exit0：Console类型+9检查+build。
- 本次最终400793 exit0：`pnpm exec tsc -p packages/client/ui-enterprise-library/tsconfig.json`；`pnpm exec vitest run packages/client/ui-enterprise-library/tests/panel.client.spec.tsx packages/client/ui-enterprise-library/tests/upload.client.spec.tsx`，24/24（新增卸载不发下一项）；指定单一tsdown config构建实际lib/CSS。
- 400795 exit0：ground cwd `pnpm --filter @mammoth/frontend typecheck`；`node --import tsx --test apps/frontend/tests/library-navigation.test.ts apps/frontend/tests/library-presentation.test.ts apps/frontend/tests/library-upload-contract.test.ts`，9/9；`pnpm --filter @mammoth/frontend build`实际dist生成。仍有既有大chunk警告，不是错误。
- 400796 exit0：必须在`ground/apps/frontend` cwd运行`/Users/fuweilang/Documents/code/mmp/mammoth-agent/node_modules/.bin/vitest run --config tests/library-upload.vitest.config.mjs`，4/4，真实Vue/Element Plus DOM、拖拽/多选/串行/真实回调进度/部分403失败/重试/关闭与卸载。复用仓库已有Vitest/jsdom，不安装依赖。此前从mammoth cwd运行存在跨workspace SFC路径解析错误；不能把那两次失败记为通过。
- 400794 exit0：backend cwd `node --test test/library/library.http.test.cjs`，12/12（11子场景+父test），真实Nest正常登录/JwtGuard/Prisma/Postgres，仅55439隔离fixture；覆盖全层级24=20+4、全局搜索、终端目录不变、角色/租户拒绝、逐文件两成功一失败/私人默认、媒体和旧版本。结束tenants=0/users=0/libraryNodes=0。
- React/Vue组件HTTP transport为替身；HTTP组是隔离真实后端。未调用真实云LLM，未做已登录GUI视觉或真实视频codec播放。使用合成fixture不等于真实用户验收。
- 实际产物断言通过：desktop链接和共享lib同hash；lib含卸载guard与根树绑定；编译CSS确有route-scoped workspace padding0及page15；backend dist含parentPath和MIME。最终`git diff --check`见收尾命令。

## 数据/权限保全
- 无迁移、无schema改动，schema SHA256 `b544ebe9f2abc10f8387ad6cb2fba14fc797aad2033661bb6191b78244a42374` 与t188基线一致。
- 未查询/修改5433开发业务资料、未读取用户正文或凭据，没有宣称取得用户资料DB前后hash。只有55439隔离fixture临时写入和清理。
- 不改已有资料/分享范围、115技能/旧会话日志、Harness原生mode/standard/审批/工具/模型池；t170/t171仍暂停。无commit/push/PR/生产、无新抓取器、无新UI库。
- 定点保全：`/tmp/mmp-library-t190`、`/tmp/mmp-library-t191-t192`、`/tmp/mmp-library-t193-native`、`/tmp/mmp-library-t190-t193-final`，后者含本次before/baseline及artifacts.json。

## 刷新与未验
- Web/Console先完整刷新；目标入口Mac本机`http://127.0.0.1:5201/console/library/mine`与其recent/shared/trash、终端既有3080资料库、Admin既有官方知识页。box的localhost不是Mac，不开隧道。
- desktop当前项目node_modules真实链接最新lib；先前已核实desktop watchBundles:false，因此磁盘同步不等于旧窗口内存更新。若仍见旧UI，请用户正常重开desktop/dev Host；本轮不代为kill/restart。后端若未watch最新源，同样由用户正常重启后端加载MIME/path字段；未改API授权。
- 未做真实浏览器/桌面视觉、窄屏/focus交互点检、真实云引用及codec播放；不声称“全系统UI已验好”。本轮授权UI实现及有界自动检查完成。

## t194/t195 保存链接（未改功能）
`library.service.ts:createLink`只保存LINK节点名称和安全URL，preview返回linkUrl、text:null、NOT_APPLICABLE并明确不会抓网页；无版本/分块/索引，不存在抓取失败状态。终端selection.ts:35拒绝LINK作为可供AI引用文件。它是网址收藏而不是网页导入，也不抓登录站或全站。用户只问是否需要，未批准移除，故原样保留。

## 源文件（不把其他代理WIP算作本轮）
- `ground/apps/backend/src/library/library.service.ts`
- `ground/apps/backend/src/library/library.types.ts`
- `ground/apps/backend/test/library/library.flow.spec.ts`
- `ground/apps/backend/test/library/library.http.test.cjs`
- `ground/apps/frontend/src/api/library.ts`
- `ground/apps/frontend/src/layouts/AppShell.vue`
- `ground/apps/frontend/src/views/Library.vue`
- `ground/apps/frontend/src/views/Knowledge.vue`
- `ground/apps/frontend/src/views/admin/AdminOfficialKnowledge.vue`
- `ground/apps/frontend/src/components/LibraryCustodyApproval.vue`
- `ground/apps/frontend/src/components/LibraryUploadDialog.vue`
- `ground/apps/frontend/src/styles/libraryDialogs.css`
- `ground/apps/frontend/src/utils/libraryPresentation.ts`
- `ground/apps/frontend/src/utils/libraryUploadQueue.ts`
- `ground/apps/frontend/tests/library-presentation.test.ts`
- `ground/apps/frontend/tests/library-upload-contract.test.ts`
- `ground/apps/frontend/tests/library-upload.client.spec.ts`
- `ground/apps/frontend/tests/library-upload.vitest.config.mjs`
- `mammoth-agent/packages/client/ui-enterprise-library/src/client/LibraryPanel.tsx`
- `mammoth-agent/packages/client/ui-enterprise-library/src/client/LibraryPanel.module.css`
- `mammoth-agent/packages/client/ui-enterprise-library/src/client/LibraryUploadDialog.tsx`
- `mammoth-agent/packages/client/ui-enterprise-library/src/client/locales.ts`
- `mammoth-agent/packages/client/ui-enterprise-library/tests/panel.client.spec.tsx`
- `mammoth-agent/packages/client/ui-enterprise-library/tests/upload.client.spec.tsx`

另追加同change的design.md/tasks.md/specs/library/spec.md/local-handoff.md及本交接，不新Page。

## 实际产物SHA256
- `mammoth-agent/packages/client/ui-enterprise-library/lib/client.js`: `8f260071223165c953864c71ba71b714af1702650a9662c6b57fe50c9e7e3f34`
- `mammoth-agent/apps/desktop/.desktop-build/development/project/node_modules/@mammoth-ai/mmp-client-ui-enterprise-library/lib/client.js`: `8f260071223165c953864c71ba71b714af1702650a9662c6b57fe50c9e7e3f34`
- `ground/apps/backend/dist/library/library.service.js`: `58f5c29f806d64385fd4b57fa2fafbd52f83de906f78f5966106548963453f8f`
- `ground/apps/frontend/dist/assets/Library-bCkeAFiJ.js`: `637697b5bb649c0ec3f525cad8deea5a401adbd3c71d055e631a8430922cf534`
- `ground/apps/frontend/dist/assets/Library-BXQFqYw_.css`: `3fba631b1cb2ec00c4f3dfad316fa57da9dee4e5ac283ac0ada5114ba72b830c`
- `ground/apps/frontend/dist/assets/AppShell-BoU0HC2a.js`: `31e93f877bca87f09e09c1cc48d679873881d7a2edbe442e6ed94b1bcddd5b43`
- `ground/apps/frontend/dist/assets/AppShell-DyhEs-RW.css`: `10559f6115de77747c8cfe8508a23702fd0f13766b8d4c0b95a106c5f28d62e4`
- `ground/apps/frontend/dist/assets/LibraryUploadDialog-BOhltT8b.js`: `4b74c64657c7e76cca82c2651d7d4b6bb8be133bca88af7c957578858e6380e5`
- `ground/apps/frontend/dist/assets/LibraryUploadDialog-mPlepZfv.css`: `9dd96d89fc7bcd0545ad662afbaa2aa7b0a4f6a9d4eb1bbea92daa32407e07a2`
- `ground/apps/frontend/dist/assets/Knowledge-BrTeuPpL.js`: `ac5df1b6771440ac4d7fcf03d4946334612cc07bb13902d191f542f1e12ad737`
- `ground/apps/frontend/dist/assets/AdminOfficialKnowledge-N2uX1hIn.js`: `37831f929dbf25f90f212aeeac05afc17da4c496c34881a2f1233c76ad0e0d90`

## 后续纠正 t197
第8行中弹窗“居中”只完成props/class声明，未验证最终CSS；自加margin:0覆盖原生auto造成左上/拉高，现已定点修正。旧检查不等于视觉通过；最新证据与限制见`t196-t197-handoff.md`。
