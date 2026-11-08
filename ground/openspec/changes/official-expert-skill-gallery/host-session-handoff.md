# Host 会话落地交接（任务 4）

供点检与任务 5 技能正文/loader 接线；**未**实现 DSH skill 正文注入或 `skill` 工具按需加载。

## 已完成

| 层 | 路径 | 作用 |
|---|---|---|
| Host Remote | `mammoth-agent/packages/preset/official-agent-gallery` | `createSkill`；专家 `create` 增 `official-gallery/source` |
| Ground 客户端 | 同包 `src/ground.ts` | `POST /api/official-skills/:id/sessions` → binding |
| 投影 | `officialGallerySource`（客户端可见）、`officialSkillExecution`（Host-only） | 来源头 + summary_only 冻结 |
| 共用 UI | `mammoth-agent/packages/client/ui-official-agent-gallery` | `requestSkill`→`createSkill`→`openSession`；会话头 `GallerySourceLabel` |

## 会话契约

1. 点技能：Client `workspaceForNewSession()` → Host `createSkill({ skillId, workspaceId })` → Ground `beginSession` 校验 → **新建** Host Session → 冻结：
   - `official-skill/bound`：`sessionSource` + `loadPolicy.initialContext=summary_only` + `contentPath`（**无** SKILL.md 正文）
   - `official-gallery/source`：`{ type:'skill', id, key, name, packageRevision }`
2. 点专家：既有 `create` 保留；额外冻结 `official-gallery/source` `{ type:'expert', id, key, name, versionId }`；`linkedSkills` 摘要随 `official-agent/bound` 冻结（正文仍 Task 5）
3. `openSession(newId)`；旧会话不改角色
4. 技能会话使用标准 `mammoth-ground` + `auto`，**不**走 `installOfficialAgent` 工具收口，保留文件/终端/联网等标准能力
5. 无工作区 / Ground 失败 / 附着失败 → 返回失败，不创建或回滚新 Session

## 明确未做（任务 5）

- 按 `loadPolicy.contentPath` 拉取 SKILL.md / resources
- `tool-skill` / `skill` 工具实际加载与「正在使用…」提示
- 专家关联技能目录注册进 skill loader
- 知识库扩面

## 运行时注意

- Host 包已对本包执行 `tsc -b` + `tsdown`，`lib/index.js` 含 `createSkill` / `@Remote`
- `typert.remote-client.*` 已手同步 `createSkill`（完整 `generate-typert` 后请核对）
- **UI** `ui-official-agent-gallery/lib/client.js` 可能仍是旧 bundle；点检前建议：
  `pnpm --filter @mammoth-ai/mmp-client-ui-official-agent-gallery bundle`
- 未跑 tests / 全仓 typecheck / E2E / 浏览器；未 commit / push / 发布；未做任务 5
