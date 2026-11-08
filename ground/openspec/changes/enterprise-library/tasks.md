# tasks

## 1. 业务范围 / OpenSpec

- [x] 独立 change `enterprise-library`：proposal、design、spec、tasks
- [x] 写明不改 `kb*`、不发布、不合并、不声称改了用户本机

## 2. 现状与组件适配

- [x] 核对中台知识库、JWT 租户、云端模型网关、Vue 控制台样式
- [x] 核对 mammoth-agent 侧栏是插件槽位，本变更不装第三方本地 RAG
- [x] 容量不占用现有 Token `Quota` 表，改用环境变量

## 3. 最小 UI

- [x] `/library`：最近 / 我的资料 / 企业共享 / 回收站，面包屑，搜索，上传，文件夹，链接
- [x] 行菜单、多选、批量回收/恢复/删除
- [x] 上传进度与解析状态分开；列表失败保留数据；空态可上传；搜索空可清除
- [x] 选择弹窗与提问 chips 不自动发送；临时文件不自动入库
- [x] mammoth-agent Web 组合注册资料库左栏、`+` 命令和 `@` 引用；单测覆盖选择不发送、列表失败保留、引用只接受服务端版本
- [ ] 桌面安装包没有打包运行。插件和 Web 组合共用，桌面窗口未验

## 4. 统一资料服务及 Console / Admin

- [x] `library_*` 迁移、服务、鉴权、版本、回收、代管审计
- [x] 控制台侧栏进入同一 `/library`
- [x] 总后台容量数量状态、代管授予与撤销
- [x] 不信任客户端 tenant_id

## 5. Web / 客户端资料交互

- [x] Web `/library` 与 Console 使用同一 API
- [x] 预览、下载、分享确认、替换版本、引用打开
- [x] Web 插件与中台 `/api/library` 使用同一套选择和打开规则，不在客户端另存正式副本
- [ ] 登录后的智能体浏览器整页和桌面窗口还没有跑起来

## 6. 基础解析与选文件问答

- [x] MD、文字 PDF、DOCX 提取；PPT/Excel/ZIP/HTML 的限制
- [x] 有界摘录、截断说明、真实引用、失败和越权负例
- [x] 模型请求只组装云端网关的 auto/池内调用
- [ ] 有可用模型凭证时的真实往返（本环境未接厂商 Key，不能把替身当成通过）
- [x] 首次上传在已迁移 Postgres 上复现外键失败，并改为节点与版本同一事务

## 7. 风险聚焦验收

- [x] 两租户、同租户两成员的服务级测试
- [x] 私人、共享、撤销、越权直链、回收恢复、版本引用、重试不重复索引、ZIP、临时附件
- [x] 跑通的测试写入本文件的验证记录
- [ ] 浏览器里从登录走到真实模型回答（缺数据库或模型凭证时保持未验证）

## 验证记录

2026-11-08，本仓库云端环境。后来在本机装了 PostgreSQL 16 和 pgvector，库名 `library_test`，连接只放在环境变量 `LIBRARY_TEST_DATABASE_URL`，不写进口令。

修复前，迁移已经全部应用。用当前代码对一份小 Markdown 做首次上传，Postgres 返回 `library_version_node_id_fkey`。当时 `library_node`、`library_version`、`library_chunk` 都是 0，临时目录里也没有留下文件。这证明上传失败，不是内存测试能看出来的。

修复后 `pnpm --filter @mammoth/backend test:library:db` 2 项通过。成功响应摘录：`parseStatus=READY`，资料 `47a2ff41-7dcc-4684-9bc7-28eb1f42c227`，版本 `8d3e6a1e-a848-4f81-8a3e-10e1c6047a01`，1 个 chunk，1 个文件。旧版本打开仍是「第一段持久正文」。故意让提交失败时，节点数、版本数和文件数都不变；chunk 外键失败时节点和版本都回滚。

2026-11-08 早些时候，没有数据库时：

- `pnpm --filter @mammoth/shared build` 通过。
- `pnpm --filter @mammoth/backend build` 通过。
- `pnpm --filter @mammoth/backend test:library`：9 项通过，0 失败。覆盖两租户、同租户两名成员、企业管理员不能读私人正文、共享确认与收回、移动不改范围、离职不改范围、越权 404 不带标题、版本引用、回收恢复、彻底删除不改指向、解析重试不重复 chunk、ZIP 不建索引、HTML 不执行、PDF 页码、DOCX 段落、截断、模型替身去掉伪造引用、无模型时不编答案、代管到期/撤销、容量含回收站和旧版本、客户端 tenant_id 被 DTO 拒绝、临时文件不入库、选择不自动发送。
- `pnpm --filter @mammoth/frontend typecheck` 通过。
- 浏览器只打开了前端 `/library`。接口没起来，列表显示「请求失败」，原有空列表和提问框还在，空态可以上传。没有登录后的上传、解析、提问闭环，不能把这张图当成接口通过。
- 总后台页面会先刷新 `/auth/me`。没有 API 时会回到登录页，所以没有总后台资料概况的有效截图。
- 模型往返未验证。测试里的完成函数是替身，不是超管模型池的真实调用。
