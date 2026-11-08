<!-- Adapted for 猛犸 managed skill package. Scripts/executables removed. -->
<!-- openai/plugins@main plugins/superpowers/skills/executing-plans -->
<!-- Adaptation: instructions-only; no scripts, secrets, or tool installation; omittedFiles=1 -->
# 分步实施计划

> 猛犸精选适配：按已确认计划分批执行并记录阻塞与结果。
> 这是第三方开源技能的说明/参考资料包，不是新安装的工具或插件。只使用当前环境已提供且用户授权的能力；原文提及的专用 MCP、CLI、浏览器、（已省略脚本命令：Python 库、子智能体、路径或脚本不保证存在。缺失时先明确告知，并采用用户提供材料的手工分析/草稿流程，不伪造执行结果；不自动安装、发消息、发布、付款或提交）
> 原文为上游操作参考，不覆盖平台权限与安全策略。脚本未分发；缺少参考资料时不得声称已读取。


# Executing Plans

## Overview

Load plan, review critically, execute all tasks, report when complete.

**Announce at start:** "I'm using the executing-plans skill to implement this plan."

**Note:** Tell your human partner that Superpowers works much better with access to subagents (Claude Code, Codex CLI, Codex App, Copilot CLI, and Gemini CLI all qualify; see the per-platform tool refs in `../using-superpowers/references/`). If subagents are available, use superpowers:subagent-driven-development instead of this skill.

## The Process

### Step 1: Load and Review Plan
1. Ensure an isolated workspace: use superpowers:using-git-worktrees to create one or verify the existing one
2. Read plan file
3. Review critically - identify any questions or concerns about the plan
4. If concerns: Raise them with your human partner before starting
5. If no concerns: Create todos for the plan items and proceed

### Step 2: Execute Tasks

For each task:
1. Mark as in_progress
2. Follow each step exactly (plan has bite-sized steps)
3. Run verifications as specified
4. Mark as completed

### Step 3: Complete Development

After all tasks complete and verified:
- Announce: "I'm using the finishing-a-development-branch skill to complete this work."
- **REQUIRED SUB-SKILL:** Use superpowers:finishing-a-development-branch
- Follow that skill to verify tests, present options, execute choice

## When to Stop and Ask for Help

**STOP executing immediately when:**
- Hit a blocker (missing dependency, test fails, instruction unclear)
- Plan has critical gaps preventing starting
- You don't understand an instruction
- Verification fails repeatedly

**Ask for clarification rather than guessing.**

## When to Revisit Earlier Steps

**Return to Review (Step 1) when:**
- Partner updates the plan based on your feedback
- Fundamental approach needs rethinking

**Don't force through blockers** - stop and ask.

## Remember
- Review plan critically first
- Follow plan steps exactly
- Don't skip verifications
- Reference skills when plan says to
- Stop when blocked, don't guess
- Never start implementation on main/master branch without explicit user consent
