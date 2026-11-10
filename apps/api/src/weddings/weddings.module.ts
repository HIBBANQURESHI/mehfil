import { Body, Controller, Delete, Get, HttpCode, Injectable, Module, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { BudgetItemSchema, ChecklistItemSchema, EventSchema, statusLabel, WeddingSchema } from '@mehfil/shared';
import { Auth, AuthCtx } from '../common/auth';
import { dateOnly, Z } from '../common/http';
import { PrismaService } from '../common/prisma.service';

const toDate = (v?: string | null) => (v ? dateOnly(v) : v === null ? null : undefined);
const COUNTED = ['AWAITING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS', 'SERVICE_COMPLETED', 'COMPLETED', 'CANCELLATION_REQUESTED', 'DISPUTED'] as const;

const STARTER_CHECKLIST = ['Select wedding venue', 'Book caterer', 'Finalize decoration', 'Book photographer', 'Confirm guest count', 'Confirm event schedule'];

@Injectable()
export class WeddingsService {
  constructor(private prisma: PrismaService) {}

  private async own(userId: string, id: string) {
    const w = await this.prisma.wedding.findFirst({ where: { id, customerId: userId } });
    if (!w) throw new NotFoundException('Wedding not found');
    return w;
  }

  list(userId: string) {
    return this.prisma.wedding.findMany({ where: { customerId: userId }, orderBy: { createdAt: 'desc' }, include: { city: true, events: { orderBy: { date: 'asc' } }, _count: { select: { checklist: true } } } });
  }

  async create(userId: string, b: z.output<typeof WeddingSchema>) {
    const { eventTypes, ...rest } = b;
    return this.prisma.wedding.create({
      data: {
        ...rest, customerId: userId, dateFrom: toDate(b.dateFrom), dateTo: toDate(b.dateTo),
        events: { create: eventTypes.map((type) => ({ type, name: statusLabel(type) })) },
        checklist: { create: STARTER_CHECKLIST.map((title, sortOrder) => ({ title, sortOrder })) },
      },
      include: { events: true },
    });
  }

  async update(userId: string, id: string, b: z.output<typeof WeddingSchema>) {
    await this.own(userId, id);
    const { eventTypes: _e, ...rest } = b;
    return this.prisma.wedding.update({ where: { id }, data: { ...rest, dateFrom: toDate(b.dateFrom), dateTo: toDate(b.dateTo) } });
  }

  async remove(userId: string, id: string) { await this.own(userId, id); await this.prisma.wedding.delete({ where: { id } }); return { ok: true }; }

  /** Budget figures are computed from the customer's own plan and real bookings, never stored totals. */
  async detail(userId: string, id: string) {
    await this.own(userId, id);
    const w = await this.prisma.wedding.findUniqueOrThrow({ where: { id }, include: { city: true, events: { orderBy: [{ date: 'asc' }] }, budgetItems: { include: { category: true } }, checklist: { orderBy: [{ done: 'asc' }, { sortOrder: 'asc' }] } } });
    const enquiries = await this.prisma.enquiry.findMany({ where: { weddingId: id }, select: { id: true, code: true, status: true, eventDate: true, listing: { select: { title: true, categoryId: true, category: { select: { name: true } } } }, vendor: { select: { businessName: true } }, quotations: { where: { booking: { isNot: null } }, select: { booking: { select: { id: true, code: true, status: true, totalAmount: true, eventDate: true, listing: { select: { categoryId: true } }, payments: { where: { status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED'] } }, select: { amount: true, refundedAmount: true } }, milestones: { where: { status: 'PENDING' }, select: { label: true, amount: true, dueDate: true } } } } } } } });
    const bookings = enquiries.flatMap((e) => e.quotations.map((q) => ({ ...q.booking!, vendorName: e.vendor.businessName, listingTitle: e.listing.title, categoryName: e.listing.category.name }))).filter((b) => (COUNTED as readonly string[]).includes(b.status));
    const booked = bookings.reduce((s, b) => s + Number(b.totalAmount), 0);
    const paid = bookings.reduce((s, b) => s + b.payments.reduce((p, x) => p + Number(x.amount) - Number(x.refundedAmount), 0), 0);
    const planned = w.budgetItems.reduce((s, b) => s + Number(b.planned), 0);
    const budgetLines = w.budgetItems.map((item) => ({ ...item, actual: item.categoryId ? bookings.filter((b) => b.listing.categoryId === item.categoryId).reduce((s, b) => s + Number(b.totalAmount), 0) : 0 }));
    return { ...w, budgetItems: budgetLines, enquiries: enquiries.map(({ quotations: _q, ...e }) => e), bookings, summary: { budget: w.budget === null ? null : Number(w.budget), planned, booked, paid, remainingToPay: booked - paid, remainingBudget: w.budget === null ? null : Number(w.budget) - booked } };
  }

  async addEvent(userId: string, id: string, b: z.output<typeof EventSchema>) { await this.own(userId, id); return this.prisma.weddingEvent.create({ data: { ...b, weddingId: id, date: toDate(b.date) } }); }
  async updateEvent(userId: string, id: string, eventId: string, b: z.output<typeof EventSchema>) { await this.own(userId, id); return this.prisma.weddingEvent.updateMany({ where: { id: eventId, weddingId: id }, data: { ...b, date: toDate(b.date) } }); }
  async removeEvent(userId: string, id: string, eventId: string) { await this.own(userId, id); await this.prisma.weddingEvent.deleteMany({ where: { id: eventId, weddingId: id } }); return { ok: true }; }
  async addBudget(userId: string, id: string, b: z.output<typeof BudgetItemSchema>) { await this.own(userId, id); return this.prisma.budgetItem.create({ data: { ...b, weddingId: id } }); }
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
  @Get(':id') detail(@Auth() a: AuthCtx, @Param('id') id: string) { return this.s.detail(a.userId, id); }
  @Patch(':id') update(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(WeddingSchema)) b: any) { return this.s.update(a.userId, id, b); }
  @Delete(':id') remove(@Auth() a: AuthCtx, @Param('id') id: string) { return this.s.remove(a.userId, id); }
  @Post(':id/events') addEvent(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(EventSchema)) b: any) { return this.s.addEvent(a.userId, id, b); }
  @Patch(':id/events/:eid') upEvent(@Auth() a: AuthCtx, @Param('id') id: string, @Param('eid') e: string, @Body(Z(EventSchema)) b: any) { return this.s.updateEvent(a.userId, id, e, b); }
  @Delete(':id/events/:eid') rmEvent(@Auth() a: AuthCtx, @Param('id') id: string, @Param('eid') e: string) { return this.s.removeEvent(a.userId, id, e); }
  @Post(':id/budget') addBudget(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(BudgetItemSchema)) b: any) { return this.s.addBudget(a.userId, id, b); }
  @Delete(':id/budget/:iid') rmBudget(@Auth() a: AuthCtx, @Param('id') id: string, @Param('iid') i: string) { return this.s.removeBudget(a.userId, id, i); }
  @Post(':id/checklist') addCheck(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(ChecklistItemSchema)) b: any) { return this.s.addCheck(a.userId, id, b); }
  @HttpCode(200) @Patch(':id/checklist/:iid') upCheck(@Auth() a: AuthCtx, @Param('id') id: string, @Param('iid') i: string, @Body(Z(ChecklistItemSchema)) b: any) { return this.s.updateCheck(a.userId, id, i, b); }
  @Delete(':id/checklist/:iid') rmCheck(@Auth() a: AuthCtx, @Param('id') id: string, @Param('iid') i: string) { return this.s.removeCheck(a.userId, id, i); }
}

@Module({ controllers: [WeddingsController], providers: [WeddingsService] })
export class WeddingsModule {}
