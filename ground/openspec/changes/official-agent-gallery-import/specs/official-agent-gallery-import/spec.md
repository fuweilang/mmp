# official-agent-gallery-import

## Requirements

### Requirement: Mapping inventory is versioned

系统 MUST 在 Ground 仓内维护 latest 20 个官方/内置智能体到 MMP 的映射（含批次与非目标）。

#### Scenario: Batch A is identifiable
- **WHEN** 读取 `assets/index.json`
- **THEN** `mammoth` 与 `c3274112ed041` 标记为 batch A 且 kind=GENERAL、无 KB

### Requirement: Idempotent draft import

系统 MUST 支持从资产包按 key 幂等导入草稿，且 MUST NOT 覆盖已发布智能体上管理员已改的草稿内容。

#### Scenario: Fresh key creates draft
- **WHEN** 导入尚不存在的 key
- **THEN** 创建 status=DRAFT 的 official_agent

#### Scenario: Published key is skipped
- **WHEN** 同 key 已 PUBLISHED
- **THEN** 导入跳过覆盖并记录日志

### Requirement: Batch A shelf for pilot

系统 MUST 能发布批次 A 两智能体并为华为试点企业建立 ACTIVE grant（固定 version_id），且 MUST NOT 破坏已有润色/答疑授权。

#### Scenario: Huawei member sees cards
- **WHEN** 华为成员调用 `GET /api/official-agents`
- **THEN** 响应包含猛犸 AI 与商业命名大师的公开卡片（name/summary/openingQuestions）
