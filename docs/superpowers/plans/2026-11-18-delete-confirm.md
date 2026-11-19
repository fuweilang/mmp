# Unified Delete Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 统一Ground管理端/企业控制台删除确认的视觉与具体操作文案。
**Architecture:** 共享DeleteConfirmContent.vue + confirmDelete(options)工具函数 + 独立delete-confirm样式。资料库复杂el-dialog复用内容和样式，保留原确认状态机。
**Tech Stack:** Vue 3, TypeScript, Element Plus, Vitest/jsdom。
**Spec:** docs/superpowers/specs/2026-11-18-delete-confirm-design.md

## Global Constraints
- 保留已有API调用、权限、影响检查、取消/关闭行为及所有本地改动。
- 不执行真实删除，不提交、推送或部署；不改全站主题。
- 参数name为字符串或字符串数组，description支持字符串、数组或安全VNode。
- 440px/24px/12px壳圆角/8px按钮圆角；默认取消焦点；对象文本安全渲染。

## Review Focus
- 特殊字符/HTML样式名称只能显示为文本；长名称与大量对象可滚动。
- 取消/关闭不调用删除；一次确认保持一次原有删除请求。
- 企业级联删除影响与资料库永久删除勾选/禁用条件完整保留。
- 窄屏和长正文时 footer可见；样式仅影响delete-confirm。
- 非删除确认（发布、启停、共享）外观和行为保留。

### Task 1: Shared UI and helper
- [x] 添加真实MessageBox组件测试，覆盖对象显示、危险按钮、取消/确认/关闭、恶意名称、普通弹窗隔离；运行见失败。
- [x] 创建components/DeleteConfirmContent.vue、utils/confirm-delete.ts和styles/deleteConfirm.css（main.ts导入）。接口confirmDelete({title,name,description,confirmText?,customClass?})返回MessageBox的Promise。
- [x] 运行新增测试转绿。

### Task 2: Migrate deletion callers
- [x] 迁移KnowledgeFolderManager、ExpertKnowledgePanel、AdminModels、AdminUsers、AdminRoles、Roles、useMembersPage、useOfficialAgents、AdminOfficialSkills、AdminEnterprises、Knowledge、Library删除确认。
- [x] AdminLibrary回收/永久删除弹窗使用共享样式与对象内容，保留校验/影响/勾选。
- [x] 更新既有交互测试中受新按钮文案影响的定位；验证取消/确认请求边界。

### Task 3: Verification and review
- [x] 跑受影响组件测试、frontend typecheck与build；失败核对基线。
- [x] 浏览器检查模型/知识库文件夹/文件/技能弹窗，取消并截图；检查长文本/窄屏（如支持）。
- [x] 独立代码审查与视觉复核，修复重要问题后复测；报告验证结果和未验边界。

## Progress
- Ruling: User explicitly approved implementation; proceed without repeating design approval. Work in current5.7 because active local UI and prior changes are in this checkout. No commits per ground/AGENTS.md.

- Task 1 complete: shared MessageBox tests reproduced missing UI and then passed; text/VNode rendering, cancel/close/confirm, namespace styles and batch content covered.
- Task 2 complete: twelve call sites plus impact-aware AdminLibrary dialogs migrated; API/permission/impact/checkbox contracts retained. Single model cancel/confirm and library purge gates have real component tests.
- Final review: independent reviewer found mask cancellation and custom Dialog cancel-focus gaps. Both reproduced (3 failing cases), fixed, and passed. Mask behavior now defaults to original true; skills retain their original false. Dialog @opened focuses cancel on every open.
- Ruling: review flagged danger-button contrast as Minor; treated as actionable readability because the requested UI uses 14px white text. Scoped danger shades now #d92d20/#b42318/#912018; browser measured default white-text contrast 4.83:1. No theme changes outside delete-confirm.
- Final verification: NODE_OPTIONS=--no-experimental-webstorage pnpm test -> 36 unit + 169 UI passed (205 total). The flag avoids Node26 global localStorage interfering with existing jsdom fixtures; production code unchanged for this environment issue.
- pnpm typecheck -> exit0; pnpm build -> exit0 (existing >500kB chunk-size warning); git diff --check -> exit0.
- Browser QA: real model/folder/file/skill dialogs opened and cancelled, no deletion executed; measured 440px width/24px padding/12px shell/8px buttons and cancel focus. At375x667 viewport, dialog x=16..359 and footer stayed visible; temporary viewport reset.
- Evidence: /tmp/mmp-delete-skill-final.jpg and /tmp/mmp-delete-{model,folder,file,skill}-unified.jpg; narrow screenshot /tmp/mmp-delete-skill-mobile.jpg. Final darker button rechecked on real page after review fix.
- Untested: real deletion requests against live data intentionally not executed; all mutation acceptance uses mocked API boundaries. Native Harness/desktop outside this approved ElementPlus scope.
- No deferred findings; no commit/push/deploy performed. Existing in-session dropdown/prompt/back-button changes retained.
