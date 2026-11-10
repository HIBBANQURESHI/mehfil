import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { applyBps, computeQuotationTotals, EnquirySchema, QuotationSchema, splitByBps, formatPKR } from '@mehfil/shared';
import { AuthCtx } from '../common/auth';
import { maskPhone } from '../common/crypto';
import { addDays, addHours, dateOnly, paged, PageQuery, paging, today } from '../common/http';
import { PrismaService, Tx } from '../common/prisma.service';
import { SettingsService } from '../common/settings.service';
import { NotificationsService } from '../notifications/notifications.module';

const QUOTE_INCLUDE = { lines: { orderBy: { sortOrder: 'asc' as const } }, milestones: { orderBy: { sortOrder: 'asc' as const } }, cancellationPolicy: true } satisfies Prisma.QuotationInclude;

@Injectable()
export class EnquiriesService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService, private settings: SettingsService) {}

  // ---- Enquiries -----------------------------------------------------------

  /** One request can go to several vendors at once. Each gets a separate enquiry and never sees the others. */
  async create(auth: AuthCtx, b: z.output<typeof EnquirySchema>) {
    const eventDate = dateOnly(b.eventDate);
    if (eventDate < today()) throw new BadRequestException({ message: 'The event date must be in the future.', fields: { eventDate: 'Choose a future date' } });
    const listings = await this.prisma.listing.findMany({ where: { id: { in: b.listingIds }, status: 'PUBLISHED', vendor: { status: 'APPROVED' } }, include: { vendor: { select: { id: true, businessName: true } } } });
    if (listings.length !== new Set(b.listingIds).size) throw new BadRequestException('One or more of these vendors is no longer available.');
    if (b.weddingId && !(await this.prisma.wedding.findFirst({ where: { id: b.weddingId, customerId: auth.userId } }))) throw new NotFoundException('Wedding not found');
    if (b.eventId && !(await this.prisma.weddingEvent.findFirst({ where: { id: b.eventId, wedding: { customerId: auth.userId } } }))) throw new NotFoundException('Event not found');
    if (auth.vendor && listings.some((l) => l.vendorId === auth.vendor!.id)) throw new ForbiddenException('You cannot send an enquiry to your own business.');
    if (b.packageId && !(listings.length === 1 && await this.prisma.package.findFirst({ where: { id: b.packageId, listingId: listings[0].id } }))) throw new BadRequestException('That package is not available.');

    const { enquiryExpiryDays } = await this.settings.all();
    const groupId = randomUUID();
    return this.prisma.$transaction(async (tx) => {
      const created = [];
      for (const l of listings) {
        const enquiry = await tx.enquiry.create({
          data: { code: await this.prisma.nextCode(tx, 'ENQ'), groupId, customerId: auth.userId, vendorId: l.vendorId, listingId: l.id, packageId: b.packageId, weddingId: b.weddingId, eventId: b.eventId, eventDate, slot: b.slot, guestCount: b.guestCount, budget: b.budget, requirements: b.requirements, expiresAt: addDays(new Date(), enquiryExpiryDays) },
        });
        created.push(enquiry);
        await this.notifications.notifyVendor(tx, l.vendorId, { type: 'ENQUIRY_NEW', title: 'New enquiry', body: `${auth.name} asked about ${l.title} for ${b.eventDate}.`, link: `/vendor/enquiries/${enquiry.id}` });
      }
      return { groupId, enquiries: created };
    });
  }

  async listForCustomer(userId: string, q: PageQuery) {
    const p = paging(q); const where = { customerId: userId };
    const [items, total] = await Promise.all([
      this.prisma.enquiry.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take, include: { listing: { select: { title: true, slug: true, media: { take: 1 } } }, vendor: { select: { businessName: true } }, quotations: { where: { status: { in: ['SENT', 'VIEWED', 'ACCEPTED'] } }, select: { id: true, total: true, status: true } } } }),
      this.prisma.enquiry.count({ where }),
    ]);
    return paged(items, total, p);
  }

  async getForCustomer(userId: string, id: string) {
    const e = await this.prisma.enquiry.findFirst({ where: { id, customerId: userId }, include: { listing: { select: { title: true, slug: true } }, vendor: { select: { id: true, businessName: true } }, quotations: { where: { status: { not: 'DRAFT' } }, orderBy: { version: 'desc' }, include: QUOTE_INCLUDE } } });
    if (!e) throw new NotFoundException('Enquiry not found');
    return e;
  }

  async listForVendor(auth: AuthCtx, q: PageQuery & { status?: string }) {
    const p = paging(q);
    const where: Prisma.EnquiryWhereInput = { vendorId: auth.vendor!.id, ...(q.status ? { status: q.status as never } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.enquiry.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take, include: { listing: { select: { title: true } }, customer: { select: { name: true } } } }),
      this.prisma.enquiry.count({ where }),
    ]);
    return paged(items, total, p);
  }

  async getForVendor(auth: AuthCtx, id: string) {
    const e = await this.prisma.enquiry.findFirst({ where: { id, vendorId: auth.vendor!.id }, include: { listing: { select: { id: true, title: true, dailyCapacity: true, category: { select: { name: true, commissionBps: true } } } }, package: true, customer: { select: { name: true, phone: true } }, quotations: { orderBy: { version: 'desc' }, include: QUOTE_INCLUDE } } });
    if (!e) throw new NotFoundException('Enquiry not found');
    if (e.status === 'NEW') await this.prisma.enquiry.update({ where: { id }, data: { status: 'VIEWED', viewedAt: new Date() } });
    const { customer, ...rest } = e;
    return { ...rest, status: e.status === 'NEW' ? 'VIEWED' : e.status, customer: { name: customer.name, phone: maskPhone(customer.phone) } };
  }

  async decline(auth: AuthCtx, id: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const e = await tx.enquiry.findFirst({ where: { id, vendorId: auth.vendor!.id } });
      if (!e) throw new NotFoundException('Enquiry not found');
      if (!['NEW', 'VIEWED', 'RESPONDED'].includes(e.status)) throw new ConflictException('This enquiry can no longer be declined.');
      await this.notifications.notify(tx, { userId: e.customerId, type: 'ENQUIRY_DECLINED', title: 'Vendor unavailable', body: `Your enquiry ${e.code} was declined: ${reason}`, link: `/account/enquiries/${e.id}` });
      return tx.enquiry.update({ where: { id }, data: { status: 'DECLINED', declineReason: reason } });
    });
  }

  async closeByCustomer(userId: string, id: string) {
    const res = await this.prisma.enquiry.updateMany({ where: { id, customerId: userId, status: { in: ['NEW', 'VIEWED', 'RESPONDED', 'QUOTATION_SENT'] } }, data: { status: 'CLOSED' } });
    if (!res.count) throw new ConflictException('This enquiry cannot be closed.');
    return { ok: true };
  }

  // ---- Quotations ----------------------------------------------------------

  private async buildQuote(tx: Tx, vendorId: string, b: z.output<typeof QuotationSchema>) {
    const policy = await tx.cancellationPolicy.findFirst({ where: { id: b.cancellationPolicyId, active: true } });
    if (!policy) throw new BadRequestException('Please choose a valid cancellation policy.');
    const enquiry = await tx.enquiry.findFirst({ where: { id: b.enquiryId, vendorId }, include: { listing: { include: { category: true } }, vendor: true } });
    if (!enquiry) throw new NotFoundException('Enquiry not found');
    if (['CLOSED', 'DECLINED', 'EXPIRED'].includes(enquiry.status)) throw new ConflictException('This enquiry is closed.');
    let totals;
    try { totals = computeQuotationTotals(b.lines, b.discount, b.taxBps); }
    catch (e) { throw new BadRequestException((e as Error).message); }
    if (totals.total <= 0) throw new BadRequestException('The quotation total must be more than zero.');
    const amounts = splitByBps(totals.total, b.milestones.map((m) => m.shareBps));
    return { enquiry, totals, amounts };
  }

  private quoteData(b: z.output<typeof QuotationSchema>, totals: ReturnType<typeof computeQuotationTotals>, amounts: number[]) {
    return {
      subtotal: totals.subtotal, discount: b.discount, taxBps: b.taxBps, tax: totals.tax, total: totals.total, notes: b.notes, terms: b.terms, cancellationPolicyId: b.cancellationPolicyId, validForHours: b.validForHours ?? null,
      lines: { create: b.lines.map((l, i) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, amount: totals.lineAmounts[i], sortOrder: i })) },
      milestones: { create: b.milestones.map((m, i) => ({ label: m.label, shareBps: m.shareBps, amount: amounts[i], dueRule: m.dueRule, dueDays: m.dueDays, sortOrder: i })) },
    };
  }

  private assertCanQuote(auth: AuthCtx) {
    if (auth.vendor!.status !== 'APPROVED') throw new ForbiddenException('Your business must be verified before sending quotations.');
  }

  async createQuote(auth: AuthCtx, b: z.output<typeof QuotationSchema>) {
    this.assertCanQuote(auth);
    const vendorId = auth.vendor!.id;
    const created = await this.prisma.$transaction(async (tx) => {
      const { enquiry, totals, amounts } = await this.buildQuote(tx, vendorId, b);
      const prior = await tx.quotation.findMany({ where: { enquiryId: b.enquiryId } });
      if (prior.some((q) => q.status === 'ACCEPTED')) throw new ConflictException('A quotation on this enquiry has already been accepted.');
      if (prior.some((q) => ['SENT', 'VIEWED'].includes(q.status))) throw new ConflictException('A quotation is already with the customer. Revise it instead.');
      await tx.quotation.deleteMany({ where: { enquiryId: b.enquiryId, status: 'DRAFT' } });
      return tx.quotation.create({ data: { ...this.quoteData(b, totals, amounts), code: await this.prisma.nextCode(tx, 'QT'), enquiryId: b.enquiryId, vendorId, customerId: enquiry.customerId, version: prior.length + 1 } });
    });
    return b.send ? this.send(auth, created.id) : this.quoteForVendor(auth, created.id);
  }

  /** The commission category must be priced before a quotation can reach a customer, so a booking can never be created without a rate. */
  private async assertCommissionConfigured(tx: Tx, vendorId: string, listingId: string) {
    const [vendor, listing] = await Promise.all([tx.vendor.findUniqueOrThrow({ where: { id: vendorId } }), tx.listing.findUniqueOrThrow({ where: { id: listingId }, include: { category: true } })]);
    const bps = vendor.commissionBpsOverride ?? listing.category.commissionBps;
    if (bps === null) throw new ConflictException({ message: 'Mehfil has not finished setting up this category yet. Please try again shortly or contact support.', code: 'COMMISSION_NOT_CONFIGURED' });
    return bps;
  }

  async send(auth: AuthCtx, id: string) {
    this.assertCanQuote(auth);
    const { quoteValidityHours } = await this.settings.all();
    await this.prisma.$transaction(async (tx) => {
      const q = await tx.quotation.findFirst({ where: { id, vendorId: auth.vendor!.id }, include: { enquiry: { include: { listing: true } } } });
      if (!q) throw new NotFoundException('Quotation not found');
      if (q.status !== 'DRAFT') throw new ConflictException('Only drafts can be sent.');
      await this.assertCommissionConfigured(tx, q.vendorId, q.enquiry.listingId);
      await tx.quotation.update({ where: { id }, data: { status: 'SENT', sentAt: new Date(), validUntil: addHours(new Date(), q.validForHours ?? quoteValidityHours) } });
      await tx.enquiry.update({ where: { id: q.enquiryId }, data: { status: 'QUOTATION_SENT' } });
      await this.notifications.notify(tx, { userId: q.customerId, type: 'QUOTATION_RECEIVED', title: 'New quotation received', body: `${q.enquiry.listing.title} sent you a quotation of ${formatPKR(Number(q.total))}.`, link: `/account/quotations/${q.id}` });
    });
    return this.quoteForVendor(auth, id);
  }

  /** Replaces a live quotation with a new version. The customer can only ever accept the latest. */
  async revise(auth: AuthCtx, id: string, b: z.output<typeof QuotationSchema>) {
    this.assertCanQuote(auth);
    const vendorId = auth.vendor!.id;
    const { quoteValidityHours } = await this.settings.all();
    const created = await this.prisma.$transaction(async (tx) => {
      const old = await tx.quotation.findFirst({ where: { id, vendorId } });
      if (!old) throw new NotFoundException('Quotation not found');
      const superseded = await tx.quotation.updateMany({ where: { id, status: { in: ['SENT', 'VIEWED', 'REJECTED', 'EXPIRED'] } }, data: { status: 'REVISED' } });
      if (!superseded.count) throw new ConflictException('This quotation can no longer be revised.');
      const { enquiry, totals, amounts } = await this.buildQuote(tx, vendorId, { ...b, enquiryId: old.enquiryId });
      await this.assertCommissionConfigured(tx, vendorId, enquiry.listingId);
      const count = await tx.quotation.count({ where: { enquiryId: old.enquiryId } });
      const q = await tx.quotation.create({ data: { ...this.quoteData(b, totals, amounts), code: await this.prisma.nextCode(tx, 'QT'), enquiryId: old.enquiryId, vendorId, customerId: old.customerId, version: count + 1, status: 'SENT', sentAt: new Date(), validUntil: addHours(new Date(), b.validForHours ?? quoteValidityHours) } });
      await tx.enquiry.update({ where: { id: old.enquiryId }, data: { status: 'QUOTATION_SENT' } });
      await this.notifications.notify(tx, { userId: old.customerId, type: 'QUOTATION_REVISED', title: 'Quotation updated', body: `A vendor revised your quotation to ${formatPKR(totals.total)}.`, link: `/account/quotations/${q.id}` });
      return q;
    });
    return this.quoteForVendor(auth, created.id);
  }

  async withdraw(auth: AuthCtx, id: string) {
    const res = await this.prisma.quotation.updateMany({ where: { id, vendorId: auth.vendor!.id, status: { in: ['SENT', 'VIEWED'] } }, data: { status: 'WITHDRAWN' } });
    if (!res.count) throw new ConflictException('This quotation can no longer be withdrawn.');
    return { ok: true };
  }

  async listForVendorQuotes(auth: AuthCtx, q: PageQuery & { status?: string }) {
    const p = paging(q);
    const where: Prisma.QuotationWhereInput = { vendorId: auth.vendor!.id, ...(q.status ? { status: q.status as never } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.quotation.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take, include: { enquiry: { select: { code: true, eventDate: true, listing: { select: { title: true } } } }, customer: { select: { name: true } } } }),
      this.prisma.quotation.count({ where }),
    ]);
    return paged(items, total, p);
  }

  async quoteForVendor(auth: AuthCtx, id: string) {
    const q = await this.prisma.quotation.findFirst({ where: { id, vendorId: auth.vendor!.id }, include: { ...QUOTE_INCLUDE, booking: { select: { id: true, code: true, status: true } }, customer: { select: { name: true } }, enquiry: { include: { listing: { select: { title: true, categoryId: true, category: { select: { commissionBps: true } } } }, vendor: { select: { commissionBpsOverride: true } } } } } });
    if (!q) throw new NotFoundException('Quotation not found');
    const bps = q.enquiry.vendor.commissionBpsOverride ?? q.enquiry.listing.category.commissionBps;
    return { ...q, commissionPreview: bps === null ? null : { bps, amount: applyBps(Number(q.total), bps), net: Number(q.total) - applyBps(Number(q.total), bps) } };
  }

  /** Quotations for the comparison screen, latest live version per enquiry, with the facts a customer weighs up. */
  async listForCustomerQuotes(userId: string, q: PageQuery & { status?: string; groupId?: string }) {
    const p = paging(q);
    const where: Prisma.QuotationWhereInput = { customerId: userId, status: q.status ? (q.status as never) : { notIn: ['DRAFT', 'REVISED'] }, ...(q.groupId ? { enquiry: { groupId: q.groupId } } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.quotation.findMany({ where, orderBy: { sentAt: 'desc' }, skip: p.skip, take: p.take, include: { ...QUOTE_INCLUDE, vendor: { select: { businessName: true, avgRating: true, reviewCount: true, identityVerifiedAt: true, businessVerifiedAt: true } }, booking: { select: { id: true, code: true, status: true } }, enquiry: { select: { code: true, groupId: true, eventDate: true, slot: true, guestCount: true, listing: { select: { title: true, slug: true, capacityMax: true, amenities: true, area: { select: { name: true } }, city: { select: { name: true } }, media: { take: 1 } } } } } } }),
      this.prisma.quotation.count({ where }),
    ]);
    return paged(items, total, p);
  }

  async getForCustomerQuote(userId: string, id: string) {
    const q = await this.prisma.quotation.findFirst({ where: { id, customerId: userId, status: { notIn: ['DRAFT'] } }, include: { ...QUOTE_INCLUDE, vendor: { select: { businessName: true, avgRating: true, reviewCount: true } }, booking: { select: { id: true, code: true, status: true } }, enquiry: { select: { code: true, eventDate: true, slot: true, guestCount: true, listing: { select: { title: true, slug: true } } } } } });
    if (!q) throw new NotFoundException('Quotation not found');
    if (q.status === 'SENT') { await this.prisma.quotation.updateMany({ where: { id, status: 'SENT' }, data: { status: 'VIEWED', viewedAt: new Date() } }); return { ...q, status: 'VIEWED' as const }; }
    return q;
  }

  async rejectQuote(userId: string, id: string, reason?: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const q = await tx.quotation.findFirst({ where: { id, customerId: userId } });
      if (!q) throw new NotFoundException('Quotation not found');
      const res = await tx.quotation.updateMany({ where: { id, status: { in: ['SENT', 'VIEWED'] } }, data: { status: 'REJECTED', respondedAt: new Date() } });
      if (!res.count) throw new ConflictException('This quotation can no longer be rejected.');
      await this.notifications.notifyVendor(tx, q.vendorId, { type: 'QUOTATION_REJECTED', title: 'Quotation declined', body: `Your quotation ${q.code} was declined${reason ? `: ${reason}` : '.'}`, link: `/vendor/quotations/${q.id}` });
      return { ok: true };
    });
  }
}
