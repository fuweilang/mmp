# 资料选择与文件卡片：实现和测试记录

日期：2026-11-09。分支：`codex/library-chat-attachments-20261109`。已实现并完成下列本地测试；未提交、推送、发布或替换已安装的桌面 App。

## 已实现

- “＋ → 资料库”使用独立弹窗，桌面 800 × 640，支持最近使用、我的资料、企业共享、名称搜索、目录、分页和跨视图多选。文件名省略后可查看完整名称，未就绪原因只出现一次。
- 确认仅替换打开弹窗时所针对会话的资料选择；取消保留草稿。选择以节点身份去重，明确选择新版本时替换先前版本；资料面板、弹窗与 @ 入口遵守相同规则。
- 输入框显示文件标签；发送中、队列和历史显示文件身份与用户提问。历史卡片可以打开当时选择的版本，超过四份资料可展开列表。
- 浏览器提交 nodeId、versionId 与原问题，Host 使用当前账号授权读取确切版本并采用服务端文件名。整个批次在提交前再次检查账号；读取失败、账号切换、来源缺失、未注册解析器或验证器均拒绝发送并保留草稿。
- 模型实际读取的摘录与截断说明保存在独立的持久文本块中，带结构化引用元数据。模型和回放仍能获得摘录；用户界面、复制、Markdown 导出及任务预览使用文件引用和用户文字。
- 队列编辑仅修改普通问题，由 Host 保留已经授权的来源块；浏览器不能通过提交 reference 字段伪造隐藏来源。

## 验证结果

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 已有专项测试文件 | 18 个文件、393 项通过 | `.superpowers/library-chat-attachments/focused-final.log` |
| 新增专项测试文件 | 7 个文件、34 项通过 | `.superpowers/library-chat-attachments/new-tests-final.log` |
| 真实 Chromium Web 验收 | 1 项通过 | `.superpowers/library-chat-attachments/visual-test-final.log` |
| build:artifacts | 8 项通过、0 失败 | `.superpowers/library-chat-attachments/build-artifacts-visual-fixed.log` |
| 最新 build:check，包含浏览器测试类型检查 | Host、Client 两项通过 | `.superpowers/library-chat-attachments/build-check-with-browser.log` |
| 独立代码审查 | 修正 @ 重复选择后无剩余具体阻塞项；复查 31 项通过 | 本次独立审查结果 |
| 类型文档比对 | 550 个原文和配对声明通过 | `.superpowers/library-chat-attachments/type-equiv-final.log` |
| 修改区域 lint 与空白检查 | 通过 | `root-lint-final.log`、`root-types-tests-lint.log` 及任务专项检查 |

上述日志均相对于仓库根目录 `/Users/luoxiaojun/Documents/mmp/mmp/`。专项测试清单分别保存在同目录的 `focused-test-files.json` 与 `new-test-files.json`；两个集合不重叠，合计 427 项，不将独立复查和重复运行累加。

专项测试包含真实 Ground `LibraryService` 的版本替换与来源删除、Host 来源授权、拒绝元数据伪造、非所有者权限、跨文件及附件准备期间切换账号、失败重试、会话持久化和当前／已发布 V4 读取、普通附件与引用段落、队列编辑、复制与导出。

## 真实浏览器验收

通过实际 Web scaffold、编译后的前端和 Chromium 操作，资料列表使用 HTTP 测试数据，历史内容使用当前会话写入器生成的固定事件记录；没有调用真实模型或生产账号。

- 历史文件卡片与原问题在刷新前后均正确；独特的隐藏正文标记不出现在页面。
- 桌面弹窗尺寸、48px 行高、20px 图标、超长文件名提示、未就绪禁选及单次原因展示通过。
- 切换标签、搜索、键盘导航、保留多选、取消保留草稿、确认仅添加文件标签通过。
- 通过产品设置切换浅色和深色，分别验证桌面与 390px 窗口。
- 浏览器测试发现并修复窄屏 2px 横向溢出：局部 Input 容器采用 `box-sizing: border-box`。修复后弹窗 `clientWidth = scrollWidth = 342`，没有溢出的子元素。

截图位于 `.superpowers/library-chat-attachments/visual/`：

- `picker-desktop-light.png`、`picker-desktop-dark.png`
- `picker-390-light.png`、`picker-390-dark.png`
- `history-desktop-light.png`、`draft-390-light.png`

## 兼容范围与未验证场景

- 新发送的消息和具有结构化引用元数据的历史记录使用文件卡片。旧版只有混合正文、无法可靠还原用户原话的记录保留原文；没有猜测删除或重写历史数据。
- 已验证文件来源读取、模型消息的日志／回放表示；未执行生产账号的实际模型问答、已安装桌面 App 验收或生产部署。
- 关联范围的扩大回归为 1,088 项通过、8 项失败。8 项均为既有中文术语／占位文案与旧测试预期不一致，相关文案和这四份测试文件在本次没有改动；详见 `client-regression.log`。未修改这些预期来伪造全绿。
- 仓库全局本地化、JSDoc 和依赖检查还存在与本功能无关的既有失败，分别为 32 处文案、375 处 JSDoc 与其他 gallery/workspace 包的四项依赖缺口；本次修改区域已单独检查。
- 持久化兼容登记工具在读取旧 V4 基线时拒绝节点 `1506a9b8224986c8`，错误为 `key does not match its subgraph digest`。登记未成功，旧基线文件没有修改。当前及已发布 V4 读取器的实际往返／回放测试通过；待登记说明保存在 `mammoth-agent/.artifacts/library-reference-persistence.prose.json`。不能将这一未完成登记写成通过。
