import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { createReadStream } from 'fs';
import { Request, Response } from 'express';
import { User } from '@prisma/client';
import { AuthService } from './auth.service';
import { ClientRegisterDto, ConsumeBrowserSsoDto, LoginDto, PublicRegisterDto, RegisterDto, SendSmsDto, SmsLoginDto, SwitchTenantDto } from './dto/login.dto';
import { ChangePasswordDto, UpdateMeDto } from './dto/self-service.dto';
import { JwtGuard } from './jwt.guard';
import { CurrentTenantId, CurrentUser } from './current-user';
import { userAvatarFile } from './user-avatar';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.login(dto.phone, dto.password, res, req.ip);
  }

  /** Desktop password login. The session JWT is in the body; no browser cookie is set. */
  @Post('client-login')
  @HttpCode(200)
  clientLogin(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.clientLogin(dto.phone, dto.password, req.ip);
  }

  /** Desktop registration. The session JWT is in the body; no browser cookie is set. */
  @Post('client-register')
  @HttpCode(200)
  clientRegister(@Body() dto: ClientRegisterDto, @Req() req: Request) {
    return this.auth.clientRegister(dto, req.ip);
  }

  @Post('register')
  @HttpCode(200)
  register(@Body() dto: PublicRegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.register(dto, res, req.ip);
  }

  @Post('sms/send')
  @HttpCode(200)
  sendSms(@Body() dto: SendSmsDto, @Req() req: Request) {
    return this.auth.sendSms(dto.phone, dto.scene, req.ip);
  }

  @Post('sms-login')
  @HttpCode(200)
  smsLogin(@Body() dto: SmsLoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.smsLogin(dto.phone, dto.smsCode, res, req.ip);
  }

  /** Desktop SMS login. The session JWT is in the body; no browser cookie is set. */
  @Post('client-sms-login')
  @HttpCode(200)
  clientSmsLogin(@Body() dto: SmsLoginDto, @Req() req: Request) {
    return this.auth.clientSmsLogin(dto.phone, dto.smsCode, req.ip);
  }

  /** Cookie or Bearer. Marks the one-time welcome seen for this account. */
  @Post('welcome-seen')
  @HttpCode(200)
  @UseGuards(JwtGuard)
  welcomeSeen(@CurrentUser() user: User) {
    return this.auth.markWelcomeSeen(user);
  }

  @Post('provision')
  @HttpCode(200)
  @UseGuards(JwtGuard)
  provision(@CurrentUser() user: User, @Body() dto: RegisterDto) {
    return this.auth.provisionEnterpriseUser(user, dto);
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    return this.auth.logout(res);
  }

  /**
   * Browser-navigable logout for Harness / OIDC clients.
   * POST keeps the SPA JSON contract; GET clears the session cookie and shows a tiny done page
   * so system-browser SSO cookies (e.g. Chrome on :5201) are actually dropped.
   */
  @Get('logout')
  logoutBrowser(@Res() res: Response) {
    this.auth.logout(res);
    res
      .status(200)
      .setHeader('cache-control', 'no-store')
      .type('html')
      .send(
        '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>已退出登录</title>'
        + '<body style="font-family:system-ui,sans-serif;padding:48px;text-align:center">'
        + '<h1>已退出登录</h1><p>可以关闭此页面。</p>'
        + '<script>try{window.close()}catch(e){}</script></body></html>',
      );
  }

  /** 自助改密：验旧密码，成功后清 cookie 强制重新登录。 */
  @Patch('password')
  @HttpCode(200)
  @UseGuards(JwtGuard)
  changePassword(
    @CurrentUser() user: User,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.changeOwnPassword(user, dto.oldPassword, dto.newPassword, res);
  }

  /** Replace the signed-in account picture. Console and Admin read it from /auth/me. */
  @Post('avatar')
  @HttpCode(200)
  @UseGuards(JwtGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  uploadAvatar(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @UploadedFile() file?: { originalname?: string; buffer?: Buffer; mimetype?: string },
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('请选择头像图片');
    return this.auth.setAvatar(user, file, tenantId);
  }

  /** Remove the picture. Surfaces fall back to the name initial. */
  @Delete('avatar')
  @HttpCode(200)
  @UseGuards(JwtGuard)
  clearAvatar(@CurrentUser() user: User, @CurrentTenantId() tenantId: string | null) {
    return this.auth.clearAvatar(user, tenantId);
  }

  /** Public file so <img> can load it without a Bearer token. Names are unguessable. */
  @Get('avatars/:fileName')
  @Header('Cache-Control', 'public, max-age=86400')
  @Header('X-Content-Type-Options', 'nosniff')
  serveAvatar(@Param('fileName') fileName: string) {
    const file = userAvatarFile(fileName);
    if (!file) throw new NotFoundException('头像不存在');
    return new StreamableFile(createReadStream(file), {
      type: 'image/png',
      disposition: `inline; filename="${fileName}"`,
    });
  }

  /** 自助改名（个人账号弹窗）。 */
  @Patch('me')
  @HttpCode(200)
  @UseGuards(JwtGuard)
  updateMe(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Body() dto: UpdateMeDto,
  ) {
    return this.auth.updateMe(user, dto.name, tenantId);
  }

  @Post('browser-sso-ticket')
  @HttpCode(200)
  @UseGuards(JwtGuard)
  issueBrowserSsoTicket(@CurrentUser() user: User, @CurrentTenantId() tenantId: string | null) {
    return this.auth.issueBrowserSsoTicket(user, tenantId);
  }

  @Post('browser-sso-consume')
  @HttpCode(200)
  consumeBrowserSso(
    @Body() dto: ConsumeBrowserSsoDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.consumeBrowserSso(dto.ticket, res, req.cookies);
  }

  @Get('me')
  @UseGuards(JwtGuard)
  me(@CurrentUser() user: User, @CurrentTenantId() tenantId: string | null) {
    return this.auth.me(user, tenantId);
  }

  @Post('switch-tenant')
  @HttpCode(200)
  @UseGuards(JwtGuard)
  switchTenant(
    @CurrentUser() user: User,
    @Body() dto: SwitchTenantDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.switchTenant(user, dto.tenantId, res);
  }

  @Post('exit-workbench')
  @HttpCode(200)
  @UseGuards(JwtGuard)
  exitWorkbench(
    @CurrentUser() user: User,
    @CurrentTenantId() tenantId: string | null,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.exitWorkbench(user, tenantId, res);
  }
}
