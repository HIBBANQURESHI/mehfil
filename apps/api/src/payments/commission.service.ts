import { ForbiddenException, Injectable } from '@nestjs/common';
import { formatPKR } from '@mehfil/shared';
import { addDays } from '../common/http';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../common/settings.service';

export interface CommissionLine {
  paymentId: string; paymentCode: string; bookingId: string; bookingCode: string; bookingStatus: string; label: string;
  method: string; collected: number; commission: number; paid: number; outstanding: number; dueAt: Date;
  status: 'PAID' | 'DUE' | 'OVERDUE' | 'ON_HOLD';
}

/**
 * Commission on money a vendor collected themselves (cash or direct transfer). Nothing here is stored as a
 * running balance: it is worked out from the payments and the ledger every time, so refunds, reversals and
 * receipts can never leave it out of step. Receipts are applied to the oldest charges first.
 */
@Injectable()
export class CommissionService {
  constructor(private prisma: PrismaService, private settings: SettingsService) {}

  async statement(vendorId: string) {
    const { commissionDueDays } = await this.settings.all();
    const [payments, received] = await Promise.all([
      this.prisma.payment.findMany({
        where: { collectedBy: 'VENDOR', status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'] }, booking: { vendorId } },
        orderBy: { succeededAt: 'asc' },
        include: { booking: { select: { id: true, code: true, status: true } }, milestone: { select: { label: true } } },
      }),
      this.prisma.ledgerEntry.aggregate({ where: { vendorId, type: 'COMMISSION_RECEIVED' }, _sum: { amount: true } }),
    ]);
    let pool = Number(received._sum.amount ?? 0);
    const now = new Date();
    const lines: CommissionLine[] = payments.map((p) => {
      const commission = Math.max(Number(p.commission ?? 0) - Number(p.commissionReversed), 0);
      const paid = Math.min(pool, commission);
      pool -= paid;
      const outstanding = commission - paid;
      const dueAt = p.commissionDueAt ?? addDays(p.succeededAt ?? p.createdAt, commissionDueDays);
      // A booking under dispute isn't chased until the dispute is settled.
      const status = outstanding <= 0 ? 'PAID' : p.booking.status === 'DISPUTED' ? 'ON_HOLD' : dueAt < now ? 'OVERDUE' : 'DUE';
      return { paymentId: p.id, paymentCode: p.code, bookingId: p.booking.id, bookingCode: p.booking.code, bookingStatus: p.booking.status, label: p.milestone.label, method: p.provider, collected: Number(p.amount) - Number(p.refundedAmount), commission, paid, outstanding, dueAt, status };
    });
    const sum = (f: (l: CommissionLine) => number) => lines.reduce((a, l) => a + f(l), 0);
    return {
      lines: [...lines].reverse(),
      totals: {
        owed: sum((l) => l.commission), received: Number(received._sum.amount ?? 0), credit: pool,
        outstanding: sum((l) => l.outstanding), overdue: sum((l) => (l.status === 'OVERDUE' ? l.outstanding : 0)),
        nextDueAt: lines.filter((l) => l.status === 'DUE').map((l) => l.dueAt).sort((a, b) => +a - +b)[0] ?? null,
      },
    };
  }

  async restricted(vendorId: string) {
    const { restrictOverdueVendors } = await this.settings.all();
    if (!restrictOverdueVendors) return false;
    return (await this.statement(vendorId)).totals.overdue > 0;
  }

  /** New business is paused while commission is overdue. Existing bookings carry on as normal. */
  async assertNotRestricted(vendorId: string) {
    if (!(await this.restricted(vendorId))) return;
    const { totals } = await this.statement(vendorId);
    throw new ForbiddenException({ message: `You have ${formatPKR(totals.overdue)} of overdue commission. Please settle it to send quotations and confirm new bookings.`, code: 'COMMISSION_OVERDUE' });
  }
}
