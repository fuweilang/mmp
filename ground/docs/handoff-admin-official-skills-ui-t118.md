# Admin 技能配置页 UI（t118）

## 范围
- 仅 `apps/frontend/src/views/admin/AdminOfficialSkills.vue`，超级管理员/平台管理员共用技能页面。
- 保留该文件原有本地未提交内容；未动智能体配置页、广场、共享 API、后端、权限、数据库、技能正文。
- 未提交、发布或构建；未执行测试、E2E、浏览器验收及 review。

## 改动
- 页面大容器采用 Element Plus 背景 token（亮色为白色）和 15px padding；整理筛选、表头、长文截断、操作对齐和分页。
- 复用用户列表的客户端 slice 分页方式，默认20条，支持20/50/100，显示筛选后总数。
- 搜索（300ms debounce/Enter/按钮/清空）、状态和分类变化回第一页；删除/启停/重新加载后按总数夹紧页码；请求序号避免旧搜索结果覆盖。
- 新建/编辑及其中 ZIP 校验/预览共用原有 el-dialog；原页面没有独立查看弹窗，未额外新增业务入口。
- el-dialog align-center + append-to-body；仅技能专属 overlay flex 居中，不使用 top/translate；上下24px（窄屏16px）安全区、vh/dvh高度限制；header/footer不缩小，body min-height:0/overflow-y:auto。长包名、校验文字、预览表格可换行。
- 页面现有停用/删除/无法删除 message box 都加技能专属 class，高度限视口、内容滚动、头尾保留。
- ZIP 选择改用 el-upload，auto-upload=false，仍走原有 validateZip/createFromZip/replaceZip API；默认 ZIP，保留名称/用途流程与旧包。校验和保存禁重复，详情加载完成前禁保存，关闭重开重置临时表单。

## 待用户点检
- Admin 技能页20条分页、筛选归一页、末页删除/停用后回退。
- 两种管理员角色下新建/编辑、ZIP选包校验/预览/替换、删除和停用确认。
- 小高度窗口、缩放、窄屏、长包名/校验信息、下拉菜单及暗色主题的实际呈现。
- 本轮仅静态查看相对原WIP的差异，未运行验证，未同步静态构建资源；前端开发服务可直接读取源码。

原始未跟踪页面的临时基线：`/tmp/mmp-admin-official-skills-before-t118.vue`（用于区分本次改动，不应覆盖回滚其他WIP）。
