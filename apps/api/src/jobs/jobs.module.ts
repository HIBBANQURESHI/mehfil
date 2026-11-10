import { Injectable, Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression, ScheduleModule } from '@nestjs/schedule';
import { formatPKR } from '@mehfil/shared';
import { env } from '../common/config';
import { addDays, addHours, today } from '../common/http';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../common/settings.service';
import { MarketplaceModule } from '../marketplace/marketplace.module';
import { BookingsService } from '../marketplace/bookings.service';
import { NotificationsService } from '../notifications/notifications.module';
import { AvailabilityService } from '../availability/availability.service';
import { VendorsModule } from '../vendors/vendors.module';

const JOB_LOCK = 72410193;

@Injectable()
export class JobsService {
  private log = new Logger('Jobs');
  constructor(private prisma: PrismaService, private settings: SettingsService, private bookings: BookingsService, private notifications: NotificationsService, private availability: AvailabilityService) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async outbox() { if (env.JOBS_ENABLED && env.NODE_ENV !== 'test') await this.notifications.processOutbox().catch((e) => this.log.error(e)); }

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
      await this.autoComplete(); await this.settlementsDue(); await this.paymentReminders();
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
    const lapsed = await this.prisma.booking.findMany({ where: { status: 'AWAITING_PAYMENT', holdExpiresAt: { lt: new Date() } }, take: 100 });
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

@Module({ imports: [ScheduleModule.forRoot(), MarketplaceModule, VendorsModule], providers: [JobsService], exports: [JobsService] })
export class JobsModule {}
