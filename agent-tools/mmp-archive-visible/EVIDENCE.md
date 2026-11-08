# 已归档固定入口（count=0 仍可见）

- 完成：2026-11-06 15:22:32 Asia/Shanghai
- 范围：仅 `ui-workspace`；未动 gallery/backend/Prisma（t71 capabilities/category TS 由其他 agent 处理）
- 未 archive / 未删除任何会话
- 未 commit / 未 push / 未发版

## Web 3080（xiaomi *******1003）

| 项 | 结果 |
|----|------|
| `[data-row-key=archived-section]` 始终存在 | PASS |
| aria | 已归档会话，共 0 个 |
| 展开空状态「暂无归档会话」+「…」提示 | PASS |
| overall | **PASS** |

DOM treeHead（展开后）: ['默认工作区', '新会话', '猛犸AI是什么及其来源', '1小时', '利基市场的本质特征', '1小时', '已归档', '0', '暂无归档会话', '可在会话「…」菜单中选择「归档会话」']

截图：
- `shots/web-01-before-expand.png` — 固定「已归档 0」
- `shots/web-02-expanded-empty.png` — 展开后空状态文案

## Electron CDP :9222（PID71604 skip-build）

| 项 | 结果 |
|----|------|
| entry present after reload | FAIL（旧 client） |
| note | Entry missing — MMP Dev likely still on skip-build / old client bundle; lib/client.js already contains always-visible fix. Do not claim Electron UI live without rebuild/restart. |

`lib/client.js` 已含 `showArchivedSection = archivedFilter === "default"`；Electron 需非 skip-build 重建/重启后才能吃到，**不宣称 Electron 真机已跟上**。

截图：`shots/electron-01-after-reload.png`（旧 UI 无入口）

## 单测

`packages/client/ui-workspace/tests/` → **516 passed**

## 代码

- `showArchivedSection = archivedFilter === 'default'`（去掉 `length > 0`）
- 展开且 count=0 → 紧凑 `archived-empty`：`section.archived.empty` + `emptyHint`
