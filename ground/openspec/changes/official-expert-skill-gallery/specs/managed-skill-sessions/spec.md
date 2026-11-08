## ADDED Requirements

### Requirement: Skills load instructions only when selected for use
DSH 标准会话 SHALL 保留现有文件、终端与联网能力。未显式选择的技能 SHALL 最多以名称和短描述出现在受管目录中，其指令正文 SHALL NOT 进入初始上下文；仅在模型选择 `skill` 或用户显式 `/name` 时 SHALL 加载正文，引用资源 SHALL 按需读取。关联技能 SHALL NOT 自动加载，独立技能 SHALL 能启动通用 AI。

#### Scenario: Expert session has two linked skills but neither is used
- **GIVEN** 当前专家关联两个启用技能
- **WHEN** 用户提出不涉及技能的问题
- **THEN** 可以展示技能摘要，未发送两份指令正文或未读取的引用资源

#### Scenario: A selected skill becomes unavailable
- **GIVEN** 新会话请求引用某一技能 revision
- **WHEN** Ground 拒绝该停用或失效 revision
- **THEN** 明确显示失败，不自动改用另一技能或创建无技能假会话


### t148/t149 current implementation constraint (supersedes unconditional tool inheritance above)
Gallery standard composition SHALL NOT automatically authorize arbitrary file/terminal/network tools. New composition v3 managed-documents explicitly mounts the existing standard preset but executes only official skill loading, session-admitted text reads, immutable managed md/txt/csv/json creation and loaded-skill text references. Unsupported execution remains unavailable; ordinary unbound standard is unchanged. Role instructions append rather than replace base. Explicit selected skill SHALL load via Host before the FIRST business assembly/request; same revision/hash/full required method and budget are checked again at actual post-budget cloud wire boundary. Missing/hash/budget failures block business inference. Auxiliary inference SHALL stay cloud-only, no tool execution, and is not advertised as business skill loading. Legacy content is preserved and gains no tools.

#### Scenario: Real managed deliverable without arbitrary execution
- GIVEN a newly bound standard gallery session and a native session-owned admitted UTF-8 text object
- WHEN the current authorization passes and managed document tools execute
- THEN output is an actual immutable attachment, subject to size/quota/format/readback SHA checks, scoped authorized download and truthful native task terminal state
- AND shell/network/MCP/foreign object/path/shadow tool cannot inherit that authorization
- AND cancellation never resurrects a terminated attempt; a committed file is reported as an actual remaining effect, not a rollback

Implementation evidence: business-v3-t149-handoff.md; nine focused native/store/mock-transport checks, NOT live cloud/full standard deployment acceptance.
