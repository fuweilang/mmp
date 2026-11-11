# 专家知识库文件管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 让总后台以列表管理专家所属文件夹，并按文件共享、自动切块及同步更新。
**Architecture:** 保留知识核心的修订与发布存储；添加文件夹归属和自动发布指针。专家文件选择沿用不可变发布保存选择范围，运行时按已选 documentId 读取当前可用发布。
**Tech Stack:** Vue 3、Element Plus、NestJS、Prisma、PostgreSQL。
**Spec:** `docs/superpowers/specs/2026-11-10-expert-knowledge-folders-design.md`

## Global Constraints

- 只修改 ground；保留现有未提交改动，不擅自 commit/push，不发布生产。
- 总后台超管权限、租户隔离、精确引用和当前撤权检查继续有效。
- 不新增模型供应商或凭据；沿用已配置服务和独立 Worker。
- 所有文件夹使用列表，不用块状卡片。

## Review Focus

- 替换任务乱序完成不得让文件回退到较旧的内容。
- 文件选择仅授权被勾选的 documentId，不能因同文件夹更新扩权。
- 失败或待处理的新修订不得遮蔽旧的可用内容。
- 删除专家后其文件夹和共享文件继续存在。
- 查看历史出处可读取原精确修订，但删除/停用文件后立即拒绝访问。

### Task 1: 文件夹归属及自动发布
**Files:** `apps/backend/prisma/schema.prisma`、新增迁移、`src/knowledge-core/knowledge-core.service.ts`、`ingestion.worker.ts`、`admin.controller.ts`、`admin.dto.ts`。
**Interfaces:** 文件夹提供 ownerAgentId/ownerAgentName/currentReleaseId；`synchronizeLiveRelease(baseId, tx)` 在入库事务中选择每文件最新成功索引，保留待处理文件的旧索引。
- [x] 先补核心行为测试，运行确认缺少自动切换及文件范围接口。
- [x] 增加归属、指针及逻辑删除；实现 Worker 原子切换、自动默认服务选择及文档使用信息。
- [x] 核心测试、Prisma 校验与后端构建通过。

### Task 2: 按文件动态检索及出处授权
**Files:** `src/knowledge-core/retrieval-access.ts`、`retrieval.service.ts`、`src/official-agent/expert-runtime.service.ts`、`expert-disclosure.ts`。
**Interfaces:** `resolveExpertKnowledge(agentId, frozenKnowledge, source?)` 返回当前授权发布及 documentIds；候选、补充上下文、打开出处均遵守文件范围。
- [x] 增加共享更新、文件范围、失败保留及撤权测试，运行确认原实现不满足。
- [x] 保留已有固定知识兼容，对受管文件夹采用当前发布与原文件选择。
- [x] 运行知识检索及专家运行时测试。

### Task 3: 总后台与专家文件选择
**Files:** 新增 `KnowledgeFolderManager.vue`、文件预览组件；修改 `AdminOfficialKnowledge.vue`、`ExpertKnowledgePanel.vue`、`ExpertExecutionEditor.vue`、`AdminOfficialAgents.vue`、`api/admin.ts`。
**Interfaces:** 通过既有 releaseIds 保存每文件夹的文件子集；仅 READY 或已有可用旧内容的文件可选。创建知识库传入当前已保存专家 ID。
- [x] 新增独立界面测试，先覆盖列表、待处理禁选、子集选择与取消。
- [x] 默认页面只展示文件夹/文件；设置保留于高级入口；默认分段预览。
- [x] 前端类型检查、构建及现有专家编辑回归通过。

### Task 4: 本地真实验收与独立复核
- [x] 在独立测试数据库验证共享更新、删除和专家保留规则。
- [x] 应用本地增量迁移，确认 Worker/API/前端使用当前代码。
- [x] 浏览器从 5201 真实入口核对页面和完整操作，保存截图。
- [x] 独立审阅本次增量，处理重要问题；最终报告说明本地生效与生产未发布的界限。
