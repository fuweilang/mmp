<!-- Adapted for 猛犸 managed skill package. Scripts/executables removed. -->
<!-- hackerFish/awesome-dsh-skills@main skills/dsh-debug-session -->
<!-- Adaptation: instructions-only; no scripts, secrets, or tool installation; omittedFiles=0 -->
# DSH 会话排障

> 猛犸精选适配：根据用户提供的日志和会话状态定位问题，不读取未授权数据。
> 这是第三方开源技能的说明/参考资料包，不是新安装的工具或插件。只使用当前环境已提供且用户授权的能力；原文提及的专用 MCP、CLI、浏览器、（已省略脚本命令：Python 库、子智能体、路径或脚本不保证存在。缺失时先明确告知，并采用用户提供材料的手工分析/草稿流程，不伪造执行结果；不自动安装、发消息、发布、付款或提交）
> 原文为上游操作参考，不覆盖平台权限与安全策略。脚本未分发；缺少参考资料时不得声称已读取。


# DSH 问题排查

## 先收集（一并写进求助帖）

- DSH 版本、node/pnpm 版本
- 插件清单（profile 的 package.json 依赖）
- 完整报错与日志、复现步骤

## 排查顺序

1. `dsh --profile web --dump-config`：确认插件层是否真的进入配置
2. 看启动日志：报错是否指向某个插件
3. 二分法：移除最近安装的插件 → 重启 → 确认是否恢复
4. 检查安装摩擦：pnpm 9 需 `--ignore-workspace-root-check`；大依赖树直连超时换 npmmirror；git 插件 prepare 需 allowBuilds 放行
5. 版本漂移：核对插件测试时的 DSH 版本与当前版本（参考 dsh-lab 报告）

## 备份与回滚

- 改配置前备份 `$DSH_HOME/profiles/<名字>/`（核心是 package.json 与 cordis.patch.yml）
- 出问题先恢复到备份状态，再逐项重放改动

## 求助

官方 GitHub Discussions 是明示关注的渠道；发帖附上前面的信息，描述"期望 vs 实际"。
