# 会话归档 + 已归档入口 — 真机证据

- 完成：2026-11-06 14:48:09 Asia/Shanghai Asia/Shanghai（脚本开始）
- 面：Web `http://127.0.0.1:3080/`（xiaomi member `*******1003`）
- 方式：Playwright + Chrome headless；真实 `workspace/archiveSession` / `unarchiveSession` 持久化
- **未删除**任何会话；对既有「猛犸AI是什么及其来源」做了可逆归档→恢复往返
- 未 commit / 未 push / 未发版

## 结果

| 检查项 | 结果 |
|--------|------|
| 归档后活跃列表消失 | PASS |
| 固定「已归档」入口可见 | PASS（已归档会话，共 1 个） |
| 展开可见归档会话 | PASS |
| 取消归档回活跃列表 | PASS（via hover-button） |
| 归档数为 0 时入口隐藏 | PASS（count=0） |
| 「…」菜单含归档会话 | PASS（['置顶会话', '重命名⌥⌘G', '分叉会话⇧⌘F', '复制 Session ID', '在 Finder 中显示', '归档会话⌥⌘A']） |
| overall | **PASS** |

## 截图

- `shots/01-home-before.png`
- `shots/02-demo-session-ready.png`
- `shots/03-after-archive-collapsed.png` — 底部固定「已归档」+ 数量
- `shots/04-archived-expanded.png` — 展开后可见归档会话与取消归档
- `shots/05-after-restore.png` — 恢复后回到活跃列表
- `shots/06-session-menu.png` — 「…」菜单含归档会话

## 单测

`packages/client/ui-workspace/tests/` → **515 passed**

## 设计落点

- 活跃列表默认隐藏已归档（既有 filter=`default`）
- 列表底部、fade 前固定「已归档」分区（`ARCHIVED_SECTION_KEY`），显示数量，可展开/收起
- 展开后复用 `SessionNodeItem`；恢复走既有 unarchive；点击归档会话仍 toast 不可打开
- Toast「查看已归档」改为展开该分区（不再切到 show filter）
- 未做删除；删除仍不在菜单中作为独立动作（本任务范围外）
