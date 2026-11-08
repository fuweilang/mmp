# Ground/Admin 落地交接（任务 1–2）

供猛犸mmp3 对接 DSH Host；**未**实现 Host 加载绑定、广场 Tab、新会话 UI。

## 规格冲突处理

| 点 | UI 摘要 | design/OpenSpec | 落地选择 |
|---|---|---|---|
| 新建后启停 | 开关默认启用 | ZIP 成功为未启用，启用后出现前台 | **按 design：默认 `enabledAt=null`** |
| 表单是否含 key | UI 列表字段未写 key | key 全局唯一且不自动改写 | ZIP 从 manifest 取 key；表单创建仍要求填写 key |
| 删除 | UI 可确认解除关联后删 | 被专家/历史引用仅可停用 | **后端拒绝删除关联或已启用技能**；Admin 引导停用 |

## 数据（迁移 un-applied）

- `prisma/migrations/20261106210000_official_skills/`
- 表：`official_skill`、`official_skill_package`、`official_agent_skill_link`
- `official_agent_version.linked_skill_summaries` JSON 快照（发布时写入）

包落盘：`uploads/official-skills/<skillId>/r<revision>/`（`skill.json` + `SKILL.md` + `references/*`），**不**把 ZIP 放大字段进库。

## 稳定 API 契约（Host 用）

### 技能目录（启用摘要）
`GET /api/official-skills?q=&category=`
→ `{ id,key,name,summary,category,enabledAt,packageRevision }[]`  
停用的不返回；无正文。

### 技能开会话契约（Ground 只校验+返回绑定，不建 Host session）
`POST /api/official-skills/:id/sessions`  
body: `{ expectedRevision?: number }`  
→
```json
{
  "sessionSource": { "type": "skill", "id", "key", "name", "packageRevision" },
  "skill": { "id", "key", "name", "summary", "category", "enabledAt", "packageRevision" },
  "standardCapabilities": { "files": true, "terminal": true, "network": true },
  "loadPolicy": {
    "initialContext": "summary_only",
    "instructionOnDemand": true,
    "contentPath": "/api/official-skills/:id/content?revision=N"
  }
}
```
错误码：`OFFICIAL_CONTENT_DISABLED`、`SKILL_REVISION_UNAVAILABLE`、`SKILL_PACKAGE_INVALID`、`SKILL_RESOURCE_NOT_FOUND`。

### 按需正文 / 资源
- `GET /api/official-skills/:id/content?revision=`
- `GET /api/official-skills/:id/resources?path=references/...&revision=`

### 专家目录 / resolve
- `GET /api/official-agents` 卡片增加 `linkedSkills`（当前关联且启用摘要）
- `POST /api/official-agents/:id/resolve` 增加 `linkedSkills`（同上；Host 应冻结到新会话）

## Admin

- 页：`/admin/official-skills`（技能管理）
- 官方智能体编辑增加「关联技能」多选（仅已启用）
- 不做工具注册/沙箱/公共模块注册/复杂版本回滚

## 明确未做

任务 3 广场双 Tab / 新会话 UI；任务 4 DSH Host provider 实际加载绑定；迁移 apply；测试/构建/发布。
