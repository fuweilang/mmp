# enterprise-library

## 数据与身份

一套 `library_*` 记录是唯一资料库。Web、Console、Admin 不得各存一份正文再同步。

租户 MUST 来自服务端登录态。客户端传来的 tenant_id MUST NOT 决定读哪一家企业。

物理路径 MUST 由服务端生成，MUST 落在资料根目录内。原始文件名 MUST NOT 参与路径。

## 可见性

新上传、新建文件夹、新建链接默认 `PRIVATE`。变成 `ENTERPRISE` 的操作 MUST 带明确确认，否则拒绝且不改范围。

移动 MUST NOT 修改 `scope`。把私人文件移入共享文件夹后，其他成员 MUST NOT 在列表、搜索、下载、预览、问答中看到它的标题或正文。

私人资料 MUST 只有所有者能读。企业管理员 MUST NOT 因为管理员身份读到他人私人正文。成员离开企业 MUST NOT 把其私人资料改成共享。

平台管理员默认 MUST 只能看容量、数量和状态。读取或代管正文 MUST 先有未过期、未撤销的代管记录，并写审计。代管范围 MUST 写明是企业共享，或某一所有者的私人资料。

列表、搜索、下载、预览、问答、打开引用 MUST 各自鉴权。无权时 MUST NOT 返回标题或正文。

## 版本、回收、删除

同名再上传 MUST 新建资料，MUST NOT 静默覆盖。

替换 MUST 新增版本并保留旧版本。旧问答引用 MUST 继续指向当时的 versionId。

回收后，该资料 MUST NOT 再被检索或下载正文。恢复 MUST 沿用原来的资料 ID 和版本 ID，MUST NOT 改成共享。

彻底删除后，打开旧引用 MUST 说明来源不可用，MUST NOT 改指向其它版本或新文件。不承诺撤回已经生成的历史回答。

## 文件与解析

MUST 限制扩展名、单文件大小和企业容量。可执行魔数 MUST 拒绝。HTML 预览 MUST NOT 把源码当页面执行。ZIP MUST NOT 解压，MUST NOT 写入 chunk。

解析状态 MUST 区分待处理、处理中、可用于 AI、失败、仅下载，并带原因。PPT、Excel 等未解析类型 MUST NOT 显示为可用于 AI。

解析重试 MUST 替换该版本已有 chunk，MUST NOT 追加重复索引。

链接 MUST 只保存 http(s) URL，MUST NOT 抓取网页，MUST NOT 变成匿名公开链。

## 问答

问答 MUST 只使用调用方点名且当前仍有权、状态为可用于 AI 的版本。长文截断 MUST 在结果里说明，MUST NOT 假装读完。

找不到、解析失败、依据不足时 MUST 说明原因，MUST NOT 编造引用或页码。

引用 MUST 包含资料 ID、版本 ID 和真实定位。只有从 PDF 页面内容流得到的页码可以标成页码。

模型调用 MUST 走中台已配置的云端模型池。MUST NOT 把本机 BYOK、Ollama 或上传文件内容当成工具指令。

选中资料 MUST 进入当前会话的待发送草稿；没有当前会话时创建新会话。MUST NOT 写到内部假会话，也 MUST NOT 自动发送。用户发送时，客户端 MUST 用当前登录 Cookie 调用 `/api/library/open`，且只传资料 ID 和版本 ID，重新读取仍被授权的摘录。未传定位时，仅有一段摘录 MUST 返回该段的真实 quote 和 locator；没有摘录 MUST 返回空并不发送；多段 MUST 在既有字数上限内拼接。无权、已删除或没有摘录时 MUST NOT 发送。`session/prompt` 收到的是这次打开后展开的文本，MUST NOT 被说成服务端再次按资料权限解析，也 MUST NOT 把用户粘贴的任意文本当成受控引用。临时附件 MUST NOT 自动入库；入库时默认私人。

## 界面

上传进度和解析状态 MUST 分开显示。列表失败 MUST 保留已有资料和输入。空列表可以上传。搜索无结果可以清除搜索。

选择弹窗只显示我的资料和企业共享里看得到的条目。未就绪但有权的条目标原因且不能选。无权条目不出现。

Console 与 Admin MUST 使用同一套解析状态文案。
