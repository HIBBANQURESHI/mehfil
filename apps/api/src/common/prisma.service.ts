import { Global, Injectable, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

export type Tx = Prisma.TransactionClient;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }

  /** Next value of a human-readable reference such as BK-1001. */
  async nextCode(tx: Tx, prefix: string): Promise<string> {
    const rows = await tx.$queryRaw<{ value: number }[]>`
      INSERT INTO "Sequence" ("name", "value") VALUES (${prefix}, 1001)
      ON CONFLICT ("name") DO UPDATE SET "value" = "Sequence"."value" + 1
      RETURNING "value"`;
    return `${prefix}-${rows[0].value}`;
  }

  /** Row-locks a booking so money and status changes on it are applied one at a time. */
  async lockBooking(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT 1 FROM "Booking" WHERE "id" = ${id} FOR UPDATE`;
  }
}

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
