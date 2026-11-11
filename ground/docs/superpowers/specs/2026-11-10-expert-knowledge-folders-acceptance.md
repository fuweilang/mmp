# 专家知识库文件管理验收

实施位置：`/Users/luoxiaojun/.codex/worktrees/official-experts-rag/mmp/ground`，当前 5201 网关实际使用的工作区。未提交、推送或发布生产。

## 已完成

- 知识库首页为紧凑文件夹列表；专家按需创建一个所属文件夹，不创建子文件夹。
- 日常上传自动选择现有可用语义服务，复用原解析/切块/索引 Worker；无需手动创建索引或发布知识。
- 所属专家自动使用处理完成的文件。其他专家进入文件夹勾选具体文件；文件子集按现有专家草稿保存/发布流程生效。
- 同一 documentId 共享同一内容。Worker 在同一事务切换可用内容；待处理/失败时保留旧内容。恢复曾上传的内容也能正确切换，迟到任务不会覆盖最新请求。
- 文件默认只读分段预览，支持原文、PDF 内联、下载、替换、失败重试和删除。
- 删除文件即时撤销所有专家的检索和历史出处访问；取消 B 的引用并发布后，B 的旧会话也不能继续访问，而 A 不受影响。
- 删除专家使用数据库 SetNull 保留所属文件夹与文件；文件夹保留原专家名称。
- 服务配置与检索诊断保留在高级设置。历史未确认归属的文件夹显示为已有资料，不伪造专家归属。

## 验证证据

独立工作记录和日志：仓库根 `.superpowers/sdd/2026-11-10-expert-knowledge-folders/`。该目录保存实施前文件备份、增量审阅补丁和截图。

- `backend-unit.log`：109 项相关逻辑测试通过，包括前端文件状态纯函数。
- `frontend-files.log`：3 项新界面交互测试通过。
- `expert-regression.log`：31 项专家编辑回归通过。
- `database.log`：3 项独立 PostgreSQL 场景通过，覆盖 Worker、共享更新、A→B→A 内容恢复、文件范围隔离、旧会话撤权、删除专家、删除文件和旧发布子集迁移。
- `verify.log` 与 `backend-build.log`：前端类型检查、前后端构建通过。单独对包含既有测试文件的宽泛 `tsc --noEmit` 曾发现原有测试的 null/HTTP 类型错误；正式 build 配置及本次相关运行测试通过，未扩大范围修改这些既有测试类型。
- 一次独立增量审阅发现的迁移、取消引用撤权、内容恢复三个问题均已复现后修复，对应 RED 证据为 `review-red.log`。

浏览器从 `http://127.0.0.1:5201/admin/official-knowledge` 验证真实 Vue/NestJS 页面：创建独立 A/B 草稿，仅 A 建所属文件夹；A 上传 Markdown 自动变为可用，默认展示三个分段；B 勾选 A 的同一文件；A 替换后 B 不需重新选择即可看到 24 小时的新内容。截图为 `knowledge-folders.jpg`、`knowledge-chunks.jpg` 和 `shared-file-updated.jpg`。

本地入口使用已有独立验收库 `mmp_rag_ui_acceptance` 和本地模拟 Embedding 供应商；数据库回归使用 `mmp_rag_acceptance`。上述证据证明工程链路与权限行为，不代表真实供应商的召回质量、计费或生产环境已验收。

## 数据迁移

新增 `20261111070000_expert_knowledge_folders` 和 `20261111071000_knowledge_effective_file_backfill`，均为增量迁移。后者根据每文件的当前请求与有效成功内容重建完整可用发布，避免把其他专家最近选择的文件子集误作整个文件夹。已应用于本地验收库；生产未执行。
