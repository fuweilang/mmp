# 专家与技能分类管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 后台分别管理专家和技能分类，新增、改名、排序同步各端。
**Architecture:** 共用分类目录服务，按 expert/skill 分域。迁移保留原 key，专家 category 和技能 categories 改用字符串；目录变更以版本号保护并发。
**Tech Stack:** Prisma/PostgreSQL、NestJS、Vue/Element Plus、React。
**Spec:** docs/superpowers/specs/2026-11-19-expert-category-management-design.md

## Global Constraints
保留已有未提交改动，不 commit/push/deploy；不执行生产数据库迁移。专家单分类、技能最多 3 分类。现有 key 不变，支持无引用分类删除，有引用时拒绝并说明数量。

## Review Focus
重复及保留名称；并发保存；越权；新 key 保存和筛选；重命名与排序在两端一致。

### Task 1: 后端目录与迁移
- [x] 测试名称校验、完整目录校验、删除引用保护、并发版本及权限。
- [x] 新增 catalog-category 模块和迁移，改分类枚举字段为文本，初始化目录。
- [x] GET /catalog-categories/:kind 与 GET/PUT /admin/catalog-categories/:kind，kind=expert|skill；目录 {version:number,items:{key:string,name:string,sortOrder:number}[]}；PUT {version,items:{key?:string,name:string}[]}，新项无 key，顺序按数组。
- [x] 所有专家/技能写入路径校验目录 key，公共 facets 携带 name/sortOrder 元数据（包括零数量分类供卡片解析），前台仍只显示有数量的筛选。
- [x] 后端聚焦测试和 build。

### Task 2: 管理后台
- [x] 公共分类管理弹窗，编辑名称、新增、上下移动、保存取消及错误重试。
- [x] 专家和技能配置页接入口，动态选项、筛选、分类标签共用响应式目录；分类 key 类型改 string。
- [x] 验证新增/重命名/排序，前端 build/typecheck。

### Task 3: 前台
- [x] 广场使用 facets 动态名称和排序，专家与技能分开处理，保留旧响应兼容。
- [x] 验证自定义 key 的筛选、标签和重命名及排序，运行聚焦测试与适用构建。

### Task 4: 集成复核
- [x] 独立审阅全链路，修复实际问题。
- [x] 汇总验证及迁移/发布限制，交付变更。

## 完成记录

专家/技能分类管理已实现并复核；验证详情见 outputs/category-management-20261119/verification.md。用户追加删除需求已覆盖，引用中的分类拒绝删除。实际环境迁移与发布未执行。
