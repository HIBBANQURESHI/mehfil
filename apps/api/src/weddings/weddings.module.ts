import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, Injectable, Logger, Module, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { applyBps, formatPKR, BudgetItemSchema, BudgetUpdateSchema, ChecklistItemSchema, defaultAllocation, EventSchema, planningStage, PlanSchema, serviceOf, statusLabel, WEDDING_SERVICES, WeddingSchema, workingBudget } from '@mehfil/shared';
import { Auth, AuthCtx } from '../common/auth';
import { addDays, dateOnly, today, Z } from '../common/http';
import { PrismaService, Tx } from '../common/prisma.service';
import { CARD } from '../catalog/catalog.module';
import { GeminiClient, WeddingPersonalizer } from './planner-ai';

const toDate = (v?: string | null) => (v ? dateOnly(v) : v === null ? null : undefined);
const iso = (d: Date | null | undefined) => d?.toISOString().slice(0, 10) ?? null;

/** Starter tasks for the services and events chosen, timed back from the first event. Gemini may add more later. */
function starterChecklist(services: string[], events: { name: string; date: Date | null }[], anchor: Date | null) {
  const has = (s: string) => services.includes(s);
  const tasks: [string, number | null][] = [
    ...(has('planner') ? [['Hire a wedding planner', 200] as [string, number]] : []),
    ...(has('venue') ? [['Shortlist and book your wedding venue', 180] as [string, number]] : []),
    ...(has('catering') ? [['Choose a caterer and arrange a menu tasting', 150] as [string, number]] : []),
    ...(has('photography') ? [['Book your photographer and videographer', 120] as [string, number]] : []),
    ...(has('outfits') ? [['Order bridal and groom outfits', 120] as [string, number]] : []),
    ...(has('decoration') ? [['Finalise the decor theme and decorator', 90] as [string, number]] : []),
    ...(has('makeup') ? [['Book the bridal makeup artist and a trial', 90] as [string, number]] : []),
    ...(has('jewellery') ? [['Finalise jewellery', 60] as [string, number]] : []),
    ['Prepare the guest list', 75],
    ['Send invitations', 45],
    ...events.map((e) => [`Confirm ${e.name} timings and venue with every vendor`, 14] as [string, number]),
    ['Confirm the final guest count with your caterer', 10],
  ];
  const now = today();
  return tasks.map(([title, daysBefore], sortOrder) => {
    let due: Date | null = anchor && daysBefore !== null ? addDays(anchor, -daysBefore) : null;
    // A deadline already in the past becomes "this week", which is honest about the urgency.
    if (due && due < now) due = addDays(now, 7);
    return { title, dueDate: due, sortOrder, source: 'AUTO' };
  });
}

@Injectable()
export class WeddingsService {
  private log = new Logger('Weddings');
  constructor(private prisma: PrismaService, private personalizer: WeddingPersonalizer, private gemini: GeminiClient) {}

  private async own(userId: string, id: string) {
    const w = await this.prisma.wedding.findFirst({ where: { id, customerId: userId } });
    if (!w) throw new NotFoundException('Wedding not found');
    return w;
  }

  list(userId: string) {
    return this.prisma.wedding.findMany({ where: { customerId: userId }, orderBy: { createdAt: 'desc' }, include: { city: true, events: { orderBy: { date: 'asc' } }, _count: { select: { checklist: true } } } });
  }

  /** Builds the whole workspace in one transaction. Personalisation then runs in the background so this never waits on Gemini. */
  async plan(userId: string, b: z.output<typeof PlanSchema>) {
    const now = today();
    const dates = [b.weddingDate, ...b.events.map((e) => e.date)].filter(Boolean) as string[];
    if (dates.some((d) => dateOnly(d) < now)) throw new BadRequestException({ message: 'Dates must be today or later.', code: 'DATE_IN_PAST' });
    if (b.cityId && !(await this.prisma.city.findFirst({ where: { id: b.cityId, active: true } }))) throw new BadRequestException('Please choose a valid city.');
    const sorted = [...dates].sort();
    const budget = b.budgetBand === 'CUSTOM' ? b.budget ?? null : b.budget ?? workingBudget(b.budgetBand);
    const anchor = sorted[0] ? dateOnly(sorted[0]) : b.targetMonth ? dateOnly(`${b.targetMonth}-01`) : null;
    const names = [b.partnerOne, b.partnerTwo].filter(Boolean);
    const events = b.events.map((e) => ({ ...e, name: e.name || statusLabel(e.type) }));

    const wedding = await this.prisma.$transaction(async (tx) => {
      const categories = await tx.category.findMany({ where: { slug: { in: WEDDING_SERVICES.flatMap((s) => [...s.categories]) } }, select: { id: true, slug: true } });
      return tx.wedding.create({
        data: {
          customerId: userId,
          title: names.length ? names.join(' & ') : 'Our wedding',
          partnerOne: b.partnerOne, partnerTwo: b.partnerTwo,
          cityId: b.cityId, guestCount: b.guestCount, planningStatus: b.planningStatus,
          dateFrom: sorted[0] ? dateOnly(sorted[0]) : null, dateTo: sorted.length ? dateOnly(sorted[sorted.length - 1]) : null,
          targetMonth: b.weddingDate ? b.weddingDate.slice(0, 7) : b.targetMonth,
          budget, budgetBand: b.budgetBand, style: b.style, venuePreference: b.venuePreference, services: b.services, notes: b.notes,
          aiStatus: this.gemini.enabled ? 'PENDING' : 'NONE',
          events: { create: events.map((e) => ({ type: e.type, name: e.name, date: toDate(e.date), guestCount: e.guestCount ?? b.guestCount, cityId: e.cityId ?? b.cityId, areaId: e.areaId, venueStatus: e.venueStatus, budget: e.budget })) },
          budgetItems: {
            create: defaultAllocation(b.services).map((a) => {
              const svc = serviceOf(a.service)!;
              return { label: svc.label, serviceKey: a.service, planned: budget ? applyBps(budget, a.bps) : 0, categoryId: categories.find((c) => c.slug === svc.categories[0])?.id };
            }),
          },
          checklist: { create: starterChecklist(b.services, events.map((e) => ({ name: e.name, date: toDate(e.date) ?? null })), anchor) },
        },
      });
    });
    // Started only once the response is built, so the reply always describes the plan as it was just saved.
    const result = await this.detail(userId, wedding.id);
    if (wedding.aiStatus === 'PENDING') setImmediate(() => this.personalizer.personalize(wedding.id).catch((e) => this.log.warn((e as Error).message)));
    return result;
  }

  async create(userId: string, b: z.output<typeof WeddingSchema>) {
    const { eventTypes, ...rest } = b;
    const w = await this.prisma.wedding.create({
      data: { ...rest, services: rest.services ?? [], customerId: userId, dateFrom: toDate(b.dateFrom), dateTo: toDate(b.dateTo), events: { create: eventTypes.map((type) => ({ type, name: statusLabel(type) })) }, checklist: { create: starterChecklist([], [], null) } },
    });
    return this.detail(userId, w.id);
  }

  async update(userId: string, id: string, b: z.output<typeof WeddingSchema>) {
    await this.own(userId, id);
    const { eventTypes: _e, ...rest } = b;
    await this.prisma.wedding.update({ where: { id }, data: { ...rest, dateFrom: toDate(b.dateFrom), dateTo: toDate(b.dateTo), budget: b.budgetBand && b.budgetBand !== 'CUSTOM' && b.budget === undefined ? workingBudget(b.budgetBand) : b.budget } });
    return this.detail(userId, id);
  }

  async remove(userId: string, id: string) { await this.own(userId, id); await this.prisma.wedding.delete({ where: { id } }); return { ok: true }; }

  /** The dashboard: every figure is worked out from the plan and real bookings at the moment it is asked for. */
  async detail(userId: string, id: string) {
    await this.own(userId, id);
    const w = await this.prisma.wedding.findUniqueOrThrow({ where: { id }, include: { city: true, events: { orderBy: [{ date: 'asc' }], include: { city: true, area: true } }, budgetItems: { include: { category: true } }, checklist: { orderBy: [{ done: 'asc' }, { dueDate: { sort: 'asc', nulls: 'last' } }, { sortOrder: 'asc' }] } } });
    const enquiries = await this.prisma.enquiry.findMany({
      where: { weddingId: id },
      select: { id: true, code: true, status: true, eventId: true, eventDate: true, listing: { select: { title: true, slug: true, categoryId: true, category: { select: { name: true, slug: true } } } }, vendor: { select: { businessName: true } }, quotations: { where: { booking: { isNot: null } }, select: { booking: { select: { id: true, code: true, status: true, totalAmount: true, eventDate: true, confirmedAt: true, payments: { where: { status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED'] } }, select: { amount: true, refundedAmount: true } }, milestones: { where: { status: 'PENDING' }, select: { label: true, amount: true, dueDate: true } } } } } } },
    });
    const bookings = enquiries.flatMap((e) => e.quotations.map((q) => ({ ...q.booking!, eventId: e.eventId, vendorName: e.vendor.businessName, listingTitle: e.listing.title, categoryName: e.listing.category.name, categorySlug: e.listing.category.slug, categoryId: e.listing.categoryId }))).filter((b) => b.status !== 'CANCELLED');
    // Committed means confirmed: an accepted quotation alone hasn't been agreed by the vendor or paid for yet.
    const committed = bookings.filter((b) => b.confirmedAt);
    const paidOf = (b: (typeof bookings)[number]) => b.payments.reduce((p, x) => p + Number(x.amount) - Number(x.refundedAmount), 0);
    const booked = committed.reduce((s, b) => s + Number(b.totalAmount), 0);
    const paid = committed.reduce((s, b) => s + paidOf(b), 0);
    const planned = w.budgetItems.reduce((s, b) => s + Number(b.planned), 0);
    const matches = (item: { categoryId: string | null; serviceKey: string | null }, b: (typeof bookings)[number]) =>
      (item.serviceKey ? (serviceOf(item.serviceKey)?.categories as readonly string[] | undefined)?.includes(b.categorySlug) : false) || (!!item.categoryId && item.categoryId === b.categoryId);
    const budgetItems = w.budgetItems.map((item) => {
      const mine = committed.filter((b) => matches(item, b));
      return { ...item, actual: mine.reduce((s, b) => s + Number(b.totalAmount), 0), paid: mine.reduce((s, b) => s + paidOf(b), 0) };
    });

    const bookable = w.services.filter((s) => (serviceOf(s)?.categories.length ?? 0) > 0);
    const servicesBooked = bookable.filter((s) => committed.some((b) => (serviceOf(s)!.categories as readonly string[]).includes(b.categorySlug)));
    const tasksDone = w.checklist.filter((c) => c.done).length;
    const total = w.checklist.length + bookable.length;
    const percent = total ? Math.round(((tasksDone + servicesBooked.length) / total) * 100) : 0;

    const eventStatus = Object.fromEntries(w.events.map((e) => {
      if (committed.some((b) => b.eventId === e.id)) return [e.id, 'BOOKED'];
      if (enquiries.some((q) => q.eventId === e.id)) return [e.id, 'IN_PROGRESS'];
      return [e.id, 'NOT_PLANNED'];
    }));
    const suggestion = Array.isArray(w.aiAllocation) ? (w.aiAllocation as { service: string; bps: number }[]).map((a) => ({ ...a, label: serviceOf(a.service)?.label ?? a.service, amount: w.budget === null ? null : applyBps(Number(w.budget), a.bps) })) : null;
    const shortlist = await this.prisma.savedListing.findMany({ where: { userId, listing: { status: 'PUBLISHED', vendor: { status: 'APPROVED' } } }, orderBy: { createdAt: 'desc' }, select: { listing: { select: CARD } } });
    const { aiAllocation: _a, aiAttempts: _t, aiLockedUntil: _l, ...rest } = w;

    return {
      ...rest, budgetItems, enquiries: enquiries.map(({ quotations: _q, ...e }) => e), bookings, eventStatus, suggestion,
      shortlist: shortlist.map((s) => s.listing),
      progress: { percent, stage: planningStage(percent), tasksDone, tasksTotal: w.checklist.length, servicesBooked: servicesBooked.length, servicesNeeded: bookable.length },
      summary: { budget: w.budget === null ? null : Number(w.budget), planned, booked, paid, remainingToPay: booked - paid, remainingBudget: w.budget === null ? null : Number(w.budget) - booked },
    };
  }

  /**
   * Real listings that fit the plan: city, guest count and the budget set aside for that service. A date is only
   * used to drop vendors whose Mehfil calendar is already full; it is never presented as confirmed availability.
   * Ranking is plain data, so every pick can be explained: within budget first, then a rating that doesn't let one
   * five-star review beat fifty good ones.
   */
  private async rank(id: string) {
    const w = await this.prisma.wedding.findUniqueOrThrow({ where: { id }, include: { city: true, events: { orderBy: { date: 'asc' } }, budgetItems: true } });
    const guests = Math.max(w.guestCount ?? 0, ...w.events.map((e) => e.guestCount ?? 0)) || null;
    const date = w.events.map((e) => e.date).filter(Boolean).sort((a, b) => +a! - +b!)[0] ?? w.dateFrom;
    let full: string[] = [];
    if (date) {
      const rows = await this.prisma.$queryRaw<{ listingId: string }[]>`
        SELECT o."listingId" FROM "Occupancy" o JOIN "Listing" l ON l."id" = o."listingId"
        WHERE o."date" = ${date}::date AND (o."expiresAt" IS NULL OR o."expiresAt" > now())
        GROUP BY o."listingId", o."slot", l."dailyCapacity" HAVING COUNT(*) >= l."dailyCapacity"`;
      full = [...new Set(rows.map((r) => r.listingId))];
    }
    const score = (l: { avgRating: number | null; reviewCount: number }) => ((l.avgRating ?? 0) * l.reviewCount + 4 * 5) / (l.reviewCount + 5);
    const groups = [];
    for (const key of w.services) {
      const svc = serviceOf(key);
      if (!svc || !svc.categories.length) continue;
      const allocation = Number(w.budgetItems.find((b) => b.serviceKey === key)?.planned ?? 0) || null;
      const where: Prisma.ListingWhereInput = {
        status: 'PUBLISHED', vendor: { status: 'APPROVED' }, category: { slug: { in: [...svc.categories] } },
        ...(w.cityId ? { cityId: w.cityId } : {}), ...(full.length ? { id: { notIn: full } } : {}),
        ...(key === 'venue' && guests ? { OR: [{ capacityMax: null }, { capacityMax: { gte: guests } }] } : {}),
      };
      const candidates = await this.prisma.listing.findMany({ where, select: CARD, orderBy: [{ avgRating: 'desc' }, { reviewCount: 'desc' }, { publishedAt: 'desc' }], take: 40 });
      // Per-person prices are compared at the planned guest count, so a cheap-looking menu isn't misleading.
      const estimate = (l: (typeof candidates)[number]) => Number(l.startingPrice) * (l.priceUnit === 'PER_PERSON' && guests ? guests : 1);
      const now = new Date();
      const scored = candidates.map((l) => ({ ...l, featured: !!l.vendor.featuredUntil && l.vendor.featuredUntil > now, estimate: estimate(l) }))
        .sort((a, b) => score(b) - score(a) || a.estimate - b.estimate);
      const fits = allocation ? scored.filter((l) => l.estimate <= allocation) : scored;
      groups.push({ key, svc, allocation, fits, others: scored, explore: { category: svc.categories[0], city: w.city?.slug ?? null, guests, date: iso(date), maxPrice: allocation && key !== 'catering' ? Math.floor(allocation / 100) : null } });
    }
    return { w, guests, date, groups };
  }

  async recommendations(userId: string, id: string) {
    await this.own(userId, id);
    const { guests, date, groups } = await this.rank(id);
    return {
      dateChecked: iso(date), guests,
      groups: groups.map((g) => ({ service: g.key, label: g.svc.label, allocation: g.allocation, total: g.fits.length, listings: g.fits.slice(0, 4), explore: g.explore })),
    };
  }

  /**
   * The simple "here is your plan" view: the best three real vendors for each service with the reasons they were
   * picked, the budget split and the next few steps. Everything a customer needs to take the next action.
   */
  async results(userId: string, id: string) {
    await this.own(userId, id);
    const { w, guests, date, groups } = await this.rank(id);
    const day = (d: Date) => d.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    const enquiries = await this.prisma.enquiry.findMany({ where: { weddingId: id }, select: { status: true, listing: { select: { category: { select: { slug: true } } } }, quotations: { select: { booking: { select: { status: true, confirmedAt: true } } } } } });
    const progressOf = (cats: readonly string[]) => {
      const mine = enquiries.filter((e) => cats.includes(e.listing.category.slug));
      if (mine.some((e) => e.quotations.some((q) => q.booking?.confirmedAt && q.booking.status !== 'CANCELLED'))) return 'BOOKED';
      if (mine.some((e) => e.quotations.some((q) => q.booking && q.booking.status !== 'CANCELLED'))) return 'BOOKING';
      return mine.length ? 'QUOTES_REQUESTED' : 'OPEN';
    };
    const services = groups.map((g) => {
      const overBudget = !!g.allocation && !g.fits.length && g.others.length > 0;
      const picks = (overBudget ? g.others : g.fits).slice(0, 3).map((l) => {
        const reasons: string[] = [];
        if (g.allocation) reasons.push(l.estimate <= g.allocation ? `Within your ${formatPKR(g.allocation)} for ${g.svc.label.toLowerCase()}` : `From ${formatPKR(l.estimate)}, above your ${formatPKR(g.allocation)}`);
        if (l.reviewCount > 0) reasons.push(`Rated ${(l.avgRating ?? 0).toFixed(1)} from ${l.reviewCount} review${l.reviewCount === 1 ? '' : 's'}`);
        else reasons.push('New on Mehfil');
        if (g.key === 'venue' && guests && l.capacityMax) reasons.push(`Holds up to ${l.capacityMax} guests`);
        if (w.city && l.city) reasons.push(`In ${l.city.name}${l.area ? `, ${l.area.name}` : ''}`);
        if (date) reasons.push(`Not booked on Mehfil for ${day(date)}`);
        if (l.vendor.identityVerifiedAt || l.vendor.businessVerifiedAt) reasons.push('Verified business');
        return { ...l, reasons };
      });
      return { service: g.key, label: g.svc.label, allocation: g.allocation, matches: g.fits.length, overBudget, progress: progressOf(g.svc.categories), picks, explore: g.explore };
    });
    const nextSteps = await this.prisma.checklistItem.findMany({ where: { weddingId: id, done: false }, orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { sortOrder: 'asc' }], take: 5, select: { id: true, title: true, dueDate: true, source: true } });
    const [tasksDone, tasksTotal] = await Promise.all([this.prisma.checklistItem.count({ where: { weddingId: id, done: true } }), this.prisma.checklistItem.count({ where: { weddingId: id } })]);
    const suggestion = Array.isArray(w.aiAllocation) ? (w.aiAllocation as { service: string; bps: number }[]) : null;
    const budgetTotal = w.budget === null ? null : Number(w.budget);
    return {
      id: w.id, title: w.title, city: w.city?.name ?? null, guests, budget: budgetTotal, style: w.style, targetMonth: w.targetMonth,
      events: w.events.map((e) => ({ id: e.id, name: e.name ?? statusLabel(e.type), type: e.type, date: iso(e.date), guestCount: e.guestCount })),
      ai: { status: w.aiStatus, note: w.aiNote },
      budgetSplit: w.budgetItems.filter((b) => b.serviceKey).map((b) => {
        const s = suggestion?.find((a) => a.service === b.serviceKey);
        return { id: b.id, service: b.serviceKey, label: b.label, planned: Number(b.planned), suggested: s && budgetTotal !== null ? applyBps(budgetTotal, s.bps) : null };
      }),
      suggestionAvailable: !!suggestion?.length && budgetTotal !== null,
      services, nextSteps, tasks: { done: tasksDone, total: tasksTotal }, dateChecked: iso(date),
    };
  }

  /** Replaces the planned amounts with Gemini's suggested split. Only the lines it covers change. */
  async applySuggestion(userId: string, id: string) {
    const w = await this.own(userId, id);
    if (!Array.isArray(w.aiAllocation) || w.budget === null) throw new ConflictException('There is no suggestion to apply yet.');
    await this.prisma.$transaction(async (tx: Tx) => {
      for (const a of w.aiAllocation as { service: string; bps: number }[]) {
        const svc = serviceOf(a.service);
        if (!svc) continue;
        const amount = applyBps(Number(w.budget), a.bps);
        const existing = await tx.budgetItem.findFirst({ where: { weddingId: id, serviceKey: a.service } });
        if (existing) await tx.budgetItem.update({ where: { id: existing.id }, data: { planned: amount } });
        else await tx.budgetItem.create({ data: { weddingId: id, serviceKey: a.service, label: svc.label, planned: amount } });
      }
    });
    return this.detail(userId, id);
  }

  async addEvent(userId: string, id: string, b: z.output<typeof EventSchema>) { await this.own(userId, id); return this.prisma.weddingEvent.create({ data: { ...b, weddingId: id, date: toDate(b.date) } }); }
  async updateEvent(userId: string, id: string, eventId: string, b: z.output<typeof EventSchema>) { await this.own(userId, id); return this.prisma.weddingEvent.updateMany({ where: { id: eventId, weddingId: id }, data: { ...b, date: toDate(b.date) } }); }
  async removeEvent(userId: string, id: string, eventId: string) { await this.own(userId, id); await this.prisma.weddingEvent.deleteMany({ where: { id: eventId, weddingId: id } }); return { ok: true }; }
  async addBudget(userId: string, id: string, b: z.output<typeof BudgetItemSchema>) { await this.own(userId, id); return this.prisma.budgetItem.create({ data: { ...b, weddingId: id } }); }
  async updateBudget(userId: string, id: string, itemId: string, b: z.output<typeof BudgetUpdateSchema>) { await this.own(userId, id); await this.prisma.budgetItem.updateMany({ where: { id: itemId, weddingId: id }, data: b }); return { ok: true }; }
  async removeBudget(userId: string, id: string, itemId: string) { await this.own(userId, id); await this.prisma.budgetItem.deleteMany({ where: { id: itemId, weddingId: id } }); return { ok: true }; }
  async addCheck(userId: string, id: string, b: z.output<typeof ChecklistItemSchema>) { await this.own(userId, id); const sortOrder = await this.prisma.checklistItem.count({ where: { weddingId: id } }); return this.prisma.checklistItem.create({ data: { title: b.title, done: b.done ?? false, dueDate: toDate(b.dueDate), weddingId: id, sortOrder } }); }
  async updateCheck(userId: string, id: string, itemId: string, b: z.output<typeof ChecklistItemSchema>) { await this.own(userId, id); await this.prisma.checklistItem.updateMany({ where: { id: itemId, weddingId: id }, data: { title: b.title, done: b.done, dueDate: toDate(b.dueDate) } }); return { ok: true }; }
  async removeCheck(userId: string, id: string, itemId: string) { await this.own(userId, id); await this.prisma.checklistItem.deleteMany({ where: { id: itemId, weddingId: id } }); return { ok: true }; }
}

@Controller('weddings')
export class WeddingsController {
  constructor(private s: WeddingsService) {}
  @Get() list(@Auth() a: AuthCtx) { return this.s.list(a.userId); }
  @Post() create(@Auth() a: AuthCtx, @Body(Z(WeddingSchema)) b: any) { return this.s.create(a.userId, b); }
  @Post('plan') plan(@Auth() a: AuthCtx, @Body(Z(PlanSchema)) b: any) { return this.s.plan(a.userId, b); }
  @Get(':id') detail(@Auth() a: AuthCtx, @Param('id') id: string) { return this.s.detail(a.userId, id); }
  @Get(':id/results') results(@Auth() a: AuthCtx, @Param('id') id: string) { return this.s.results(a.userId, id); }
  @Get(':id/recommendations') recommendations(@Auth() a: AuthCtx, @Param('id') id: string) { return this.s.recommendations(a.userId, id); }
  @HttpCode(200) @Post(':id/budget/apply-suggestion') apply(@Auth() a: AuthCtx, @Param('id') id: string) { return this.s.applySuggestion(a.userId, id); }
  @Patch(':id') update(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(WeddingSchema)) b: any) { return this.s.update(a.userId, id, b); }
  @Delete(':id') remove(@Auth() a: AuthCtx, @Param('id') id: string) { return this.s.remove(a.userId, id); }
  @Post(':id/events') addEvent(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(EventSchema)) b: any) { return this.s.addEvent(a.userId, id, b); }
  @Patch(':id/events/:eid') upEvent(@Auth() a: AuthCtx, @Param('id') id: string, @Param('eid') e: string, @Body(Z(EventSchema)) b: any) { return this.s.updateEvent(a.userId, id, e, b); }
  @Delete(':id/events/:eid') rmEvent(@Auth() a: AuthCtx, @Param('id') id: string, @Param('eid') e: string) { return this.s.removeEvent(a.userId, id, e); }
  @Post(':id/budget') addBudget(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(BudgetItemSchema)) b: any) { return this.s.addBudget(a.userId, id, b); }
  @HttpCode(200) @Patch(':id/budget/:iid') upBudget(@Auth() a: AuthCtx, @Param('id') id: string, @Param('iid') i: string, @Body(Z(BudgetUpdateSchema)) b: any) { return this.s.updateBudget(a.userId, id, i, b); }
  @Delete(':id/budget/:iid') rmBudget(@Auth() a: AuthCtx, @Param('id') id: string, @Param('iid') i: string) { return this.s.removeBudget(a.userId, id, i); }
  @Post(':id/checklist') addCheck(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(ChecklistItemSchema)) b: any) { return this.s.addCheck(a.userId, id, b); }
  @HttpCode(200) @Patch(':id/checklist/:iid') upCheck(@Auth() a: AuthCtx, @Param('id') id: string, @Param('iid') i: string, @Body(Z(ChecklistItemSchema)) b: any) { return this.s.updateCheck(a.userId, id, i, b); }
  @Delete(':id/checklist/:iid') rmCheck(@Auth() a: AuthCtx, @Param('id') id: string, @Param('iid') i: string) { return this.s.removeCheck(a.userId, id, i); }
}

@Module({ controllers: [WeddingsController], providers: [WeddingsService, WeddingPersonalizer, GeminiClient], exports: [WeddingPersonalizer] })
export class WeddingsModule {}
