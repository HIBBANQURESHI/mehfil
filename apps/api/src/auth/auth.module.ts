import { Body, Controller, Delete, Get, HttpCode, Ip, Module, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AcceptInviteSchema, AdminEnrollSchema, AdminLoginSchema, ChangePasswordSchema, DeleteAccountSchema, ForgotSchema, LoginSchema, RefreshSchema, RegisterSchema, ResendOtpSchema, ResetSchema, UpdateProfileSchema, VerifyOtpSchema } from '@mehfil/shared';
import { Auth, AuthCtx, Public } from '../common/auth';
import { env } from '../common/config';
import { Z } from '../common/http';
import { PrismaService } from '../common/prisma.service';
import { AuthService, ClientInfo } from './auth.service';

const client = (req: Request): ClientInfo => ({ ip: req.ip, userAgent: req.headers['user-agent'] });
const STRICT = { default: { limit: 10, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService, private prisma: PrismaService) {}

  @Public() @Throttle(STRICT) @Post('register')
  register(@Body(Z(RegisterSchema)) body: any) { return this.auth.register(body); }

  @Public() @Throttle(STRICT) @HttpCode(200) @Post('verify-phone')
  verify(@Body(Z(VerifyOtpSchema)) b: any, @Req() req: Request) { return this.auth.verifyPhone(b.phone, b.code, client(req)); }

  @Public() @Throttle(STRICT) @HttpCode(200) @Post('resend-otp')
  resend(@Body(Z(ResendOtpSchema)) b: any) { return this.auth.resendOtp(b.phone); }

  @Public() @Throttle(STRICT) @HttpCode(200) @Post('login')
  login(@Body(Z(LoginSchema)) b: any, @Req() req: Request) { return this.auth.login(b, client(req)); }

  @Public() @Throttle({ default: { limit: 60, ttl: 60_000 } }) @HttpCode(200) @Post('refresh')
  refresh(@Body(Z(RefreshSchema)) b: any, @Req() req: Request) { return this.auth.refresh(b.refreshToken, client(req)); }

  @Public() @Throttle(STRICT) @HttpCode(200) @Post('forgot-password')
  forgot(@Body(Z(ForgotSchema)) b: any) { return this.auth.forgot(b.identifier); }

  @Public() @Throttle(STRICT) @HttpCode(200) @Post('reset-password')
  reset(@Body(Z(ResetSchema)) b: any) { return this.auth.reset(b); }

  @Public() @Throttle(STRICT) @HttpCode(200) @Post('admin/login')
  adminLogin(@Body(Z(AdminLoginSchema)) b: any, @Req() req: Request) { return this.auth.adminLogin(b, client(req)); }

  @Public() @Throttle(STRICT) @HttpCode(200) @Post('admin/enroll')
  adminEnroll(@Body(Z(AdminEnrollSchema)) b: any, @Req() req: Request) { return this.auth.adminEnroll(b, client(req)); }

  @Public() @Get('invites')
  inspectInvite(@Query('token') token: string) { return this.auth.inspectInvite(token ?? ''); }

  @Public() @Throttle(STRICT) @HttpCode(200) @Post('invites/accept')
  acceptInvite(@Body(Z(AcceptInviteSchema)) b: any) { return this.auth.acceptInvite(b); }

  @HttpCode(200) @Post('logout')
  logout(@Auth() a: AuthCtx) { return this.auth.logout(a.sessionId); }

  @Get('me')
  async me(@Auth() a: AuthCtx) { return { ...(await this.auth.me(a.userId)), adminSession: !!a.admin }; }

  @Patch('me')
  async update(@Auth() a: AuthCtx, @Body(Z(UpdateProfileSchema)) b: any) {
    await this.prisma.user.update({ where: { id: a.userId }, data: b });
    return this.auth.me(a.userId);
  }

  @Throttle(STRICT) @HttpCode(200) @Post('change-password')
  changePassword(@Auth() a: AuthCtx, @Body(Z(ChangePasswordSchema)) b: any) { return this.auth.changePassword(a.userId, a.sessionId, b); }

  @Get('sessions')
  sessions(@Auth() a: AuthCtx) { return this.auth.sessions(a.userId); }

  @Delete('sessions/:id')
  revoke(@Auth() a: AuthCtx, @Param('id') id: string) { return this.auth.revokeSession(a.userId, id); }

  @Throttle(STRICT) @HttpCode(200) @Post('delete-account')
  remove(@Auth() a: AuthCtx, @Body(Z(DeleteAccountSchema)) b: any) { return this.auth.deleteAccount(a.userId, b.password); }
}

export const jwtModule = JwtModule.register({ global: true, secret: env.JWT_SECRET, signOptions: { algorithm: 'HS256', issuer: 'mehfil' }, verifyOptions: { algorithms: ['HS256'], issuer: 'mehfil' } });

@Module({ controllers: [AuthController], providers: [AuthService], exports: [AuthService] })
export class AuthModule {}
