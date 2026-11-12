# Grok Build 交接约定（DeepSeek/李庚 侧只读等待中）

DeepSeek 已**暂停**所有写操作与测试任务，5.0 交给 Grok Build 独占修改。李庚本轮不写任何业务源码，秋池不再跑测试。

## Grok 写完后请做一件事
在仓库根写入文件 `.opencode/reports/grok-done.flag`，内容示例：

```
done 2026-11-12T20:40
改了: ground/apps/backend/src/auth/*, apps/desktop/scripts/*
说明: 修发布 bug xxx
涉及文件: <path 列表>
```

## 之后 DeepSeek 会
1. 检查该 flag 与 `git status --porcelain` / `git log`，确认你的改动范围
2. 派李庚只修 **未被 Grok 覆盖** 的缺陷
3. 派秋池复验

## 冲突红线（DeepSeek 侧承诺）
- 不 commit / push / stash / reset / clean / 切分支
- 不改 Grok 正在改的文件；发现同文件被改即让路
- 不跑全量 build、不跑 electron-builder、不重启用户服务

## 待修清单
见 `.opencode/reports/pending-fix-5.0-20261112.md`（P0×1 / P1×3 / P2×12）。Grok 若已修其中某条，请在 flag 里注明编号，避免重复改。
