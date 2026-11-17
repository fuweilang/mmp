import { ForbiddenException } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * 停用企业 = 该企业的上下文不可用（成员进不了 console/agent），但不动成员账号本身。
 * 平台账号不受此限制；无租户上下文（tenantId=null）也不受限。
 */
export async function tenantActive(
  prisma: PrismaService,
  tenantId: string | null | undefined,
): Promise<boolean> {
  if (!tenantId) return true;
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { status: true },
  });
  return tenant?.status === 'active';
}

/**
 * OIDC / 会话续期用：企业已删或停用、或成员已解绑则抛错。
 * 与 JwtGuard「停用企业拒业务」对齐，并额外挡住解绑后仍拿旧 cookie 换 Agent 会话。
 * 平台账号不受限；无租户上下文（tenantId=null）也不受限。
 */
export async function assertEnterpriseSession(
  prisma: PrismaService,
  user: Pick<User, 'id' | 'isPlatformAdmin'>,
  tenantId: string | null | undefined,
): Promise<void> {
  if (!tenantId) return;
  if (user.isPlatformAdmin) return;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { status: true },
  });
  if (!tenant || tenant.status !== 'active') {
    throw new ForbiddenException('该企业已被停用');
  }

  const membership = await prisma.orgMember.findUnique({
    where: { userId_tenantId: { userId: user.id, tenantId } },
    select: { id: true },
  });
  if (!membership) {
    throw new ForbiddenException('已不是该企业成员');
  }
}
