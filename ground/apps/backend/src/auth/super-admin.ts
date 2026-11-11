import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
/** Reusable narrow privilege assertion. Platform access alone never implies author authority. */
export async function assertSuperAdmin(db: PrismaService, userId: string): Promise<void> {
  const user = await db.user.findUnique({
    where: {
      id: userId
    }, select: {
      status: true
    }
  });
  const binding = await db.userRole.findFirst({
    where: {
      userId, role: {
        key: 'super_admin', scope: 'PLATFORM'
      }
    }, select: {
      roleId: true
    }
  });
  if (!user || user.status !== 'active' || !binding)
    throw new ForbiddenException('SUPER_ADMIN_REQUIRED');
}
