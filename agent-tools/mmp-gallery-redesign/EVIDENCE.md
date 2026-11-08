# 智能体广场分类 + 新版卡片

- 时间：2026-11-06 Asia/Shanghai
- 未 commit / push / 发版；未改正式 prompt / versionId
- Prompt hash bundle：`a81323f8e7bbb30aa6a9c556af80bbd0`（before=after）

## 持久层

- `official_agent.category`（enum OfficialAgentCategory）+ `official_agent.capabilities`（Json）
- 挂在**可编辑父级**；改分类/能力标签**不发新版本**
- 公开卡 `capabilities`：先从线上 `toolScope` 派生（企业资料/联网检索/网页阅读/表格分析/团队协作），再合并父级中文能力标签，最多 3 个
- 资产包 `agents/*.json` + Admin 导入可写 presentation；Admin 表单可编辑分类/能力标签

## 分类 counts（22）

| category | count | 代表 |
|---|---|---|
| common | 1 | mammoth |
| productivity | 2 | boss, qc |
| content | 9 | xhs/copy/pyq/video/live/gzh/ip/naming/copy-polish |
| sales | 5 | growth/sifu/trans/sell/spy |
| expertise | 4 | enterprise-product-answer/niche/method/interview |
| analytics | 1 | data |

## 测试

- Ground `gallery-presentation.unit.test.ts` 3/3
- UI `gallery-page.client.spec.tsx` + host ground/loader 19/19
- 真机 Web 3080 accept 28/28（shots 01–05）
- nest build PASS；桌面进程未停（MMP Dev 71604 仍在）
- 曾短暂重启 `serve-ground-web` 以加载新 Zod/UI（旧 Host strict schema 拒收 category 字段）

## 截图

- `shots/01-default.png` 全部 22
- `shots/02-filter-content.png` 内容营销
- `shots/03-filter-analytics.png` 数据分析=data
- `shots/04-empty.png` 搜索空态
- `shots/05-chat-mammoth.png` 开聊绑定 mammoth v2
