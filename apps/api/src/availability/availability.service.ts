import { Injectable } from '@nestjs/common';
import { OccupancyKind, OccupiedSlot, Slot } from '@prisma/client';
import { PrismaService, Tx } from '../common/prisma.service';

export const slotsFor = (slot: Slot): OccupiedSlot[] => (slot === 'FULL_DAY' ? ['LUNCH', 'DINNER'] : [slot as OccupiedSlot]);

@Injectable()
export class AvailabilityService {
  constructor(private prisma: PrismaService) {}

  /** Clears lapsed holds for one date. Called before claiming so an expired hold never blocks a new customer. */
  private purgeExpired(tx: Tx, listingId: string, date: Date) {
    return tx.occupancy.deleteMany({ where: { listingId, date, kind: 'HOLD', expiresAt: { lt: new Date() } } });
  }

  /**
   * Takes one free unit of each slot, or returns false if any slot is full. Relies on the unique index:
   * ON CONFLICT DO NOTHING means two racing requests cannot both get the last unit, and a failure part-way
   * rolls back with the caller's transaction.
   */
  async claim(tx: Tx, args: { listingId: string; date: Date; slot: Slot; capacity: number; kind: OccupancyKind; bookingId?: string; expiresAt?: Date | null; note?: string | null }): Promise<boolean> {
    await this.purgeExpired(tx, args.listingId, args.date);
    for (const slot of slotsFor(args.slot)) {
      let claimed = false;
      for (let unit = 0; unit < args.capacity && !claimed; unit++) {
        const res = await tx.occupancy.createMany({
          data: [{ listingId: args.listingId, date: args.date, slot, unit, kind: args.kind, bookingId: args.bookingId, expiresAt: args.expiresAt, note: args.note }],
          skipDuplicates: true,
        });
        claimed = res.count === 1;
      }
      if (!claimed) return false;
    }
    return true;
  }

  confirm(tx: Tx, bookingId: string) {
    return tx.occupancy.updateMany({ where: { bookingId }, data: { kind: 'BOOKED', expiresAt: null } });
  }

  release(tx: Tx, bookingId: string) {
    return tx.occupancy.deleteMany({ where: { bookingId } });
  }

  /** A manual block closes the whole slot, across every unit a capacity-based vendor has. */
  async block(listingId: string, dates: Date[], slot: Slot, capacity: number, note?: string | null) {
    const skipped: string[] = [];
    for (const date of dates) {
      await this.prisma.$transaction(async (tx) => {
        await this.purgeExpired(tx, listingId, date);
        const res = await tx.occupancy.createMany({
          data: slotsFor(slot).flatMap((s) => Array.from({ length: capacity }, (_, unit) => ({ listingId, date, slot: s, unit, kind: 'BLOCK' as const, note }))),
          skipDuplicates: true,
        });
        if (res.count === 0) skipped.push(date.toISOString().slice(0, 10));
      });
    }
    return { skipped };
  }

  async unblock(listingId: string, dates: Date[], slot: Slot) {
    const res = await this.prisma.occupancy.deleteMany({ where: { listingId, date: { in: dates }, slot: { in: slotsFor(slot) }, kind: 'BLOCK' } });
    return { removed: res.count };
  }

  async calendar(listingId: string, from: Date, to: Date) {
    return this.prisma.occupancy.findMany({
      where: { listingId, date: { gte: from, lt: to }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      select: { date: true, slot: true, unit: true, kind: true, note: true, booking: { select: { id: true, code: true, status: true, customer: { select: { name: true } } } } },
      orderBy: [{ date: 'asc' }, { slot: 'asc' }, { unit: 'asc' }],
    });
  }
}
