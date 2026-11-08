# Host 技能按需加载交接（任务 5）

供点检；**未**跑 tests / 全仓构建 / E2E / 浏览器，**未** commit / push / 发布。

## 接入点（证据来自现有 DSH 机制）

复用 `ctx.skills.registerProvider`（`@mammoth-ai/mmp-skill`）+ 既有 `tool-skill` 的 `skill` 工具与 `SkillRow` UI。
**不**新建消息流；真实调用 `skill` / 用户 `/name` 时才出现「加载技能」行。

| 层 | 路径 | 作用 |
|---|---|---|
| Provider | `mammoth-agent/packages/preset/official-agent-gallery/src/skill-provider.ts` | 会话作用域注册冻结技能摘要；`get()` 拉 Ground content/resources |
| Host wiring | 同包 `src/index.ts` `agent/created` | 技能会话 / 专家 `linkedSkills` 安装 provider；专家有关联时放行 `skill` 工具 |
| Ground 客户端 | 同包 `src/ground.ts` | `fetchSkillContent` / `fetchSkillResource` |
| Ground API | `ground/.../official-skill.service.ts` | 停用后仍允许**显式 revision**读 content/resources（旧会话冻结内容） |

## 行为边界

1. 初始上下文只有目录摘要（`tool-skill` catalog），**不**塞 SKILL.md。
2. 点技能会话：仅开放该冻结技能；专家会话：仅开放当时冻结的关联且启用摘要。
3. `get()` 按冻结 revision 拉正文；引用资源落到临时目录，`resourceBase.kind=directory` 供标准读文件。
4. 目录/新会话仍要求启用；停用后旧会话凭冻结 revision 可读。
5. 不改自动模式，不迁旧代码，不重做包存储/广场卡片/知识库页。
6. 专家工具白名单：有关联技能时额外允许原生 `skill`；无关联保持原限制。
7. 全局/本地 filesystem 技能仍可能出现在 catalog（未改 tool-skill 内核过滤）；Hub 全量包不会注入。

## 局部 bundle

- Host：`pnpm --filter @mammoth-ai/mmp-official-agent-gallery bundle`（或本交接执行结果）
- UI：`pnpm --filter @mammoth-ai/mmp-client-ui-official-agent-gallery bundle` → `lib/client.js`

## 点检建议（用户）

1. migrate `20261106210000_official_skills`（若尚未）。
2. Admin 上传/启用技能 → 专家关联 → 广场点专家/技能新建会话。
3. 会话头来源标签；提问触发模型 `skill` 或用户 `/key` → 出现加载技能行且正文生效。
4. 未调用时不应显示「正在使用」。
5. 停用技能后：旧会话仍可按需加载冻结 revision；新目录不再出现。
