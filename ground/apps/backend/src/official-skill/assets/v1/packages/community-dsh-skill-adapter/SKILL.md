<!-- Adapted for 猛犸 managed skill package. Scripts/executables removed. -->
<!-- hackerFish/awesome-dsh-skills@main skills/dsh-skill-adapter -->
<!-- Adaptation: instructions-only; no scripts, secrets, or tool installation; omittedFiles=0 -->
# DSH 技能适配

> 猛犸精选适配：检查技能指令与当前 Host 的工具、目录和权限契约。
> 这是第三方开源技能的说明/参考资料包，不是新安装的工具或插件。只使用当前环境已提供且用户授权的能力；原文提及的专用 MCP、CLI、浏览器、（已省略脚本命令：Python 库、子智能体、路径或脚本不保证存在。缺失时先明确告知，并采用用户提供材料的手工分析/草稿流程，不伪造执行结果；不自动安装、发消息、发布、付款或提交）
> 原文为上游操作参考，不覆盖平台权限与安全策略。脚本未分发；缺少参考资料时不得声称已读取。


# DSH Skill Adapter

1. Inspect the source Skill, license, revision, task triggers, tools, side effects, output contract, and verification steps.
2. Do not port a skill verbatim when its license, provenance, or permitted reuse is unclear; independently summarize its workflow instead.
3. Keep decision rules and checks; remove role-play, repeated host-agent rules, invented capability claims, and agent-specific private tool names.
4. Map each action to an enabled DSH capability: filesystem, configured shell, web search, browser plugin, or subagent.
5. For an unavailable capability, state a prerequisite or manual handoff. Never claim a replacement tool ran when it did not.
6. Write the adapted file at `.agents/skills/<name>/SKILL.md` or `.dsh/skills/<name>/SKILL.md` using a kebab-case name plus `name` and `description` frontmatter.
7. Require confirmation before deletion, publishing, deployment, external messages, or credential changes.
8. Verify that every command, path, and tool either exists in the active session or is labeled as a prerequisite.
9. Deliver the source/license assessment, DSH capability map, installation path, adapted `SKILL.md`, two trigger prompts, and one near-miss prompt.
