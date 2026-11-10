import { Controller, Get, Global, Injectable, Logger, Module, Param, Post, Query, Body, Delete } from '@nestjs/common';
import { PushTokenSchema } from '@mehfil/shared';
import { Auth, AuthCtx } from '../common/auth';
import { env } from '../common/config';
import { paged, PageQuery, paging, Z } from '../common/http';
import { PrismaService, Tx } from '../common/prisma.service';
import { EmailSender, PushSender, SmsSender } from './senders';

export interface NotifyInput { userId: string; type: string; title: string; body: string; link?: string; email?: boolean }

const MAX_ATTEMPTS = 6;

@Injectable()
export class NotificationsService {
  private log = new Logger('Notifications');
  constructor(private prisma: PrismaService, private email: EmailSender, private push: PushSender, private sms: SmsSender) {}

  /** Written inside the caller's transaction, so a notification exists only if the change it describes committed. */
  async notify(tx: Tx, input: NotifyInput) {
    await tx.notification.create({ data: { userId: input.userId, type: input.type, title: input.title, body: input.body, link: input.link } });
    const user = await tx.user.findUnique({ where: { id: input.userId }, include: { pushTokens: true } });
    if (!user || user.status === 'DELETED') return;
    const deliveries = user.pushTokens.map((t) => ({ channel: 'PUSH' as const, recipient: t.token, subject: input.title, body: input.body + (input.link ? `\u001f${input.link}` : '') }));
    if (input.email !== false && user.email) deliveries.push({ channel: 'EMAIL' as never, recipient: user.email, subject: `${input.title} | Mehfil`, body: `${input.body}${input.link ? `\n\nOpen: ${env.WEB_URL}${input.link}` : ''}\n\nMehfil` });
    if (deliveries.length) await tx.delivery.createMany({ data: deliveries });
  }

  async notifyVendor(tx: Tx, vendorId: string, input: Omit<NotifyInput, 'userId'>) {
    const members = await tx.vendorMember.findMany({ where: { vendorId, active: true } });
    for (const m of members) await this.notify(tx, { ...input, userId: m.userId });
  }

  async notifyAdmins(tx: Tx, permission: string, input: Omit<NotifyInput, 'userId'>) {
    const admins = await tx.adminMember.findMany({ where: { active: true, OR: [{ isSuper: true }, { role: { permissions: { has: permission } } }] } });
    for (const a of admins) await this.notify(tx, { ...input, userId: a.userId, email: false });
  }

  sendOtpSms(to: string, body: string) { return this.sms.send(to, body); }
  sendEmailNow(to: string, subject: string, body: string) { return this.email.send(to, subject, body); }

  /** Claims due rows with SKIP LOCKED so several API instances never send the same message twice. */
  async processOutbox(batch = 50) {
    const rows = await this.prisma.$queryRaw<{ id: string; channel: string; recipient: string; subject: string | null; body: string; attempts: number }[]>`
      UPDATE "Delivery" SET "nextAttemptAt" = now() + interval '5 minutes', "attempts" = "attempts" + 1
      WHERE "id" IN (SELECT "id" FROM "Delivery" WHERE "status" = 'PENDING' AND "nextAttemptAt" <= now() ORDER BY "nextAttemptAt" LIMIT ${batch} FOR UPDATE SKIP LOCKED)
      RETURNING "id", "channel"::text, "recipient", "subject", "body", "attempts"`;
    for (const row of rows) {
      try {
        if (row.channel === 'EMAIL') await this.email.send(row.recipient, row.subject ?? 'Mehfil', row.body);
        else if (row.channel === 'SMS') await this.sms.send(row.recipient, row.body);
        else { const [body, link] = row.body.split('\u001f'); await this.push.send(row.recipient, row.subject ?? 'Mehfil', body, link); }
        await this.prisma.delivery.update({ where: { id: row.id }, data: { status: 'SENT', sentAt: new Date(), lastError: null } });
      } catch (e) {
        const failed = row.attempts >= MAX_ATTEMPTS;
        this.log.warn(`Delivery ${row.id} attempt ${row.attempts} failed: ${(e as Error).message}`);
        await this.prisma.delivery.update({ where: { id: row.id }, data: { status: failed ? 'FAILED' : 'PENDING', lastError: (e as Error).message.slice(0, 500), nextAttemptAt: new Date(Date.now() + 2 ** row.attempts * 60_000) } });
      }
    }
    return rows.length;
  }
}

@Controller('notifications')
export class NotificationsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(@Auth() auth: AuthCtx, @Query() q: PageQuery) {
    const p = paging(q);
    const where = { userId: auth.userId };
    const [items, total, unread] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { ...where, readAt: null } }),
    ]);
    return { ...paged(items, total, p), unread };
  }

  @Post('read-all')
  async readAll(@Auth() auth: AuthCtx) {
    await this.prisma.notification.updateMany({ where: { userId: auth.userId, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }

  @Post(':id/read')
  async read(@Auth() auth: AuthCtx, @Param('id') id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId: auth.userId }, data: { readAt: new Date() } });
    return { ok: true };
  }

  @Post('push-tokens')
  async registerPush(@Auth() auth: AuthCtx, @Body(Z(PushTokenSchema)) body: { token: string; platform: string }) {
    await this.prisma.pushToken.upsert({ where: { token: body.token }, create: { ...body, userId: auth.userId }, update: { userId: auth.userId, platform: body.platform } });
    return { ok: true };
  }

  @Delete('push-tokens/:token')
  async removePush(@Auth() auth: AuthCtx, @Param('token') token: string) {
    await this.prisma.pushToken.deleteMany({ where: { token, userId: auth.userId } });
    return { ok: true };
  }
}

@Global()
@Module({ controllers: [NotificationsController], providers: [NotificationsService, EmailSender, PushSender, SmsSender], exports: [NotificationsService] })
export class NotificationsModule {}
