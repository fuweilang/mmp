import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isKnownPermissionKey } from './catalog';

export const ORG_MEMBER_PRESET_KEY = 'org_member';
export const ORG_ADMIN_PRESET_KEY = 'org_admin';

type Db = PrismaService | Prisma.TransactionClient;

/** 读取租户对 org_member 的覆盖权限包；无覆盖返回 null（调用方回退全局预置）。 */
export async function loadOrgMemberOverridePermKeys(
  db: Db,
  tenantId: string | null | undefined,
): Promise<string[] | null> {
  if (!tenantId) return null;
  const row = await db.orgPresetOverride.findUnique({
    where: { tenantId_presetKey: { tenantId, presetKey: ORG_MEMBER_PRESET_KEY } },
    select: { permissions: { select: { permKey: true } } },
  });
  if (!row) return null;
  return row.permissions
    .map((p) => p.permKey)
    .filter((k) => isKnownPermissionKey(k))
    .sort();
}

/** 解析 org_member 有效权限包：租户覆盖优先，否则全局 RolePermission。 */
export function resolveOrgMemberPermKeys(
  globalPermKeys: string[],
  overridePermKeys: string[] | null,
): string[] {
  const source = overridePermKeys ?? globalPermKeys;
  return [...new Set(source.filter((k) => isKnownPermissionKey(k)))].sort();
}
