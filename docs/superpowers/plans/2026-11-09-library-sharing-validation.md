# 企业共享权限继承实施与验证记录

修改已从隔离工作区 `/Users/luoxiaojun/.codex/worktrees/enterprise-library-inheritance/mmp` 合入原工作区 `/Users/luoxiaojun/Documents/mmp/mmp`。本次合入 35 个相关文件；原有 12 个未提交文件逐项校验内容未变，Git 暂存区保持不变。未提交、推送、部署或替换已安装客户端。

原工作区已重新执行下表全部相关测试、构建与类型检查，共 147 项自动化测试通过。合入前备份和校验清单位于 `/var/folders/29/d5zz2rw15yj74xrbjph4p6740000gn/T/mmp-library-merge-20261109-_cu8bhts`。隔离工作区保留。

## 实际行为

- 企业共享根目录的新建文件夹、上传和链接直接以企业共享范围保存。
- 目录内新建和上传按服务端父目录继承；显式陈旧范围拒绝提交。
- 共享已有目录递归包含全部未彻删子项，包括回收项；所有者和资料 ID 不变。
- 逐项验证待变更资料的管理权限，任一无权或数据库失败时整次回滚；不会通过目录操作公开他人的私有资料。
- 私有资料移入共享目录需确认并递归共享；移出保留范围。共享目录内的子项需先移出再单独取消共享，整个目录取消共享需确认并逐项鉴权。
- 普通成员可创建；其他成员可读，创建者和企业管理员的管理权限沿用原规则。平台代管须分别具备源和目标范围 CRUD 授权。
- Console、平台管理页和桌面端显示保存范围与递归影响数量；确认使用目录修订号。创建成功保留共享目录，上传目标在弹窗打开时捕获。

## 验证结果

以下命令均在最终改动后验证，退出码为 0；数据库测试仅使用本次新建的本地独立 PostgreSQL，已清除合成账号和企业并删除测试容器。

| 检查 | 命令（相对原工作区） | 结果 |
|---|---|---|
| 后端资料库及权限单元测试 | `pnpm --dir ground/apps/backend test:library` | 39/39 |
| PostgreSQL 持久化及事务 | `pnpm --dir ground/apps/backend test:library:db`，设置专用 `LIBRARY_TEST_DATABASE_URL` | 5/5 |
| 真实登录、普通成员及平台管理 HTTP | `pnpm --dir ground/apps/backend test:library:http`，设置专用 `LIBRARY_TEST_DATABASE_URL` | 28/28 |
| Console / Admin 的 Vue 界面 | 在 `ground/apps/frontend` 执行 `../../../mammoth-agent/node_modules/.bin/vitest run --config tests/library-upload.vitest.config.mjs` | 25/25 |
| 桌面资料库与账号传输 | 在 `mammoth-agent` 执行 `pnpm exec vitest run packages/client/ui-enterprise-library/tests packages/credentials/deepseek-account-platform/tests/ground-library.spec.ts` | 50/50 |
| 后端构建 | `pnpm --dir ground/apps/backend build` | 通过 |
| Console 类型检查及构建 | `pnpm --dir ground/apps/frontend typecheck`、`pnpm --dir ground/apps/frontend build` | 通过 |
| 桌面 / Web 构建及聚合类型检查 | `pnpm --dir mammoth-agent run build:artifacts`、`pnpm --dir mammoth-agent run build:check` | 8 个构建检查、2 个聚合检查通过 |
| 补丁格式 | `git diff --check` | 通过 |

PostgreSQL 用例通过真实触发器拒绝第二个子项更新，验证父项、子项和共享审计全部回滚。其他用例覆盖成员读取与编辑隔离、跨租户、陈旧确认、并发创建、旧客户端继承、上传期间目录变更及新文件清理。

## 独立审查

独立审查发现三项实质问题，均已先复现失败，再修复并通过回归：

1. 平台代管移动错误使用源授权读取共享目标：目标父目录使用显式目标 CRUD 授权，源子树继续使用源授权。
2. 新增事务包装可能在文件物理删除后恢复旧元数据：撤回本次对彻底删除流程新增的事务包装，保持其原有行为。
3. 替换版本在后续审计失败时遗留新原件：将解析和原件准备放在提交前，提交时重新鉴权及检查资料修订；清理覆盖整个事务完成，包括审计和提交失败。

审查未报告其他重要问题或待处理的小项。

## 范围与未验证项

没有自动回填或公开历史私有资料；没有数据库结构迁移。代码已合入原工作区并重新构建。没有执行真实账号、已安装桌面程序或线上环境的人工验收；未对已运行实例是否加载新代码作验收结论。

补充诊断：直接对后端整个项目执行 `pnpm exec tsc --noEmit --incremental false` 会把历史测试一并检查。原工作区也复现了相同失败，分别在 `test/official-agent-admin-avatar.unit.test.ts`、`test/official-agent-admin.service.test.ts` 和 `test/official-agent-version-presentation.unit.test.ts`，涉及参数个数、类型收窄及 `import.meta` 编译模式；本次未修改这些无关测试。后端正式 Nest 构建和上表所列检查通过。
