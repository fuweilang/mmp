import { Body, Controller, Get, Header, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { JWTPayload } from 'jose';
import { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/jwt.guard';
import { assertEnterpriseSession } from '../auth/tenant-status';
import { OidcService } from './oidc.service';

@Controller()
export class OidcController {
  constructor(
    private oidc: OidcService,
    private jwt: JwtService,
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  @Get('oidc/.well-known/openid-configuration')
  discovery(@Req() req: Request) {
    return this.oidc.discovery(req);
  }

  @Get('oidc/jwks')
  @Header('Cache-Control', 'no-store')
  jwks() {
    return this.oidc.jwks();
  }

  @Get('oidc/authorize')
  async authorize(
    @Query() query: Record<string, string>,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const {
      response_type,
      client_id,
      redirect_uri,
      state,
      nonce,
      code_challenge,
      code_challenge_method,
    } = query;
    if (response_type !== 'code') return res.status(400).send('unsupported_response_type');
    if (!client_id || !this.oidc.isAllowedClient(client_id)) return res.status(400).send('invalid_client');
    if (!redirect_uri || !this.oidc.isAllowedRedirect(redirect_uri)) {
      return res.status(400).send('invalid_redirect_uri');
    }
    if (!state || !nonce || !code_challenge) return res.status(400).send('invalid_request');
    if (code_challenge_method && code_challenge_method !== 'S256') {
      return res.status(400).send('invalid_request');
    }

    const session = await this.userFromCookie(req, res);
    const authorizeUrl = this.oidc.authorizeUrl(req);
    if (!session) {
      return res.redirect(this.oidc.loginRedirect(authorizeUrl, req.hostname, req.protocol));
    }

    const code = this.oidc.issueCode(session.user, {
      nonce,
      clientId: client_id,
      redirectUri: redirect_uri,
      codeChallenge: code_challenge,
      issuer: this.oidc.issuer(req),
      tenantId: session.tenantId,
    });
    const next = new URL(redirect_uri);
    next.searchParams.set('code', code);
    next.searchParams.set('state', state);
    return res.redirect(next.toString());
  }

  @Post('oidc/token')
  async token(@Req() req: Request, @Body() body: Record<string, string>) {
    return this.oidc.exchange(body, req);
  }

  @Get('oidc/userinfo')
  async userinfo(@Req() req: Request) {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw new UnauthorizedException('invalid_token');
    // 必须先验签再取 claims：decodeJwt 不验签，任何人都能伪造 token 冒充任意用户。
    let claims: JWTPayload;
    try {
      claims = await this.oidc.verifyIdToken(token);
    } catch {
      throw new UnauthorizedException('invalid_token');
    }
    if (typeof claims.sub !== 'string') throw new UnauthorizedException('invalid_token');
    const tenantRaw = claims['tenant_id'];
    const tenantId = typeof tenantRaw === 'string' ? tenantRaw : null;
    return this.oidc.userinfo(claims.sub, tenantId);
  }

  private async userFromCookie(req: Request, res: Response) {
    const cookieName = this.config.get<string>('COOKIE_NAME') ?? 'mammothai_access_token';
    const token = req.cookies?.[cookieName] as string | undefined;
    if (!token) return null;
    const clear = () => this.clearSessionCookie(res, cookieName);
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      // Scoped library credentials and handoff tickets are never browser login sessions.
      if (payload.purpose !== undefined) {
        clear();
        return null;
      }
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || user.status !== 'active') {
        clear();
        return null;
      }
      // 与 JwtGuard 对齐：成员/企业已删或停用时 authorize 不得静默发 code 再登回 Agent。
      try {
        await assertEnterpriseSession(this.prisma, user, payload.tenantId ?? null);
      } catch {
        clear();
        return null;
      }
      return { user, tenantId: payload.tenantId ?? null };
    } catch {
      clear();
      return null;
    }
  }

  private clearSessionCookie(res: Response, cookieName: string) {
    const secure = (this.config.get<string>('PUBLIC_ORIGIN') ?? '').startsWith('https://');
    res.clearCookie(cookieName, {
      path: '/',
      sameSite: 'lax',
      secure,
    });
  }
}
