# 本机OpenCode配置与交接执行记录

- 时间：2026-11-07 22:34 PST
- OpenCode实际版本：v2.1.2；正常既有service http://127.0.0.1:49374。
- TUI进程5940，ttys000，cwd=/Users/fuweilang/Documents/code/mmp，命令仅opencode，没有--session；后台service进程5942。
- 只读参考 /Users/fuweilang/Documents/code/mmPlatform/.opencode/agents/{林杰,浪哥,秋池,李庚,王总,甜甜}.md；未改旧项目或PeecAI。旧角色Octop/Python与固定模型配置不照搬。
- 新增.opencode/agents/六角色、.opencode/tasks/expert-gallery-library-review.md，以及本记录。六角色采用V2 mode:subagent + 有序permissions，省略model继承主会话。审核/QA/备用角色不改业务源码（仅报告目录可写）；审核/产品/UI shell deny，QA/开发 shell ask，无任意shell allow；开发edit按Ground与mammoth/云桥分界，不允许外部目录或子代理嵌套。
- opencode debug agents解析退出0且六角色均可见；未调用reload、未重启，未声称正在运行的已有会话已热加载新角色。官方reload会重建所有loaded locations且取消pending forms/permissions；本任务不为热加载影响其它用户会话。必要时由操作者在安全边界正常reload，再检查agent.list或debug agents。
- 原37路径指纹完全未变；HEAD95a1a61e…、3.0，无unmerged。没有业务审核/业务源码修改、commit/push/PR/部署。
- 交接任务全文已准备，明确DeepSeek唯一主导；浪哥审核、秋池测试、李庚/王总修复为主要闭环；林杰/甜甜仅备用，无预设重构结论。

## 送达状态：仅准备好，未发送
- 通过公开session list/get实际发现15条该项目历史主会话，其中多个（10条）模型为DeepSeek，均无active执行drain。已确认模型字段而非猜DeepSeek ID，但这不等于确认当前TUI正在查看哪条。
- 最新候选 ses_e4eca69b6ffex8qjK7mroti7KG，标题“确认能否正常回答问题”，模型qwen/deepseek-v4.1-flash。**候选不是已确认目标**，不能凭最新updated就发送。
- 公开session.active只列执行中的drain，不返回当前TUI选中会话。TUI进程也没有显式session参数，所以无法唯一绑定当前iTerm窗口到该候选；未新建会话，未向任何候选试发。
- 已按unblock-research完成记忆查询、官方文档/公开问题、Web及X研究。官方公共API支持session.get/active/prompt，未发现可用的当前TUI选择查询；OpenCode公开issue54329仍在请求此能力。不能把旧版未合入/关闭PR里的/tui/active-session当当前V2已支持接口，亦不安装额外桥接插件、不读私有session/DB、不写随机TTY、不用AppleScript。
- 需要接续的唯一目标信息：当前iTerm OpenCode正在显示的准确session ID（或可唯一确认的会话标题+ID）；取得后重新检查项目/模型/空闲，再按用户授权只发送一次完整任务，并记录session.prompt受理回执。没有已发送回执。

## 公开依据
- https://opencode.ai/docs/agents/ ：V2 project .opencode/agents、模型继承及permissions最后匹配规则。
- https://opencode.ai/docs/cli/commands/ ：session list、api、debug agents、reload。
- https://opencode.ai/docs/api/ ：session.active是执行drain，session.prompt是持久受理，不等于任务完成。
- https://github.com/anomalyco/opencode/issues/54329 ：TUI选中/打开会话对外查询缺口。

备份与基线：/Users/fuweilang/Documents/code/mmp-opencode-handoff-20261107-223238（原有目标文件均不存在，未覆盖；含baseline状态/37路径hash、新文件副本、角色验证）。完整协调任务无需另开新会话，可在确认目标后送入既有DeepSeek。
