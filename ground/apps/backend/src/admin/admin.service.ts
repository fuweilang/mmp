import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { ListAdminUsersDto } from './dto/list-admin-users.dto';
import { CreateAdminEnterpriseDto } from './dto/create-admin-enterprise.dto';
import { UpdateAdminEnterpriseDto } from './dto/update-admin-enterprise.dto';
import {
  CreateAdminTenantRoleDto,
  ListAdminTenantRolesDto,
  UpdateAdminTenantRoleDto,
} from './dto/tenant-role.dto';
import { ListAdminRolesDto } from './dto/list-admin-roles.dto';
import { CreateAdminRoleDto } from './dto/create-admin-role.dto';
import { UpdateAdminRoleDto } from './dto/update-admin-role.dto';
import { AdminEnterprisesService } from './admin-enterprises.service';
import { AdminRolesService } from './admin-roles.service';
import { AdminSupportService } from './admin-support.service';
import { AdminUsersService } from './admin-users.service';

/**
 * 薄门面：控制器仍注入 AdminService；实现拆到 users / enterprises / roles + support。
 */
@Injectable()
export class AdminService {
  constructor(
    private support: AdminSupportService,
    private users: AdminUsersService,
    private enterprises: AdminEnterprisesService,
    private roles: AdminRolesService,
  ) {}

  requirePlatformAdminPublic(actor: User) {
    return this.support.requirePlatformAdminPublic(actor);
  }

  assertKnownPermissionKeys(keys: string[]) {
    return this.support.assertKnownPermissionKeys(keys);
  }

  adminScope(actor: User) {
    return this.support.adminScope(actor);
  }

  listUsers(actor: User, query: ListAdminUsersDto) {
    return this.users.listUsers(actor, query);
  }
  createUser(actor: User, dto: CreateAdminUserDto) {
    return this.users.createUser(actor, dto);
  }
  updateUser(actor: User, id: string, dto: UpdateAdminUserDto) {
    return this.users.updateUser(actor, id, dto);
  }
  userPermissions(actor: User, id: string, tenantId?: string | null) {
    return this.users.userPermissions(actor, id, tenantId);
  }
  changePassword(actor: User, id: string, password: string) {
    return this.users.changePassword(actor, id, password);
  }
  deactivateUser(actor: User, id: string) {
    return this.users.deactivateUser(actor, id);
  }
  deleteUser(actor: User, id: string) {
    return this.users.deleteUser(actor, id);
  }

  listEnterprises(actor: User) {
    return this.enterprises.listEnterprises(actor);
  }
  createEnterprise(actor: User, dto: CreateAdminEnterpriseDto) {
    return this.enterprises.createEnterprise(actor, dto);
  }
  updateEnterprise(actor: User, id: string, dto: UpdateAdminEnterpriseDto) {
    return this.enterprises.updateEnterprise(actor, id, dto);
  }
  getEnterpriseDeletionImpact(actor: User, id: string) {
    return this.enterprises.getEnterpriseDeletionImpact(actor, id);
  }
  deleteEnterprise(actor: User, id: string) {
    return this.enterprises.deleteEnterprise(actor, id);
  }

  listRoles(actor: User, query: ListAdminRolesDto) {
    return this.roles.listRoles(actor, query);
  }
  getRole(actor: User, id: string) {
    return this.roles.getRole(actor, id);
  }
  createRole(actor: User, dto: CreateAdminRoleDto) {
    return this.roles.createRole(actor, dto);
  }
  updateRole(actor: User, id: string, dto: UpdateAdminRoleDto) {
    return this.roles.updateRole(actor, id, dto);
  }
  deleteRole(actor: User, id: string) {
    return this.roles.deleteRole(actor, id);
  }

  tenantRoleCatalog(actor: User) {
    return this.roles.tenantRoleCatalog(actor);
  }
  listTenantRoles(actor: User, query: ListAdminTenantRolesDto) {
    return this.roles.listTenantRoles(actor, query);
  }
  createTenantRole(actor: User, dto: CreateAdminTenantRoleDto) {
    return this.roles.createTenantRole(actor, dto);
  }
  updateTenantRole(actor: User, id: string, dto: UpdateAdminTenantRoleDto) {
    return this.roles.updateTenantRole(actor, id, dto);
  }
  deleteTenantRole(actor: User, id: string) {
    return this.roles.deleteTenantRole(actor, id);
  }
}
