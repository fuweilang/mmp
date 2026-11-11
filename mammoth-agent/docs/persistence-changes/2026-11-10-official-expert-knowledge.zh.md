---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-10-official-expert-knowledge

[English](2026-11-10-official-expert-knowledge.md) | 中文

## 概述

为必需的官方专家、目录和知识证据将 Session 写入方从 V4 升到 V5。增加内容恒等转换及原生 V5 校验，同时保留可选 Library 引用和历史标题来源拼写。此前的字面值及最终确认摘要域恢复不改变已接受摘要和检查点。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-10-official-expert-knowledge
baseline: false
changes:
  - root: "JsonlHeaderLine"
    previous: "2026-09-11-initial"
    after: "dd498b6fce7c7a0258d68c99d24e522dacdffd8cae534a63cc7991808d59b1d9"
    decision: version-bump
  - root: "SessionHeader"
    previous: "2026-09-16-session-format-v4"
    after: "22c6899a78214dd841c266348ae997027ef391174ddb21127f1b71dc1b362824"
    decision: version-bump
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-13-liveshare-share-viewer-principal"
    after: "5ffefdd4271e74cc13b7689e476aea129ba5d60ac19e89068757f916c677a0bb"
    decision: version-bump
  - root: "event:assistant/attempt"
    previous: "2026-09-16-session-format-v4"
    after: "9f015952f38c672be8e26e4b5122cbed01d4eb67632c4cf26535486be0f4af42"
    decision: version-bump
  - root: "event:assistant/message"
    previous: "2026-09-16-session-format-v4"
    after: "e28c7c7389cdad7cb1c2e70c8dc601ea7fe42567d6abdcf8c06519193c9fccea"
    decision: version-bump
  - root: "event:compaction/summary"
    previous: "2026-09-16-session-format-v4"
    after: "aacbf02ae1aefc458e88a072e75caba1980e59118159cbafa8dd07a5f671d847"
    decision: version-bump
  - root: "event:developer/message"
    previous: "2026-10-13-liveshare-share-viewer-principal"
    after: "d051c01264c55963d57369a817d37c80f4ff0e3d160da01d9dea490133b139aa"
    decision: version-bump
  - root: "event:official-agent/bound"
    previous: null
    after: "54ecf97a058fe0f76babc8eeb831cfbed140f7d34951f394c623d831190e8550"
    decision: version-bump
  - root: "event:official-agent/knowledge"
    previous: null
    after: "717647cef155fed2dd95871c28fca9a27d3734b83b52ac291121bcabb7eb489d"
    decision: version-bump
  - root: "event:official-gallery/artifact"
    previous: null
    after: "24a686c65b6d7a102392380299db74ba1ee83816673cbcaceb3fbd62278ad256"
    decision: version-bump
  - root: "event:official-gallery/attempt"
    previous: null
    after: "dde85adc136b2ee03b595d611286ad4a55568eca6a1a91bf3c5e019b62d4d085"
    decision: version-bump
  - root: "event:official-gallery/attempt-start"
    previous: null
    after: "d8ea0e46117898bf37a0226fc86c90e46ef1e5456cfc581b5253cf5a047927e6"
    decision: version-bump
  - root: "event:official-gallery/composition"
    previous: null
    after: "faef4f599756d8c0fba47e10e596664ad7581f58808c88422b5c348d70cd8a26"
    decision: version-bump
  - root: "event:official-gallery/receipt"
    previous: null
    after: "2bbda8fc1c9fb8dc831b7451b07fb3c0daaa5c5ad830968fda0bac2d3ffb5c93"
    decision: version-bump
  - root: "event:official-gallery/source"
    previous: null
    after: "839b8efe978262d1b952284aed2f2b777f6149a0534fd8bb01dbab958ab09942"
    decision: version-bump
  - root: "event:official-skill/bound"
    previous: null
    after: "ef12505e392a725c334441c001f3825cb9e95cf1fb50bfbaa7061428c18aa810"
    decision: version-bump
  - root: "event:session/title-llm-request"
    previous: "2026-10-13-liveshare-share-viewer-principal"
    after: "6e69ff57747c05d1d873f494e6027e9235401087b6025988d3931b0b7af805e5"
    decision: version-bump
  - root: "event:system/message"
    previous: "2026-09-16-session-format-v4"
    after: "2f77529cdc90bf62d7ff54b91ebed642d087a677e396ba27ddc607d37f96bf46"
    decision: version-bump
  - root: "event:team/message/queued"
    previous: "2026-09-16-session-format-v4"
    after: "c8a39690de7eec986748da1d940895f6c00c01f4fcaf4eb160de84d44d2af7cf"
    decision: version-bump
  - root: "event:tool/ptc-dispatch"
    previous: "2026-10-05-ptc-operation-metadata"
    after: "b23bd861e6700e3a3b1f38a12cebe4d9cd79e86cb71279db5218b304421db8b4"
    decision: version-bump
  - root: "event:tool/result"
    previous: "2026-09-16-session-format-v4"
    after: "45c090ae794957a480b9ef98db5e8d1df234b432d40af5b8f0dcc156ceb97078"
    decision: version-bump
  - root: "event:user/message"
    previous: "2026-10-13-liveshare-share-viewer-principal"
    after: "82b42620a050367f8e464ef5d5d42264ec569c4b9829ae366d18f252dd25e80d"
    decision: version-bump
```

<a id="compatibility"></a>
## 兼容性

捕获的先前 built V4 JSONL 读取方对原始及 Zstandard 输入都在内容恢复之前通过头部拒绝 V5，包括损坏前缀后跟随必需知识数据的情况。最高代选择不会回退到 V4。此前同版本声明不足：旧 V4 扫描器会在较早损坏之后跳过未知必需事件。相邻 V4→V5 边保留接受的事件顺序、id、消息、来源、引用、不透明可忽略记录和继承截点，包括有效的临时本地 V4 RAG 记录。未知必需 V4 来源名称、声称当前目标 V5 的来源投递标记会被明确拒绝且不修改来源；包含这类未来 V5 标记的 V3 输入也会沿迁移链拒绝。原生 V5 在抑制可恢复尾部之前检查未知必需行。只读打开准备历史但不发布；写入打开先验证并发布最终 V5 后继，再追加，保留前代字节、路径及 inode。固定 V4 子会话前置读取独立于当前写入方。不改写旧编解码器、已接受记录、最终确认检查点或发布记录；应用及 SQLite 版本不变。

<a id="verification"></a>
## 验证

已执行聚焦的 V5/目录/JSONL 校验及 owner-only 端点测试：71 项通过。严格恢复覆盖 0 至 5 代及继承截点；磁盘测试覆盖原始/Zstandard 只读准备、追加前发布、V4 字节/摘要/inode 保持、原生 V5 重开及不回退。捕获的不可变先前 built V4 读取方完成 8 项原始/Zstandard × 单头部/最高代 × 读/写拒绝检查，字节和 inode 均未改变。无密钥 TypeScript SDK text-turn 和 official-expert-knowledge 回放 2 项通过；官方专家 Python SDK 冒烟在刷新后继后通过，再次不回写运行也通过。语料检查 3 项通过。这些是本地合成供应商检查，不代表真实供应商、生产或 UI 验收。较广文档检查另行报告；未运行完整 Harness 测试集。

<a id="dev-note"></a>
## 开发备注

无。
