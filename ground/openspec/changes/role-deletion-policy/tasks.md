# 任务 — role-deletion-policy

谁干：本机工程窗口直接改 ground；秋池可按 specs 手工验。

勾选：做完打 `[x]`。

## 0. OpenSpec

- [x] 写出 proposal / tasks / specs/role-deletion
- [x] 实现后回填验收勾选

## 1. 后端硬闸（admin.service）

- [x] `assertActorCanDeleteCustomRoles`：仅 `super_admin` / `platform_admin`（`getRoleKeys`）；否则 403
- [x] `deleteRole`：用上述身份闸（不再仅依赖 `actorHasRolesWrite`）；`builtIn` **或** key ∈ `BUILTIN_ROLE_KEYS` → 400；`users>0` → 400 且不删关联
- [x] `deleteTenantRole`：同样身份闸 + `users>0` 禁删；非 `ORG_CUSTOM` 仍 404

## 2. 前端 AdminRoles

- [x] `canDeleteRoles`：当前账号平台角色为超管或平台管（与 write 解耦）
- [x] `canDeleteRow` / `deleteHint`：无删权 / 内置 / 有人使用 三类提示；内置含 `builtIn` 或四键

## 3. 验证

- [x] `npx tsc --noEmit` + `npx nest build`（backend）
- [x] 源码检索：删除路径不再把「可删」等同于 `roles.write`
