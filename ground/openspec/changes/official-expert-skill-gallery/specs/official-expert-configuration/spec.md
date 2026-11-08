## MODIFIED Requirements

### Requirement: Idempotent draft import
系统 MUST 支持从资产包按 key 幂等导入草稿且 MUST NOT 覆盖已发布智能体的管理员草稿。导入为受专家广场当前启停规则约束的内部管理操作，SHALL NOT 通过导入自动安装技能；未启用的导入结果 SHALL NOT 出现在公共 Tab。

#### Scenario: Imported content is disabled
- **WHEN** 专家草稿已导入且未启用
- **THEN** Admin 可查看，公共目录和新会话 resolve 不开放

## ADDED Requirements

### Requirement: Expert configuration references content, not package implementation
Admin SHALL 复用既有官方智能体完整 CRUD，增加启停、少量分类、关联技能和官方/企业知识引用。知识关联 SHALL 保持 Admin 官方与 Console 企业隔离；目录 SHALL 仅暴露最小展示信息。执行 revision SHALL 冻结关联技能摘要和当前启用状态。

#### Scenario: Public visibility never grants enterprise knowledge access
- **GIVEN** 官方专家全员可见，某企业成员无权读取另一企业 Console 文档
- **WHEN** 成员使用该专家
- **THEN** 检索与来源访问仍受原 member/tenant 规则约束，不因公开卡片而被越过


## ADDED t122 requirements
### Unified expert definition and imports
Expert SHALL retain existing OfficialAgent identity/routes and execution configuration, and MAY carry versioned expertDefinition metadata for profile, workflow, deliverables, source/license/dependency/adaptation and upstream extensions. Legacy metadata defaults to an empty object and SHALL NOT rewrite old instructions, statuses, IDs, roles or versions. Imported external roles SHALL include substantive adapted Chinese instructions and redistributable license evidence pinned to immutable refs. New imports SHALL be drafts until explicit publication approval. Existing same-key records SHALL be skipped without overwrite.

### Optional skills and published snapshots
Expert editing SHALL support optional multiple existing enabled official skills and display their short summaries in preview. No skills is valid. Newly published expert versions SHALL freeze expert definition and linked skill revisions; historical session events SHALL remain unchanged. Tools/KB SHALL reuse existing checks and cloud-admin model routing; foreign tool/model declarations SHALL NOT create privileges or imply connected SaaS.

### Product wording
Expert product surfaces SHALL use 专家 / Expert while preserving technical identifiers, compatibility URLs, upstream copyright and original package texts.


### Requirement: t128 staged independent catalog icons
Both Admin expert and skill editors SHALL allow an optional PNG/JPG/WebP image<=2MB with preview/replace/remove. Files and removals SHALL remain staged until Save; Cancel SHALL leave stored icons unchanged. Both ends validate file type/signature/size, the server uses generated managed filenames, and public image delivery SHALL not require Admin authentication or expose disk paths.

#### Scenario: Image-only save
- **WHEN** only the icon changes
- **THEN** no instruction/package revision or published version is rebuilt, no ZIP is required, no draft is enabled/published and existing permissions remain unchanged. Admin expert/skill pages default to10 rows.

### Requirement: guarded display-only purpose descriptions
Audited Chinese purpose metadata SHALL be applied only when the stored original summary equals its recorded expected value. It SHALL not rewrite instructions/licenses/revisions/published or session snapshots, and SHALL state missing external capabilities rather than claiming tool execution.
