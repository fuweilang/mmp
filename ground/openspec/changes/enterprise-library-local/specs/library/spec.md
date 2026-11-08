# 资料库验收

## 权限
两租户两成员，私有→共享→撤销，列表/搜索/下载/预览/问答/引用逐项生效。跨租户伪造ID/tenant不泄露标题正文。企管无默认私人权限，平台默认汇总。

## 文件
首次上传真实事务成功，失败回滚并清理文件。中文名正常；同名不覆盖；版本引用固定；回收/恢复/彻删行为明确。ZIP零chunk；解析失败可重试且无重复索引。

## 终端
Web/桌面同ID同版本；左栏入口实际可用；多选挂当前草稿不发；单chunk、0chunk、多chunk发送边界；临时附件不自动入库。

## AI
真实Ground云模型按所选版本回答，来源真实可定位，不伪造页码、不声称读完截断内容。无权限/无来源不编造。

## 运行
开发自验与一次聚焦流程，不全仓回归；GUI由父代理安排。不以远程测试替代本机证据。

## t188 additions
### Requirement: Authorized hierarchical and complete browsing
The library SHALL preserve its four views. Mine SHALL include all records owned by the current user, even shared ones. Shared SHALL include only currently authorized ENTERPRISE records. Tree branches SHALL load on demand with explicit paging and cycle bounds, alongside root files. Optional paging SHALL preserve old unpaged picker compatibility. Server filtering SHALL precede pagination.
### Requirement: Stored media is not parsed knowledge
Raster images and allowed video containers SHALL be validated and stored under existing authorization and quotas. They SHALL remain DOWNLOAD_ONLY with no extracted chunks. Protected previews SHALL restrict MIME, avoid active SVG/HTML and offer download fallback; they SHALL NOT imply OCR or video understanding.
### Requirement: Evidence-based recent access
Browsing metadata and preparing a possible future prompt SHALL NOT mark actual use. Successful authorized previews/downloads, confirmed draft insertions and successful library ask operations SHALL update current-user/current-tenant recency. Native model consumption SHALL NOT be claimed where no actual hook exists. Failed operations SHALL NOT report success.


## t190–t193 final presentation requirements
### Requirement: Distinct terminal and Console navigation
Terminal Mine SHALL directly show its paged root records without a root toggle. Child expansion SHALL remain independent from folder selection and SHALL NOT be reset on category round trips. Console Mine SHALL be a flat all-level management table, server-paged and globally searched within the authenticated user's ownership and tenant scope. It SHALL NOT render the terminal tree or label folders as file previews. Type labels SHALL use kind/recorded version MIME; unknown MIME SHALL NOT be guessed from display names. Ancestor labels SHALL pass existing visibility checks.
### Requirement: Library-scoped geometry
The four Console library routes SHALL have a white content area with exactly 15px internal padding, without workspace padding stacking. Their opted-in dialogs SHALL be centered, viewport-bounded with safe gaps, and scroll within the body while preserving header/footer. These rules SHALL NOT globally alter unrelated dialogs or terminal layouts.
### Requirement: Honest bounded uploads
Authorized library/knowledge upload entrypoints SHALL open a file drop/multi-select dialog, keep original format/size/scope contracts, submit at most one file concurrently, and show per-file results. Explicit retry SHALL exclude saved files. Actual XHR progress MAY be shown; absent transport progress SHALL NOT be fabricated. Saved but not parsed/indexed SHALL NOT be described as AI-ready. Version replacement SHALL remain explicitly single-file. Unmount SHALL stop unsent entries, SHALL NOT imply cancellation of in-flight writes, and SHALL suppress stale completion callbacks. No prior user data or sharing scope SHALL be changed by this UI work.

## t196/t197 呈现约束补充
我的资料根不显示独立展开按钮且点击必显示根内容；子目录默认折叠并独立按需展开、标题只导航。状态筛选使用既有可键盘操作的portal Menu，保留原过滤语义。仅资料Dialog采用viewport fixed遮罩/body teleport及原生双轴居中（auto margin不得被0覆盖），安全余量24px/小屏16px，内容限高滚动、头尾可见；样式不得作用非资料业务弹窗，权限/数据语义不变。


## t200 Admin enterprise management
### Requirement: Platform metadata is not implicit content authorization
Platform administrators MAY search enterprise metadata and a selected enterprise's all-level records. Every body/version read and write SHALL revalidate the explicitly selected, non-expired/non-revoked custody grant. READ SHALL NOT write. Platform SHALL NOT approve its own grants or impersonate an enterprise member.
### Requirement: Explicit ownership and immutable uploads
Create SHALL require an active non-platform target member, same-enterprise authorized folder, scope, reason and requestId. PRIVATE SHALL be the default; ENTERPRISE SHALL require explicit confirmation and matching grant. Actual actor and owner SHALL be distinct. File queues SHALL freeze targets, stop unsent files on unmount and only retry failures with their original keys. Replacement SHALL append a version and retain old version references.
### Requirement: Scoped mutations, audit and conservative deletion
Mutations SHALL recheck tenant/node/grant/state/expected stamp or version, reject foreign or cyclic targets, retain owner, and audit real actor, target, reason, before/after and result without body/tokens. Recycle SHALL disable subsequent source access; restore SHALL preserve lineage and require confirmation for a missing original parent. Processing/conflicting objects SHALL be protected. FILE purge SHALL remain blocked while active-use protection is unavailable; impact SHALL say UNVERIFIED, never zero. Folder/link purge SHALL require recycled state, explicit confirmation and no active/recycled direct children.
### Requirement: Actual UI resources
Admin SHALL use enterprise locator plus a single table, existing Element Plus and shared upload/dialog primitives, actual white 15px content and body-teleported viewport-bounded dialogs. Backend dist and frontend dist SHALL be regenerated; DOM fixtures SHALL NOT be called real visual acceptance. No schema migration is needed for this increment.
