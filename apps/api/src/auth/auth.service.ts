import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomInt } from 'crypto';
import { authenticator } from 'otplib';
import { z } from 'zod';
import { AcceptInviteSchema, AdminEnrollSchema, AdminLoginSchema, ChangePasswordSchema, LoginSchema, pkPhone, RegisterSchema, ResetSchema } from '@mehfil/shared';
import { AuditService } from '../common/audit.service';
import { env } from '../common/config';
import { decrypt, encrypt, hmac, randomToken, safeEqual, sha256 } from '../common/crypto';
import { addDays } from '../common/http';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.module';
import { OtpPurpose, User } from '@prisma/client';

const ACCESS_TTL = '15m';
const REFRESH_DAYS = 30;
const ADMIN_SESSION_MS = 12 * 3_600_000;
const ROTATION_GRACE_MS = 30_000;
const OTP_TTL_MS = 10 * 60_000;
const OTP_COOLDOWN_MS = 45_000;
const OTP_MAX_PER_HOUR = 5;
const OTP_MAX_ATTEMPTS = 5;
const MAX_FAILED_LOGINS = 8;
const LOCK_MS = 15 * 60_000;

// Verified against when the account doesn't exist, so response time doesn't reveal which numbers are registered.
const DUMMY_HASH = argon2.hash('mehfil-timing-equaliser');

export interface ClientInfo { ip?: string; userAgent?: string }
export interface Tokens { accessToken: string; refreshToken?: string }

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService, private notifications: NotificationsService, private audit: AuditService) {}

  private hash(pw: string) { return argon2.hash(pw, { type: argon2.argon2id }); }

  private async issue(userId: string, client: ClientInfo, adminMfa = false): Promise<Required<Tokens>> {
    const secret = randomToken();
    const session = await this.prisma.session.create({ data: { userId, adminMfa, refreshHash: sha256(secret), ip: client.ip, userAgent: client.userAgent?.slice(0, 300), expiresAt: adminMfa ? new Date(Date.now() + ADMIN_SESSION_MS) : addDays(new Date(), REFRESH_DAYS) } });
    return { accessToken: await this.access(userId, session.id), refreshToken: `${session.id}.${secret}` };
  }

  private access(userId: string, sessionId: string) {
    return this.jwt.signAsync({ sub: userId, sid: sessionId, typ: 'access' }, { expiresIn: ACCESS_TTL });
  }

  // ---- OTP ----------------------------------------------------------------

  private otpHash(target: string, purpose: OtpPurpose, code: string) { return hmac(`${target}:${purpose}:${code}`); }

  private async createOtp(target: string, purpose: OtpPurpose) {
    const since = new Date(Date.now() - 3_600_000);
    const recent = await this.prisma.otpCode.findMany({ where: { target, purpose, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' } });
    if (recent.length >= OTP_MAX_PER_HOUR) throw new HttpException({ message: 'Too many codes requested. Please try again later.', code: 'OTP_LIMIT' }, 429);
    if (recent[0] && Date.now() - recent[0].createdAt.getTime() < OTP_COOLDOWN_MS) throw new HttpException({ message: 'Please wait a moment before requesting another code.', code: 'OTP_COOLDOWN' }, 429);
    const code = String(randomInt(100000, 1000000));
    await this.prisma.otpCode.updateMany({ where: { target, purpose, consumedAt: null }, data: { consumedAt: new Date() } });
    await this.prisma.otpCode.create({ data: { target, purpose, codeHash: this.otpHash(target, purpose, code), expiresAt: new Date(Date.now() + OTP_TTL_MS) } });
    return code;
  }

  private async consumeOtp(target: string, purpose: OtpPurpose, code: string) {
    const otp = await this.prisma.otpCode.findFirst({ where: { target, purpose, consumedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
    const invalid = new BadRequestException({ message: 'That code is incorrect or has expired.', code: 'OTP_INVALID', fields: { code: 'That code is incorrect or has expired.' } });
    if (!otp) throw invalid;
    // Counts the guess before checking it, so sending many guesses at once can't get past the limit.
    const counted = await this.prisma.otpCode.updateMany({ where: { id: otp.id, attempts: { lt: OTP_MAX_ATTEMPTS } }, data: { attempts: { increment: 1 } } });
    if (!counted.count || !safeEqual(otp.codeHash, this.otpHash(target, purpose, code))) throw invalid;
    const consumed = await this.prisma.otpCode.updateMany({ where: { id: otp.id, consumedAt: null }, data: { consumedAt: new Date() } });
    if (!consumed.count) throw invalid;
  }

  private async sendPhoneOtp(phone: string, purpose: OtpPurpose) {
    const code = await this.createOtp(phone, purpose);
    await this.notifications.sendOtpSms(phone, `${code} is your Mehfil verification code. It expires in 10 minutes. Never share it with anyone.`);
  }

  // ---- Customer and vendor accounts ---------------------------------------

  async register(input: z.output<typeof RegisterSchema>) {
    const existing = await this.prisma.user.findUnique({ where: { phone: input.phone }, include: { admin: true, vendorMembers: true } });
    // An unverified sign-up can be restarted, but an invited team member's account must not be overwritten by a stranger.
    if (existing?.phoneVerifiedAt || existing?.admin || existing?.vendorMembers.length) throw new ConflictException({ message: 'This number already has an account. Please sign in.', code: 'PHONE_TAKEN', fields: { phone: 'This number already has an account.' } });
    if (input.email) {
      const emailOwner = await this.prisma.user.findUnique({ where: { email: input.email } });
      if (emailOwner && emailOwner.id !== existing?.id) throw new ConflictException({ message: 'This email already has an account.', code: 'EMAIL_TAKEN', fields: { email: 'This email already has an account.' } });
    }
    const passwordHash = await this.hash(input.password);
    const data = { name: input.name, email: input.email ?? null, passwordHash, termsAcceptedAt: new Date() };
    if (existing) await this.prisma.user.update({ where: { id: existing.id }, data });
    else await this.prisma.user.create({ data: { ...data, phone: input.phone } });
    await this.sendPhoneOtp(input.phone, 'VERIFY_PHONE');
    return { phone: input.phone, otpSent: true };
  }

  async verifyPhone(phone: string, code: string, client: ClientInfo) {
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) throw new BadRequestException({ message: 'That code is incorrect or has expired.', code: 'OTP_INVALID' });
    await this.consumeOtp(phone, 'VERIFY_PHONE', code);
    if (!user.phoneVerifiedAt) await this.prisma.user.update({ where: { id: user.id }, data: { phoneVerifiedAt: new Date() } });
    return this.issue(user.id, client);
  }

  async resendOtp(phone: string) {
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (user && !user.phoneVerifiedAt) await this.sendPhoneOtp(phone, 'VERIFY_PHONE');
    return { otpSent: true };
  }

  private normaliseIdentifier(identifier: string) {
    const phone = pkPhone.safeParse(identifier);
    return phone.success ? { phone: phone.data } : { email: identifier.trim().toLowerCase() };
  }

  private async checkPassword(user: User | null, password: string) {
    const invalid = new UnauthorizedException({ message: 'Incorrect phone/email or password.', code: 'INVALID_CREDENTIALS' });
    if (!user) { await argon2.verify(await DUMMY_HASH, password); throw invalid; }
    if (user.lockedUntil && user.lockedUntil > new Date()) throw new HttpException({ message: 'Too many failed attempts. Please try again in 15 minutes.', code: 'LOCKED' }, 429);
    if (!(await argon2.verify(user.passwordHash, password))) {
      const failed = user.failedLogins + 1;
      await this.prisma.user.update({ where: { id: user.id }, data: failed >= MAX_FAILED_LOGINS ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MS) } : { failedLogins: failed } });
      throw invalid;
    }
    if (user.status !== 'ACTIVE') throw new ForbiddenException({ message: 'This account is not active. Please contact support.', code: 'ACCOUNT_INACTIVE' });
    if (user.failedLogins || user.lockedUntil) await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
  }

  async login(input: z.output<typeof LoginSchema>, client: ClientInfo) {
    const user = await this.prisma.user.findUnique({ where: this.normaliseIdentifier(input.identifier) as { phone: string } });
    await this.checkPassword(user, input.password);
    if (user!.phone && !user!.phoneVerifiedAt) {
      await this.sendPhoneOtp(user!.phone, 'VERIFY_PHONE').catch(() => undefined);
      throw new ForbiddenException({ message: 'Please verify your phone number first.', code: 'PHONE_NOT_VERIFIED', phone: user!.phone });
    }
    return this.issue(user!.id, client);
  }

  async refresh(refreshToken: string, client: ClientInfo): Promise<Tokens> {
    const [sid, secret] = refreshToken.split('.');
    const invalid = new UnauthorizedException({ message: 'Session expired. Please sign in again.', code: 'REFRESH_INVALID' });
    if (!sid || !secret || !/^[0-9a-f-]{36}$/.test(sid)) throw invalid;
    const session = await this.prisma.session.findUnique({ where: { id: sid }, include: { user: true } });
    if (!session || session.revokedAt || session.expiresAt < new Date() || session.user.status !== 'ACTIVE') throw invalid;
    const hash = sha256(secret);

    if (safeEqual(hash, session.refreshHash)) {
      const next = randomToken();
      const moved = await this.prisma.session.updateMany({
        where: { id: sid, refreshHash: hash },
        data: { refreshHash: sha256(next), previousHash: hash, rotatedAt: new Date(), lastUsedAt: new Date(), ip: client.ip, expiresAt: session.adminMfa ? session.expiresAt : addDays(new Date(), REFRESH_DAYS) },
      });
      // Lost a race with a parallel refresh of the same token: that caller keeps the new refresh token.
      if (!moved.count) return { accessToken: await this.access(session.userId, sid) };
      return { accessToken: await this.access(session.userId, sid), refreshToken: `${sid}.${next}` };
    }

    // Two tabs refreshing together is normal; an old token turning up later means it was stolen.
    if (session.previousHash && safeEqual(hash, session.previousHash) && session.rotatedAt && Date.now() - session.rotatedAt.getTime() < ROTATION_GRACE_MS) {
      return { accessToken: await this.access(session.userId, sid) };
    }
    await this.prisma.session.update({ where: { id: sid }, data: { revokedAt: new Date() } });
    await this.audit.record({ actorId: session.userId, action: 'auth.refresh_reuse_detected', entity: 'Session', entityId: sid, ip: client.ip });
    throw invalid;
  }

  async logout(sessionId: string) {
    await this.prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
    return { ok: true };
  }

  async forgot(identifier: string) {
    const where = this.normaliseIdentifier(identifier);
    const user = await this.prisma.user.findUnique({ where: where as { phone: string } });
    // The response is the same either way, so this can't be used to discover accounts.
    if (user && user.status === 'ACTIVE') {
      try {
        if ('phone' in where && where.phone) await this.sendPhoneOtp(where.phone, 'RESET_PASSWORD');
        else if (user.email) {
          const code = await this.createOtp(user.email, 'RESET_PASSWORD');
          await this.notifications.sendEmailNow(user.email, 'Reset your Mehfil password', `Your password reset code is ${code}. It expires in 10 minutes. If you did not ask for this, you can ignore this email.`);
        }
      } catch (e) { if (!(e instanceof HttpException)) throw e; }
    }
    return { ok: true };
  }

  async reset(input: z.output<typeof ResetSchema>) {
    const where = this.normaliseIdentifier(input.identifier);
    const user = await this.prisma.user.findUnique({ where: where as { phone: string } });
    const target = 'phone' in where ? where.phone! : where.email!;
    if (!user) throw new BadRequestException({ message: 'That code is incorrect or has expired.', code: 'OTP_INVALID' });
    await this.consumeOtp(target, 'RESET_PASSWORD', input.code);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await this.hash(input.password), failedLogins: 0, lockedUntil: null, phoneVerifiedAt: user.phoneVerifiedAt ?? ('phone' in where ? new Date() : null) } }),
      this.prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    return { ok: true };
  }

  async changePassword(userId: string, sessionId: string, input: z.output<typeof ChangePasswordSchema>) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await argon2.verify(user.passwordHash, input.currentPassword))) throw new BadRequestException({ message: 'Your current password is incorrect.', fields: { currentPassword: 'Incorrect password' } });
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await this.hash(input.newPassword) } }),
      this.prisma.session.updateMany({ where: { userId, revokedAt: null, id: { not: sessionId } }, data: { revokedAt: new Date() } }),
    ]);
    return { ok: true };
  }

  sessions(userId: string) {
    return this.prisma.session.findMany({ where: { userId, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastUsedAt: 'desc' }, select: { id: true, userAgent: true, ip: true, createdAt: true, lastUsedAt: true } });
  }

  async revokeSession(userId: string, id: string) {
    await this.prisma.session.updateMany({ where: { id, userId, revokedAt: null }, data: { revokedAt: new Date() } });
    return { ok: true };
  }

  /** Personal data is erased; bookings and ledger rows stay because financial records must be kept. */
  async deleteAccount(userId: string, password: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { admin: true, vendorMembers: { where: { role: 'OWNER', active: true } } } });
    if (!(await argon2.verify(user.passwordHash, password))) throw new BadRequestException({ message: 'Incorrect password', fields: { password: 'Incorrect password' } });
    if (user.admin) throw new ForbiddenException('Admin accounts must be removed by a Super Admin');
    if (user.vendorMembers.length) throw new ConflictException('This account owns a vendor business. Please contact support to close the business first.');
    const open = await this.prisma.booking.count({ where: { customerId: userId, status: { in: ['AWAITING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS', 'SERVICE_COMPLETED', 'CANCELLATION_REQUESTED', 'DISPUTED'] } } });
    if (open) throw new ConflictException('You have active bookings. Please complete or cancel them before deleting your account.');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { name: 'Deleted user', phone: null, email: null, avatarUrl: null, status: 'DELETED', deletedAt: new Date(), passwordHash: await this.hash(randomToken()) } }),
      this.prisma.session.updateMany({ where: { userId }, data: { revokedAt: new Date() } }),
      this.prisma.pushToken.deleteMany({ where: { userId } }),
      this.prisma.savedListing.deleteMany({ where: { userId } }),
    ]);
    return { ok: true };
  }

  // ---- Admin ---------------------------------------------------------------

  async adminLogin(input: z.output<typeof AdminLoginSchema>, client: ClientInfo) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email }, include: { admin: true } });
    await this.checkPassword(user, input.password);
    const admin = user!.admin;
    // Same error as a wrong password, so the admin login doesn't confirm who is staff.
    if (!admin?.active) throw new UnauthorizedException({ message: 'Incorrect phone/email or password.', code: 'INVALID_CREDENTIALS' });

    if (!admin.totpEnabled) {
      const secret = authenticator.generateSecret();
      await this.prisma.adminMember.update({ where: { id: admin.id }, data: { totpSecret: encrypt(secret) } });
      const enrollToken = await this.jwt.signAsync({ sub: user!.id, typ: 'admin-enroll' }, { expiresIn: '10m' });
      return { status: 'ENROLL_TOTP' as const, enrollToken, secret, otpauthUrl: authenticator.keyuri(input.email, 'Mehfil Admin', secret) };
    }
    if (!input.totp) return { status: 'TOTP_REQUIRED' as const };
    await this.verifyTotp(admin.id, decrypt(admin.totpSecret!), input.totp);
    await this.audit.record({ actorId: user!.id, action: 'admin.login', entity: 'User', entityId: user!.id, ip: client.ip });
    return { status: 'OK' as const, ...(await this.issue(user!.id, client, true)) };
  }

  async adminEnroll(input: z.output<typeof AdminEnrollSchema>, client: ClientInfo) {
    let claims: { sub: string; typ: string };
    try { claims = await this.jwt.verifyAsync(input.enrollToken); } catch { throw new UnauthorizedException('Enrollment expired. Please sign in again.'); }
    if (claims.typ !== 'admin-enroll') throw new UnauthorizedException('Enrollment expired. Please sign in again.');
    const admin = await this.prisma.adminMember.findUniqueOrThrow({ where: { userId: claims.sub } });
    if (!admin.totpSecret || admin.totpEnabled) throw new BadRequestException('Two-factor authentication is already set up.');
    await this.verifyTotp(admin.id, decrypt(admin.totpSecret), input.code);
    await this.prisma.adminMember.update({ where: { id: admin.id }, data: { totpEnabled: true } });
    await this.audit.record({ actorId: claims.sub, action: 'admin.totp_enrolled', entity: 'User', entityId: claims.sub, ip: client.ip });
    return { status: 'OK' as const, ...(await this.issue(claims.sub, client, true)) };
  }

  /** Each code works once: the step it was accepted for is stored and earlier ones are refused. */
  private async verifyTotp(adminId: string, secret: string, code: string) {
    const invalid = new UnauthorizedException({ message: 'That authentication code is incorrect.', code: 'TOTP_INVALID', fields: { totp: 'Incorrect code' } });
    const delta = authenticator.checkDelta(code, secret);
    if (delta === null) throw invalid;
    const step = BigInt(Math.floor(Date.now() / 30_000) + delta);
    const claimed = await this.prisma.adminMember.updateMany({ where: { id: adminId, OR: [{ lastTotpStep: null }, { lastTotpStep: { lt: step } }] }, data: { lastTotpStep: step } });
    if (!claimed.count) throw invalid;
  }

  // ---- Invitations ---------------------------------------------------------

  async createInvite(args: { kind: 'ADMIN' | 'VENDOR'; email: string; invitedById: string; adminRoleId?: string; vendorId?: string; vendorRole?: 'MANAGER' | 'SALES' | 'FINANCE' | 'COORDINATOR'; subject: string; path: string }) {
    const token = randomToken();
    await this.prisma.invite.create({ data: { kind: args.kind, email: args.email, tokenHash: sha256(token), adminRoleId: args.adminRoleId, vendorId: args.vendorId, vendorRole: args.vendorRole, invitedById: args.invitedById, expiresAt: addDays(new Date(), 7) } });
    await this.notifications.sendEmailNow(args.email, args.subject, `You have been invited to Mehfil. Accept within 7 days:\n\n${env.WEB_URL}${args.path}?token=${token}`);
    return { ok: true, token: env.NODE_ENV === 'test' ? token : undefined };
  }

  async inspectInvite(token: string) {
    const invite = await this.prisma.invite.findUnique({ where: { tokenHash: sha256(token) } });
    if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt < new Date()) throw new BadRequestException('This invitation is invalid or has expired.');
    const existing = await this.prisma.user.findUnique({ where: { email: invite.email } });
    return { kind: invite.kind, email: invite.email, existingAccount: !!existing };
  }

  /** The invite link proves control of the email address; it never upgrades an account without its password. */
  async acceptInvite(input: z.output<typeof AcceptInviteSchema>) {
    const invite = await this.prisma.invite.findUnique({ where: { tokenHash: sha256(input.token) } });
    if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt < new Date()) throw new BadRequestException('This invitation is invalid or has expired.');
    let user = await this.prisma.user.findUnique({ where: { email: invite.email } });
    if (user) {
      if (!(await argon2.verify(user.passwordHash, input.password))) throw new UnauthorizedException({ message: 'Enter the password of your existing Mehfil account.', fields: { password: 'Incorrect password' } });
    } else {
      user = await this.prisma.user.create({ data: { name: input.name, email: invite.email, phone: input.phone, passwordHash: await this.hash(input.password), termsAcceptedAt: new Date(), phoneVerifiedAt: input.phone ? null : undefined } });
    }
    const userId = user.id;
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.invite.updateMany({ where: { id: invite.id, acceptedAt: null }, data: { acceptedAt: new Date() } });
      if (!claimed.count) throw new BadRequestException('This invitation has already been used.');
      if (invite.kind === 'ADMIN') await tx.adminMember.upsert({ where: { userId }, create: { userId, roleId: invite.adminRoleId! }, update: { roleId: invite.adminRoleId!, active: true } });
      else await tx.vendorMember.upsert({ where: { vendorId_userId: { vendorId: invite.vendorId!, userId } }, create: { vendorId: invite.vendorId!, userId, role: invite.vendorRole! }, update: { role: invite.vendorRole!, active: true } });
      await this.audit.record({ actorId: userId, action: 'invite.accepted', entity: 'Invite', entityId: invite.id, after: { kind: invite.kind } }, tx);
    });
    return { ok: true, kind: invite.kind };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { city: true, admin: { include: { role: true } }, vendorMembers: { where: { active: true }, include: { vendor: { select: { id: true, businessName: true, status: true, slug: true, statusReason: true } } }, take: 1 } },
    });
    const { passwordHash: _p, failedLogins: _f, lockedUntil: _l, admin, vendorMembers, ...rest } = user;
    return { ...rest, admin: admin ? { isSuper: admin.isSuper, permissions: admin.role.permissions, role: admin.role.name, active: admin.active } : null, vendor: vendorMembers[0] ? { ...vendorMembers[0].vendor, role: vendorMembers[0].role } : null };
  }
}
