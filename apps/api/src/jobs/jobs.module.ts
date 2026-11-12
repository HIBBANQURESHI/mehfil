import { Injectable, Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression, ScheduleModule } from '@nestjs/schedule';
import { formatPKR } from '@mehfil/shared';
import { env } from '../common/config';
import { addDays, addHours, today } from '../common/http';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../common/settings.service';
import { MarketplaceModule } from '../marketplace/marketplace.module';
import { BookingsService } from '../marketplace/bookings.service';
import { PaymentsService } from '../payments/payments.service';
import { CommissionService } from '../payments/commission.service';
import { NotificationsService } from '../notifications/notifications.module';
import { AvailabilityService } from '../availability/availability.service';
import { VendorsModule } from '../vendors/vendors.module';
import { WeddingPersonalizer } from '../weddings/planner-ai';
import { WeddingsModule } from '../weddings/weddings.module';

const JOB_LOCK = 72410193;

@Injectable()
export class JobsService {
  private log = new Logger('Jobs');
  constructor(private prisma: PrismaService, private settings: SettingsService, private bookings: BookingsService, private notifications: NotificationsService, private availability: AvailabilityService, private personalizer: WeddingPersonalizer, private payments: PaymentsService, private commission: CommissionService) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async outbox() { if (env.JOBS_ENABLED && env.NODE_ENV !== 'test') await this.notifications.processOutbox().catch((e) => this.log.error(e)); }

  /** Kept apart from tick(): a Gemini call can take a minute, and its own claim already stops double work. */
  @Cron(CronExpression.EVERY_MINUTE)
  async personalizeWeddings() {
    if (env.JOBS_ENABLED && env.NODE_ENV !== 'test') await this.personalizer.runDue().catch((e) => this.log.error(e));
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async tick() {
    if (!env.JOBS_ENABLED || env.NODE_ENV === 'test') return;
    await this.runAll().catch((e) => this.log.error(e));
  }

  /** An advisory lock keeps this to one API instance at a time. */
  async runAll() {
    // A transaction-scoped lock stays on one pooled connection and is released even if the process dies.
    await this.prisma.$transaction(async (tx) => {
      const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${JOB_LOCK}::bigint) AS locked`;
      if (!locked) return;
      await this.expireQuotes(); await this.expireEnquiries(); await this.releaseHolds(); await this.startEvents();
      await this.autoComplete(); await this.settlementsDue(); await this.paymentReminders(); await this.autoConfirmCash(); await this.commissionReminders(); await this.payments.reconcileOpenCheckouts();
    }, { timeout: 120_000, maxWait: 10_000 });
  }

  private async expireQuotes() {
    const soon = await this.prisma.quotation.findMany({ where: { status: { in: ['SENT', 'VIEWED'] }, reminderSentAt: null, validUntil: { gt: new Date(), lt: addHours(new Date(), 12) } }, take: 100 });
    for (const q of soon) {
      await this.prisma.$transaction(async (tx) => {
        await tx.quotation.update({ where: { id: q.id }, data: { reminderSentAt: new Date() } });
        await this.notifications.notify(tx, { userId: q.customerId, type: 'QUOTATION_EXPIRING', title: 'Quotation expiring soon', body: `Quotation ${q.code} expires within 12 hours.`, link: `/account/quotations/${q.id}` });
      });
    }
    await this.prisma.quotation.updateMany({ where: { status: { in: ['SENT', 'VIEWED'] }, validUntil: { lt: new Date() } }, data: { status: 'EXPIRED' } });
  }

  private expireEnquiries() {
    return this.prisma.enquiry.updateMany({ where: { status: { in: ['NEW', 'VIEWED', 'RESPONDED'] }, expiresAt: { lt: new Date() } }, data: { status: 'EXPIRED' } });
  }

  private async releaseHolds() {
    const lapsed = await this.prisma.booking.findMany({ where: { status: 'AWAITING_PAYMENT', holdExpiresAt: { lt: new Date() }, cashReceipts: { none: { status: { in: ['PENDING', 'DISPUTED'] } } } }, take: 100 });
    for (const b of lapsed) {
      await this.prisma.$transaction(async (tx) => {
        await this.prisma.lockBooking(tx, b.id);
        const fresh = await tx.booking.findUniqueOrThrow({ where: { id: b.id } });
        if (fresh.status !== 'AWAITING_PAYMENT') return;
        await this.bookings.transition(tx, fresh, 'CANCELLED', { type: 'SYSTEM' }, 'Advance was not paid before the hold expired', { cancelledAt: new Date(), cancelReason: 'Hold expired', cancelledByType: 'SYSTEM' });
        await this.availability.release(tx, b.id);
        await this.notifications.notify(tx, { userId: b.customerId, type: 'BOOKING_EXPIRED', title: 'Date released', body: `The hold for ${b.code} expired because the advance was not paid.`, link: `/account/bookings/${b.id}` });
        await this.notifications.notifyVendor(tx, b.vendorId, { type: 'BOOKING_EXPIRED', title: 'Hold expired', body: `${b.code} was not paid and the date is free again.`, link: `/vendor/bookings/${b.id}` });
      });
    }
  }

  private async startEvents() {
    const rows = await this.prisma.booking.findMany({ where: { status: 'CONFIRMED', eventDate: { lte: today() } }, take: 200 });
    for (const b of rows) await this.prisma.$transaction((tx) => this.bookings.transition(tx, b, 'IN_PROGRESS', { type: 'SYSTEM' }, 'Event date reached'));
  }

  private async autoComplete() {
    const { autoCompleteDays } = await this.settings.all();
    const rows = await this.prisma.booking.findMany({ where: { status: 'SERVICE_COMPLETED', serviceCompletedAt: { lt: addDays(new Date(), -autoCompleteDays) } }, take: 100 });
    for (const b of rows) await this.prisma.$transaction((tx) => this.bookings.autoComplete(tx, b));
  }

  private async settlementsDue() {
    await this.prisma.settlement.updateMany({
      where: { status: 'NOT_DUE', payable: { gt: 0 }, booking: { status: { in: ['COMPLETED', 'CANCELLED'] }, settlementDueAt: { lte: new Date() } }, payment: { refunds: { none: { status: { in: ['REQUESTED', 'APPROVED'] } } } } },
      data: { status: 'DUE' },
    });
  }

  /** A customer who doesn't answer within the window is taken to have received what the vendor recorded. They can still raise a dispute. */
  async autoConfirmCash() {
    const { cashAutoConfirmDays } = await this.settings.all();
    const due = await this.prisma.cashReceipt.findMany({ where: { status: 'PENDING', createdAt: { lt: addDays(new Date(), -cashAutoConfirmDays) } }, select: { id: true }, take: 100 });
    for (const r of due) await this.payments.confirmCash(r.id, { type: 'SYSTEM' }).catch((e) => this.log.warn(`Auto-confirming cash ${r.id}: ${(e as Error).message}`));
  }

  /** One reminder two days before commission falls due, and one notice once it is overdue. */
  async commissionReminders() {
    const vendors = await this.prisma.payment.findMany({ where: { collectedBy: 'VENDOR', status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED'] }, OR: [{ commissionReminderAt: null }, { commissionOverdueAt: null }] }, select: { booking: { select: { vendorId: true } } }, distinct: ['bookingId'], take: 500 });
    for (const vendorId of new Set(vendors.map((v) => v.booking.vendorId))) {
      const { lines } = await this.commission.statement(vendorId);
      const soon = lines.filter((l) => l.status === 'DUE' && l.dueAt < addDays(new Date(), 2));
      const late = lines.filter((l) => l.status === 'OVERDUE');
      await this.prisma.$transaction(async (tx) => {
        const remind = await tx.payment.findMany({ where: { id: { in: soon.map((l) => l.paymentId) }, commissionReminderAt: null } });
        const notice = await tx.payment.findMany({ where: { id: { in: late.map((l) => l.paymentId) }, commissionOverdueAt: null } });
        if (remind.length) {
          await tx.payment.updateMany({ where: { id: { in: remind.map((p) => p.id) } }, data: { commissionReminderAt: new Date() } });
          const sum = soon.filter((l) => remind.some((p) => p.id === l.paymentId)).reduce((a, l) => a + l.outstanding, 0);
          await this.notifications.notifyVendor(tx, vendorId, { type: 'COMMISSION_DUE', title: 'Commission due soon', body: `${formatPKR(sum)} of Mehfil commission is due within 2 days.`, link: '/vendor/commission' });
        }
        if (notice.length) {
          await tx.payment.updateMany({ where: { id: { in: notice.map((p) => p.id) } }, data: { commissionOverdueAt: new Date() } });
          const sum = late.filter((l) => notice.some((p) => p.id === l.paymentId)).reduce((a, l) => a + l.outstanding, 0);
          await this.notifications.notifyVendor(tx, vendorId, { type: 'COMMISSION_OVERDUE', title: 'Commission overdue', body: `${formatPKR(sum)} of Mehfil commission is overdue. New quotations are paused until it is settled.`, link: '/vendor/commission' });
          await this.notifications.notifyAdmins(tx, 'finance.manage', { type: 'COMMISSION_OVERDUE', title: 'Vendor commission overdue', body: `${formatPKR(sum)} overdue`, link: '/admin/commissions' });
        }
      });
    }
  }

  private async paymentReminders() {
    const rows = await this.prisma.bookingMilestone.findMany({ where: { status: 'PENDING', remindedAt: null, dueDate: { lte: addDays(today(), 3) }, booking: { status: { in: ['CONFIRMED', 'IN_PROGRESS'] } } }, include: { booking: true }, take: 200 });
    for (const m of rows) {
      await this.prisma.$transaction(async (tx) => {
        await tx.bookingMilestone.update({ where: { id: m.id }, data: { remindedAt: new Date() } });
        await this.notifications.notify(tx, { userId: m.booking.customerId, type: 'PAYMENT_REMINDER', title: 'Payment due soon', body: `${m.label} of ${formatPKR(Number(m.amount))} for ${m.booking.code} is due by ${m.dueDate!.toISOString().slice(0, 10)}.`, link: `/account/bookings/${m.bookingId}` });
      });
    }
  }
}

@Module({ imports: [ScheduleModule.forRoot(), MarketplaceModule, VendorsModule, WeddingsModule], providers: [JobsService], exports: [JobsService] })
export class JobsModule {}
