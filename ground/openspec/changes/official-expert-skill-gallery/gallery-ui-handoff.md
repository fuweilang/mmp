# 专家广场 UI 落地交接（任务 3）

供猛犸mmp3 / 任务 4 Host 对接；**未**实现技能 Host 会话绑定、来源头、DSH provider。

## 包边界

| 层 | 路径 | 作用 |
|---|---|---|
| 共用 UI（Web+桌面） | `mammoth-agent/packages/client/ui-official-agent-gallery` | 专家广场 Tab/卡片/`requestSkill` 占位 |
| Host Remote | `mammoth-agent/packages/preset/official-agent-gallery` | `list` / **`listSkills`** / `create`(专家) |
| Ground 公开读 | `GET /api/official-agents`、`GET /api/official-skills` | 仅启用摘要 |

未新建第二套前端；未改 Knowledge / 登录权限 / 模式预设。

## 技能按钮契约（任务 4 接）

当前 Client：

```ts
requestSkill(skillId) => 'pending'  // 文案含 skillId；不建会话
```

任务 4 应替换为大致：

1. `workspaceForNewSession()`；无工作区 → `workspaceRequired`
2. Host remote 调 Ground `POST /api/official-skills/:id/sessions`（可选 `expectedRevision`）
3. Host 新建标准 Session，冻结 `sessionSource.type=skill` + revision（见 `ground-admin-handoff.md`）
4. `uiWorkspace.openSession(newId)`；旧会话不动
5. 会话头「技能 · {name}」（本任务未做）

**禁止**把 Ground sessions 响应当成已存在的 Host session id。

## 与 UI spec 的收口差异

| 点 | Spec | 落地 |
|---|---|---|
| 技能点击新建会话 + 来源头 | §6.2 | **延后任务 4**；按钮 pending |
| 刷新按钮 | 可藏次要 | 仍保留右上 ghost「刷新」 |
| 暗色主色硬编码 | 禁止正文硬编码 #415fff | 指示/chip/按钮用 #415fff；正文走 alias |
| 专家 executionGranted 锁态 UI | 卡片删除锁态 | 按钮统一「开始对话」；未开通仍阻断并提示 |
| 技能分类 | 少量 chip | 使用 Ground 技能分类 `common/content/business/expertise` |

## 运行时注意

- 未跑构建：`ui-official-agent-gallery/lib/client.js` 可能仍是旧 bundle，需后续 `pnpm --filter @mammoth-ai/mmp-client-ui-official-agent-gallery bundle`（或等价）才反映 UI。
- Host `lib/` / `typert.remote-client.*` 已手工加入 `listSkills` 与 `linkedSkills`；完整 `generate-typert` 后请核对。
