import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Payment, Prisma } from '@prisma/client';
import { commissionForPayment, commissionReversalForRefund, formatPKR } from '@mehfil/shared';
import { AuthCtx } from '../common/auth';
import { AuditService } from '../common/audit.service';
import { env } from '../common/config';
import { decrypt } from '../common/crypto';
import { paged, PageQuery, paging } from '../common/http';
import { PrismaService, Tx } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.module';
import { BookingsService } from '../marketplace/bookings.service';
import { AvailabilityService } from '../availability/availability.service';
import type { PaymentProvider, WebhookEventData } from './providers';

export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';
const COLLECTED = ['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const;
const CAN_PAY_LATER_MILESTONE = ['CONFIRMED', 'IN_PROGRESS', 'SERVICE_COMPLETED', 'COMPLETED', 'CANCELLATION_REQUESTED'];

@Injectable()
export class PaymentsService {
  private log = new Logger('Payments');
  constructor(
    private prisma: PrismaService, private notifications: NotificationsService, private bookings: BookingsService,
    private availability: AvailabilityService, private audit: AuditService, @Inject(PAYMENT_PROVIDER) public provider: PaymentProvider,
  ) {}

  private async payableMilestone(tx: Tx, bookingId: string, milestoneId: string) {
    const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: { milestones: { orderBy: { sortOrder: 'asc' } }, listing: { select: { title: true } } } });
    if (!booking) throw new NotFoundException('Booking not found');
    const next = booking.milestones.find((m) => m.status === 'PENDING');
    if (!next) throw new ConflictException('This booking is fully paid.');
    if (next.id !== milestoneId) throw new ConflictException({ message: 'Please pay the earlier instalment first.', code: 'MILESTONE_ORDER' });
    if (next.sortOrder === 0) {
      if (booking.status !== 'AWAITING_PAYMENT') throw new ConflictException({ message: 'This booking is not ready for payment.', code: 'NOT_PAYABLE' });
      if (booking.holdExpiresAt && booking.holdExpiresAt < new Date()) throw new ConflictException({ message: 'The hold on this date has expired.', code: 'HOLD_EXPIRED' });
    } else if (!CAN_PAY_LATER_MILESTONE.includes(booking.status)) throw new ConflictException({ message: 'This booking cannot take payments right now.', code: 'NOT_PAYABLE' });
    return { booking, milestone: next };
  }

  /** Re-opens an unfinished checkout instead of creating a second one, so a double tap can't lead to a double charge. */
  async start(auth: AuthCtx, bookingId: string, milestoneId: string, returnUrl: string) {
    const owned = await this.prisma.booking.findFirst({ where: { id: bookingId, customerId: auth.userId } });
    if (!owned) throw new NotFoundException('Booking not found');

    const prepared = await this.prisma.$transaction(async (tx) => {
      await this.prisma.lockBooking(tx, bookingId);
      const { booking, milestone } = await this.payableMilestone(tx, bookingId, milestoneId);
      const open = await tx.payment.findFirst({ where: { milestoneId, status: { in: ['INITIATED', 'PROCESSING'] }, checkoutUrl: { not: null } } });
      if (open) return { existing: open };
      const attempts = await tx.payment.count({ where: { milestoneId } });
      const payment = await tx.payment.create({ data: { code: await this.prisma.nextCode(tx, 'PAY'), bookingId, milestoneId, amount: milestone.amount, provider: this.provider.name, idempotencyKey: `${milestoneId}:${attempts}` } });
      return { payment, description: `${booking.code} ${milestone.label}: ${booking.listing.title}` };
    });
    if ('existing' in prepared && prepared.existing) return { paymentId: prepared.existing.id, checkoutUrl: prepared.existing.checkoutUrl };

    const { payment, description } = prepared as { payment: Payment; description: string };
    try {
      const checkout = await this.provider.createCheckout({ paymentCode: payment.code, amount: Number(payment.amount), description, returnUrl });
      await this.prisma.payment.update({ where: { id: payment.id }, data: { providerRef: checkout.providerRef, checkoutUrl: checkout.checkoutUrl } });
      return { paymentId: payment.id, checkoutUrl: checkout.checkoutUrl };
    } catch (e) {
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', failureReason: (e as Error).message.slice(0, 300) } });
      throw e;
    }
  }

  /**
   * The webhook is the only proof of payment; a browser redirect proves nothing. Signature first, then a unique
   * event row (so redelivery is harmless), then the state change under a row lock on the booking.
   */
  async handleWebhook(providerName: string, rawBody: Buffer, headers: Record<string, string | string[] | undefined>) {
    if (providerName !== this.provider.name) throw new NotFoundException();
    const evt = this.provider.parseWebhook(rawBody, headers);
    return this.processEvent(evt, JSON.parse(rawBody.toString('utf8')));
  }

  async processEvent(evt: WebhookEventData, payload: Prisma.InputJsonValue) {
    const providerName = this.provider.name;
    const stored = await this.prisma.webhookEvent.upsert({ where: { provider_eventId: { provider: providerName, eventId: evt.eventId } }, create: { provider: providerName, eventId: evt.eventId, payload }, update: {} });
    if (stored.processedAt) return { ok: true, duplicate: true };

    return this.prisma.$transaction(async (tx) => {
      const ref = await tx.payment.findUnique({ where: { providerRef: evt.providerRef } });
      if (!ref) {
        await tx.webhookEvent.update({ where: { id: stored.id }, data: { error: 'Unknown payment reference' } });
        this.log.error(`Webhook ${evt.eventId} references unknown payment ${evt.providerRef}`);
        return { ok: true, unknown: true };
      }
      await this.prisma.lockBooking(tx, ref.bookingId);
      const claimed = await tx.webhookEvent.updateMany({ where: { id: stored.id, processedAt: null }, data: { processedAt: new Date() } });
      if (!claimed.count) return { ok: true, duplicate: true };
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: ref.id } });

      if (evt.status === 'FAILED') {
        if (['INITIATED', 'PROCESSING'].includes(payment.status)) {
          await tx.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', failureReason: evt.failureReason ?? 'Declined', checkoutUrl: null } });
          const b = await tx.booking.findUniqueOrThrow({ where: { id: payment.bookingId } });
          await this.notifications.notify(tx, { userId: b.customerId, type: 'PAYMENT_FAILED', title: 'Payment failed', body: `Your payment for ${b.code} did not go through. You can try again.`, link: `/account/bookings/${b.id}` });
        }
        return { ok: true };
      }
      if ((COLLECTED as readonly string[]).includes(payment.status)) return { ok: true, duplicate: true };
      if (evt.amount !== Number(payment.amount)) { await this.flagForReconciliation(tx, payment, `Amount mismatch: expected ${payment.amount}, gateway reported ${evt.amount}`); return { ok: true, reconcile: true }; }
      await this.applySuccess(tx, payment, { providerFee: evt.fee, actorType: 'SYSTEM' });
      return { ok: true };
    });
  }

  private async flagForReconciliation(tx: Tx, payment: Payment, reason: string) {
    await tx.payment.update({ where: { id: payment.id }, data: { status: 'RECONCILIATION_REQUIRED', failureReason: reason.slice(0, 300) } });
    await this.notifications.notifyAdmins(tx, 'finance.manage', { type: 'PAYMENT_RECONCILE', title: 'Payment needs reconciliation', body: `${payment.code}: ${reason}`, link: '/admin/payments' });
  }

  /** Called with the booking row already locked. Writes the payment, milestone, ledger and settlement together. */
  private async applySuccess(tx: Tx, payment: Payment, opts: { providerFee?: number; actorType: 'SYSTEM' | 'ADMIN'; actorId?: string }) {
    const booking = await tx.booking.findUniqueOrThrow({ where: { id: payment.bookingId }, include: { listing: { select: { title: true, dailyCapacity: true } } } });
    const milestone = await tx.bookingMilestone.findUniqueOrThrow({ where: { id: payment.milestoneId } });
    if (milestone.status === 'PAID') return this.flagForReconciliation(tx, payment, 'Instalment was already paid: a duplicate charge to refund');
    if (booking.status === 'CANCELLED') return this.flagForReconciliation(tx, payment, 'Payment arrived after the booking was cancelled');

    if (booking.status === 'AWAITING_PAYMENT') {
      const held = await tx.occupancy.count({ where: { bookingId: booking.id } });
      if (!held) {
        const free = await this.availability.claim(tx, { listingId: booking.listingId, date: booking.eventDate, slot: booking.slot, capacity: booking.listing.dailyCapacity, kind: 'BOOKED', bookingId: booking.id });
        if (!free) return this.flagForReconciliation(tx, payment, 'Hold expired and the date was taken before payment arrived');
      }
      await this.availability.confirm(tx, booking.id);
      await this.bookings.transition(tx, booking, 'CONFIRMED', { type: 'SYSTEM' }, `Advance received (${payment.code})`, { confirmedAt: new Date(), holdExpiresAt: null });
    }

    const prior = await tx.payment.findMany({ where: { bookingId: booking.id, status: { in: [...COLLECTED] }, id: { not: payment.id } } });
    const commission = commissionForPayment({
      paymentAmount: Number(payment.amount), bookingTotal: Number(booking.totalAmount), commissionTotal: Number(booking.commissionTotal),
      alreadyCollected: prior.reduce((s, p) => s + Number(p.amount), 0), commissionAlreadyCharged: prior.reduce((s, p) => s + Number(p.commission ?? 0), 0),
    });
    const net = Number(payment.amount) - commission;
    await tx.payment.update({ where: { id: payment.id }, data: { status: 'SUCCEEDED', succeededAt: new Date(), commission, providerFee: opts.providerFee, checkoutUrl: null } });
    await tx.bookingMilestone.update({ where: { id: milestone.id }, data: { status: 'PAID', paidAt: new Date() } });
    const refs = { bookingId: booking.id, paymentId: payment.id, vendorId: booking.vendorId, actorId: opts.actorId };
    await tx.ledgerEntry.createMany({ data: [
      { ...refs, type: 'PAYMENT_RECEIVED', amount: payment.amount, memo: milestone.label },
      { ...refs, type: 'COMMISSION_EARNED', amount: commission, memo: `${booking.commissionBps} bps` },
      ...(payment.collectedBy === 'PLATFORM' ? [{ ...refs, type: 'VENDOR_PAYABLE' as const, amount: net }] : []),
    ] });
    if (payment.collectedBy === 'PLATFORM') await tx.settlement.create({ data: { vendorId: booking.vendorId, bookingId: booking.id, paymentId: payment.id, gross: payment.amount, commission, payable: net } });
    await this.notifications.notify(tx, { userId: booking.customerId, type: 'PAYMENT_SUCCEEDED', title: 'Payment successful', body: `We received ${formatPKR(Number(payment.amount))} for ${booking.code}.`, link: `/account/bookings/${booking.id}` });
    await this.notifications.notifyVendor(tx, booking.vendorId, { type: 'PAYMENT_RECEIVED', title: 'Payment received', body: `${formatPKR(Number(payment.amount))} recorded on ${booking.code}.`, link: `/vendor/bookings/${booking.id}` });
  }

  /** Pilot route for when the customer paid the vendor directly. Commission then becomes money the vendor owes Mehfil. */
  async recordManual(auth: AuthCtx, bookingId: string, milestoneId: string, reference: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.prisma.lockBooking(tx, bookingId);
      const { milestone } = await this.payableMilestone(tx, bookingId, milestoneId);
      const payment = await tx.payment.create({ data: { code: await this.prisma.nextCode(tx, 'PAY'), bookingId, milestoneId, amount: milestone.amount, provider: 'manual', collectedBy: 'VENDOR', providerRef: `manual:${milestoneId}`, idempotencyKey: `manual:${milestoneId}` } });
      await this.applySuccess(tx, payment, { actorType: 'ADMIN', actorId: auth.userId });
      await this.audit.record({ actorId: auth.userId, action: 'payment.manual_recorded', entity: 'Payment', entityId: payment.id, reason, after: { reference, amount: milestone.amount } }, tx);
      return tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
    });
  }

  // ---- Refunds -------------------------------------------------------------

  private async refundable(tx: Tx, paymentId: string) {
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    const open = await tx.refund.aggregate({ where: { paymentId, status: { in: ['REQUESTED', 'APPROVED'] } }, _sum: { amount: true } });
    return { payment, available: Number(payment.amount) - Number(payment.refundedAmount) - Number(open._sum.amount ?? 0) };
  }

  async requestRefund(auth: AuthCtx, paymentId: string, amount: number | undefined, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const p = await tx.payment.findFirst({ where: { id: paymentId, booking: { customerId: auth.userId }, status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED'] } }, include: { booking: true } });
      if (!p) throw new NotFoundException('Payment not found');
      await this.prisma.lockBooking(tx, p.bookingId);
      const { available } = await this.refundable(tx, paymentId);
      const value = amount ?? available;
      if (value <= 0 || value > available) throw new BadRequestException('That amount is more than can be refunded on this payment.');
      const refund = await tx.refund.create({ data: { code: await this.prisma.nextCode(tx, 'RF'), paymentId, amount: value, reason, requestedById: auth.userId } });
      await this.notifications.notifyAdmins(tx, 'finance.manage', { type: 'REFUND_REQUESTED', title: 'Refund requested', body: `${p.booking.code}: ${formatPKR(value)}`, link: '/admin/refunds' });
      return refund;
    });
  }

  /** The gateway call sits between two transactions. If it fails, the refund stays APPROVED and can simply be retried. */
  async decideRefund(auth: AuthCtx, id: string, approve: boolean, amount: number | undefined, note: string) {
    const refund = await this.prisma.refund.findUniqueOrThrow({ where: { id }, include: { payment: true } });
    if (!approve) {
      const res = await this.prisma.refund.updateMany({ where: { id, status: 'REQUESTED' }, data: { status: 'REJECTED', decidedById: auth.userId, decisionNote: note } });
      if (!res.count) throw new ConflictException('This refund has already been decided.');
      await this.audit.record({ actorId: auth.userId, action: 'refund.rejected', entity: 'Refund', entityId: id, reason: note });
      return { ok: true };
    }
    if (refund.status !== 'APPROVED') {
      await this.prisma.$transaction(async (tx) => {
        await this.prisma.lockBooking(tx, refund.payment.bookingId);
        const { available } = await this.refundable(tx, refund.paymentId);
        const value = amount ?? Number(refund.amount);
        if (value <= 0 || value > available + Number(refund.amount)) throw new BadRequestException('That amount is more than can be refunded on this payment.');
        const res = await tx.refund.updateMany({ where: { id, status: 'REQUESTED' }, data: { status: 'APPROVED', amount: value, decidedById: auth.userId, decisionNote: note } });
        if (!res.count) throw new ConflictException('This refund has already been decided.');
      });
    }
    const current = await this.prisma.refund.findUniqueOrThrow({ where: { id }, include: { payment: true } });
    if (current.status !== 'APPROVED') throw new ConflictException('This refund has already been processed.');
    let providerRef: string | undefined;
    if (current.payment.provider !== 'manual') providerRef = (await this.provider.refund({ providerRef: current.payment.providerRef!, amount: Number(current.amount), reason: current.reason, idempotencyKey: current.id })).providerRef;
    await this.prisma.$transaction(async (tx) => {
      await this.prisma.lockBooking(tx, current.payment.bookingId);
      const claimed = await tx.refund.updateMany({ where: { id, status: 'APPROVED' }, data: { status: 'PROCESSED', processedAt: new Date(), providerRef } });
      if (!claimed.count) throw new ConflictException('This refund has already been processed.');
      await this.applyRefund(tx, id, auth.userId);
      await this.audit.record({ actorId: auth.userId, action: 'refund.processed', entity: 'Refund', entityId: id, reason: note, after: { amount: current.amount } }, tx);
    });
    return { ok: true };
  }

  private async applyRefund(tx: Tx, refundId: string, actorId: string) {
    const refund = await tx.refund.findUniqueOrThrow({ where: { id: refundId }, include: { payment: { include: { booking: true, settlement: true } } } });
    const { payment } = refund;
    const amount = Number(refund.amount);
    const reversal = commissionReversalForRefund({ refundAmount: amount, paymentAmount: Number(payment.amount), paymentCommission: Number(payment.commission ?? 0), alreadyRefunded: Number(payment.refundedAmount), commissionAlreadyReversed: Number(payment.commissionReversed) });
    const net = amount - reversal;
    const refunded = Number(payment.refundedAmount) + amount;
    await tx.payment.update({ where: { id: payment.id }, data: { refundedAmount: refunded, commissionReversed: Number(payment.commissionReversed) + reversal, status: refunded >= Number(payment.amount) ? 'REFUNDED' : 'PARTIALLY_REFUNDED' } });
    const refs = { bookingId: payment.bookingId, paymentId: payment.id, refundId, vendorId: payment.booking.vendorId, actorId };
    await tx.ledgerEntry.createMany({ data: [
      { ...refs, type: 'REFUND_ISSUED', amount },
      { ...refs, type: 'COMMISSION_REVERSED', amount: reversal },
      ...(payment.collectedBy === 'PLATFORM' ? [{ ...refs, type: 'VENDOR_PAYABLE_REVERSED' as const, amount: net }] : []),
    ] });
    const s = payment.settlement;
    if (s) {
      // Money already sent to the vendor is recovered from their next payout instead of being rewritten.
      if (['PAID', 'PROCESSING'].includes(s.status)) await tx.settlement.update({ where: { id: s.id }, data: { clawback: { increment: net } } });
      else await tx.settlement.update({ where: { id: s.id }, data: { gross: { decrement: amount }, commission: { decrement: reversal }, payable: { decrement: net } } });
    }
    await this.notifications.notify(tx, { userId: payment.booking.customerId, type: 'REFUND_PROCESSED', title: 'Refund processed', body: `${formatPKR(amount)} was refunded for ${payment.booking.code}.`, link: `/account/bookings/${payment.bookingId}` });
  }

  // ---- Vendor earnings and payouts -----------------------------------------

  private async outstandingClawback(vendorId: string, tx: Tx = this.prisma) {
    const [claw, netted] = await Promise.all([
      tx.settlement.aggregate({ where: { vendorId }, _sum: { clawback: true } }),
      tx.payout.aggregate({ where: { vendorId, status: { not: 'FAILED' } }, _sum: { clawbackNetted: true } }),
    ]);
    return Number(claw._sum.clawback ?? 0) - Number(netted._sum.clawbackNetted ?? 0);
  }

  async vendorEarnings(vendorId: string) {
    const sum = async (type: Prisma.LedgerEntryWhereInput['type']) => Number((await this.prisma.ledgerEntry.aggregate({ where: { vendorId, type }, _sum: { amount: true } }))._sum.amount ?? 0);
    const [received, refunded, commission, reversed, byStatus, clawback, paid, commissionReceived, direct] = await Promise.all([
      sum('PAYMENT_RECEIVED'), sum('REFUND_ISSUED'), sum('COMMISSION_EARNED'), sum('COMMISSION_REVERSED'),
      this.prisma.settlement.groupBy({ by: ['status'], where: { vendorId }, _sum: { payable: true } }),
      this.outstandingClawback(vendorId),
      this.prisma.payout.aggregate({ where: { vendorId, status: 'PAID' }, _sum: { amount: true } }),
      sum('COMMISSION_RECEIVED'),
      this.prisma.payment.aggregate({ where: { collectedBy: 'VENDOR', booking: { vendorId } }, _sum: { commission: true, commissionReversed: true } }),
    ]);
    const bucket = (s: string) => Number(byStatus.find((b) => b.status === s)?._sum.payable ?? 0);
    const due = bucket('DUE');
    return {
      customerPayments: received, refunds: refunded, commission: commission - reversed, net: received - refunded - (commission - reversed),
      pending: bucket('NOT_DUE') + bucket('ON_HOLD'), onHold: bucket('ON_HOLD'), due, clawback, availableForPayout: Math.max(due - clawback, 0), inProcess: bucket('PROCESSING'), paidOut: Number(paid._sum.amount ?? 0),
      commissionOwed: Number(direct._sum.commission ?? 0) - Number(direct._sum.commissionReversed ?? 0) - commissionReceived,
    };
  }

  async vendorTransactions(vendorId: string, q: PageQuery) {
    const p = paging(q); const where = { vendorId };
    const [items, total] = await Promise.all([
      this.prisma.settlement.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take, include: { booking: { select: { code: true, eventDate: true, customer: { select: { name: true } } } }, payment: { select: { code: true, status: true, succeededAt: true } } } }),
      this.prisma.settlement.count({ where }),
    ]);
    return paged(items, total, p);
  }

  async vendorPayouts(vendorId: string, q: PageQuery) {
    const p = paging(q); const where = { vendorId };
    const [rows, total] = await Promise.all([this.prisma.payout.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take }), this.prisma.payout.count({ where })]);
    return paged(rows.map(({ iban, ...r }) => ({ ...r, ibanLast4: decrypt(iban).slice(-4) })), total, p);
  }

  async requestPayout(auth: AuthCtx) {
    const vendorId = auth.vendor!.id;
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "Vendor" WHERE "id" = ${vendorId} FOR UPDATE`;
      const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: vendorId } });
      if (vendor.status !== 'APPROVED') throw new ForbiddenException('Your business must be active to request payouts.');
      if (!vendor.iban || !vendor.bankName || !vendor.accountTitle) throw new BadRequestException({ message: 'Please add your bank details first.', code: 'NO_BANK_DETAILS' });
      const due = await tx.settlement.findMany({ where: { vendorId, status: 'DUE', payable: { gt: 0 } } });
      const gross = due.reduce((s, x) => s + Number(x.payable), 0);
      const clawbackNetted = Math.min(await this.outstandingClawback(vendorId, tx), gross);
      const amount = gross - clawbackNetted;
      if (amount <= 0) throw new ConflictException({ message: 'There is nothing available to pay out yet.', code: 'NOTHING_DUE' });
      const payout = await tx.payout.create({ data: { code: await this.prisma.nextCode(tx, 'PO'), vendorId, amount, clawbackNetted, bankName: vendor.bankName, accountTitle: vendor.accountTitle, iban: vendor.iban, requestedById: auth.userId } });
      await tx.settlement.updateMany({ where: { id: { in: due.map((d) => d.id) } }, data: { status: 'PROCESSING', payoutId: payout.id } });
      await this.notifications.notifyAdmins(tx, 'finance.manage', { type: 'PAYOUT_REQUESTED', title: 'Payout requested', body: `${vendor.businessName}: ${formatPKR(amount)}`, link: '/admin/payouts' });
      return payout;
    });
  }

  async decidePayout(auth: AuthCtx, id: string, action: 'APPROVE' | 'MARK_PAID' | 'FAIL', reference?: string | null, reason?: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const payout = await tx.payout.findUnique({ where: { id } });
      if (!payout) throw new NotFoundException('Payout not found');
      if (action === 'APPROVE') {
        const res = await tx.payout.updateMany({ where: { id, status: 'REQUESTED' }, data: { status: 'APPROVED', decidedById: auth.userId } });
        if (!res.count) throw new ConflictException('This payout has already been decided.');
      } else if (action === 'MARK_PAID') {
        if (!reference) throw new BadRequestException('A bank reference is required.');
        const res = await tx.payout.updateMany({ where: { id, status: 'APPROVED' }, data: { status: 'PAID', paidAt: new Date(), reference, decidedById: auth.userId } });
        if (!res.count) throw new ConflictException('Only approved payouts can be marked as paid.');
        await tx.settlement.updateMany({ where: { payoutId: id }, data: { status: 'PAID' } });
        await tx.ledgerEntry.create({ data: { type: 'PAYOUT_SENT', amount: payout.amount, vendorId: payout.vendorId, payoutId: id, actorId: auth.userId, memo: reference } });
        await this.notifications.notifyVendor(tx, payout.vendorId, { type: 'PAYOUT_PAID', title: 'Payout sent', body: `${formatPKR(Number(payout.amount))} was sent to your bank. Reference: ${reference}`, link: '/vendor/payouts' });
      } else {
        const res = await tx.payout.updateMany({ where: { id, status: { in: ['REQUESTED', 'APPROVED'] } }, data: { status: 'FAILED', note: reason, decidedById: auth.userId } });
        if (!res.count) throw new ConflictException('This payout can no longer be failed.');
        await tx.settlement.updateMany({ where: { payoutId: id }, data: { status: 'DUE', payoutId: null } });
        await this.notifications.notifyVendor(tx, payout.vendorId, { type: 'PAYOUT_FAILED', title: 'Payout failed', body: reason ?? 'Please check your bank details.', link: '/vendor/payouts' });
      }
      await this.audit.record({ actorId: auth.userId, action: `payout.${action.toLowerCase()}`, entity: 'Payout', entityId: id, reason, after: { reference } }, tx);
      return { ok: true };
    });
  }

  env() { return env.PAYMENT_PROVIDER; }
}
