# 资料库验收

## 权限
两租户两成员，私有→共享→撤销，列表/搜索/下载/预览/问答/引用逐项生效。跨租户伪造ID/tenant不泄露标题正文。企管可管理本企业成员私人资料，但 AI 引用仅本人私有和当前企业共享；平台治理与终端成员上下文分离。

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
Platform administrators MAY search enterprise metadata and a selected enterprise's all-level records. Every body/version management read and write SHALL revalidate the selected enterprise and platform authority. Inactive enterprises SHALL be read-only. Custody grants are legacy compatibility, not the Admin management path. Platform SHALL NOT impersonate a member.
### Requirement: Explicit ownership and immutable uploads
Create SHALL require an active real target member (including a platform account with a real membership), same-enterprise authorized folder, scope and requestId. PRIVATE SHALL be the default; ENTERPRISE SHALL require explicit confirmation and selected enterprise. Actual actor and owner SHALL be distinct. File queues SHALL freeze targets, stop unsent files on unmount and only retry failures with their original keys. Replacement SHALL append a version and retain old version references.
### Requirement: Scoped mutations, audit and conservative deletion
Mutations SHALL recheck tenant/node/platform authority/state/expected stamp or version, reject foreign or cyclic targets, retain owner, and audit real actor, target, reason, before/after and result without body/tokens. Recycle SHALL disable subsequent source access; restore SHALL preserve lineage and require confirmation for a missing original parent. Processing/conflicting objects SHALL be protected. FILE purge SHALL remain blocked while active-use protection is unavailable; impact SHALL say UNVERIFIED, never zero. Folder/link purge SHALL require recycled state, explicit confirmation and no active/recycled direct children.
### Requirement: Actual UI resources
Admin SHALL use enterprise locator plus a single table, existing Element Plus and shared upload/dialog primitives, actual white 15px content and body-teleported viewport-bounded dialogs. Backend dist and frontend dist SHALL be regenerated; DOM fixtures SHALL NOT be called real visual acceptance. No schema migration is needed for this increment.


## 平台账号终端成员上下文与 Admin 闭环（2026-11-10）
- 平台角色与 OrgMember 成员关系独立，不硬编码账号、企业名称或默认第一企业。平台账号只进 Admin，不因加入企业而获得 Console 入口或 Console 管理 API。
- Admin 治理目标由 URL tenantId 指定，终端成员企业由资料库 context 单独明确选择。GET /api/library/context 仅列本人的有效业务企业成员关系（排除 PLATFORM，保留既有 AGENCY/ENTERPRISE 业务租户兼容）。POST context 必须重新验证真实成员关系，签发 purpose=library-member 的受限凭证；不修改浏览器登录 Cookie、不改 auth/me 的 tenants 语义。
- 受限凭证仅保存在账户 Host 的资料库实例中，不返回 Client，不用于 Admin、Auth、Console 或代管 API。底层账户凭证变化立即丢弃选择；Host 重启需重新明确选择。每次资料 API 仍检查成员关系和企业状态。未绑定企业不暗中创建/绑定，提示配置成员关系，不引导 Console。
- 自动 search、手选 open、ask、来源 source 和 used 均按当前企业本人私有或 ENTERPRISE 共享校验；管理可读不等于可引用。回收/彻删来源保留既有 409/410 语义，但只有曾有本人引用权限的来源才可获知该状态；无权者 404，不透露标题。历史已生成内容不追溯抹除。
- /admin/library 为总览；/admin/library/:tenantId 为独立详情。旧 ?tenantId 链接兼容。详情提供全部文件和成员列表/成员筛选，预览仍为页内弹窗，不增加第三页；保留版本、幂等、审计、解析重试、回收恢复和文件彻删保护。
- 有文件成员数=ACTIVE FILE 的去重 ownerUserId（含仍持有资料的历史所有者）；共享文件数=ACTIVE FILE 且 ENTERPRISE；容量=未 PURGED 节点所有历史版本，含回收项；失败=ACTIVE 节点当前版本 FAILED。
- 现有 AdminSupportService.adminScope 对超级管理员/平台管理员均返回全量；本次不发明按企业授权模型。后续若收窄范围，资料库与 Admin 企业管理需共用范围校验。

- 既有 Admin 用户编辑表单允许为平台账号新增终端企业 MEMBER 关系。PATCH 用户的 addMemberTenantId 只增不删，不与旧 tenantId 替换操作混用，不接受平台总部或停用企业，不同时取消平台身份。重复关联不重复创建、不降级既有成员角色。超级管理员目标的新增关系必须由超级管理员操作；操作写入既有 admin_update_user 审计。
