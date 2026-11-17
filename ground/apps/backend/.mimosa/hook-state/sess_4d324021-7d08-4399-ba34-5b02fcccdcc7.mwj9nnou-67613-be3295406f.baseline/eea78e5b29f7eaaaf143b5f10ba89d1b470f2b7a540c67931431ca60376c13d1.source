import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ASSIGNABLE_TENANT_KEYS, ROLE_META, getTenantCatalogGrouped, isKnownPermissionKey, isRoleMutationAllowed, sanitizePermissionKeys } from '../permissions/catalog';
import {
  CreateAdminTenantRoleDto,
  ListAdminTenantRolesDto,
  UpdateAdminTenantRoleDto,
} from './dto/tenant-role.dto';
import { ListAdminRolesDto } from './dto/list-admin-roles.dto';
import { CreateAdminRoleDto } from './dto/create-admin-role.dto';
import { UpdateAdminRoleDto } from './dto/update-admin-role.dto';
import { AdminSupportService, roleGrantsAdmin } from './admin-support.service';

@Injectable()
export class AdminRolesService {
  constructor(
    private prisma: PrismaService,
    private support: AdminSupportService,
  ) {}

  async listRoles(actor: User, query: ListAdminRolesDto) {
    this.support.requirePlatformAdmin(actor);
    // 企业自建角色（ORG_CUSTOM）归企业自己管，不进平台角色列表。
    const where: Prisma.RoleWhereInput = { scope: { in: ['PLATFORM', 'ORG_PRESET'] } };
    if (query.keyword?.trim()) {
      const keyword = query.keyword.trim();
      where.OR = [
        { name: { contains: keyword, mode: 'insensitive' } },
        { key: { contains: keyword, mode: 'insensitive' } },
      ];
    }
    const roles = await this.prisma.role.findMany({
      where,
      include: {
        permissions: { select: { permKey: true } },
        _count: { select: { users: true } },
      },
      orderBy: [{ scope: 'asc' }, { key: 'asc' }],
    });
    return roles.map((r) => this.support.presentRole(r));
  }

  async getRole(actor: User, id: string) {
    this.support.requirePlatformAdmin(actor);
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        permissions: { select: { permKey: true } },
        _count: { select: { users: true } },
      },
    });
    if (!role) throw new NotFoundException('角色不存在');
    return this.support.presentRole(role);
  }

  async createRole(actor: User, dto: CreateAdminRoleDto) {
    this.support.requirePlatformAdmin(actor);
    if (!(await this.support.actorHasRolesWrite(actor))) {
      throw new ForbiddenException('无角色编辑权限');
    }
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('角色名称不能为空');

    const duplicated = await this.prisma.role.findFirst({
      where: { name, scope: 'PLATFORM' },
      select: { id: true },
    });
    if (duplicated) throw new BadRequestException('角色名称已存在');

    const permissions = this.support.assertKnownPermissionKeys(dto.permissions ?? []);
    const key = this.support.nextCustomRoleKey();
    const role = await this.prisma.role.create({
      data: {
        key,
        name,
        description: dto.description?.trim() || null,
        scope: 'PLATFORM',
        builtIn: false,
        editable: true,
        permissions: {
          create: permissions.map((permKey) => ({ permKey })),
        },
      },
      include: {
        permissions: { select: { permKey: true } },
        _count: { select: { users: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: actor.id,
        action: 'admin_create_role',
        meta: { roleId: role.id, key: role.key, permissions },
      },
    });
    return this.support.presentRole(role);
  }

  async deleteRole(actor: User, id: string) {
    this.support.requirePlatformAdmin(actor);
    await this.support.assertActorCanDeleteCustomRoles(actor);
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!role) throw new NotFoundException('角色不存在');
    if (role.builtIn || this.support.isBuiltinRoleKey(role.key)) {
      throw new BadRequestException('系统内置角色不可删除');
    }
    if (role._count.users > 0) {
      throw new BadRequestException(
        `还有 ${role._count.users} 个用户使用该角色，禁止删除`,
      );
    }

    await this.prisma.role.delete({ where: { id } });
    await this.prisma.auditLog.create({
      data: {
        userId: actor.id,
        action: 'admin_delete_role',
        meta: { roleId: id, key: role.key, name: role.name },
      },
    });
    return { ok: true };
  }

  async updateRole(actor: User, id: string, dto: UpdateAdminRoleDto) {
    this.support.requirePlatformAdmin(actor);
    if (!(await this.support.actorHasRolesWrite(actor))) {
      throw new ForbiddenException('无角色编辑权限');
    }
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { permissions: { select: { id: true, permKey: true } } },
    });
    if (!role) throw new NotFoundException('角色不存在');
    // 仅 super_admin 禁止改 name/description/permissions；其余内置/自定义角色可改。
    if (!isRoleMutationAllowed(role.key, role.editable)) {
      const label = ROLE_META[role.key as keyof typeof ROLE_META]?.name ?? role.name;
      throw new ForbiddenException(`系统角色「${label}」不可编辑（权限默认全选并锁定）`);
    }

    const data: Prisma.RoleUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) {
      data.description = dto.description === null ? null : dto.description.trim();
    }

    if (dto.permissions !== undefined) {
      // 丢弃目录外的陈旧键（如已下线的 portal.console.agents），保证 org_admin 可保存。
      let keys = this.support.assertKnownPermissionKeys(sanitizePermissionKeys(dto.permissions));
      // 企业预置不得写入平台级 portal.admin.*（硬顶之外），避免企管误获总后台权限。
      if (role.scope === 'ORG_PRESET') {
        keys = keys.filter((k) => ASSIGNABLE_TENANT_KEYS.has(k));
      }
      await this.support.replaceRolePermissions(role.id, keys);
    }

    if (Object.keys(data).length > 0) {
      await this.prisma.role.update({ where: { id }, data });
    }
    // 角色权限变了，绑定该角色的用户「总后台身份」跟着变。
    if (dto.permissions !== undefined) {
      const fresh = await this.prisma.role.findUnique({
        where: { id },
        include: { permissions: { select: { permKey: true } } },
      });
      const bound = await this.prisma.userRole.findMany({
        where: { roleId: id },
        select: { userId: true },
      });
      for (const row of bound) {
        const keys = await this.support.getRoleKeys(row.userId);
        const roles = await this.support.loadRoles(keys);
        await this.prisma.user.update({
          where: { id: row.userId },
          data: { isPlatformAdmin: roles.some((role) => roleGrantsAdmin(role)) },
        });
      }
    }

    await this.prisma.auditLog.create({
      data: {
        userId: actor.id,
        action: 'admin_update_role',
        meta: { roleId: id, key: role.key },
      },
    });
    return this.getRole(actor, id);
  }

  async tenantRoleCatalog(actor: User) {
    this.support.requirePlatformAdmin(actor);
    const allowed = await this.support.resolveOrgPresetAssignableKeys();
    return { categories: getTenantCatalogGrouped(allowed) };
  }

  async listTenantRoles(actor: User, query: ListAdminTenantRolesDto) {
    this.support.requirePlatformAdmin(actor);
    const where: Prisma.RoleWhereInput = { scope: 'ORG_CUSTOM' };
    if (query.tenantId) where.tenantId = query.tenantId;
    if (query.keyword?.trim()) {
      const keyword = query.keyword.trim();
      where.OR = [
        { name: { contains: keyword, mode: 'insensitive' } },
        { key: { contains: keyword, mode: 'insensitive' } },
      ];
    }
    const roles = await this.prisma.role.findMany({
      where,
      include: {
        permissions: { select: { permKey: true } },
        _count: { select: { users: true } },
        tenant: { select: { id: true, name: true } },
      },
      orderBy: [{ tenantId: 'asc' }, { createdAt: 'asc' }],
    });
    return roles.map((role) => ({
      id: role.id,
      key: role.key,
      name: role.name,
      description: role.description,
      scope: role.scope,
      builtIn: role.builtIn,
      editable: role.editable,
      permissions: role.permissions.map((p) => p.permKey).filter((k) => isKnownPermissionKey(k)),
      userCount: role._count.users,
      tenant: role.tenant,
    }));
  }

  async createTenantRole(actor: User, dto: CreateAdminTenantRoleDto) {
    this.support.requirePlatformAdmin(actor);
    if (!(await this.support.actorHasRolesWrite(actor))) {
      throw new ForbiddenException('无角色编辑权限');
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: dto.tenantId },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundException('企业不存在');
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('角色名称不能为空');
    const permissions = await this.support.assertAssignableKeys(sanitizePermissionKeys(dto.permissions ?? []));
    const role = await this.prisma.role.create({
      data: {
        key: this.support.nextCustomRoleKey(),
        name,
        description: dto.description?.trim() || null,
        scope: 'ORG_CUSTOM',
        builtIn: false,
        editable: true,
        tenantId: tenant.id,
        permissions: { create: permissions.map((permKey) => ({ permKey })) },
      },
      include: { permissions: { select: { permKey: true } }, tenant: { select: { id: true, name: true } } },
    });
    await this.prisma.auditLog.create({
      data: {
        userId: actor.id,
        tenantId: tenant.id,
        action: 'admin_create_tenant_role',
        meta: { roleId: role.id, key: role.key, name, permissions },
      },
    });
    return { id: role.id, key: role.key, name: role.name, tenant: role.tenant };
  }

  async updateTenantRole(actor: User, id: string, dto: UpdateAdminTenantRoleDto) {
    this.support.requirePlatformAdmin(actor);
    if (!(await this.support.actorHasRolesWrite(actor))) {
      throw new ForbiddenException('无角色编辑权限');
    }
    const role = await this.prisma.role.findUnique({ where: { id }, select: { id: true, tenantId: true } });
    if (!role || !role.tenantId) throw new NotFoundException('角色不存在');
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('角色名称不能为空');
      await this.prisma.role.update({ where: { id }, data: { name } });
    }
    if (dto.description !== undefined) {
      await this.prisma.role.update({
        where: { id },
        data: { description: dto.description === null ? null : dto.description.trim() },
      });
    }
    if (dto.permissions !== undefined) {
      const keys = await this.support.assertAssignableKeys(sanitizePermissionKeys(dto.permissions));
      await this.support.replaceRolePermissions(id, keys);
    }
    await this.prisma.auditLog.create({
      data: {
        userId: actor.id,
        tenantId: role.tenantId,
        action: 'admin_update_tenant_role',
        meta: { roleId: id, fields: Object.keys(dto) },
      },
    });
    return { ok: true };
  }

  async deleteTenantRole(actor: User, id: string) {
    this.support.requirePlatformAdmin(actor);
    await this.support.assertActorCanDeleteCustomRoles(actor);
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!role || role.scope !== 'ORG_CUSTOM' || !role.tenantId) {
      throw new NotFoundException('角色不存在');
    }
    if (role.builtIn || this.support.isBuiltinRoleKey(role.key)) {
      throw new BadRequestException('系统内置角色不可删除');
    }
    if (role._count.users > 0) {
      throw new BadRequestException(
        `还有 ${role._count.users} 个成员使用该角色，禁止删除`,
      );
    }
    await this.prisma.role.delete({ where: { id } });
    await this.prisma.auditLog.create({
      data: {
        userId: actor.id,
        tenantId: role.tenantId,
        action: 'admin_delete_tenant_role',
        meta: { roleId: id, key: role.key, name: role.name },
      },
    });
    return { ok: true };
  }

}
