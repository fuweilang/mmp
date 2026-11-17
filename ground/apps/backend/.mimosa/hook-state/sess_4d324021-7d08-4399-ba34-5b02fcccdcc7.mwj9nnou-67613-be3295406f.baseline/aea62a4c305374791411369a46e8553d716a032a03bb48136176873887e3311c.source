import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { Response } from 'express';
import { randomUUID } from 'crypto';
import { MemberRole, Prisma, TenantType, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SessionMe } from '@mammoth/shared';
import { computeEffectivePermissions } from '../permissions/effective';
import { JwtPayload } from './jwt.guard';
import { creditSignupGiftInTx } from '../billing/welcome-gift';
import { removeStoredFile } from '../knowledge/storage';
import { saveUserAvatar, userAvatarPublicUrl } from './user-avatar';
import { SmsCodes, smsError, type SmsCodeStore, type SmsScene } from './sms';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  private usedBrowserSsoJti = new Set<string>();

  async register(
    input: { name: string; phone: string; password: string; enterpriseName: string; slug: string; smsCode: string },
    res: Response,
    ip?: string,
  ) {
    // 先校验不核销；建号与核销同一事务，建号失败不会烧掉验证码。
    const claim = await this.smsCodes().verify(input.phone.trim(), 'register', input.smsCode);
    const { user, tenant } = await this.createEnterpriseAccount(input, claim);

    this.setCookie(res, { sub: user.id, tenantId: tenant.id });
    await this.prisma.auditLog.create({
      data: { userId: user.id, tenantId: tenant.id, action: 'register', ip },
    });
    return this.me(user, tenant.id);
  }

  /**
   * Desktop registration. The session JWT is returned; the browser cookie is not set.
   * 短信验证是硬门槛：旧客户端不带 smsCode 一律拒绝（CLIENT_TOO_OLD），
   * 不建号、不发会话，也不做宽限期/降权兼容。
   */
  async clientRegister(
    input: { name: string; phone: string; password: string; enterpriseName: string; slug: string; smsCode?: string },
    ip?: string,
  ) {
    const smsCode = (input.smsCode || '').trim();
    if (!smsCode) {
      throw smsError('CLIENT_TOO_OLD', '当前客户端版本过旧，注册需要短信验证，请升级到最新版本后重试');
    }
    const claim = await this.smsCodes().verify(input.phone.trim(), 'register', smsCode);
    const { user, tenant } = await this.createEnterpriseAccount(input, claim);
    await this.prisma.auditLog.create({
      data: { userId: user.id, tenantId: tenant.id, action: 'client_register', ip },
    });
    return {
      token: this.jwt.sign({ sub: user.id, tenantId: tenant.id }),
      session: await this.me(user, tenant.id),
    };
  }

  /** Record that this account has dismissed the one-time welcome. Idempotent. */
  async markWelcomeSeen(user: User): Promise<{ welcomeSeen: true }> {
    if (user.welcomeSeenAt == null) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { welcomeSeenAt: new Date() },
      });
    }
    return { welcomeSeen: true };
  }

  async provisionEnterpriseUser(
    actor: User,
    input: { name: string; phone: string; password: string; enterpriseName: string; slug: string },
  ) {
    if (!actor.isPlatformAdmin) throw new ForbiddenException('仅平台管理员可开户');
    const phone = input.phone.trim();
    const existing = await this.prisma.user.findUnique({ where: { phone } });
    if (existing) {
      const memberships = await this.prisma.orgMember.findMany({
        where: { userId: existing.id },
        orderBy: { createdAt: 'asc' },
      });
      return {
        id: existing.id,
        phone: existing.phone,
        tenantId: memberships[0]?.tenantId ?? null,
        created: false,
      };
    }
    const { user, tenant } = await this.createEnterpriseAccount(input);
    return { id: user.id, phone: user.phone, tenantId: tenant.id, created: true };
  }

  private async createEnterpriseAccount(input: {
    name: string;
    phone: string;
    password: string;
    enterpriseName: string;
    slug: string;
  }, smsClaim?: { id: string }) {
    const phone = input.phone.trim();
    const enterpriseName = input.enterpriseName.trim();
    if (!enterpriseName) throw new BadRequestException('注册必须填写企业名称');
    const existing = await this.prisma.user.findUnique({ where: { phone } });
    if (existing) throw new ConflictException('手机号已注册');

    const passwordHash = await bcrypt.hash(input.password, 10);
    const slug = input.slug.trim();
    const slugTaken = await this.prisma.tenant.findUnique({ where: { slug } });
    if (slugTaken) throw new ConflictException('品牌已被占用');
    const platform = await this.prisma.tenant.findFirst({ where: { type: TenantType.PLATFORM } });

    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: enterpriseName, slug, type: TenantType.ENTERPRISE },
      });
      if (platform) {
        await tx.orgTree.create({ data: { parentId: platform.id, childId: tenant.id } });
      }
      const user = await tx.user.create({
        data: {
          name: input.name.trim(),
          phone,
          passwordHash,
        },
      });
      await tx.orgMember.create({
        data: { userId: user.id, tenantId: tenant.id, role: MemberRole.ADMIN },
      });
      // 注册即企业管理员：必须绑 org_admin 预设角色（user_role），否则有效权限为空、控制台进不去。
      const adminPreset = await tx.role.findUnique({
        where: { key: 'org_admin' },
        select: { id: true },
      });
      if (adminPreset) {
        await tx.userRole.create({ data: { userId: user.id, roleId: adminPreset.id } });
      }
      await tx.quota.create({ data: { tenantId: tenant.id } });
      const wallet = await tx.tenantAiWallet.create({
        data: { tenantId: tenant.id, balanceCoins: 0 },
      });
      await creditSignupGiftInTx(tx, {
        tenantId: tenant.id,
        walletId: wallet.id,
        actorUserId: user.id,
      });
      if (smsClaim) {
        // 与建号同事务：并发下只有一个请求能把码立为已核销，另一个整体回滚。
        const claimed = await tx.smsVerificationCode.updateMany({
          where: { id: smsClaim.id, consumedAt: null },
          data: { consumedAt: new Date() },
        });
        if (claimed.count !== 1) throw smsError('SMS_CODE_EXPIRED', '验证码已使用，请重新获取');
      }
      return { user, tenant };
    });
  }

  async login(phone: string, password: string, res: Response, ip?: string) {
    const session = await this.openSession(phone, password, ip, 'login');
    this.setCookie(res, { sub: session.user.id, tenantId: session.tenantId });
    return session.me;
  }

  /**
   * Desktop password login. Returns the same 7-day session JWT the browser cookie carries,
   * without writing that cookie, so Chrome keeps its own login.
   */
  async clientLogin(phone: string, password: string, ip?: string) {
    const session = await this.openSession(phone, password, ip, 'client_login');
    return {
      token: this.jwt.sign({ sub: session.user.id, tenantId: session.tenantId }),
      session: session.me,
    };
  }

  async sendSms(phone: string, scene: SmsScene, ip?: string) {
    return this.smsCodes().send(phone.trim(), scene, (ip || '').trim());
  }

  async smsLogin(phone: string, smsCode: string, res: Response, ip?: string) {
    const session = await this.openSmsSession(phone, smsCode, ip, 'sms_login');
    this.setCookie(res, { sub: session.user.id, tenantId: session.tenantId });
    return session.me;
  }

  async clientSmsLogin(phone: string, smsCode: string, ip?: string) {
    const session = await this.openSmsSession(phone, smsCode, ip, 'client_sms_login');
    return {
      token: this.jwt.sign({ sub: session.user.id, tenantId: session.tenantId }),
      session: session.me,
    };
  }

  private smsCodes(): SmsCodes {
    const store: SmsCodeStore = {
      findLatest: async (phone, scene, now) => this.prisma.smsVerificationCode.findFirst({
        where: { phone, scene, consumedAt: null, expiresAt: { gt: now } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, codeHash: true, attempts: true, createdAt: true },
      }),
      findCooldown: async (phone, scene, since) => this.prisma.smsVerificationCode.findFirst({
        where: { phone, scene, consumedAt: null, createdAt: { gt: since } },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      countSince: (sendIp, since) => this.prisma.smsVerificationCode.count({
        where: { sendIp, createdAt: { gt: since } },
      }),
      countPhoneSince: (phone, since) => this.prisma.smsVerificationCode.count({
        where: { phone, createdAt: { gt: since } },
      }),
      retireExpired: async (phone, scene, now) => {
        await this.prisma.smsVerificationCode.updateMany({
          where: { phone, scene, consumedAt: null, expiresAt: { lte: now } },
          data: { consumedAt: now },
        });
      },
      purgeExpired: async (before) => {
        await this.prisma.smsVerificationCode.deleteMany({ where: { expiresAt: { lt: before } } });
      },
      insert: async (row) => {
        try {
          const created = await this.prisma.smsVerificationCode.create({ data: row, select: { id: true } });
          return created.id;
        } catch (error) {
          // phone+scene 部分唯一索引：已有未核销行时视为冷却，不重复下发。
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return null;
          throw error;
        }
      },
      discard: async (id) => {
        await this.prisma.smsVerificationCode.deleteMany({ where: { id, consumedAt: null } });
      },
      bumpAttempts: (id) => this.prisma.smsVerificationCode.update({
        where: { id },
        data: { attempts: { increment: 1 } },
      }).then(() => undefined),
      consume: async (id, at) => {
        const result = await this.prisma.smsVerificationCode.updateMany({
          where: { id, consumedAt: null },
          data: { consumedAt: at },
        });
        return result.count === 1;
      },
      phoneRegistered: async (phone) => {
        const user = await this.prisma.user.findUnique({ where: { phone }, select: { id: true } });
        return user !== null;
      },
    };
    return new SmsCodes(store, this.config.getOrThrow<string>('JWT_SECRET'));
  }

  private async openSmsSession(phone: string, smsCode: string, ip: string | undefined, action: string) {
    const normalized = phone.trim();
    const user = await this.prisma.user.findUnique({ where: { phone: normalized } });
    // 统一错误码+文案：不区分手机号是否存在/停用，也不暴露是否有活码/是否错码，
    // 避免登录接口被用来枚举号码（三种失败态必须完全一致）。
    const invalid = () => smsError('SMS_INVALID', '手机号或验证码错误');
    if (!user || user.status !== 'active') throw invalid();
    try {
      await this.smsCodes().consume(normalized, 'login', smsCode);
    } catch (error) {
      if (error instanceof BadRequestException) throw invalid();
      throw error;
    }
    return this.establishSession(user, ip, action);
  }

  private async openSession(phone: string, password: string, ip: string | undefined, action: string) {
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user || user.status !== 'active') throw new UnauthorizedException('账号或密码错误');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('账号或密码错误');
    return this.establishSession(user, ip, action);
  }

  private async establishSession(user: User, ip: string | undefined, action: string) {
    const tenants = await this.listTenants(user);
    // 业务账号必须有企业归属；无任何企业成员关系的禁止登录（平台账号不受影响）。
    if (!user.isPlatformAdmin && tenants.length === 0) {
      throw new ForbiddenException('账号未归属任何企业，请联系管理员');
    }
    // 业务账号全部企业已停用/删除：禁止登录，避免发无企业上下文的空会话继续用 agent。
    const current = user.isPlatformAdmin ? null : tenants.find((t) => t.status === 'active') ?? null;
    if (!user.isPlatformAdmin && !current) {
      throw new ForbiddenException('企业已停用，无法登录');
    }
    const tenantId = current?.id ?? null;
    await this.prisma.auditLog.create({
      data: { userId: user.id, tenantId, action, ip },
    });
    return { user, tenantId, me: await this.toMe(user, tenantId, tenants) };
  }

  async me(user: User, tenantId: string | null): Promise<SessionMe> {
    const tenants = await this.listTenants(user);
    return await this.toMe(user, tenantId, tenants);
  }

  async switchTenant(user: User, tenantId: string, res: Response) {
    const tenants = await this.listTenants(user);
    const target = tenants.find((t) => t.id === tenantId);
    if (!target && !user.isPlatformAdmin) throw new ForbiddenException('无权切换到该租户');
    let tenant: { status: string; type: TenantType } | null = target ?? null;
    if (user.isPlatformAdmin && !tenant) {
      const found = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!found) throw new ForbiddenException('租户不存在');
      tenant = found;
    }
    if (tenant && tenant.status !== 'active') throw new ForbiddenException('企业已停用，无法进入');
    // 平台代运营只针对业务租户；猛犸总部（PLATFORM）没有「工作台」语义。
    if (user.isPlatformAdmin && tenant && tenant.type === TenantType.PLATFORM) {
      throw new ForbiddenException('平台租户无需进入工作台');
    }
    this.setCookie(res, { sub: user.id, tenantId });
    await this.prisma.auditLog.create({
      data: { userId: user.id, tenantId, action: 'switch_tenant' },
    });
    return this.me(user, tenantId);
  }

  logout(res: Response) {
    res.clearCookie(this.cookieName(), {
      path: '/',
      sameSite: 'lax',
      secure: this.cookieSecure(),
    });
    return { ok: true };
  }

  /** 自助改密：必须验旧密码（证明本人），改完清 cookie 强制重新登录。 */
  async changeOwnPassword(user: User, oldPassword: string, newPassword: string, res: Response) {
    const fresh = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (!fresh) throw new UnauthorizedException();
    const ok = await bcrypt.compare(oldPassword, fresh.passwordHash);
    if (!ok) throw new ForbiddenException('原密码不正确');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(newPassword, 10) },
    });
    res.clearCookie(this.cookieName(), {
      path: '/',
      sameSite: 'lax',
      secure: this.cookieSecure(),
    });
    await this.prisma.auditLog.create({
      data: { userId: user.id, action: 'change_own_password' },
    });
    return { ok: true };
  }

  /** 自助改名（个人账号弹窗）。 */
  async updateMe(user: User, name: string, tenantId: string | null) {
    const trimmed = name.trim();
    if (!trimmed) throw new ForbiddenException('姓名不能为空');
    await this.prisma.user.update({ where: { id: user.id }, data: { name: trimmed } });
    await this.prisma.auditLog.create({
      data: { userId: user.id, tenantId, action: 'update_own_profile', meta: { name: trimmed } },
    });
    return this.me({ ...user, name: trimmed } as User, tenantId);
  }

  /** Replace this account's picture. The same URL is returned by every session. */
  async setAvatar(
    user: User,
    file: { originalname?: string; buffer?: Buffer; mimetype?: string },
    tenantId: string | null,
  ) {
    if (!file.buffer?.length) throw new BadRequestException('请选择头像图片');
    let storagePath: string;
    try {
      storagePath = await saveUserAvatar(file.originalname || 'avatar.png', file.buffer, file.mimetype);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : '头像上传失败');
    }
    const fresh = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (!fresh) throw new UnauthorizedException();
    const previous = fresh.avatarPath;
    await this.prisma.user.update({ where: { id: user.id }, data: { avatarPath: storagePath } });
    if (previous && previous !== storagePath) await removeStoredFile(previous);
    await this.prisma.auditLog.create({
      data: { userId: user.id, tenantId, action: 'update_own_avatar' },
    });
    return this.me({ ...fresh, avatarPath: storagePath }, tenantId);
  }

  /** Drop the picture so every surface shows the name initial again. */
  async clearAvatar(user: User, tenantId: string | null) {
    const fresh = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (!fresh) throw new UnauthorizedException();
    if (fresh.avatarPath) {
      await this.prisma.user.update({ where: { id: user.id }, data: { avatarPath: null } });
      await removeStoredFile(fresh.avatarPath);
      await this.prisma.auditLog.create({
        data: { userId: user.id, tenantId, action: 'clear_own_avatar' },
      });
    }
    return this.me({ ...fresh, avatarPath: null }, tenantId);
  }

  async issueBrowserSsoTicket(user: User, tenantId: string | null) {
    // 没有企业控制台权限的账号不给签发 handoff 票（企业成员预设已含 access）。
    if (!user.isPlatformAdmin) {
      const eff = await computeEffectivePermissions(this.prisma, user.id, tenantId);
      if (!eff.effectivePermissions.includes('portal.console.access')) {
        throw new ForbiddenException('当前账号没有「企业控制台」权限，请联系企业管理员分配');
      }
    }
    const jti = randomUUID();
    const ticket = this.jwt.sign(
      { sub: user.id, tenantId, purpose: 'browser-sso', jti },
      { expiresIn: '60s' },
    );
    return {
      ticket,
      next: user.isPlatformAdmin ? '/admin' : '/console/',
    };
  }

  async consumeBrowserSso(ticket: string, res: Response, browserCookies: Record<string, unknown> = {}) {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(ticket);
    } catch {
      throw new UnauthorizedException('登录已失效，请重新登录');
    }
    if (payload.purpose !== 'browser-sso' || !payload.jti) {
      throw new UnauthorizedException('登录已失效，请重新登录');
    }
    if (this.usedBrowserSsoJti.has(payload.jti)) {
      throw new UnauthorizedException('登录已失效，请重新登录');
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== 'active') throw new UnauthorizedException('账号不可用');
    this.usedBrowserSsoJti.add(payload.jti);
    const tenantId = await this.resolveSsoTenant(user, payload.tenantId ?? null);
    // 控制台在新标签打开时保留同账号、同企业的现有登录，避免使原 Web 页的已验证凭证失效。
    if (!await this.matchesBrowserSession(browserCookies[this.cookieName()], user.id, tenantId)) {
      this.setCookie(res, { sub: user.id, tenantId });
    }
    return this.me(user, tenantId);
  }

  /**
   * 从 Octop 桌面端带过来的 handoff 票据常常不带企业上下文（后端用 Bearer 换票，没有
   * cookie），若直接沿用票据里的 tenantId，企业用户会落到 currentTenant = null，被
   * /console 路由守卫弹回 /agent/chat。这里与 login() 对齐：平台管理员留空进 /admin，
   * 其余用户回落到自己第一个可用企业。
   */
  private async resolveSsoTenant(user: User, tenantId: string | null): Promise<string | null> {
    if (!tenantId && user.isPlatformAdmin) return null;
    const tenants = await this.listTenants(user);
    if (tenantId && tenants.some((t) => t.id === tenantId && t.status === 'active')) {
      return tenantId;
    }
    if (user.isPlatformAdmin) return null;
    return tenants.find((t) => t.status === 'active')?.id ?? null;
  }

  /** 平台管理员退出代运营：清掉当前企业上下文，回到「没有企业」的平台身份。 */
  async exitWorkbench(user: User, tenantId: string | null, res: Response) {
    if (!user.isPlatformAdmin) throw new ForbiddenException('只有平台管理员可以退出业务工作台');
    this.setCookie(res, { sub: user.id, tenantId: null });
    await this.prisma.auditLog.create({
      data: { userId: user.id, tenantId, action: 'exit_workbench' },
    });
    return this.me(user, null);
  }

  private async matchesBrowserSession(token: unknown, userId: string, tenantId: string | null): Promise<boolean> {
    if (typeof token !== 'string' || !token) return false;
    try {
      const current = await this.jwt.verifyAsync<JwtPayload>(token);
      return current.purpose === undefined && current.sub === userId && (current.tenantId ?? null) === tenantId;
    } catch {
      return false;
    }
  }

  private cookieName() {
    return this.config.get<string>('COOKIE_NAME') ?? 'mammothai_access_token';
  }

  private cookieSecure() {
    return (this.config.get<string>('PUBLIC_ORIGIN') ?? '').startsWith('https://');
  }

  private setCookie(res: Response, payload: JwtPayload) {
    const token = this.jwt.sign(payload);
    res.cookie(this.cookieName(), token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.cookieSecure(),
      path: '/',
      maxAge: 7 * 24 * 3600 * 1000,
    });
  }

  private async listTenants(user: User) {
    if (user.isPlatformAdmin) {
      const all = await this.prisma.tenant.findMany({ orderBy: { createdAt: 'asc' } });
      const memberships = await this.prisma.orgMember.findMany({ where: { userId: user.id } });
      const roleMap = new Map(memberships.map((m) => [m.tenantId, m.role]));
      return all.map((t) => ({ ...t, role: roleMap.get(t.id) ?? null }));
    }
    const memberships = await this.prisma.orgMember.findMany({
      where: { userId: user.id },
      include: { tenant: true },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({ ...m.tenant, role: m.role }));
  }

  private async toMe(
    user: User,
    tenantId: string | null,
    tenants: Array<Prisma.TenantGetPayload<object> & { role: MemberRole | null }>,
  ): Promise<SessionMe> {
    const current = tenants.find((t) => t.id === tenantId) ?? null;
    const eff = await computeEffectivePermissions(this.prisma, user.id, tenantId);
    const boundRoles = await this.prisma.userRole.findMany({
      where: { userId: user.id },
      select: { role: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    // 总后台身份以角色权限为准（只授业务模块键的自建角色不算平台管理员）
    const isPlatformAdmin = eff.isPlatformAdmin;
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        avatarUrl: userAvatarPublicUrl(user.avatarPath),
        isPlatformAdmin,
        platformRoleKey: eff.platformRoleKey,
        roleNames: boundRoles.map((row) => row.role.name),
      },
      currentTenant: current
        ? { id: current.id, name: current.name, slug: current.slug, type: current.type, status: current.status }
        : null,
      currentRole: current?.role ?? null,
      tenants: tenants.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        type: t.type,
        status: t.status,
        role: t.role,
      })),
      effectivePermissions: eff.effectivePermissions,
      platformRoleKey: eff.platformRoleKey,
      welcomeSeen: user.welcomeSeenAt != null,
    };
  }
}
