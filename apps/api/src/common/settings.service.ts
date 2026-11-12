import { Global, Injectable, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** Operational defaults only. Nothing that moves money lives here; commission and refund terms are set by admins. */
export const SETTING_DEFAULTS = {
  holdHours: 48,
  quoteValidityHours: 72,
  enquiryExpiryDays: 14,
  disputeWindowDays: 3,
  autoCompleteDays: 7,
  requireListingReview: true,
  // Cash and vendor-collected payments.
  allowCash: true,
  requireOnlineDeposit: false,
  cashAutoConfirmDays: 3,
  commissionDueDays: 7,
  restrictOverdueVendors: true,
  commissionPaymentInstructions: '',
};
export type Settings = typeof SETTING_DEFAULTS;

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async all(): Promise<Settings> {
    const rows = await this.prisma.platformSetting.findMany();
    return { ...SETTING_DEFAULTS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) } as Settings;
  }

  async update(patch: Partial<Settings>) {
    await this.prisma.$transaction(Object.entries(patch).map(([key, value]) =>
      this.prisma.platformSetting.upsert({ where: { key }, create: { key, value: value as never }, update: { value: value as never } })));
    return this.all();
  }
}

@Global()
@Module({ providers: [SettingsService], exports: [SettingsService] })
export class SettingsModule {}
