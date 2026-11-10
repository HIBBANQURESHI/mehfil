import './common/bigint';
import { Controller, ExecutionContext, Get, Module } from '@nestjs/common';
import type { Request } from 'express';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './common/audit.service';
import { AuthGuard, Public } from './common/auth';
import { env } from './common/config';
import { safeEqual } from './common/crypto';
import { AllExceptionsFilter } from './common/http';
import { PrismaModule, PrismaService } from './common/prisma.service';
import { SettingsModule } from './common/settings.service';
import { AdminModule } from './admin/admin.module';
import { AuthModule, jwtModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { JobsModule } from './jobs/jobs.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { NotificationsModule } from './notifications/notifications.module';
import { StorageModule } from './storage/storage.module';
import { VendorsModule } from './vendors/vendors.module';
import { WeddingsModule } from './weddings/weddings.module';

/** The web server renders pages for everyone from one address, so it presents a key instead of being limited as one client. */
function skipThrottle(ctx: ExecutionContext) {
  if (env.NODE_ENV === 'test') return true;
  const given = ctx.switchToHttp().getRequest<Request>().headers['x-internal-key'];
  return !!env.INTERNAL_API_KEY && typeof given === 'string' && safeEqual(given, env.INTERNAL_API_KEY);
}

@Controller('health')
class HealthController {
  constructor(private prisma: PrismaService) {}
  @Public() @Get() async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}

@Module({
  imports: [
    ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }], skipIf: skipThrottle }),
    jwtModule, PrismaModule, AuditModule, SettingsModule, NotificationsModule, StorageModule,
    AuthModule, CatalogModule, VendorsModule, WeddingsModule, MarketplaceModule, AdminModule, JobsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
