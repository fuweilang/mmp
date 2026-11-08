<!-- Adapted for 猛犸 managed skill package. Scripts/executables removed. -->
<!-- hackerFish/awesome-dsh-skills@main skills/dsh-preset-authoring -->
<!-- Adaptation: instructions-only; no scripts, secrets, or tool installation; omittedFiles=0 -->
# DSH 预设编写

> 猛犸精选适配：指导组织可复用预设与插件组合，需目标项目环境。
> 这是第三方开源技能的说明/参考资料包，不是新安装的工具或插件。只使用当前环境已提供且用户授权的能力；原文提及的专用 MCP、CLI、浏览器、（已省略脚本命令：Python 库、子智能体、路径或脚本不保证存在。缺失时先明确告知，并采用用户提供材料的手工分析/草稿流程，不伪造执行结果；不自动安装、发消息、发布、付款或提交）
> 原文为上游操作参考，不覆盖平台权限与安全策略。脚本未分发；缺少参考资料时不得声称已读取。


# DSH Preset Authoring

1. A preset is one directory: `agent.cordis.yml` (required composition) plus optional `preset.yml` (display metadata: `name`, `description`, numeric `order`; `order` sorts the roster).
2. Name the directory (the preset id) `[a-z0-9][a-z0-9-]*` kebab-case — discovery skips any other id outright, and authoring APIs reject it.
3. `agent.cordis.yml` is a top-level YAML list of rows `{id, name, config?}`; every `name` is an `@deepseek-ai/*` package (with optional `config`) or `cordis:group` whose `config` is a recursive row list.
4. Take each row and its config fields verbatim from an official shipped preset or an install you validated — never invent field names; unverified rows fail the package-existence gate or break the boot.
5. Install under the harness-home user root `~/.dsh/.agent-presets/<id>/` (files are the only composition editor; `copy()` is the API alternative and never overwrites).
6. Validate against a real install: `node tools/validate-presets.mjs --harness <dsh node_modules root>` from awesome-dsh-presets — YAML (incl. `!!js` dialect) parses, rows carry `id`+`name`, `cordis:group` recurses, every referenced `@deepseek-ai/*` package exists.
7. Expect live discovery: `list()`/`resolve()` re-read roots per call, and each session tracks its composition file's mtime/size stamp — a new session picks up your edit, an already-joined session keeps the generation it started on.
8. A directory that is broken (missing/unreadable `agent.cordis.yml`) is listed with its reason, occupying the id: fix the file or delete the directory; do not shadow it with a duplicate.
9. Switching presets applies only to a blank session (nothing produced yet); a produced session answers `agent-preset-locked` — do not claim a switch happened.
10. Deliver the preset directory, the validation output against the harness version you used, and one blank-session verification that it boots with the intended tools.
