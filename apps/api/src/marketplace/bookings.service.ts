import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Booking, BookingStatus as DbStatus, Prisma } from '@prisma/client';
import { applyBps, canTransition, CancellationTier, BookingStatus, formatPKR, refundBpsForCancellation } from '@mehfil/shared';
import { AuthCtx } from '../common/auth';
import { AuditService } from '../common/audit.service';
import { maskPhone } from '../common/crypto';
import { addDays, addHours, paged, PageQuery, paging, today } from '../common/http';
import { PrismaService, Tx } from '../common/prisma.service';
import { SettingsService } from '../common/settings.service';
import { NotificationsService } from '../notifications/notifications.module';
import { AvailabilityService } from '../availability/availability.service';

export type Actor = { type: 'CUSTOMER' | 'VENDOR' | 'ADMIN' | 'SYSTEM'; id?: string | null };

const DETAIL = {
  listing: { select: { id: true, title: true, slug: true, category: { select: { name: true } } } },
  vendor: { select: { id: true, businessName: true, slug: true, phone: true, whatsapp: true, address: true } },
  customer: { select: { id: true, name: true, phone: true, email: true } },
  milestones: { orderBy: { sortOrder: 'asc' as const } },
  timeline: { orderBy: { createdAt: 'asc' as const } },
  payments: { orderBy: { createdAt: 'desc' as const }, include: { refunds: true } },
  review: true,
  quotation: { include: { lines: { orderBy: { sortOrder: 'asc' as const } } } },
} satisfies Prisma.BookingInclude;

const OPEN_STATUSES: DbStatus[] = ['PENDING_VENDOR_CONFIRMATION', 'AWAITING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS', 'SERVICE_COMPLETED', 'CANCELLATION_REQUESTED', 'DISPUTED'];

@Injectable()
export class BookingsService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService, private settings: SettingsService, private availability: AvailabilityService, private audit: AuditService) {}

  /** The single place booking status changes. Rejects any move the state machine doesn't allow and records it on the timeline. */
  async transition(tx: Tx, booking: Booking, to: DbStatus, actor: Actor, note?: string | null, extra: Prisma.BookingUncheckedUpdateInput = {}) {
    if (!canTransition(booking.status as BookingStatus, to as BookingStatus)) throw new ConflictException({ message: `A booking that is ${booking.status.toLowerCase().replace(/_/g, ' ')} cannot move to ${to.toLowerCase().replace(/_/g, ' ')}.`, code: 'INVALID_TRANSITION' });
    const res = await tx.booking.updateMany({ where: { id: booking.id, status: booking.status }, data: { ...(extra as Prisma.BookingUncheckedUpdateManyInput), status: to } });
    if (!res.count) throw new ConflictException({ message: 'This booking was just updated. Please refresh and try again.', code: 'STALE' });
    await tx.bookingEvent.create({ data: { bookingId: booking.id, fromStatus: booking.status, toStatus: to, actorId: actor.id, actorType: actor.type, note } });
  }

  private async locked(tx: Tx, id: string) {
    await this.prisma.lockBooking(tx, id);
    return tx.booking.findUnique({ where: { id }, include: { listing: { select: { title: true, dailyCapacity: true } } } });
  }

  /** Accepting creates a booking request. It is not a confirmed booking until the vendor reconfirms and the advance is paid. */
  async acceptQuotation(auth: AuthCtx, quotationId: string) {
    return this.prisma.$transaction(async (tx) => {
      const q = await tx.quotation.findFirst({ where: { id: quotationId, customerId: auth.userId }, include: { milestones: { orderBy: { sortOrder: 'asc' } }, cancellationPolicy: true, vendor: true, enquiry: { include: { listing: { include: { category: true } } } } } });
      if (!q) throw new NotFoundException('Quotation not found');
      if (q.validUntil && q.validUntil < new Date()) throw new ConflictException({ message: 'This quotation has expired. Please ask the vendor for a new one.', code: 'QUOTE_EXPIRED' });
      if (q.vendor.status !== 'APPROVED') throw new ConflictException('This vendor is not currently available.');
      const claimed = await tx.quotation.updateMany({ where: { id: quotationId, status: { in: ['SENT', 'VIEWED'] } }, data: { status: 'ACCEPTED', respondedAt: new Date() } });
      if (!claimed.count) throw new ConflictException({ message: 'This quotation can no longer be accepted.', code: 'QUOTE_NOT_OPEN' });
      const commissionBps = q.vendor.commissionBpsOverride ?? q.enquiry.listing.category.commissionBps;
      if (commissionBps === null) throw new ConflictException({ message: 'This category is still being set up. Please contact support.', code: 'COMMISSION_NOT_CONFIGURED' });
      const total = Number(q.total);
      const eventDate = q.enquiry.eventDate;
      const booking = await tx.booking.create({
        data: {
          code: await this.prisma.nextCode(tx, 'BK'), quotationId, customerId: q.customerId, vendorId: q.vendorId, listingId: q.enquiry.listingId, eventDate, slot: q.enquiry.slot, guestCount: q.enquiry.guestCount,
          totalAmount: total, commissionBps, commissionTotal: applyBps(total, commissionBps),
          cancellationPolicyName: q.cancellationPolicy.name, cancellationPolicyBody: q.cancellationPolicy.body, cancellationTiers: q.cancellationPolicy.tiers as Prisma.InputJsonValue,
          milestones: { create: q.milestones.map((m) => ({ label: m.label, amount: m.amount, dueRule: m.dueRule, sortOrder: m.sortOrder, dueDate: m.dueRule === 'DAYS_BEFORE_EVENT' ? addDays(eventDate, -(m.dueDays ?? 0)) : m.dueRule === 'ON_BOOKING' ? today() : null })) },
          timeline: { create: { toStatus: 'PENDING_VENDOR_CONFIRMATION', actorId: auth.userId, actorType: 'CUSTOMER', note: `Accepted quotation ${q.code}` } },
        },
      });
      await tx.enquiry.update({ where: { id: q.enquiryId }, data: { status: 'CLOSED' } });
      await this.notifications.notifyVendor(tx, q.vendorId, { type: 'QUOTATION_ACCEPTED', title: 'Quotation accepted', body: `${auth.name} accepted ${q.code}. Please reconfirm the date.`, link: `/vendor/bookings/${booking.id}` });
      return booking;
    });
  }

  /** The vendor reconfirms the date, which places a timed hold on the calendar. */
  async vendorConfirm(auth: AuthCtx, id: string) {
    const { holdHours } = await this.settings.all();
    return this.prisma.$transaction(async (tx) => {
      const b = await this.locked(tx, id);
      if (!b || b.vendorId !== auth.vendor!.id) throw new NotFoundException('Booking not found');
      const expiresAt = addHours(new Date(), holdHours);
      if (b.status !== 'PENDING_VENDOR_CONFIRMATION') throw new ConflictException({ message: 'This booking has already been handled.', code: 'INVALID_TRANSITION' });
      const free = await this.availability.claim(tx, { listingId: b.listingId, date: b.eventDate, slot: b.slot, capacity: b.listing.dailyCapacity, kind: 'HOLD', bookingId: b.id, expiresAt });
      if (!free) throw new ConflictException({ message: 'This date is no longer available on your calendar. Free the date or decline this booking.', code: 'DATE_TAKEN' });
      await this.transition(tx, b, 'AWAITING_PAYMENT', { type: 'VENDOR', id: auth.userId }, 'Vendor reconfirmed the date', { vendorConfirmedAt: new Date(), holdExpiresAt: expiresAt });
      await this.notifications.notify(tx, { userId: b.customerId, type: 'BOOKING_AWAITING_PAYMENT', title: 'Vendor confirmed your date', body: `Pay the advance within ${holdHours} hours to secure ${b.listing.title}.`, link: `/account/bookings/${b.id}` });
      return { ok: true, holdExpiresAt: expiresAt };
    });
  }

  async vendorDecline(auth: AuthCtx, id: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const b = await this.locked(tx, id);
      if (!b || b.vendorId !== auth.vendor!.id) throw new NotFoundException('Booking not found');
      if (b.status !== 'PENDING_VENDOR_CONFIRMATION') throw new ConflictException('Only unconfirmed requests can be declined. To cancel a confirmed booking, use Cancel.');
      await this.transition(tx, b, 'CANCELLED', { type: 'VENDOR', id: auth.userId }, reason, { cancelledAt: new Date(), cancelReason: reason, cancelledByType: 'VENDOR' });
      await this.notifications.notify(tx, { userId: b.customerId, type: 'BOOKING_DECLINED', title: 'Vendor could not confirm', body: `${b.listing.title} could not confirm your date: ${reason}`, link: `/account/bookings/${b.id}` });
      return { ok: true };
    });
  }

  async vendorComplete(auth: AuthCtx, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const b = await this.locked(tx, id);
      if (!b || b.vendorId !== auth.vendor!.id) throw new NotFoundException('Booking not found');
      if (b.eventDate > today()) throw new ConflictException('A booking can only be marked completed on or after the event date.');
      await this.transition(tx, b, 'SERVICE_COMPLETED', { type: 'VENDOR', id: auth.userId }, 'Vendor marked the service as completed', { serviceCompletedAt: new Date() });
      await this.notifications.notify(tx, { userId: b.customerId, type: 'BOOKING_SERVICE_COMPLETED', title: 'Was your event completed?', body: `${b.listing.title} marked your event as completed. Please confirm or report a problem.`, link: `/account/bookings/${b.id}` });
      return { ok: true };
    });
  }

  private async complete(tx: Tx, b: Booking, actor: Actor, note: string) {
    const { disputeWindowDays } = await this.settings.all();
    await this.transition(tx, b, 'COMPLETED', actor, note, { completedAt: new Date(), customerConfirmedAt: actor.type === 'CUSTOMER' ? new Date() : undefined, settlementDueAt: addDays(new Date(), disputeWindowDays) });
    await this.notifications.notifyVendor(tx, b.vendorId, { type: 'BOOKING_COMPLETED', title: 'Booking completed', body: `Booking ${b.code} is complete.`, link: `/vendor/bookings/${b.id}` });
    await this.notifications.notify(tx, { userId: b.customerId, type: 'REVIEW_REQUEST', title: 'How was it?', body: 'Your review helps other families plan their wedding.', link: `/account/bookings/${b.id}` });
  }

  async customerConfirmCompletion(auth: AuthCtx, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const b = await this.locked(tx, id);
      if (!b || b.customerId !== auth.userId) throw new NotFoundException('Booking not found');
      await this.complete(tx, b, { type: 'CUSTOMER', id: auth.userId }, 'Customer confirmed completion');
      return { ok: true };
    });
  }

  autoComplete(tx: Tx, b: Booking) { return this.complete(tx, b, { type: 'SYSTEM' }, 'Completed automatically: the customer did not respond in time'); }

  private paidTotal(payments: { amount: bigint; refundedAmount: bigint; status: string; collectedBy: string }[]) {
    return payments.filter((p) => ['SUCCEEDED', 'PARTIALLY_REFUNDED'].includes(p.status)).reduce((s, p) => s + Number(p.amount) - Number(p.refundedAmount), 0);
  }

  /** What the customer would get back under the policy agreed at booking. Shown before they commit to cancelling. */
  async cancellationQuote(bookingId: string) {
    const b = await this.prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { payments: true } });
    const daysBefore = Math.floor((b.eventDate.getTime() - today().getTime()) / 86_400_000);
    const refundBps = refundBpsForCancellation(b.cancellationTiers as unknown as CancellationTier[], daysBefore);
    const paid = this.paidTotal(b.payments);
    return { daysBefore, refundBps, paid, refundAmount: applyBps(paid, refundBps), policyName: b.cancellationPolicyName, policyBody: b.cancellationPolicyBody };
  }

  /** Unpaid bookings cancel straight away. Once money has moved, cancelling is a request an admin settles under the policy. */
  async customerCancel(auth: AuthCtx, id: string, reason: string) {
    const r = await this.prisma.$transaction(async (tx) => {
      const b = await this.locked(tx, id);
      if (!b || b.customerId !== auth.userId) throw new NotFoundException('Booking not found');
      const actor: Actor = { type: 'CUSTOMER', id: auth.userId };
      if (['PENDING_VENDOR_CONFIRMATION', 'AWAITING_PAYMENT'].includes(b.status)) {
        await this.transition(tx, b, 'CANCELLED', actor, reason, { cancelledAt: new Date(), cancelReason: reason, cancelledByType: 'CUSTOMER' });
        await this.availability.release(tx, b.id);
        await this.notifications.notifyVendor(tx, b.vendorId, { type: 'BOOKING_CANCELLED', title: 'Booking cancelled', body: `${b.code} was cancelled by the customer.`, link: `/vendor/bookings/${b.id}` });
        return { status: 'CANCELLED' };
      }
      await this.transition(tx, b, 'CANCELLATION_REQUESTED', actor, reason, { cancelReason: reason, cancelledByType: 'CUSTOMER' });
      await this.notifications.notifyVendor(tx, b.vendorId, { type: 'BOOKING_CANCEL_REQUESTED', title: 'Cancellation requested', body: `The customer asked to cancel ${b.code}.`, link: `/vendor/bookings/${b.id}` });
      await this.notifications.notifyAdmins(tx, 'bookings.manage', { type: 'BOOKING_CANCEL_REQUESTED', title: 'Cancellation requested', body: `${b.code} needs a decision.`, link: `/admin/bookings/${b.id}` });
      return { status: 'CANCELLATION_REQUESTED' };
    });
    return r;
  }

  /** A vendor backing out after payment owes the customer everything back, regardless of the cancellation tiers. */
  async vendorCancel(auth: AuthCtx, id: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const b = await this.locked(tx, id);
      if (!b || b.vendorId !== auth.vendor!.id) throw new NotFoundException('Booking not found');
      if (b.status === 'PENDING_VENDOR_CONFIRMATION') throw new ConflictException('Use Decline for unconfirmed requests.');
      await this.finishCancellation(tx, b, 10_000, { type: 'VENDOR', id: auth.userId }, reason, 'VENDOR');
      await this.notifications.notifyAdmins(tx, 'bookings.manage', { type: 'VENDOR_CANCELLED', title: 'Vendor cancelled a booking', body: `${b.code}: ${reason}`, link: `/admin/bookings/${b.id}` });
      return { ok: true };
    });
  }

  /** Cancels, frees the date, and raises refund requests newest payment first until the amount owed is covered. */
  async finishCancellation(tx: Tx, b: Booking, refundBps: number, actor: Actor, reason: string, by: string) {
    const payments = await tx.payment.findMany({ where: { bookingId: b.id, status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED'] } }, orderBy: { succeededAt: 'desc' } });
    const openRefunds = await tx.refund.findMany({ where: { paymentId: { in: payments.map((p) => p.id) }, status: { in: ['REQUESTED', 'APPROVED'] } } });
    let owed = applyBps(this.paidTotal(payments), refundBps) - openRefunds.reduce((s, r) => s + Number(r.amount), 0);
    const { disputeWindowDays } = await this.settings.all();
    await this.transition(tx, b, 'CANCELLED', actor, reason, { cancelledAt: new Date(), cancelReason: reason, cancelledByType: by, settlementDueAt: addDays(new Date(), disputeWindowDays) });
    await this.availability.release(tx, b.id);
    for (const p of payments) {
      if (owed <= 0) break;
      const available = Number(p.amount) - Number(p.refundedAmount) - openRefunds.filter((r) => r.paymentId === p.id).reduce((s, r) => s + Number(r.amount), 0);
      const amount = Math.min(available, owed);
      if (amount <= 0) continue;
      await tx.refund.create({ data: { code: await this.prisma.nextCode(tx, 'RF'), paymentId: p.id, amount, reason: `Cancellation: ${reason}`, requestedById: actor.id } });
      owed -= amount;
    }
    const total = applyBps(this.paidTotal(payments), refundBps);
    await this.notifications.notify(tx, { userId: b.customerId, type: 'BOOKING_CANCELLED', title: 'Booking cancelled', body: total > 0 ? `${b.code} was cancelled. A refund of ${formatPKR(total)} is being processed.` : `${b.code} was cancelled.`, link: `/account/bookings/${b.id}` });
    await this.notifications.notifyVendor(tx, b.vendorId, { type: 'BOOKING_CANCELLED', title: 'Booking cancelled', body: `${b.code} was cancelled.`, link: `/vendor/bookings/${b.id}` });
    if (total > 0) await this.notifications.notifyAdmins(tx, 'finance.manage', { type: 'REFUND_REQUESTED', title: 'Refund to process', body: `${b.code}: ${formatPKR(total)}`, link: '/admin/refunds' });
  }

  async adminCancel(auth: AuthCtx, id: string, reason: string, overrideRefundBps?: number) {
    return this.prisma.$transaction(async (tx) => {
      const b = await this.locked(tx, id);
      if (!b) throw new NotFoundException('Booking not found');
      const daysBefore = Math.floor((b.eventDate.getTime() - today().getTime()) / 86_400_000);
      const policyBps = refundBpsForCancellation(b.cancellationTiers as unknown as CancellationTier[], daysBefore);
      const refundBps = overrideRefundBps ?? policyBps;
      await this.finishCancellation(tx, b, refundBps, { type: 'ADMIN', id: auth.userId }, reason, 'ADMIN');
      await this.audit.record({ actorId: auth.userId, action: 'booking.cancel', entity: 'Booking', entityId: id, reason, after: { refundBps, policyBps, overridden: refundBps !== policyBps } }, tx);
      return { ok: true, refundBps };
    });
  }

  async rejectCancellation(auth: AuthCtx, id: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const b = await this.locked(tx, id);
      if (!b) throw new NotFoundException('Booking not found');
      if (b.status !== 'CANCELLATION_REQUESTED') throw new ConflictException('No cancellation request is open on this booking.');
      await this.transition(tx, b, 'CONFIRMED', { type: 'ADMIN', id: auth.userId }, reason);
      await this.audit.record({ actorId: auth.userId, action: 'booking.cancel_rejected', entity: 'Booking', entityId: id, reason }, tx);
      await this.notifications.notify(tx, { userId: b.customerId, type: 'BOOKING_CANCEL_REJECTED', title: 'Cancellation not approved', body: reason, link: `/account/bookings/${b.id}` });
      return { ok: true };
    });
  }

  async dispute(auth: AuthCtx, id: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const b = await this.locked(tx, id);
      if (!b || b.customerId !== auth.userId) throw new NotFoundException('Booking not found');
      if (b.status === 'COMPLETED' && b.settlementDueAt && b.settlementDueAt < new Date()) throw new ForbiddenException('The dispute window for this booking has closed. Please contact support.');
      await this.transition(tx, b, 'DISPUTED', { type: 'CUSTOMER', id: auth.userId }, reason);
      await tx.settlement.updateMany({ where: { bookingId: id, status: { in: ['NOT_DUE', 'DUE'] } }, data: { status: 'ON_HOLD' } });
      const ticket = await tx.supportTicket.create({ data: { code: await this.prisma.nextCode(tx, 'TK'), userId: auth.userId, bookingId: id, category: 'SERVICE_NOT_DELIVERED', subject: `Dispute on ${b.code}`, priority: 'HIGH', messages: { create: { senderId: auth.userId, body: reason } } } });
      await this.notifications.notifyVendor(tx, b.vendorId, { type: 'BOOKING_DISPUTED', title: 'Booking disputed', body: `The customer raised a dispute on ${b.code}.`, link: `/vendor/bookings/${b.id}` });
      await this.notifications.notifyAdmins(tx, 'bookings.manage', { type: 'BOOKING_DISPUTED', title: 'New dispute', body: `${b.code}: ${reason}`, link: `/admin/bookings/${b.id}` });
      return { ok: true, ticketId: ticket.id };
    });
  }

  async resolveDispute(auth: AuthCtx, id: string, outcome: 'CONFIRMED' | 'COMPLETED' | 'CANCELLED', reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const b = await this.locked(tx, id);
      if (!b) throw new NotFoundException('Booking not found');
      if (b.status !== 'DISPUTED') throw new ConflictException('This booking is not in dispute.');
      const actor: Actor = { type: 'ADMIN', id: auth.userId };
      await tx.settlement.updateMany({ where: { bookingId: id, status: 'ON_HOLD' }, data: { status: 'NOT_DUE' } });
      if (outcome === 'CANCELLED') await this.finishCancellation(tx, b, 10_000, actor, reason, 'ADMIN');
      else if (outcome === 'COMPLETED') { const { disputeWindowDays: _ } = await this.settings.all(); await this.transition(tx, b, 'COMPLETED', actor, reason, { completedAt: b.completedAt ?? new Date(), settlementDueAt: new Date() }); }
      else await this.transition(tx, b, 'CONFIRMED', actor, reason);
      await this.audit.record({ actorId: auth.userId, action: 'booking.dispute_resolved', entity: 'Booking', entityId: id, reason, after: { outcome } }, tx);
      await this.notifications.notify(tx, { userId: b.customerId, type: 'DISPUTE_RESOLVED', title: 'Dispute resolved', body: reason, link: `/account/bookings/${b.id}` });
      await this.notifications.notifyVendor(tx, b.vendorId, { type: 'DISPUTE_RESOLVED', title: 'Dispute resolved', body: reason, link: `/vendor/bookings/${b.id}` });
      return { ok: true };
    });
  }

  async listForCustomer(userId: string, q: PageQuery) {
    const p = paging(q); const where = { customerId: userId };
    const [items, total] = await Promise.all([
      this.prisma.booking.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take, include: { listing: { select: { title: true, slug: true, media: { take: 1 } } }, vendor: { select: { businessName: true } }, milestones: { orderBy: { sortOrder: 'asc' } } } }),
      this.prisma.booking.count({ where }),
    ]);
    return paged(items, total, p);
  }

  async listForVendor(auth: AuthCtx, q: PageQuery & { status?: string; upcoming?: string }) {
    const p = paging(q);
    const where: Prisma.BookingWhereInput = { vendorId: auth.vendor!.id, ...(q.status ? { status: q.status as DbStatus } : {}), ...(q.upcoming ? { eventDate: { gte: today() }, status: { in: ['CONFIRMED', 'IN_PROGRESS'] } } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.booking.findMany({ where, orderBy: { eventDate: 'asc' }, skip: p.skip, take: p.take, include: { listing: { select: { title: true } }, customer: { select: { name: true } } } }),
      this.prisma.booking.count({ where }),
    ]);
    return paged(items, total, p);
  }

  async getForCustomer(userId: string, id: string) {
    const b = await this.prisma.booking.findFirst({ where: { id, customerId: userId }, include: DETAIL });
    if (!b) throw new NotFoundException('Booking not found');
    // The vendor's direct contact details unlock only once the booking is confirmed.
    const unlocked = !!b.confirmedAt;
    const { adminNotes: _n, flagged: _f, commissionBps: _c, commissionTotal: _t, payments, ...rest } = b;
    return { ...rest, payments: payments.map(({ commission: _a, commissionReversed: _b, providerFee: _p, ...x }) => x), vendor: { ...b.vendor, phone: unlocked ? b.vendor.phone : null, whatsapp: unlocked ? b.vendor.whatsapp : null, address: unlocked ? b.vendor.address : null }, cancellation: await this.cancellationQuote(id), paid: this.paidTotal(b.payments), balance: Number(b.totalAmount) - this.paidTotal(b.payments) };
  }

  async getForVendor(auth: AuthCtx, id: string) {
    const b = await this.prisma.booking.findFirst({ where: { id, vendorId: auth.vendor!.id }, include: { ...DETAIL, settlements: true } });
    if (!b) throw new NotFoundException('Booking not found');
    const { adminNotes: _n, flagged: _f, customer, ...rest } = b;
    const unlocked = !!b.confirmedAt;
    const paid = this.paidTotal(b.payments);
    return { ...rest, customer: { id: customer.id, name: customer.name, phone: unlocked ? customer.phone : maskPhone(customer.phone), email: unlocked ? customer.email : null }, paid, balance: Number(b.totalAmount) - paid, netPayable: Number(b.totalAmount) - Number(b.commissionTotal) };
  }

  getAdmin(id: string) {
    return this.prisma.booking.findUniqueOrThrow({ where: { id }, include: { ...DETAIL, settlements: true, ledger: { orderBy: { createdAt: 'asc' } }, tickets: { select: { id: true, code: true, status: true, subject: true } } } });
  }

  async listAdmin(q: PageQuery & { status?: string; q?: string; flagged?: string }) {
    const p = paging(q);
    const where: Prisma.BookingWhereInput = {
      ...(q.status ? { status: q.status as DbStatus } : {}), ...(q.flagged ? { flagged: true } : {}),
      ...(q.q ? { OR: [{ code: { contains: q.q, mode: 'insensitive' } }, { customer: { name: { contains: q.q, mode: 'insensitive' } } }, { vendor: { businessName: { contains: q.q, mode: 'insensitive' } } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.booking.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take, include: { customer: { select: { name: true } }, vendor: { select: { businessName: true } }, listing: { select: { title: true } } } }),
      this.prisma.booking.count({ where }),
    ]);
    return paged(items, total, p);
  }

  countOpen() { return this.prisma.booking.count({ where: { status: { in: OPEN_STATUSES } } }); }

}
