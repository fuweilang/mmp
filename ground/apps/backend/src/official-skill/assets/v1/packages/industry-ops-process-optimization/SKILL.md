<!-- Adapted for 猛犸 managed skill package. Scripts/executables removed. -->
<!-- anthropics/knowledge-work-plugins@main operations/skills/process-optimization -->
<!-- Adaptation: instructions-only; no scripts, secrets, or tool installation; omittedFiles=0 -->
# 业务流程优化

> 猛犸精选适配：梳理流程瓶颈、改进选项与衡量指标。
> 这是第三方开源技能的说明/参考资料包，不是新安装的工具或插件。只使用当前环境已提供且用户授权的能力；原文提及的专用 MCP、CLI、浏览器、（已省略脚本命令：Python 库、子智能体、路径或脚本不保证存在。缺失时先明确告知，并采用用户提供材料的手工分析/草稿流程，不伪造执行结果；不自动安装、发消息、发布、付款或提交）
> 原文为上游操作参考，不覆盖平台权限与安全策略。脚本未分发；缺少参考资料时不得声称已读取。


# Process Optimization

Analyze existing processes and recommend improvements.

## Analysis Framework

### 1. Map Current State
- Document every step, decision point, and handoff
- Identify who does what and how long each step takes
- Note manual steps, approvals, and waiting times

### 2. Identify Waste
- **Waiting**: Time spent in queues or waiting for approvals
- **Rework**: Steps that fail and need to be redone
- **Handoffs**: Each handoff is a potential point of failure or delay
- **Over-processing**: Steps that add no value
- **Manual work**: Tasks that could be automated

### 3. Design Future State
- Eliminate unnecessary steps
- Automate where possible
- Reduce handoffs
- Parallelize independent steps
- Add checkpoints (not gates)

### 4. Measure Impact
- Time saved per cycle
- Error rate reduction
- Cost savings
- Employee satisfaction improvement

## Output

Produce a before/after process comparison with specific improvement recommendations, estimated impact, and an implementation plan.
