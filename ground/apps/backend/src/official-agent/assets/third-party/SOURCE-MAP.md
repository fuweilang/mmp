# 开源方法吸收说明（获客文案 / 公众号改写试点）

本目录保存第三方 MIT 许可原文与来源映射。**不会**把整仓 skill 注入线上生产 systemPrompt；生产提示词见 `prompts/copy.md`、`prompts/gzh.md`（中文改写后的精简准则）。

## A. Marketingskills

- 仓库：https://github.com/coreyhaines31/marketingskills
- 许可证：MIT（见 `marketingskills/LICENSE`）
- 版权：Copyright (c) 2025 Corey Haines
- 参考提交：`88c79f6528a9347420e57ceb1fff9a60de651768`（main，2026-10-30）
- 吸收子集（只读参考，非全量 53 skills）：
  - `skills/copywriting/SKILL.md` → 获客文案：写前诊断、具体胜过空洞、可证伪主张、强 CTA、三版本角度
  - `skills/marketing-psychology/SKILL.md` → 获客文案：社会证明 / 损失规避 / 锚定等**诚实**使用原则
  - （未导入）cold-email、海外隐私法专章、product-marketing 上下文文档流程

## B. AI Copywriter

- 仓库：https://github.com/mikiarlo3/ai-copywriter
- 分支：`claude/humanizer-copywriting-skill-u5x4vd`
- 许可证：MIT（见 `ai-copywriter/LICENSE`）
- 版权：Copyright (c) 2025 Siqi Chen（original humanizer）；Copyright (c) 2026 Mickey Haslavsky（AI Copywriter additions）
- 参考提交：`08b53b1ad39887cd94cbaab61cac3b6aae2d8518`
- 吸收子集：
  - 根 `SKILL.md` 中的读者优先提问、不编造事实、交付前审计思路
  - 用于「公众号改写」的保真 / 节奏 / 禁代写经历原则（中文改写，非英文禁词表硬编码）

## 落地映射

| 官方智能体 | key | 生产提示词 | 主要来源 |
|---|---|---|---|
| 获客文案大师 | `copy` | `prompts/copy.md` | Marketingskills copywriting + 少量 marketing-psychology |
| 公众号改写专家 | `gzh` | `prompts/gzh.md` | 原有 SOP/KB + AI Copywriter 保真与人味准则 |

可选强化阅读稿（不自动进模型上下文）：

- `marketingskills/adapted-copywriting-notes.zh.md`
- `ai-copywriter/adapted-humanizer-notes.zh.md`

评测用例：`../evals/copy.eval.json`、`../evals/gzh.eval.json`

## 同步草稿（不发布）

```bash
cd apps/backend
node scripts/sync-official-agent-draft-prompts.mjs copy gzh
# 切勿加 publish 参数；本脚本也不含发布逻辑
```
