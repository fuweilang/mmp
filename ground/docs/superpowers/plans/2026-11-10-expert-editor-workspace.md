# 专家编辑工作台 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this corrective task inline; fresh final reviewer required.

**Goal:** 点击专家编辑直接进入参考 Monica 的三栏配置与真实试聊工作台。

**Architecture:** 原 AdminOfficialAgents 保留草稿 / 发布所有权；ExpertExecutionEditor 接收工具和技能插槽，按能力分组；ExpertDraftPreview 只呈现服务端冻结预览。复用标准 Host URL 和现有鉴权。

**Tech Stack:** Vue 3、Element Plus、现有 Nest API / Host。

**Spec:** ../specs/2026-11-10-expert-editor-workspace-design.md

## Global Constraints

- 同一隔离 worktree；不 commit / push / 部署；不改 V5 或后端。
- 浏览器 origin 仅 http://127.0.0.1:5201，通过已有私有验收路由到隔离服务。
- 原验收窗口不主动刷新；原 3100 / 5201 服务不动。
- 保存草稿、真实试聊、发布分别有明确状态与失败反馈。

## Review Focus

- 未保存提示词不能被旧快照预览冒充；编辑后提示重启预览。
- 新建 / API 保存失败 / 发布失败必须保留表单，不得静默关闭。
- 关闭和 Escape 不能丢失输入；请求中不能切换对象。
- 旧 LEGACY 专家不能因换布局被静默切换或清空知识。
- 小屏内容和真实 Host 输入及出处入口必须可达。

## Task 1: 原编辑入口与三栏能力配置 / 冻结试聊

**Files:** Modify src/views/admin/AdminOfficialAgents.vue, src/components/admin/ExpertExecutionEditor.vue; create src/components/admin/ExpertDraftPreview.vue; add tests/expert-editor.client.spec.ts and its config.

**Interfaces:** Consumes existing adminOfficialAgentApi create/update/preview/publish and previewHostLaunchUrl. Emits no new backend protocol. Slots tools/skills from the existing form into capability editor.

- [x] 编写可失败的实际 Vue 组件测试：编辑弹窗为三栏，提示词可编辑，保存不关闭，预览先保存后冻结，失败保留，过期 / 改动状态，关闭确认。
- [x] 观察 RED；实现工作台、预览状态与关闭保护；运行 GREEN 和现有前端帮助函数测试。
- [x] typecheck / build；在隔离数据库经真正 UI 保存、试聊、提问、点击精确知识来源；检查 1440 / 1024 / 手机布局。
- [x] 独立代码审查，修复重要问题；新开可见验收页面并交付。无真实模型质量声明。
