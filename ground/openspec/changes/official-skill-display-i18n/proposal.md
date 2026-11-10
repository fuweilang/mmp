# 官方技能展示中文化

## 目标
Admin 与专家广场技能 Tab 共享同一套中文展示字段（name/summary），保留爬取/导入英文原文，不改 SKILL.md 与执行内容。

## 方案
- `official_skill.source_name/source_summary` 保存原文
- `name/summary` 仍为展示真相源（Admin/Gallery 继续读这两列）
- `display_provenance`: source | machine | manual；manual 禁止机翻覆盖
- 机翻只走 Ground `LlmChatGatewayService.completeOnce`（超管模型池 preferred/auto）
- `POST /admin/official-skills/translate-display` 支持 dryRun/limit/keys 续跑

## 非目标
- 不翻译 instruction / SKILL.md / 工具标识
- 不在页面请求路径实时翻译
- 不新建 Console 技能管理页
