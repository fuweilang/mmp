# 企业共享权限继承 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 企业共享入口直接创建共享资料，共享目录递归共享已有内容并让新增内容继承范围。
**Architecture:** 复用 scope，在服务端统一解析创建位置和权限，通过租户事务原子变更目录树。Console 与桌面端使用相同 API。
**Tech Stack:** NestJS、Prisma、PostgreSQL、Vue、React、node:test、Vitest。
**Spec:** docs/superpowers/specs/2026-11-09-library-sharing-design.md

## Global Constraints

保留并行工作；不提交、不推送、不部署；不改变 ID、所有者和企业边界；不自动公开历史私有资料；代管授权不能扩大。

## Review Focus

共享目录的旧客户端上传；上传期间目录权限变化；他人私有子项；平台代管的源和目标范围；回收子项恢复与目录移动并发。

### Task 1: 后端创建继承与目录树原子变更

**Files:** library.service.ts、library.store.ts、library.prisma-store.ts、library.dto.ts、library.controller.ts、library.admin.service.ts 及 backend/test/library 下行为测试。
**Interfaces:** 创建参数 scope/confirmShare；目录范围影响查询；移动 confirmShare；范围更新 confirmUnshare；LibraryStore 租户事务。

- [x] 编写新建共享、父目录继承、递归共享及无权回滚测试，先运行观察失败。
- [x] 实现统一范围解析、事务和接口；逐项校验 canManage，补移动和取消共享规则。
- [x] 运行 pnpm --dir ground/apps/backend test:library；专用本地 Postgres 可用时运行持久化和 HTTP 用例。

### Task 2: Console 与桌面交互

**Files:** frontend/src/api/library.ts、views/Library.vue；ui-enterprise-library 的 LibraryPanel、上传弹窗、api、词典、README 和 tests。
**Interfaces:** 消费 Task 1 API，捕获操作目标及范围，保留当前目录，显示递归影响数量与共享提示。

- [x] 添加共享创建、上传与递归确认交互测试并观察失败。
- [x] 同步两端 API、确认、目标提示和创建后刷新行为。
- [x] 运行资料库前端定向测试、Console 类型检查/构建、桌面构建与检查，记录基线问题。

### Task 3: 文档、审查与交付

- [x] 更新资料库规范，说明新建继承、递归共享、移动和撤销规则。
- [x] 运行 diff 检查，独立审查全部改动并修复实质问题。
- [x] 报告实际测试证据、代码路径和未验证项；保留隔离工作区供验收。
