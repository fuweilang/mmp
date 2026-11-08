# t150 专家/技能共享详情弹窗透明回归修复

## 根因与证据边界
已读取用户截图及真实组件/主题/构建资源。`GalleryPage.module.css`旧`.detailDialog`使用`background:var(--dsw-alias-bg-elevated)`，但本项目主题没有这个变量且未设fallback。项目真实Modal使用`--dsw-alias-bg-layer-2`。旧client.js确实包含同样无效token，CSS module映射与样式注入都存在，因此不是仅src未编译或CSS module类名完全丢失；透明surface使底部cards与详情文字叠显，符合截图。未运行浏览器ComputedStyle，不能把这称为像素级现场复现。

原组件本来使用原生`dialog.showModal()`，已经进入浏览器top layer；没有证据需要另造portal或加无限z-index。本轮保留原生dialog，而不是换权限/会话机制。

## 实际修改（仅两处共享UI业务源码）
- M/packages/client/ui-official-agent-gallery/src/client/GalleryPage.module.css
  - 详情surface用真实layer-2 token；下方独立不透明白底，body[data-ds-dark-theme]有不透明深色fallback；主题paint用独立gradient覆盖，即使自定义theme给alpha也不会穿透到底页。
  - 实际主题解析：light rgb(255,255,255)，dark rgb(44,44,46)。缺token时白/#24262c；正文/提示也有可靠fallback，没套PeecAI品牌色/font/方角。
  - 16px圆角、淡边框/适度阴影；只有::backdrop半透明，不给整窗opacity。
  - 固定header/footer，中间detailBody唯一文档滚动区(min-height:0/overflow-y:auto)；680px上限、viewport左右各16px、vh+dvh最大高度；窄屏16px内距、长标题/正文/starter换行，textarea实底可读。
- M/packages/client/ui-official-agent-gallery/src/client/GalleryPage.tsx
  - 仅CatalogDetails：header/name/icon/close、分组正文、footer结构；加载/失败保留，CTA与starter原业务处理保持不变。
  - 保留native showModal/ESC/busy禁关；补显式dialog/aria-modal语义、严格遮罩按下/抬起同在窗外才关闭（正文拖拽不误关）。
  - 打开锁html/body scroll，关闭/卸载恢复原overflow和仍连接的调用焦点；showModal若抛错也先还原滚动状态。

未改Admin/数据/API/权限/模型/工具/专家技能资料/启用状态；未执行DB或migration；没有clone/cloud/commit/push/publish/reset/clean、kill/restart用户进程。

## 构建与静态实证
- `M/node_modules/.bin/tsc -p packages/client/ui-official-agent-gallery/tsconfig.json`最终单独运行退出0。
- 共享UI包目录`../../../node_modules/.bin/tsdown --env.MMP_BUILD_FACE client --no-clean`退出0，仅该包loader与client资源；无全仓build。
- 更新实际`lib/client.js`/`.map`和tsc发射的`lib/types/client/GalleryPage.js`等目标包常规产物；CSS在client.js内嵌并经CSS modules/lightningcss编译，不需拷贝另一份供应商CSS。
- `modal-t150-evidence/STATIC-CSS-RESULT.json`：16项静态检查全部通过，包括真实light/dark token解析、缺失token实底fallback、独立遮罩、header/footer不滚动、viewport边距、native语义/关闭/滚动/焦点cleanup、原CTA/starter处理、实际bundle CSS module映射及新body scroller。
- `COMPILED-GALLERY.css`从实际新client.js提取，不是手写重建；BEFORE/RESULT保存源码和运行资源SHA256。旧token仍可存在于其他未动的卡片样式，检查限定详情surface，未扩scope整页替换。
- 过程有一次命令误带不存在的`../../../node_modules/.bin/true`而返回127（前面的tsc已经运行）；随后单独重跑tsc为0。静态checker初版只识别hex而不接受真实rgb值，已修正为识别无alpha的rgb；主题值未为过检查而更改。

## 未验及刷新要求
没有browser/E2E/截图回归，未声称看到了修复后的实际窗口；上述是源码+真实构建CSS/主题解析证据，不是浏览器布局/交互验收。未生成另造的假mock视觉图冒充真实页面。

用户应**完整刷新Web/客户端窗口**后再打开“专家广场→任一专家卡主体→详情”，再切技能同样检查；不是仅关闭重开弹窗。该bundle的样式注入按固定style tag去重，只热重载JS可能仍保留旧style，完整reload清除它。若DevHost缓存旧模块清单/仍拉旧bundle，再由用户按原方式重启DevHost并刷新；无Host协议/后端变更，不要求重启backend，本轮未重启任何进程。

复现路径使用用户截图中的现有登录客户端，不需要提供/读取密码、token或私有文件。未确认有可从box访问的实际HTTP地址，不能把box的localhost当Mac；父若要视觉点检，需用户原客户端或可正常访问的现有开发URL，不能猜造地址/绕过登录。

建议窄验：light/dark实底、长内容与窄窗、header/footer固定、正文单滚动、starter可编辑不自动发、ESC/遮罩/关闭及焦点回归、busy时禁关与原启动逻辑。不扩到执行/授权任务；等待用户点检。
