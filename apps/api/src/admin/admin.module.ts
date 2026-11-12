import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, Header, HttpCode, Module, NotFoundException, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { ADMIN_PERMISSIONS, CashResolveSchema, AdminInviteSchema, AdminRoleSchema, AreaSchema, CancellationPolicySchema, CategorySchema, CitySchema, CommissionReceiptSchema, DisputeResolutionSchema, LedgerAdjustmentSchema, ListingDecisionSchema, ManualPaymentSchema, PayoutDecisionSchema, ReasonSchema, RefundDecisionSchema, ReviewModerationSchema, SettingsSchema, TicketReplySchema, TicketUpdateSchema, UserStatusSchema, VendorCommissionSchema, VendorDecisionSchema, VendorFeatureSchema } from '@mehfil/shared';
import { AuditService } from '../common/audit.service';
import { AdminOnly, Auth, AuthCtx } from '../common/auth';
import { env } from '../common/config';
import { decrypt, maskIban } from '../common/crypto';
import { addDays, dateOnly, paged, PageQuery, paging, slugify, Z } from '../common/http';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../common/settings.service';
import { AuthModule } from '../auth/auth.module';
import { AuthService } from '../auth/auth.service';
import { BookingsService } from '../marketplace/bookings.service';
import { MarketplaceModule, recomputeRatings } from '../marketplace/marketplace.module';
import { NotificationsService } from '../notifications/notifications.module';
import { PaymentsService } from '../payments/payments.service';
import { CommissionService } from '../payments/commission.service';
import { VendorsModule, VendorsService } from '../vendors/vendors.module';

interface Range { from?: string; to?: string }
const range = (q: Range) => ({ gte: q.from ? dateOnly(q.from) : undefined, lt: q.to ? addDays(dateOnly(q.to), 1) : undefined });
const contains = (v: string) => ({ contains: v, mode: 'insensitive' as const });

/** Prefixes cells a spreadsheet would run as a formula, so exported customer text can't execute anything. */
function csv(rows: (string | number | null | undefined)[][]) {
  return rows.map((r) => r.map((c) => {
    let s = c === null || c === undefined ? '' : String(c);
    if (typeof c === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
}

// The class-level guard means a route added later without its own permission still needs an admin session.
@AdminOnly()
@Controller('admin')
export class AdminController {
  constructor(private prisma: PrismaService, private audit: AuditService, private settings: SettingsService, private bookings: BookingsService, private payments: PaymentsService, private vendors: VendorsService, private notifications: NotificationsService, private auth2: AuthService, private commission: CommissionService) {}

  /** Staff can only hand out permissions they hold themselves, which stops anyone promoting themselves through a role. */
  private assertGrantable(a: AuthCtx, permissions: string[]) {
    if (!a.admin!.isSuper && permissions.some((p) => !a.admin!.permissions.includes(p))) throw new ForbiddenException('You can only grant permissions you hold yourself.');
  }

  // ---- Overview ------------------------------------------------------------

  private async ledgerSum(type: Prisma.LedgerEntryWhereInput['type'], createdAt: ReturnType<typeof range>) {
    return Number((await this.prisma.ledgerEntry.aggregate({ where: { type, createdAt }, _sum: { amount: true } }))._sum.amount ?? 0);
  }

  @AdminOnly() @Get('overview') async overview(@Query() q: Range) {
    const createdAt = range(q);
    const [customers, vendors, pendingVendors, activeListings, totalBookings, confirmed, gmv, collected, commission, reversed, refunds, vendorDue, recentUsers, pendingList, recentPayments, failed, openTickets, disputes, reconcile, activity] = await Promise.all([
      this.prisma.user.count({ where: { admin: null, vendorMembers: { none: {} }, status: { not: 'DELETED' }, createdAt } }),
      this.prisma.vendor.count({ where: { createdAt } }),
      this.prisma.vendor.count({ where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } }),
      this.prisma.listing.count({ where: { status: 'PUBLISHED', vendor: { status: 'APPROVED' } } }),
      this.prisma.booking.count({ where: { createdAt } }),
      this.prisma.booking.count({ where: { confirmedAt: { ...createdAt, not: null }, status: { not: 'CANCELLED' } } }),
      this.prisma.booking.aggregate({ where: { confirmedAt: { ...createdAt, not: null }, status: { not: 'CANCELLED' } }, _sum: { totalAmount: true } }),
      this.ledgerSum('PAYMENT_RECEIVED', createdAt), this.ledgerSum('COMMISSION_EARNED', createdAt), this.ledgerSum('COMMISSION_REVERSED', createdAt), this.ledgerSum('REFUND_ISSUED', createdAt),
      this.prisma.settlement.aggregate({ where: { status: { in: ['NOT_DUE', 'DUE', 'ON_HOLD', 'PROCESSING'] } }, _sum: { payable: true } }),
      this.prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 6, where: { status: { not: 'DELETED' } }, select: { id: true, name: true, createdAt: true, vendorMembers: { take: 1, select: { vendor: { select: { businessName: true } } } } } }),
      this.prisma.vendor.findMany({ where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } }, orderBy: { submittedAt: 'asc' }, take: 6, select: { id: true, businessName: true, submittedAt: true, status: true } }),
      this.prisma.payment.findMany({ where: { status: { notIn: ['INITIATED'] } }, orderBy: { createdAt: 'desc' }, take: 6, select: { id: true, code: true, amount: true, status: true, createdAt: true, booking: { select: { id: true, code: true } } } }),
      this.prisma.payment.count({ where: { status: 'FAILED', createdAt: { gte: addDays(new Date(), -7) } } }),
      this.prisma.supportTicket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      this.prisma.booking.count({ where: { status: 'DISPUTED' } }),
      this.prisma.payment.count({ where: { status: 'RECONCILIATION_REQUIRED' } }),
      this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8, include: { actor: { select: { name: true } } } }),
    ]);
    return { kpis: { customers, vendors, pendingVendors, activeListings, totalBookings, confirmedBookings: confirmed, gmv: Number(gmv._sum.totalAmount ?? 0), collected, platformRevenue: commission - reversed, refunds, vendorPayable: Number(vendorDue._sum.payable ?? 0) }, recentUsers, pendingVendors: pendingList, recentPayments, alerts: { failedPayments: failed, openTickets, disputes, reconcile }, activity };
  }

  @AdminOnly('finance.view') @Get('analytics/revenue') async revenue(@Query('bucket') bucket = 'day', @Query() q: Range) {
    const unit = ['day', 'week', 'month', 'year'].includes(bucket) ? bucket : 'day';
    const from = q.from ? dateOnly(q.from) : addDays(new Date(), -30);
    const to = q.to ? addDays(dateOnly(q.to), 1) : addDays(new Date(), 1);
    const rows = await this.prisma.$queryRaw<{ bucket: Date; revenue: bigint; collected: bigint }[]>`
      SELECT date_trunc(${unit}, "createdAt") AS bucket,
        COALESCE(SUM(CASE WHEN "type" = 'COMMISSION_EARNED' THEN "amount" WHEN "type" = 'COMMISSION_REVERSED' THEN -"amount" ELSE 0 END), 0)::bigint AS revenue,
        COALESCE(SUM(CASE WHEN "type" = 'PAYMENT_RECEIVED' THEN "amount" ELSE 0 END), 0)::bigint AS collected
      FROM "LedgerEntry" WHERE "createdAt" >= ${from} AND "createdAt" < ${to} GROUP BY 1 ORDER BY 1`;
    return rows;
  }

  @AdminOnly('finance.view') @Get('analytics/categories') byCategory() {
    return this.prisma.$queryRaw`SELECT c."name", COUNT(b."id")::int AS bookings, COALESCE(SUM(b."totalAmount"), 0)::bigint AS value FROM "Booking" b JOIN "Listing" l ON l."id" = b."listingId" JOIN "Category" c ON c."id" = l."categoryId" WHERE b."confirmedAt" IS NOT NULL AND b."status" <> 'CANCELLED' GROUP BY c."name" ORDER BY value DESC`;
  }

  @AdminOnly('finance.view') @Get('analytics/top-vendors') topVendors() {
    return this.prisma.$queryRaw`SELECT v."id", v."businessName", v."avgRating", COUNT(b."id")::int AS bookings, COALESCE(SUM(b."totalAmount"), 0)::bigint AS value FROM "Vendor" v JOIN "Booking" b ON b."vendorId" = v."id" WHERE b."confirmedAt" IS NOT NULL AND b."status" <> 'CANCELLED' GROUP BY v."id" ORDER BY value DESC LIMIT 10`;
  }

  /** Everything still blocking real transactions, so nothing about launch readiness is left to memory. */
  @AdminOnly() @Get('setup') async setup() {
    const [unpriced, policies, cities, categories, vendors] = await Promise.all([
      this.prisma.category.findMany({ where: { active: true, commissionBps: null }, select: { name: true } }),
      this.prisma.cancellationPolicy.count({ where: { active: true } }), this.prisma.city.count({ where: { active: true } }), this.prisma.category.count({ where: { active: true } }), this.prisma.vendor.count({ where: { status: 'APPROVED' } }),
    ]);
    return { unpricedCategories: unpriced.map((c) => c.name), cancellationPolicies: policies, cities, categories, approvedVendors: vendors, paymentProvider: env.PAYMENT_PROVIDER, smsConfigured: env.SMS_PROVIDER !== 'console', emailConfigured: !!(env.RESEND_API_KEY || env.SMTP_URL), storage: env.STORAGE_DRIVER };
  }

  // ---- Customers -----------------------------------------------------------

  @AdminOnly('users.manage') @Get('users') async users(@Query() q: PageQuery & { q?: string; status?: string }) {
    const p = paging(q);
    const where: Prisma.UserWhereInput = { admin: null, vendorMembers: { none: {} }, ...(q.status ? { status: q.status as never } : { status: { not: 'DELETED' } }), ...(q.q ? { OR: [{ name: contains(q.q) }, { phone: contains(q.q) }, { email: contains(q.q) }] } : {}) };
    const [items, total] = await Promise.all([this.prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take, select: { id: true, name: true, phone: true, email: true, status: true, createdAt: true, _count: { select: { bookings: true, enquiries: true } } } }), this.prisma.user.count({ where })]);
    return paged(items, total, p);
  }
  @AdminOnly('users.manage') @Get('users/:id') user(@Param('id') id: string) {
    return this.prisma.user.findUniqueOrThrow({ where: { id }, select: { id: true, name: true, phone: true, email: true, status: true, statusReason: true, createdAt: true, phoneVerifiedAt: true, weddings: { select: { id: true, title: true, dateFrom: true } }, bookings: { orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, code: true, status: true, totalAmount: true, vendor: { select: { businessName: true } } } }, enquiries: { orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, code: true, status: true, vendor: { select: { businessName: true } } } }, tickets: { orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, code: true, subject: true, status: true } } } });
  }
  @AdminOnly('users.manage') @Patch('users/:id/status') async userStatus(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(UserStatusSchema)) b: { status: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED'; reason: string }) {
    if (id === a.userId) throw new ForbiddenException('You cannot change your own status.');
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.user.findUniqueOrThrow({ where: { id }, include: { admin: true } });
      if (before.admin) throw new ForbiddenException('Staff accounts are managed under Staff and roles.');
      await tx.user.update({ where: { id }, data: { status: b.status, statusReason: b.reason } });
      if (b.status !== 'ACTIVE') await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.record({ actorId: a.userId, action: 'user.status', entity: 'User', entityId: id, reason: b.reason, before: { status: before.status }, after: { status: b.status } }, tx);
      return { ok: true };
    });
  }

  // ---- Vendors -------------------------------------------------------------

  @AdminOnly('vendors.review') @Get('vendors') async vendorList(@Query() q: PageQuery & { q?: string; status?: string }) {
    const p = paging(q);
    const statuses = q.status === 'PENDING' ? { in: ['SUBMITTED', 'UNDER_REVIEW'] as never[] } : q.status ? (q.status as never) : undefined;
    const where: Prisma.VendorWhereInput = { status: statuses, ...(q.q ? { businessName: contains(q.q) } : {}) };
    const [items, total] = await Promise.all([this.prisma.vendor.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take, select: { id: true, businessName: true, slug: true, status: true, submittedAt: true, createdAt: true, avgRating: true, featuredUntil: true, primaryCategory: { select: { name: true } }, city: { select: { name: true } }, _count: { select: { listings: true, bookings: true } } } }), this.prisma.vendor.count({ where })]);
    return paged(items, total, p);
  }
  @AdminOnly('vendors.review') @Get('vendors/:id') async vendor(@Param('id') id: string) {
    const v = await this.prisma.vendor.findUniqueOrThrow({ where: { id }, include: { primaryCategory: true, city: true, area: true, documents: { orderBy: { createdAt: 'desc' }, select: { id: true, type: true, filename: true, mimeType: true, size: true, reviewStatus: true, reviewNote: true, createdAt: true } }, listings: { include: { category: true, _count: { select: { media: true, packages: true } } } }, members: { include: { user: { select: { name: true, email: true, phone: true } } } } } });
    const { iban, ...rest } = v;
    return { ...rest, ibanMasked: iban ? maskIban(decrypt(iban)) : null };
  }
  @AdminOnly('vendors.review') @HttpCode(200) @Post('vendors/:id/decision') decide(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(VendorDecisionSchema)) b: { decision: string; reason?: string | null }) {
    return this.prisma.$transaction(async (tx) => {
      const v = await tx.vendor.findUniqueOrThrow({ where: { id }, include: { documents: true } });
      const inReview = ['SUBMITTED', 'UNDER_REVIEW'].includes(v.status);
      const bad = (msg: string) => new ConflictException(msg);
      let title = '', body = '';
      if (b.decision === 'APPROVE') {
        if (!inReview) throw bad('Only applications under review can be approved.');
        const approved = v.documents.filter((d) => d.reviewStatus === 'APPROVED').map((d) => d.type);
        if (!approved.includes('CNIC_FRONT') || !approved.includes('CNIC_BACK')) throw bad('Approve the CNIC front and back documents first.');
        const businessDoc = approved.includes('BUSINESS_REGISTRATION') || approved.includes('OWNERSHIP_PROOF') || approved.includes('NTN_CERTIFICATE');
        await tx.vendor.update({ where: { id }, data: { status: 'APPROVED', approvedAt: new Date(), statusReason: null, identityVerifiedAt: new Date(), businessVerifiedAt: businessDoc ? new Date() : null } });
        await tx.listing.updateMany({ where: { vendorId: id, status: 'PENDING_REVIEW' }, data: { status: 'PUBLISHED', publishedAt: new Date() } });
        title = 'Your business is verified'; body = 'Your listings are live and you can now receive enquiries.';
      } else if (b.decision === 'REJECT' || b.decision === 'REQUEST_CHANGES') {
        if (!inReview) throw bad('Only applications under review can be decided.');
        const status = b.decision === 'REJECT' ? 'REJECTED' : 'CHANGES_REQUIRED';
        await tx.vendor.update({ where: { id }, data: { status, statusReason: b.reason } });
        await tx.listing.updateMany({ where: { vendorId: id, status: 'PENDING_REVIEW' }, data: { status: 'DRAFT' } });
        title = b.decision === 'REJECT' ? 'Application not approved' : 'Changes needed on your application'; body = b.reason!;
      } else if (b.decision === 'SUSPEND') {
        if (v.status !== 'APPROVED') throw bad('Only approved vendors can be suspended.');
        await tx.vendor.update({ where: { id }, data: { status: 'SUSPENDED', statusReason: b.reason } });
        title = 'Your business has been suspended'; body = b.reason!;
      } else {
        if (v.status !== 'SUSPENDED') throw bad('Only suspended vendors can be reactivated.');
        await tx.vendor.update({ where: { id }, data: { status: 'APPROVED', statusReason: null } });
        title = 'Your business is active again'; body = 'Your listings are visible to customers again.';
      }
      await this.audit.record({ actorId: a.userId, action: `vendor.${b.decision.toLowerCase()}`, entity: 'Vendor', entityId: id, reason: b.reason, before: { status: v.status } }, tx);
      await this.notifications.notifyVendor(tx, id, { type: 'VENDOR_DECISION', title, body, link: '/vendor' });
      return { ok: true };
    });
  }
  @AdminOnly('vendors.review') @HttpCode(200) @Post('vendor-documents/:id/review') async reviewDoc(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(z.object({ status: z.enum(['APPROVED', 'REJECTED']), note: z.string().trim().max(500).optional() }))) b: { status: 'APPROVED' | 'REJECTED'; note?: string }) {
    return this.prisma.$transaction(async (tx) => {
      const doc = await tx.vendorDocument.update({ where: { id }, data: { reviewStatus: b.status, reviewNote: b.note, reviewedById: a.userId, reviewedAt: new Date() } });
      await tx.vendor.updateMany({ where: { id: doc.vendorId, status: 'SUBMITTED' }, data: { status: 'UNDER_REVIEW' } });
      await this.audit.record({ actorId: a.userId, action: 'vendor_document.review', entity: 'VendorDocument', entityId: id, after: { status: b.status }, reason: b.note }, tx);
      return { ok: true };
    });
  }
  /** Every look at an identity document is logged against the staff member. */
  @AdminOnly('vendors.review') @Get('vendor-documents/:id/file') async docFile(@Auth() a: AuthCtx, @Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const { doc, buffer } = await this.vendors.documentFile(id);
    await this.audit.record({ actorId: a.userId, action: 'vendor_document.viewed', entity: 'VendorDocument', entityId: id, ip: req.ip });
    res.setHeader('Content-Type', doc.mimeType); res.setHeader('Content-Disposition', 'inline'); res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.send(buffer);
  }
  @AdminOnly('vendors.review') @Patch('vendors/:id/feature') async feature(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(VendorFeatureSchema)) b: { featuredUntil: string | null }) {
    await this.prisma.vendor.update({ where: { id }, data: { featuredUntil: b.featuredUntil ? dateOnly(b.featuredUntil) : null } });
    await this.audit.record({ actorId: a.userId, action: 'vendor.feature', entity: 'Vendor', entityId: id, after: b });
    return { ok: true };
  }
  @AdminOnly('finance.manage') @Patch('vendors/:id/commission') async vendorCommission(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(VendorCommissionSchema)) b: { commissionBpsOverride: number | null; reason: string }) {
    const before = await this.prisma.vendor.findUniqueOrThrow({ where: { id } });
    await this.prisma.vendor.update({ where: { id }, data: { commissionBpsOverride: b.commissionBpsOverride } });
    await this.audit.record({ actorId: a.userId, action: 'vendor.commission_override', entity: 'Vendor', entityId: id, reason: b.reason, before: { bps: before.commissionBpsOverride }, after: { bps: b.commissionBpsOverride } });
    return { ok: true };
  }

  // ---- Listings ------------------------------------------------------------

  @AdminOnly('listings.manage') @Get('listings') async listings(@Query() q: PageQuery & { q?: string; status?: string }) {
    const p = paging(q);
    const where: Prisma.ListingWhereInput = { ...(q.status ? { status: q.status as never } : {}), ...(q.q ? { title: contains(q.q) } : {}) };
    const [items, total] = await Promise.all([this.prisma.listing.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: p.skip, take: p.take, include: { vendor: { select: { businessName: true, status: true } }, category: { select: { name: true } }, city: { select: { name: true } }, media: { take: 1 }, _count: { select: { packages: true } } } }), this.prisma.listing.count({ where })]);
    return paged(items, total, p);
  }
  @AdminOnly('listings.manage') @HttpCode(200) @Post('listings/:id/decision') async listingDecision(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(ListingDecisionSchema)) b: { decision: string; reason?: string | null }) {
    const l = await this.prisma.listing.findUniqueOrThrow({ where: { id }, include: { vendor: true } });
    if (b.decision === 'APPROVE' && l.vendor.status !== 'APPROVED') throw new ConflictException('Verify the vendor before publishing their listings.');
    if (b.decision !== 'APPROVE' && !b.reason) throw new BadRequestException({ message: 'A reason is required', fields: { reason: 'A reason is required' } });
    const data = b.decision === 'APPROVE' ? { status: 'PUBLISHED' as const, publishedAt: l.publishedAt ?? new Date(), statusReason: null } : b.decision === 'REJECT' ? { status: 'REJECTED' as const, statusReason: b.reason } : { status: 'PAUSED' as const, statusReason: b.reason };
    await this.prisma.$transaction(async (tx) => {
      await tx.listing.update({ where: { id }, data });
      await this.audit.record({ actorId: a.userId, action: `listing.${b.decision.toLowerCase()}`, entity: 'Listing', entityId: id, reason: b.reason, before: { status: l.status } }, tx);
      await this.notifications.notifyVendor(tx, l.vendorId, { type: 'LISTING_DECISION', title: `Listing ${data.status.toLowerCase()}: ${l.title}`, body: b.reason ?? 'Your listing is live.', link: `/vendor/listings/${id}` });
    });
    return { ok: true };
  }

  // ---- Catalog and policies ------------------------------------------------

  @AdminOnly('catalog.manage') @Get('categories') allCategories() { return this.prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }); }
  @AdminOnly('catalog.manage') @Post('categories') async addCategory(@Auth() a: AuthCtx, @Body(Z(CategorySchema)) b: any) {
    const c = await this.prisma.category.create({ data: { ...b, slug: slugify(b.name) } });
    await this.audit.record({ actorId: a.userId, action: 'category.create', entity: 'Category', entityId: c.id, after: b });
    return c;
  }
  @AdminOnly('catalog.manage') @Patch('categories/:id') async updateCategory(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(CategorySchema)) b: any) {
    const before = await this.prisma.category.findUniqueOrThrow({ where: { id } });
    if (b.commissionBps !== undefined && b.commissionBps !== before.commissionBps && !a.admin!.isSuper && !a.admin!.permissions.includes('finance.manage')) throw new ForbiddenException('Changing commission requires finance permission.');
    const c = await this.prisma.category.update({ where: { id }, data: b });
    await this.audit.record({ actorId: a.userId, action: 'category.update', entity: 'Category', entityId: id, before: { commissionBps: before.commissionBps, name: before.name }, after: { commissionBps: c.commissionBps, name: c.name } });
    return c;
  }
  @AdminOnly('catalog.manage') @Get('cities') allCities() { return this.prisma.city.findMany({ include: { areas: { orderBy: { name: 'asc' } } }, orderBy: { name: 'asc' } }); }
  @AdminOnly('catalog.manage') @Post('cities') addCity(@Body(Z(CitySchema)) b: any) { return this.prisma.city.create({ data: { ...b, slug: slugify(b.name) } }); }
  @AdminOnly('catalog.manage') @Patch('cities/:id') updateCity(@Param('id') id: string, @Body(Z(CitySchema)) b: any) { return this.prisma.city.update({ where: { id }, data: b }); }
  @AdminOnly('catalog.manage') @Post('cities/:id/areas') addArea(@Param('id') id: string, @Body(Z(AreaSchema)) b: any) { return this.prisma.area.create({ data: { name: b.name, slug: slugify(b.name), cityId: id } }); }
  @AdminOnly('catalog.manage') @Delete('areas/:id') async rmArea(@Param('id') id: string) { await this.prisma.area.delete({ where: { id } }); return { ok: true }; }

  @AdminOnly('settings.manage') @Get('cancellation-policies') policies() { return this.prisma.cancellationPolicy.findMany({ orderBy: { createdAt: 'desc' } }); }
  @AdminOnly('settings.manage') @Post('cancellation-policies') async addPolicy(@Auth() a: AuthCtx, @Body(Z(CancellationPolicySchema)) b: any) {
    const p = await this.prisma.cancellationPolicy.create({ data: b });
    await this.audit.record({ actorId: a.userId, action: 'policy.create', entity: 'CancellationPolicy', entityId: p.id, after: b });
    return p;
  }
  @AdminOnly('settings.manage') @Patch('cancellation-policies/:id') async updatePolicy(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(CancellationPolicySchema)) b: any) {
    const before = await this.prisma.cancellationPolicy.findUniqueOrThrow({ where: { id } });
    const p = await this.prisma.cancellationPolicy.update({ where: { id }, data: b });
    await this.audit.record({ actorId: a.userId, action: 'policy.update', entity: 'CancellationPolicy', entityId: id, before, after: b });
    return p;
  }
  @AdminOnly('settings.manage') @Get('settings') getSettings() { return this.settings.all(); }
  @AdminOnly('settings.manage') @Patch('settings') async setSettings(@Auth() a: AuthCtx, @Body(Z(SettingsSchema)) b: any) {
    const before = await this.settings.all();
    const after = await this.settings.update(b);
    await this.audit.record({ actorId: a.userId, action: 'settings.update', entity: 'PlatformSetting', before, after });
    return after;
  }

  // ---- Bookings ------------------------------------------------------------

  @AdminOnly('bookings.manage') @Get('bookings') bookingList(@Query() q: any) { return this.bookings.listAdmin(q); }
  @AdminOnly('bookings.manage') @Get('bookings/:id') booking(@Param('id') id: string) { return this.bookings.getAdmin(id); }
  @AdminOnly('bookings.manage') @HttpCode(200) @Post('bookings/:id/cancel') cancel(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(z.object({ reason: z.string().trim().min(1).max(1000), refundBps: z.number().int().min(0).max(10000).optional() }))) b: { reason: string; refundBps?: number }) { return this.bookings.adminCancel(a, id, b.reason, b.refundBps); }
  @AdminOnly('bookings.manage') @HttpCode(200) @Post('bookings/:id/reject-cancellation') rejectCancel(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(ReasonSchema)) b: { reason: string }) { return this.bookings.rejectCancellation(a, id, b.reason); }
  @AdminOnly('bookings.manage') @HttpCode(200) @Post('bookings/:id/resolve-dispute') resolve(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(DisputeResolutionSchema)) b: any) { return this.bookings.resolveDispute(a, id, b.outcome, b.reason); }
  @AdminOnly('bookings.manage') @Patch('bookings/:id/notes') async notes(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(z.object({ adminNotes: z.string().max(4000).optional(), flagged: z.boolean().optional() }))) b: any) {
    await this.prisma.booking.update({ where: { id }, data: b });
    await this.audit.record({ actorId: a.userId, action: 'booking.notes', entity: 'Booking', entityId: id, after: { flagged: b.flagged } });
    return { ok: true };
  }
  @AdminOnly('bookings.manage') @Get('enquiries') async enquiries(@Query() q: PageQuery & { status?: string }) {
    const p = paging(q); const where: Prisma.EnquiryWhereInput = q.status ? { status: q.status as never } : {};
    const [items, total] = await Promise.all([this.prisma.enquiry.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take, include: { customer: { select: { name: true } }, vendor: { select: { businessName: true } }, listing: { select: { title: true } } } }), this.prisma.enquiry.count({ where })]);
    return paged(items, total, p);
  }
  @AdminOnly('bookings.manage') @Get('quotations') async quotations(@Query() q: PageQuery & { status?: string }) {
    const p = paging(q); const where: Prisma.QuotationWhereInput = q.status ? { status: q.status as never } : { status: { not: 'DRAFT' } };
    const [items, total] = await Promise.all([this.prisma.quotation.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take, include: { customer: { select: { name: true } }, vendor: { select: { businessName: true } } } }), this.prisma.quotation.count({ where })]);
    return paged(items, total, p);
  }

  // ---- Finance -------------------------------------------------------------

  @AdminOnly('finance.view') @Get('payments') async paymentList(@Query() q: PageQuery & { status?: string }) {
    const p = paging(q); const where: Prisma.PaymentWhereInput = q.status ? { status: q.status as never } : {};
    const [items, total] = await Promise.all([this.prisma.payment.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take, include: { booking: { select: { id: true, code: true, customer: { select: { name: true } }, vendor: { select: { businessName: true } } } }, milestone: { select: { label: true } } } }), this.prisma.payment.count({ where })]);
    return paged(items, total, p);
  }
  @AdminOnly('finance.manage') @HttpCode(200) @Post('bookings/:id/manual-payment') manual(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(ManualPaymentSchema)) b: any) { return this.payments.recordManual(a, id, b.milestoneId, b.reference, b.reason); }
  @AdminOnly('finance.view') @Get('refunds') async refunds(@Query() q: PageQuery & { status?: string }) {
    const p = paging(q); const where: Prisma.RefundWhereInput = q.status ? { status: q.status as never } : {};
    const [items, total] = await Promise.all([this.prisma.refund.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take, include: { payment: { select: { code: true, amount: true, booking: { select: { id: true, code: true, customer: { select: { name: true } }, vendor: { select: { businessName: true } } } } } } } }), this.prisma.refund.count({ where })]);
    return paged(items, total, p);
  }
  @AdminOnly('finance.manage') @HttpCode(200) @Post('refunds/:id/decision') refundDecision(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(RefundDecisionSchema)) b: any) { return this.payments.decideRefund(a, id, b.approve, b.amount, b.reason); }
  @AdminOnly('finance.view') @Get('payouts') async payouts(@Query() q: PageQuery & { status?: string }) {
    const p = paging(q); const where: Prisma.PayoutWhereInput = q.status ? { status: q.status as never } : {};
    const [rows, total] = await Promise.all([this.prisma.payout.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take, include: { vendor: { select: { businessName: true } } } }), this.prisma.payout.count({ where })]);
    return paged(rows.map(({ iban, ...r }) => ({ ...r, ibanMasked: maskIban(decrypt(iban)) })), total, p);
  }
  @AdminOnly('finance.manage') @Get('payouts/:id/bank') async payoutBank(@Auth() a: AuthCtx, @Param('id') id: string, @Req() req: Request) {
    const p = await this.prisma.payout.findUniqueOrThrow({ where: { id } });
    await this.audit.record({ actorId: a.userId, action: 'payout.bank_details_viewed', entity: 'Payout', entityId: id, ip: req.ip });
    return { bankName: p.bankName, accountTitle: p.accountTitle, iban: decrypt(p.iban) };
  }
  @AdminOnly('finance.manage') @HttpCode(200) @Post('payouts/:id/decision') payoutDecision(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(PayoutDecisionSchema)) b: any) { return this.payments.decidePayout(a, id, b.action, b.reference, b.reason); }
  @AdminOnly('finance.view') @Get('ledger') async ledger(@Query() q: PageQuery & Range & { type?: string }) {
    const p = paging(q); const where: Prisma.LedgerEntryWhereInput = { createdAt: range(q), ...(q.type ? { type: q.type as never } : {}) };
    const [items, total] = await Promise.all([this.prisma.ledgerEntry.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take, include: { booking: { select: { code: true } }, vendor: { select: { businessName: true } } } }), this.prisma.ledgerEntry.count({ where })]);
    return paged(items, total, p);
  }
  @AdminOnly('bookings.manage') @Get('cash-receipts') cashReceipts(@Query('status') status?: string) {
    return this.prisma.cashReceipt.findMany({ where: status ? { status: status as never } : { status: { in: ['PENDING', 'DISPUTED'] } }, orderBy: { createdAt: 'desc' }, take: 200, include: { booking: { select: { id: true, code: true, customer: { select: { name: true } }, vendor: { select: { businessName: true } } } } } });
  }
  @AdminOnly('bookings.manage') @HttpCode(200) @Post('cash-receipts/:id/resolve') resolveCash(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(CashResolveSchema)) b: any) { return this.payments.resolveCash(a, id, b.action, b.reason); }
  @AdminOnly('finance.view') @Get('commission-statements') async statements() {
    const vendors = await this.prisma.vendor.findMany({ where: { bookings: { some: { payments: { some: { collectedBy: 'VENDOR' } } } } }, select: { id: true, businessName: true } });
    const rows = await Promise.all(vendors.map(async (v) => ({ ...v, ...(await this.commission.statement(v.id)).totals })));
    return rows.sort((a, b) => b.overdue - a.overdue || b.outstanding - a.outstanding);
  }
  @AdminOnly('finance.view') @Get('commissions') async commissions() {
    return this.prisma.$queryRaw`
      SELECT v."id", v."businessName",
        COALESCE(SUM(CASE WHEN l."type" = 'COMMISSION_EARNED' THEN l."amount" WHEN l."type" = 'COMMISSION_REVERSED' THEN -l."amount" ELSE 0 END), 0)::bigint AS commission,
        COALESCE(SUM(CASE WHEN l."type" = 'PAYMENT_RECEIVED' THEN l."amount" ELSE 0 END), 0)::bigint AS collected,
        COALESCE(SUM(CASE WHEN l."type" = 'COMMISSION_RECEIVED' THEN l."amount" ELSE 0 END), 0)::bigint AS received,
        COALESCE((SELECT SUM(p."commission" - p."commissionReversed") FROM "Payment" p JOIN "Booking" b ON b."id" = p."bookingId" WHERE b."vendorId" = v."id" AND p."collectedBy" = 'VENDOR'), 0)::bigint AS "directCommission"
      FROM "Vendor" v JOIN "LedgerEntry" l ON l."vendorId" = v."id" GROUP BY v."id" ORDER BY commission DESC`;
  }
  @AdminOnly('finance.manage') @Post('commission-receipts') async commissionReceipt(@Auth() a: AuthCtx, @Body(Z(CommissionReceiptSchema)) b: { vendorId: string; amount: number; reference: string }) {
    return this.prisma.$transaction(async (tx) => {
      const e = await tx.ledgerEntry.create({ data: { type: 'COMMISSION_RECEIVED', amount: b.amount, vendorId: b.vendorId, actorId: a.userId, memo: b.reference } });
      await this.audit.record({ actorId: a.userId, action: 'commission.received', entity: 'LedgerEntry', entityId: e.id, after: b }, tx);
      return e;
    });
  }
  /** Mistakes are corrected with a new entry and a stated reason. Existing entries cannot be edited, even by a Super Admin. */
  @AdminOnly('finance.manage') @Post('ledger/adjustments') async adjust(@Auth() a: AuthCtx, @Body(Z(LedgerAdjustmentSchema)) b: { vendorId?: string | null; bookingId?: string | null; amount: number; memo: string }) {
    return this.prisma.$transaction(async (tx) => {
      const e = await tx.ledgerEntry.create({ data: { type: 'ADJUSTMENT', amount: b.amount, vendorId: b.vendorId, bookingId: b.bookingId, memo: b.memo, actorId: a.userId } });
      await this.audit.record({ actorId: a.userId, action: 'ledger.adjustment', entity: 'LedgerEntry', entityId: e.id, reason: b.memo, after: { amount: b.amount } }, tx);
      return e;
    });
  }

  // ---- Reviews and support -------------------------------------------------

  @AdminOnly('reviews.moderate') @Get('reviews') async reviews(@Query() q: PageQuery & { reported?: string }) {
    const p = paging(q); const where: Prisma.ReviewWhereInput = q.reported ? { reports: { some: { resolvedAt: null } } } : {};
    const [items, total] = await Promise.all([this.prisma.review.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take, include: { customer: { select: { name: true } }, vendor: { select: { businessName: true } }, listing: { select: { title: true } }, reports: { where: { resolvedAt: null } } } }), this.prisma.review.count({ where })]);
    return paged(items, total, p);
  }
  @AdminOnly('reviews.moderate') @HttpCode(200) @Post('reviews/:id/moderate') moderate(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(ReviewModerationSchema)) b: { action: 'HIDE' | 'RESTORE' | 'DISMISS'; reason: string }) {
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.review.findUniqueOrThrow({ where: { id } });
      if (b.action !== 'DISMISS') { await tx.review.update({ where: { id }, data: { status: b.action === 'HIDE' ? 'HIDDEN' : 'PUBLISHED', moderationNote: b.reason } }); await recomputeRatings(tx as PrismaService, r.vendorId, r.listingId); }
      await tx.reviewReport.updateMany({ where: { reviewId: id, resolvedAt: null }, data: { resolvedAt: new Date() } });
      await this.audit.record({ actorId: a.userId, action: `review.${b.action.toLowerCase()}`, entity: 'Review', entityId: id, reason: b.reason }, tx);
      return { ok: true };
    });
  }
  @AdminOnly('support.manage') @Get('tickets') async tickets(@Query() q: PageQuery & { status?: string }) {
    const p = paging(q); const where: Prisma.SupportTicketWhereInput = q.status ? { status: q.status as never } : {};
    const [items, total] = await Promise.all([this.prisma.supportTicket.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: p.skip, take: p.take, include: { user: { select: { name: true } }, assignedTo: { select: { name: true } }, booking: { select: { code: true } } } }), this.prisma.supportTicket.count({ where })]);
    return paged(items, total, p);
  }
  @AdminOnly('support.manage') @Get('tickets/:id') ticket(@Param('id') id: string) { return this.prisma.supportTicket.findUniqueOrThrow({ where: { id }, include: { user: { select: { id: true, name: true, phone: true, email: true } }, assignedTo: { select: { id: true, name: true } }, booking: { select: { id: true, code: true, status: true } }, messages: { orderBy: { createdAt: 'asc' } } } }); }
  @AdminOnly('support.manage') @Patch('tickets/:id') updateTicket(@Param('id') id: string, @Body(Z(TicketUpdateSchema)) b: any) { return this.prisma.supportTicket.update({ where: { id }, data: b }); }
  @AdminOnly('support.manage') @Post('tickets/:id/messages') replyTicket(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(TicketReplySchema)) b: { body: string; internal: boolean }) {
    return this.prisma.$transaction(async (tx) => {
      const t = await tx.supportTicket.update({ where: { id }, data: { status: b.internal ? undefined : 'IN_PROGRESS' } });
      const m = await tx.ticketMessage.create({ data: { ticketId: id, senderId: a.userId, fromStaff: true, internal: b.internal, body: b.body } });
      if (!b.internal) await this.notifications.notify(tx, { userId: t.userId, type: 'TICKET_REPLY', title: `Reply on ${t.code}`, body: b.body.slice(0, 160), link: `/account/support/${t.id}` });
      return m;
    });
  }
  @AdminOnly('support.manage') @Get('contact-messages') contactMessages() { return this.prisma.contactMessage.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }); }

  // ---- Staff and audit -----------------------------------------------------

  @AdminOnly('admins.manage') @Get('permissions') permissions() { return ADMIN_PERMISSIONS; }
  @AdminOnly('admins.manage') @Get('roles') roles() { return this.prisma.adminRole.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { members: true } } } }); }
  @AdminOnly('admins.manage') @Post('roles') async addRole(@Auth() a: AuthCtx, @Body(Z(AdminRoleSchema)) b: any) { this.assertGrantable(a, b.permissions); const r = await this.prisma.adminRole.create({ data: b }); await this.audit.record({ actorId: a.userId, action: 'admin_role.create', entity: 'AdminRole', entityId: r.id, after: b }); return r; }
  @AdminOnly('admins.manage') @Patch('roles/:id') async updateRole(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(AdminRoleSchema)) b: any) {
    const before = await this.prisma.adminRole.findUniqueOrThrow({ where: { id } });
    if (before.isSystem) throw new ForbiddenException('System roles cannot be changed.');
    this.assertGrantable(a, [...before.permissions, ...b.permissions]);
    const r = await this.prisma.adminRole.update({ where: { id }, data: b });
    await this.audit.record({ actorId: a.userId, action: 'admin_role.update', entity: 'AdminRole', entityId: id, before, after: b });
    return r;
  }
  @AdminOnly('admins.manage') @Get('staff') async staff() {
    const [members, invites] = await Promise.all([
      this.prisma.adminMember.findMany({ include: { user: { select: { id: true, name: true, email: true } }, role: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } }),
      this.prisma.invite.findMany({ where: { kind: 'ADMIN', acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true, email: true, expiresAt: true } }),
    ]);
    return { members: members.map(({ totpSecret: _s, lastTotpStep: _t, ...m }) => m), invites };
  }
  @AdminOnly('admins.manage') @Post('staff/invite') async inviteStaff(@Auth() a: AuthCtx, @Body(Z(AdminInviteSchema)) b: { email: string; roleId: string }) {
    this.assertGrantable(a, (await this.prisma.adminRole.findUniqueOrThrow({ where: { id: b.roleId } })).permissions);
    const r = await this.auth2.createInvite({ kind: 'ADMIN', email: b.email, invitedById: a.userId, adminRoleId: b.roleId, subject: 'You have been invited to the Mehfil admin team', path: '/invite' });
    await this.audit.record({ actorId: a.userId, action: 'admin.invite', entity: 'Invite', after: { email: b.email, roleId: b.roleId } });
    return r;
  }
  @AdminOnly('admins.manage') @Patch('staff/:id') async updateStaff(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(z.object({ roleId: z.string().uuid().optional(), active: z.boolean().optional() }))) b: { roleId?: string; active?: boolean }) {
    const m = await this.prisma.adminMember.findUniqueOrThrow({ where: { id } });
    if (m.isSuper) throw new ForbiddenException('The Super Admin cannot be changed here.');
    if (m.userId === a.userId) throw new ForbiddenException('You cannot change your own access.');
    if (b.roleId) this.assertGrantable(a, (await this.prisma.adminRole.findUniqueOrThrow({ where: { id: b.roleId } })).permissions);
    return this.prisma.$transaction(async (tx) => {
      await tx.adminMember.update({ where: { id }, data: b });
      if (b.active === false) await tx.session.updateMany({ where: { userId: m.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.record({ actorId: a.userId, action: 'admin.update', entity: 'AdminMember', entityId: id, before: { roleId: m.roleId, active: m.active }, after: b }, tx);
      return { ok: true };
    });
  }
  @AdminOnly('audit.view') @Get('audit-logs') async auditLogs(@Query() q: PageQuery & Range & { action?: string; entity?: string }) {
    const p = paging(q); const where: Prisma.AuditLogWhereInput = { createdAt: range(q), ...(q.action ? { action: contains(q.action) } : {}), ...(q.entity ? { entity: q.entity } : {}) };
    const [items, total] = await Promise.all([this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take, include: { actor: { select: { name: true } } } }), this.prisma.auditLog.count({ where })]);
    return paged(items, total, p);
  }

  @AdminOnly('finance.view') @Get('reports/bookings.csv') @Header('Content-Type', 'text/csv; charset=utf-8') @Header('Content-Disposition', 'attachment; filename="bookings.csv"')
  async bookingsCsv(@Query() q: Range) {
    const rows = await this.prisma.booking.findMany({ where: { createdAt: range(q) }, orderBy: { createdAt: 'desc' }, take: 20000, include: { customer: { select: { name: true } }, vendor: { select: { businessName: true } }, listing: { select: { title: true } } } });
    return csv([['Code', 'Created', 'Event date', 'Customer', 'Vendor', 'Listing', 'Status', 'Total PKR', 'Commission PKR'], ...rows.map((b) => [b.code, b.createdAt.toISOString(), b.eventDate.toISOString().slice(0, 10), b.customer.name, b.vendor.businessName, b.listing.title, b.status, Number(b.totalAmount) / 100, Number(b.commissionTotal) / 100])]);
  }
  @AdminOnly('finance.view') @Get('reports/ledger.csv') @Header('Content-Type', 'text/csv; charset=utf-8') @Header('Content-Disposition', 'attachment; filename="ledger.csv"')
  async ledgerCsv(@Query() q: Range) {
    const rows = await this.prisma.ledgerEntry.findMany({ where: { createdAt: range(q) }, orderBy: { createdAt: 'desc' }, take: 50000, include: { booking: { select: { code: true } }, vendor: { select: { businessName: true } } } });
    return csv([['Date', 'Type', 'Amount PKR', 'Booking', 'Vendor', 'Memo'], ...rows.map((e) => [e.createdAt.toISOString(), e.type, Number(e.amount) / 100, e.booking?.code, e.vendor?.businessName, e.memo])]);
  }
}

@Module({ imports: [AuthModule, MarketplaceModule, VendorsModule], controllers: [AdminController] })
export class AdminModule {}
