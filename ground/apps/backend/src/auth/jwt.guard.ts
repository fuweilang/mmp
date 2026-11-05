import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { computeEffectivePermissions } from '../permissions/effective';
import { tenantActive } from './tenant-status';

export type JwtPayload = {
  sub: string;
  tenantId?: string | null;
  purpose?: string;
  jti?: string;
};

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private jwt: JwtService,
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<Request>();
    const cookieName = this.config.get<string>('COOKIE_NAME') ?? 'mammothai_access_token';
    const header = req.headers.authorization;
    const bearer = header?.startsWith('Bearer ') ? header.slice(7) : null;
    const token = bearer || (req.cookies?.[cookieName] as string | undefined);
    if (!token) throw new UnauthorizedException('未登录');

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('登录已过期');
    }

    if (payload.purpose === 'browser-sso') throw new UnauthorizedException('登录已过期');
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== 'active') throw new UnauthorizedException('账号不可用');

    const effective = await computeEffectivePermissions(this.prisma, user.id, payload.tenantId ?? null);
    const principal = { ...user, isPlatformAdmin: effective.isPlatformAdmin };

    // 停用企业的成员：业务 API 整体拒绝（平台账号不受影响）。
    // /auth/* 放行，保证 me/logout 还能正常返回，前端能把人引导走。
    const isAuthRoute = req.path.includes('/auth/');
    if (!isAuthRoute && !principal.isPlatformAdmin && !(await tenantActive(this.prisma, payload.tenantId))) {
      throw new ForbiddenException('该企业已被停用');
    }

    (req as Request & { user: typeof user; tenantId: string | null }).user = principal;
    (req as Request & { tenantId: string | null }).tenantId = payload.tenantId ?? null;
    return true;
  }
}
