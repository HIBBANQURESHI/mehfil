import { Global, Injectable, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, Tx } from './prisma.service';

export interface AuditEntry { actorId?: string | null; action: string; entity: string; entityId?: string | null; reason?: string | null; before?: unknown; after?: unknown; ip?: string | null }

const json = (v: unknown) => (v === undefined || v === null ? Prisma.JsonNull : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue));

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}
  record(entry: AuditEntry, tx: Tx = this.prisma) {
    return tx.auditLog.create({ data: { actorId: entry.actorId, action: entry.action, entity: entry.entity, entityId: entry.entityId, reason: entry.reason, before: json(entry.before), after: json(entry.after), ip: entry.ip } });
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
