import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Header, HttpCode, Module, NotFoundException, Param, Post, Query, Req, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { EnquirySchema, formatPKR, MessageSchema, OptionalReasonSchema, QuotationSchema, ReasonSchema, RefundRequestSchema, ReviewSchema, StartConversationSchema, StartPaymentSchema, TicketReplySchema, TicketSchema, DeclineSchema } from '@mehfil/shared';
import { Auth, AuthCtx, Public, VendorOnly } from '../common/auth';
import { env } from '../common/config';
import { addDays, paged, PageQuery, paging, today, Z } from '../common/http';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.module';
import { PAYMENT_PROVIDER, PaymentsService } from '../payments/payments.service';
import { NoProvider, SandboxProvider } from '../payments/providers';
import { VendorsModule } from '../vendors/vendors.module';
import { BookingsService } from './bookings.service';
import { EnquiriesService } from './enquiries.service';

@Controller()
export class CustomerController {
  constructor(private enquiries: EnquiriesService, private bookings: BookingsService, private payments: PaymentsService, private prisma: PrismaService) {}

  @Post('enquiries') create(@Auth() a: AuthCtx, @Body(Z(EnquirySchema)) b: any) { return this.enquiries.create(a, b); }
  @Get('enquiries') list(@Auth() a: AuthCtx, @Query() q: PageQuery) { return this.enquiries.listForCustomer(a.userId, q); }
  @Get('enquiries/:id') get(@Auth() a: AuthCtx, @Param('id') id: string) { return this.enquiries.getForCustomer(a.userId, id); }
  @HttpCode(200) @Post('enquiries/:id/close') close(@Auth() a: AuthCtx, @Param('id') id: string) { return this.enquiries.closeByCustomer(a.userId, id); }

  @Get('quotations') quotes(@Auth() a: AuthCtx, @Query() q: any) { return this.enquiries.listForCustomerQuotes(a.userId, q); }
  @Get('quotations/:id') quote(@Auth() a: AuthCtx, @Param('id') id: string) { return this.enquiries.getForCustomerQuote(a.userId, id); }
  @HttpCode(200) @Post('quotations/:id/accept') accept(@Auth() a: AuthCtx, @Param('id') id: string) { return this.bookings.acceptQuotation(a, id); }
  @HttpCode(200) @Post('quotations/:id/reject') reject(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(OptionalReasonSchema)) b: any) { return this.enquiries.rejectQuote(a.userId, id, b.reason); }

  @Get('bookings') bookingsList(@Auth() a: AuthCtx, @Query() q: PageQuery) { return this.bookings.listForCustomer(a.userId, q); }
  @Get('bookings/:id') booking(@Auth() a: AuthCtx, @Param('id') id: string) { return this.bookings.getForCustomer(a.userId, id); }
  @HttpCode(200) @Post('bookings/:id/cancel') cancel(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(ReasonSchema)) b: any) { return this.bookings.customerCancel(a, id, b.reason); }
  @HttpCode(200) @Post('bookings/:id/confirm-completion') confirm(@Auth() a: AuthCtx, @Param('id') id: string) { return this.bookings.customerConfirmCompletion(a, id); }
  @HttpCode(200) @Post('bookings/:id/dispute') dispute(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(ReasonSchema)) b: any) { return this.bookings.dispute(a, id, b.reason); }

  /** The return address is built here, never taken from the client, so checkout can't be used as an open redirect. */
  @HttpCode(200) @Post('bookings/:id/pay') pay(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(StartPaymentSchema)) b: any) {
    return this.payments.start(a, id, b.milestoneId, `${env.WEB_URL}/account/bookings/${id}`);
  }

  @Get('payments') async myPayments(@Auth() a: AuthCtx, @Query() q: PageQuery) {
    const p = paging(q); const where = { booking: { customerId: a.userId }, status: { not: 'INITIATED' as const } };
    const [items, total] = await Promise.all([
      this.prisma.payment.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take, select: { id: true, code: true, amount: true, refundedAmount: true, status: true, succeededAt: true, createdAt: true, milestone: { select: { label: true } }, booking: { select: { id: true, code: true, listing: { select: { title: true } } } }, refunds: { select: { code: true, amount: true, status: true } } } }),
      this.prisma.payment.count({ where }),
    ]);
    return paged(items, total, p);
  }
  @Post('refunds') refund(@Auth() a: AuthCtx, @Body(Z(RefundRequestSchema)) b: any) { return this.payments.requestRefund(a, b.paymentId, b.amount, b.reason); }

  /** Only the customer of a completed booking can review it, once. */
  @Post('bookings/:id/review') async review(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(ReviewSchema)) b: any) {
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findFirst({ where: { id, customerId: a.userId } });
      if (!booking) throw new NotFoundException('Booking not found');
      if (booking.status !== 'COMPLETED') throw new ConflictException('You can review a booking once it is completed.');
      const review = await tx.review.create({ data: { bookingId: id, customerId: a.userId, vendorId: booking.vendorId, listingId: booking.listingId, rating: b.rating, comment: b.comment, photos: b.photos } });
      await recomputeRatings(tx as PrismaService, booking.vendorId, booking.listingId);
      return review;
    });
  }
  @Get('my-reviews') myReviews(@Auth() a: AuthCtx) { return this.prisma.review.findMany({ where: { customerId: a.userId }, orderBy: { createdAt: 'desc' }, include: { listing: { select: { title: true, slug: true } }, booking: { select: { code: true } } } }); }
  @Get('dashboard') async dashboard(@Auth() a: AuthCtx) {
    const [enquiries, quotes, bookings, unpaid, wedding] = await Promise.all([
      this.prisma.enquiry.count({ where: { customerId: a.userId, status: { in: ['NEW', 'VIEWED', 'RESPONDED', 'QUOTATION_SENT'] } } }),
      this.prisma.quotation.count({ where: { customerId: a.userId, status: { in: ['SENT', 'VIEWED'] } } }),
      this.prisma.booking.count({ where: { customerId: a.userId, status: { in: ['AWAITING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS', 'PENDING_VENDOR_CONFIRMATION'] } } }),
      this.prisma.bookingMilestone.findMany({ where: { status: 'PENDING', booking: { customerId: a.userId, status: { in: ['AWAITING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS', 'SERVICE_COMPLETED'] } } }, orderBy: { dueDate: 'asc' }, take: 5, include: { booking: { select: { id: true, code: true, listing: { select: { title: true } } } } } }),
      this.prisma.wedding.findFirst({ where: { customerId: a.userId }, orderBy: { createdAt: 'desc' }, select: { id: true, title: true, dateFrom: true } }),
    ]);
    return { openEnquiries: enquiries, openQuotations: quotes, activeBookings: bookings, upcomingPayments: unpaid, wedding };
  }
}

export async function recomputeRatings(prisma: Pick<PrismaService, 'review' | 'vendor' | 'listing'>, vendorId: string, listingId: string) {
  const where = { status: 'PUBLISHED' as const };
  const [v, l] = await Promise.all([prisma.review.aggregate({ where: { ...where, vendorId }, _avg: { rating: true }, _count: true }), prisma.review.aggregate({ where: { ...where, listingId }, _avg: { rating: true }, _count: true })]);
  await prisma.vendor.update({ where: { id: vendorId }, data: { avgRating: v._avg.rating ?? 0, reviewCount: v._count } });
  await prisma.listing.update({ where: { id: listingId }, data: { avgRating: l._avg.rating ?? 0, reviewCount: l._count } });
}

@Controller('vendor')
export class VendorOpsController {
  constructor(private enquiries: EnquiriesService, private bookings: BookingsService, private payments: PaymentsService, private prisma: PrismaService) {}

  @VendorOnly('enquiries') @Get('enquiries') list(@Auth() a: AuthCtx, @Query() q: any) { return this.enquiries.listForVendor(a, q); }
  @VendorOnly('enquiries') @Get('enquiries/:id') get(@Auth() a: AuthCtx, @Param('id') id: string) { return this.enquiries.getForVendor(a, id); }
  @VendorOnly('enquiries') @HttpCode(200) @Post('enquiries/:id/decline') decline(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(DeclineSchema)) b: any) { return this.enquiries.decline(a, id, b.reason); }
  @VendorOnly('enquiries') @Get('quotations') quotes(@Auth() a: AuthCtx, @Query() q: any) { return this.enquiries.listForVendorQuotes(a, q); }
  @VendorOnly('enquiries') @Post('quotations') create(@Auth() a: AuthCtx, @Body(Z(QuotationSchema)) b: any) { return this.enquiries.createQuote(a, b); }
  @VendorOnly('enquiries') @Get('quotations/:id') quote(@Auth() a: AuthCtx, @Param('id') id: string) { return this.enquiries.quoteForVendor(a, id); }
  @VendorOnly('enquiries') @HttpCode(200) @Post('quotations/:id/send') send(@Auth() a: AuthCtx, @Param('id') id: string) { return this.enquiries.send(a, id); }
  @VendorOnly('enquiries') @Post('quotations/:id/revise') revise(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(QuotationSchema)) b: any) { return this.enquiries.revise(a, id, b); }
  @VendorOnly('enquiries') @HttpCode(200) @Post('quotations/:id/withdraw') withdraw(@Auth() a: AuthCtx, @Param('id') id: string) { return this.enquiries.withdraw(a, id); }
  @VendorOnly() @Get('cancellation-policies') policies() { return this.prisma.cancellationPolicy.findMany({ where: { active: true }, orderBy: { name: 'asc' } }); }

  @VendorOnly('bookings') @Get('bookings') bookingsList(@Auth() a: AuthCtx, @Query() q: any) { return this.bookings.listForVendor(a, q); }
  @VendorOnly('bookings') @Get('bookings/:id') booking(@Auth() a: AuthCtx, @Param('id') id: string) { return this.bookings.getForVendor(a, id); }
  @VendorOnly('bookings') @HttpCode(200) @Post('bookings/:id/confirm') confirm(@Auth() a: AuthCtx, @Param('id') id: string) { return this.bookings.vendorConfirm(a, id); }
  @VendorOnly('bookings') @HttpCode(200) @Post('bookings/:id/decline') decline2(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(ReasonSchema)) b: any) { return this.bookings.vendorDecline(a, id, b.reason); }
  @VendorOnly('bookings') @HttpCode(200) @Post('bookings/:id/cancel') cancel(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(ReasonSchema)) b: any) { return this.bookings.vendorCancel(a, id, b.reason); }
  @VendorOnly('bookings') @HttpCode(200) @Post('bookings/:id/complete') complete(@Auth() a: AuthCtx, @Param('id') id: string) { return this.bookings.vendorComplete(a, id); }

  @VendorOnly('finance') @Get('earnings') earnings(@Auth() a: AuthCtx) { return this.payments.vendorEarnings(a.vendor!.id); }
  @VendorOnly('finance') @Get('transactions') tx(@Auth() a: AuthCtx, @Query() q: PageQuery) { return this.payments.vendorTransactions(a.vendor!.id, q); }
  @VendorOnly('finance') @Get('payouts') payouts(@Auth() a: AuthCtx, @Query() q: PageQuery) { return this.payments.vendorPayouts(a.vendor!.id, q); }
  @VendorOnly('finance') @Post('payouts') requestPayout(@Auth() a: AuthCtx) { return this.payments.requestPayout(a); }

  @VendorOnly() @Get('overview') async overview(@Auth() a: AuthCtx) {
    const vendorId = a.vendor!.id;
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const canFinance = a.vendor!.areas.includes('finance');
    const [views, newEnquiries, pendingQuotes, upcoming, month, earnings, recentEnquiries, nextBookings, reviews, listings] = await Promise.all([
      this.prisma.listing.aggregate({ where: { vendorId }, _sum: { viewCount: true } }),
      this.prisma.enquiry.count({ where: { vendorId, status: { in: ['NEW', 'VIEWED'] } } }),
      this.prisma.quotation.count({ where: { vendorId, status: { in: ['SENT', 'VIEWED'] } } }),
      this.prisma.booking.count({ where: { vendorId, status: { in: ['CONFIRMED', 'IN_PROGRESS'] }, eventDate: { gte: today() } } }),
      canFinance ? this.prisma.ledgerEntry.aggregate({ where: { vendorId, type: 'PAYMENT_RECEIVED', createdAt: { gte: monthStart } }, _sum: { amount: true } }) : null,
      canFinance ? this.payments.vendorEarnings(vendorId) : null,
      this.prisma.enquiry.findMany({ where: { vendorId, status: { in: ['NEW', 'VIEWED'] } }, orderBy: { createdAt: 'desc' }, take: 5, include: { customer: { select: { name: true } }, listing: { select: { title: true } } } }),
      this.prisma.booking.findMany({ where: { vendorId, status: { in: ['PENDING_VENDOR_CONFIRMATION', 'AWAITING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS'] }, eventDate: { gte: today() } }, orderBy: { eventDate: 'asc' }, take: 5, include: { customer: { select: { name: true } }, listing: { select: { title: true } } } }),
      this.prisma.review.findMany({ where: { vendorId }, orderBy: { createdAt: 'desc' }, take: 3, include: { customer: { select: { name: true } } } }),
      this.prisma.listing.findMany({ where: { vendorId, status: { not: 'ARCHIVED' } }, orderBy: { viewCount: 'desc' }, take: 5, select: { id: true, title: true, status: true, viewCount: true, _count: { select: { enquiries: true, bookings: true } } } }),
    ]);
    return { profileViews: views._sum.viewCount ?? 0, newEnquiries, pendingQuotes, upcomingBookings: upcoming, monthRevenue: month ? Number(month._sum.amount ?? 0) : null, pendingPayout: earnings ? earnings.pending + earnings.due : null, recentEnquiries, nextBookings, reviews, listings };
  }

  @VendorOnly() @Get('analytics') async analytics(@Auth() a: AuthCtx) {
    const vendorId = a.vendor!.id;
    const since = addDays(new Date(), -180);
    const [enquiries, quotes, accepted, bookings, revenue] = await Promise.all([
      this.prisma.enquiry.count({ where: { vendorId, createdAt: { gte: since } } }),
      this.prisma.quotation.count({ where: { vendorId, createdAt: { gte: since }, status: { not: 'DRAFT' } } }),
      this.prisma.quotation.count({ where: { vendorId, createdAt: { gte: since }, status: 'ACCEPTED' } }),
      this.prisma.booking.count({ where: { vendorId, createdAt: { gte: since }, confirmedAt: { not: null } } }),
      a.vendor!.areas.includes('finance') ? this.prisma.$queryRaw<{ month: string; amount: bigint }[]>`SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month, SUM("amount")::bigint AS amount FROM "LedgerEntry" WHERE "vendorId" = ${vendorId} AND "type" = 'PAYMENT_RECEIVED' AND "createdAt" >= ${since} GROUP BY 1 ORDER BY 1` : Promise.resolve([]),
    ]);
    return { funnel: { enquiries, quotes, accepted, bookings }, revenue };
  }
}

@Controller()
export class MessagingController {
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  private async access(a: AuthCtx, id: string) {
    const c = await this.prisma.conversation.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Conversation not found');
    const isCustomer = c.customerId === a.userId;
    const isVendor = a.vendor?.id === c.vendorId && a.vendor.areas.includes('enquiries');
    if (!isCustomer && !isVendor) throw new NotFoundException('Conversation not found');
    return { c, fromVendor: isVendor && !isCustomer };
  }

  @Get('conversations') list(@Auth() a: AuthCtx) {
    return this.prisma.conversation.findMany({ where: { customerId: a.userId }, orderBy: { lastMessageAt: 'desc' }, take: 100, include: { vendor: { select: { businessName: true, logoUrl: true } }, messages: { take: 1, orderBy: { createdAt: 'desc' } } } });
  }
  @VendorOnly('enquiries') @Get('vendor/conversations') vendorList(@Auth() a: AuthCtx) {
    return this.prisma.conversation.findMany({ where: { vendorId: a.vendor!.id }, orderBy: { lastMessageAt: 'desc' }, take: 100, include: { customer: { select: { name: true } }, messages: { take: 1, orderBy: { createdAt: 'desc' } } } });
  }
  @Post('conversations') async start(@Auth() a: AuthCtx, @Body(Z(StartConversationSchema)) b: { vendorId: string; body: string }) {
    const vendor = await this.prisma.vendor.findFirst({ where: { id: b.vendorId, status: 'APPROVED' } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    if (a.vendor?.id === b.vendorId) throw new ForbiddenException('You cannot message your own business.');
    const c = await this.prisma.conversation.upsert({ where: { customerId_vendorId: { customerId: a.userId, vendorId: b.vendorId } }, create: { customerId: a.userId, vendorId: b.vendorId }, update: {} });
    await this.post(a, c.id, b.body);
    return c;
  }
  @Get('conversations/:id/messages') async messages(@Auth() a: AuthCtx, @Param('id') id: string) {
    const { c, fromVendor } = await this.access(a, id);
    await this.prisma.conversation.update({ where: { id }, data: fromVendor ? { vendorReadAt: new Date() } : { customerReadAt: new Date() } });
    const messages = await this.prisma.message.findMany({ where: { conversationId: id }, orderBy: { createdAt: 'asc' }, take: 500 });
    return { conversation: c, messages, me: fromVendor ? 'VENDOR' : 'CUSTOMER' };
  }
  @Post('conversations/:id/messages') send(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(MessageSchema)) b: { body: string }) { return this.post(a, id, b.body); }

  private async post(a: AuthCtx, id: string, body: string) {
    const { c, fromVendor } = await this.access(a, id);
    return this.prisma.$transaction(async (tx) => {
      const m = await tx.message.create({ data: { conversationId: id, senderId: a.userId, fromVendor, body } });
      await tx.conversation.update({ where: { id }, data: { lastMessageAt: new Date() } });
      const note = { type: 'MESSAGE', title: `New message from ${a.name}`, body: body.slice(0, 120), email: false };
      if (fromVendor) await this.notifications.notify(tx, { ...note, userId: c.customerId, link: `/account/messages/${id}` });
      else await this.notifications.notifyVendor(tx, c.vendorId, { ...note, link: `/vendor/messages/${id}` });
      return m;
    });
  }

  @Post('support/tickets') createTicket(@Auth() a: AuthCtx, @Body(Z(TicketSchema)) b: any) {
    return this.prisma.$transaction(async (tx) => {
      if (b.bookingId && !(await tx.booking.findFirst({ where: { id: b.bookingId, OR: [{ customerId: a.userId }, ...(a.vendor ? [{ vendorId: a.vendor.id }] : [])] } }))) throw new NotFoundException('Booking not found');
      const code = await (this.prisma as PrismaService).nextCode(tx, 'TK');
      const t = await tx.supportTicket.create({ data: { code, userId: a.userId, bookingId: b.bookingId, category: b.category, subject: b.subject, messages: { create: { senderId: a.userId, body: b.body } } } });
      await this.notifications.notifyAdmins(tx, 'support.manage', { type: 'TICKET_NEW', title: 'New support ticket', body: b.subject, link: `/admin/support/${t.id}` });
      return t;
    });
  }
  @Get('support/tickets') tickets(@Auth() a: AuthCtx) { return this.prisma.supportTicket.findMany({ where: { userId: a.userId }, orderBy: { updatedAt: 'desc' }, take: 100 }); }
  @Get('support/tickets/:id') async ticket(@Auth() a: AuthCtx, @Param('id') id: string) {
    const t = await this.prisma.supportTicket.findFirst({ where: { id, userId: a.userId }, include: { messages: { where: { internal: false }, orderBy: { createdAt: 'asc' } } } });
    if (!t) throw new NotFoundException('Ticket not found');
    return t;
  }
  @Post('support/tickets/:id/messages') async reply(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(TicketReplySchema)) b: { body: string }) {
    const t = await this.prisma.supportTicket.findFirst({ where: { id, userId: a.userId } });
    if (!t) throw new NotFoundException('Ticket not found');
    const [m] = await this.prisma.$transaction([this.prisma.ticketMessage.create({ data: { ticketId: id, senderId: a.userId, body: b.body } }), this.prisma.supportTicket.update({ where: { id }, data: { status: t.status === 'RESOLVED' ? 'OPEN' : undefined, updatedAt: new Date() } })]);
    return m;
  }
}

@Controller()
export class WebhooksController {
  constructor(private payments: PaymentsService, private provider2: SandboxProvider) {}

  @Public() @SkipThrottle() @HttpCode(200) @Post('webhooks/payments/:provider')
  webhook(@Param('provider') provider: string, @Req() req: Request & { rawBody?: Buffer }) {
    if (!req.rawBody) throw new BadRequestException('Missing body');
    return this.payments.handleWebhook(provider, req.rawBody, req.headers);
  }

  private guard() { if (env.PAYMENT_PROVIDER !== 'sandbox') throw new NotFoundException(); }

  /** Stand-in for a gateway's hosted page. Unreachable in production: config validation refuses the sandbox provider there. */
  @Public() @Get('sandbox/pay/:ref') @Header('Content-Type', 'text/html; charset=utf-8') @Header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'")
  async sandboxPage(@Param('ref') ref: string, @Query('returnUrl') returnUrl: string) {
    this.guard();
    const p = await (this.payments as any).prisma.payment.findUnique({ where: { providerRef: ref } });
    if (!p) throw new NotFoundException();
    const q = `returnUrl=${encodeURIComponent(returnUrl ?? '')}`;
    return `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><title>Sandbox payment</title><body style="font-family:system-ui;background:#FFFDF9;color:#49343A;max-width:420px;margin:48px auto;padding:24px"><p style="background:#F8E9E9;padding:12px;border-radius:8px"><b>Test mode.</b> No real money moves.</p><h1>${formatPKR(Number(p.amount))}</h1><p>Payment ${p.code}</p><form method=post action="/v1/sandbox/pay/${ref}/success?${q}"><button style="width:100%;padding:14px;background:#8F3048;color:#fff;border:0;border-radius:10px;font-size:16px">Simulate success</button></form><form method=post action="/v1/sandbox/pay/${ref}/fail?${q}" style="margin-top:12px"><button style="width:100%;padding:14px;background:#fff;border:1px solid #F0E3E2;border-radius:10px;font-size:16px">Simulate failure</button></form>`;
  }

  @Public() @Post('sandbox/pay/:ref/:result')
  async sandboxComplete(@Param('ref') ref: string, @Param('result') result: string, @Query('returnUrl') returnUrl: string, @Res() res: Response) {
    this.guard();
    if (result !== 'success' && result !== 'fail') throw new NotFoundException();
    const p = await (this.payments as any).prisma.payment.findUnique({ where: { providerRef: ref } });
    if (!p) throw new NotFoundException();
    const body = JSON.stringify({ eventId: `evt_${ref}_${result}`, providerRef: ref, status: result === 'success' ? 'SUCCEEDED' : 'FAILED', amount: Number(p.amount) });
    await this.payments.handleWebhook('sandbox', Buffer.from(body), { 'x-sandbox-signature': this.provider2.sign(body) });
    const safe = (returnUrl ?? '').startsWith(env.WEB_URL) ? returnUrl : env.WEB_URL;
    res.redirect(303, `${safe}?payment=${result}`);
  }
}

@Module({
  imports: [VendorsModule],
  controllers: [CustomerController, VendorOpsController, MessagingController, WebhooksController],
  providers: [EnquiriesService, BookingsService, PaymentsService, SandboxProvider, NoProvider,
    { provide: PAYMENT_PROVIDER, useFactory: (s: SandboxProvider, n: NoProvider) => (env.PAYMENT_PROVIDER === 'sandbox' ? s : n), inject: [SandboxProvider, NoProvider] }],
  exports: [EnquiriesService, BookingsService, PaymentsService],
})
export class MarketplaceModule {}
