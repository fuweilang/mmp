# t196 / t197 本机增量交接

完成记录：2026-11-08 18:37 Asia/Shanghai（UTC+8）。仅现有Mac WIP，未commit/push/发布、未重启任何用户进程。

## t196：终端Web/desktop共享资料库
- 导航/内容重分层：232px侧栏（中屏208/180）、分组分隔/独立滚动，根分类34px/13px，子目录30px/12px；嵌套引导线与20px独立disclosure列，14px子图标对齐。当前目录高亮/键盘focus、hover、长名称ellipsis+原生title保留完整名称。纠正旧`.page button`14px通用规则对新树字体的覆盖，真实computed-style已验证12px。
- 我的资料根无单独箭头；根标题始终进入根内容、不toggle。子目录仍默认收起、独立箭头按需加载、标题只选目录；分类往返不清已展开子分支；循环保护/分页/API/权限不变。
- 全部状态不再native select：复用已存在ui-primitives Menu（没有新造Select API），portal/fixed定位、opaque panel、check标记、打开状态aria、键盘导航/Escape/焦点返回/outside-dismiss；搜索/筛选/刷新32px，分页28px、轻分隔与数字对齐。未引Vue/Element Plus到React，无新库。

## t197：资料弹窗实际根因与定点修复
- 已安装Element Plus实际版本2.14.7：use-dialog.mjs在alignCenter时让overlay-dialog display:flex；theme-chalk/el-dialog.css原生`.el-dialog.is-align-center{margin:auto}`。我们t192新增`.el-dialog.library-modal{margin:0}`覆盖相同specificity的原生auto，导致flex子项贴左上且默认cross-axis stretch，和截图一致。这是源CSS错误，不是接口/资料数据问题；旧构建也含错误规则，不能只叫用户清缓存。
- 现恢复namespaced margin:auto、border-box；所有采用library-modal的实际Dialog显式append-to-body+align-center，隔离AppShell/transform/overflow祖先，依旧24px/小屏16px安全余量、有限宽高、正文滚动与header/footer保留。
- 盘点：Console四页共用Library.vue的预览/新建文件夹/保存链接/移动；共享上传组件；重命名prompt/共享与取消共享/清理确认等统一confirm helper；代管授权Dialog与批准/撤销MessageBox。Admin代管浏览Dialog补齐同namespace/teleport，撤销确认补namespace；官方知识预览改同样library-modal，移除48px/24px硬编码top margin!important，上传仍复用共享组件。未改非资料业务弹窗。
- 终端原生Modal本来就是body portal+fixed inset0+双轴flex center，未改共享原语。只为资料编辑/版本/预览卡添加max-height:100%及其受支持contentClassName，长正文可缩滚动、标题换行；上传已有受限滚动布局保留。浏览器自有confirm若存在仍由浏览器呈现，不改成另一套确认流程。
- 更正t192旧交付：当时只证明声明class/align-center，不足以证明最终CSS几何生效；“所有弹窗已视觉居中”不成立。本次真实组件+安装CSS computed-style覆盖原错误，仍未进行GUI/pixel视觉验收。

## 改动文件（仅本轮）
- mammoth-agent/packages/client/ui-enterprise-library/src/client/LibraryPanel.tsx
- 同目录LibraryTree.tsx、LibraryPanel.module.css
- mammoth-agent/packages/client/ui-enterprise-library/tests/panel.client.spec.tsx
- ground/apps/frontend/src/styles/libraryDialogs.css
- ground/apps/frontend/src/views/Library.vue
- ground/apps/frontend/src/components/LibraryUploadDialog.vue、LibraryCustodyApproval.vue、LibraryManagedBrowser.vue
- ground/apps/frontend/src/views/admin/AdminOfficialKnowledge.vue、AdminLibrary.vue
- ground/apps/frontend/tests/library-dialog.client.spec.ts、library-upload.vitest.config.mjs
- ground/apps/frontend/tests/fixtures/library-dialog-visual.ts、tests/build-library-visual-fixture.mjs（仅隔离视觉fixture工具，不进入产品入口）
- 同change的design/tasks/spec/local-handoff增量与本文件；实际lib/sourcemap及Console dist已同步。

## 实际验证与边界
- `/Users/fuweilang/terminals/400812.txt` exit0：目标`pnpm exec tsc -p packages/client/ui-enterprise-library/tsconfig.json`、原panel/upload真实React DOM共28/28、唯一指定包tsdown config构建。涵盖保留的根无箭头/子目录收起/来回导航/迟返回、真实Menu portal/check/选项/方向键/Escape/focus/outside；真实CSS树列/30px/12px/省略/滚动及native Modal fixed/center/限高。jsdom不合成Enter的原生click，测试显式模拟该激活；不是浏览器键盘验收。
- `/Users/fuweilang/terminals/400808.txt` exit0：`pnpm --filter @mammoth/frontend typecheck`、library-navigation/presentation/upload-contract 9/9、`pnpm --filter @mammoth/frontend build`；既有>500k chunk warning不阻断。没有全仓build/E2E。
- `/Users/fuweilang/terminals/400810.txt` exit0：frontend cwd复用原Vitest config真实Vue/Element Plus DOM 10/10（原上传4+新几何6）；真实四资料路由带preview/version query、真实Library.vue与安装CSS，不只直接ElDialog stub；transform/clipped祖先下body teleport、fixed mask、flex+auto margin、正文滚动及header/footer、真实MessageBox取消；重新注入旧margin0规则重现computed错误再移除恢复auto。
- HTTP数据为合成替身，并明确阻断测试的live fetch；本轮没有业务DB读写、没有后台HTTP重跑、没有用户正文/凭据读取。前轮12个隔离HTTP结果只能作为前轮记录，不冒充本轮GUI验证。
- 原先失败测试（CSS URL被Vite变为HTTP、单位0/0px、MessageBox包装层class、close不结算promise）均已修正并重跑，不算通过证据。
- 实际desktop工作目录node_modules解析到共享lib；最终两者SHA256相同：`5af84869789331a7c1123f6545a25dc1964a80682fb11a03b6fa1167902dce40`。
- Console dist真实`libraryDialogs-BBf6doNS.css`已断言`.el-dialog.library-modal`含margin:auto而非margin:0；构建资产与SHA清单`/tmp/mmp-library-t196-t197-final/artifacts.json`。目标git diff --check通过。

## 视觉fixture / 刷新
- 已生成真实Library.vue+Element Plus的单HTML：Mac `/tmp/mmp-library-t196-t197-visual/console.html`，构建脚本`node tests/build-library-visual-fixture.mjs`，构建exit0（400811）。短/长预览、四route按钮；全部网络被拦截为合成数据，CSP connect-src none、envDir false，不登录、不读取真实资料、不启动服务。可直接file://打开缩放viewport，检查短内容居中/长内容上下gap与正文滚动/头尾可见。底部fixture控制条非产品UI。
- CopyToBox此/tmp文件被工具以“outside allowed local-exec root”拒绝；未移动文件或改用Shell传输绕过。故box没有该HTML，尚未浏览器检查。若需父视觉验收，使用Mac本地此文件/用户允许的正式入口，或先获得工具正常访问授权，不绕限制。
- 正式Mac Console入口`http://127.0.0.1:5201/console/library/mine`（recent/shared/trash同前缀），终端既有3080资料库；先完整刷新。desktop watchBundles:false，磁盘lib同步不代表旧窗口已重新require；必要用户正常重开desktop/dev Host，本轮未代重启。
- 尚未实测：浏览器真实viewport像素位置/窄屏媒体codec、已登录GUI所有Dialog逐一点击。DOM/computed-style不是视觉验收，不宣称“全系统UI都OK”。

## 保全
无API/权限/tenant/分享/解析/媒体上传语义变化，无schema/migration/DB/用户资料或历史改动；保存链接原样保留。Harness原生standard/modes/tools/审批/模型池完全不碰；不继续t170/t171。t196前3源文件快照`/tmp/mmp-library-t196-before`，t197前源文件快照`/tmp/mmp-library-t197-before`；其他代理WIP保留。
