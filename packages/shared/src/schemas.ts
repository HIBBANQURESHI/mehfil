import { z } from 'zod';
import { DocumentType, EventType, Slot, TicketCategory } from './status';
import { MAX_AMOUNT } from './money';

const paisa = z.number().int().min(0).max(MAX_AMOUNT);
const bps = z.number().int().min(0).max(10_000);
const text = (max = 200) => z.string().trim().min(1).max(max);
const optText = (max = 200) => z.string().trim().max(max).optional().nullable();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const url = z.string().trim().url().max(500).refine((v) => /^https?:\/\//i.test(v), 'Links must start with http:// or https://');
const optUrl = url.optional().nullable().or(z.literal('').transform(() => null));
const uuid = z.string().uuid();
const optUuid = uuid.optional().nullable();

/** Accepts 03XXXXXXXXX, 923XXXXXXXXX and +923XXXXXXXXX and normalises to E.164. */
export const pkPhone = z.string().trim().transform((v) => v.replace(/[\s-]/g, ''))
  .refine((v) => /^(\+?92|0)3\d{9}$/.test(v), 'Enter a valid Pakistani mobile number, e.g. 03001234567')
  .transform((v) => `+92${v.slice(-10)}`);
export const password = z.string().min(10, 'Use at least 10 characters').max(128)
  .refine((v) => /[a-zA-Z]/.test(v) && /\d/.test(v), 'Use letters and at least one number');
const email = z.string().trim().toLowerCase().email().max(200);
const otp = z.string().regex(/^\d{6}$/, 'Enter the 6-digit code');

export const RegisterSchema = z.object({
  name: text(100), phone: pkPhone, email: email.optional().nullable().or(z.literal('').transform(() => null)), password,
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Please accept the terms' }) }),
});
export const VerifyOtpSchema = z.object({ phone: pkPhone, code: otp });
export const ResendOtpSchema = z.object({ phone: pkPhone });
export const LoginSchema = z.object({ identifier: text(200), password: z.string().min(1).max(128) });
export const AdminLoginSchema = z.object({ email, password: z.string().min(1).max(128), totp: otp.optional() });
export const AdminEnrollSchema = z.object({ enrollToken: z.string().min(10).max(1000), code: otp });
export const RefreshSchema = z.object({ refreshToken: z.string().min(20).max(300) });
export const ForgotSchema = z.object({ identifier: text(200) });
export const ResetSchema = z.object({ identifier: text(200), code: otp, password });
export const ChangePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: password });
export const AcceptInviteSchema = z.object({ token: z.string().min(20).max(200), name: text(100), password, phone: pkPhone.optional() });
export const UpdateProfileSchema = z.object({ name: text(100).optional(), email: email.optional().nullable(), avatarUrl: optUrl, cityId: optUuid });
export const PushTokenSchema = z.object({ token: text(300), platform: z.enum(['android', 'ios', 'web']) });
export const DeleteAccountSchema = z.object({ password: z.string().min(1).max(128) });

export const CitySchema = z.object({ name: text(80), active: z.boolean().default(true) });
export const AreaSchema = z.object({ name: text(80) });
export const CategorySchema = z.object({
  name: text(80), description: optText(500), iconKey: optText(40), imageUrl: optUrl,
  availabilityMode: z.enum(['EXCLUSIVE', 'CAPACITY']), commissionBps: bps.nullable().optional(),
  amenityOptions: z.array(text(60)).max(60).default([]), sortOrder: z.number().int().default(0), active: z.boolean().default(true),
});
export const CancellationPolicySchema = z.object({
  name: text(100), body: text(4000), active: z.boolean().default(true),
  tiers: z.array(z.object({ daysBefore: z.number().int().min(0).max(730), refundBps: bps })).min(1).max(10),
});
export const SettingsSchema = z.object({
  holdHours: z.number().int().min(1).max(168).optional(),
  quoteValidityHours: z.number().int().min(1).max(720).optional(),
  enquiryExpiryDays: z.number().int().min(1).max(90).optional(),
  disputeWindowDays: z.number().int().min(0).max(60).optional(),
  autoCompleteDays: z.number().int().min(1).max(60).optional(),
  requireListingReview: z.boolean().optional(),
});

export const VendorProfileSchema = z.object({
  businessName: text(120), primaryCategoryId: uuid.optional().nullable(), description: z.string().trim().max(4000).optional().nullable(),
  yearEstablished: z.number().int().min(1900).max(2100).optional().nullable(), employees: z.number().int().min(0).max(100000).optional().nullable(),
  website: optUrl, instagram: optText(200), facebook: optText(200), phone: pkPhone.optional().nullable(), whatsapp: pkPhone.optional().nullable(), email: email.optional().nullable(),
  cityId: optUuid, areaId: optUuid, address: optText(300),
  lat: z.number().min(-90).max(90).optional().nullable(), lng: z.number().min(-180).max(180).optional().nullable(),
  serviceAreas: z.array(text(80)).max(50).optional(), workingHours: optText(200), logoUrl: optUrl, coverUrl: optUrl,
});
export const PayoutDetailsSchema = z.object({ bankName: text(100), accountTitle: text(120), iban: z.string().trim().toUpperCase().regex(/^PK\d{2}[A-Z]{4}[A-Z0-9]{16}$/, 'Enter a valid Pakistani IBAN') });
export const DocumentMetaSchema = z.object({ type: z.enum(DocumentType) });
export const SubmitVendorSchema = z.object({ acceptTerms: z.literal(true) });
export const VendorDecisionSchema = z.object({ decision: z.enum(['APPROVE', 'REJECT', 'REQUEST_CHANGES', 'SUSPEND', 'REACTIVATE']), reason: optText(1000) })
  .refine((v) => v.decision === 'APPROVE' || v.decision === 'REACTIVATE' || !!v.reason, { message: 'A reason is required', path: ['reason'] });
export const VendorFeatureSchema = z.object({ featuredUntil: isoDate.nullable() });
export const VendorCommissionSchema = z.object({ commissionBpsOverride: bps.nullable(), reason: text(500) });
export const VendorInviteSchema = z.object({ email, role: z.enum(['MANAGER', 'SALES', 'FINANCE', 'COORDINATOR']) });

export const ListingSchema = z.object({
  categoryId: uuid, title: text(120), description: text(5000), cityId: uuid, areaId: optUuid,
  address: optText(300), lat: z.number().min(-90).max(90).optional().nullable(), lng: z.number().min(-180).max(180).optional().nullable(),
  capacityMin: z.number().int().min(0).max(100000).optional().nullable(), capacityMax: z.number().int().min(0).max(100000).optional().nullable(),
  indoorOutdoor: z.enum(['INDOOR', 'OUTDOOR', 'BOTH']).optional().nullable(), amenities: z.array(text(60)).max(60).default([]),
  startingPrice: paisa, priceUnit: z.enum(['FLAT', 'PER_PERSON']), dailyCapacity: z.number().int().min(1).max(100).default(1),
});
export const ListingMediaSchema = z.object({ url, type: z.enum(['IMAGE', 'VIDEO']).default('IMAGE'), caption: optText(200) });
export const PackageSchema = z.object({
  name: text(120), description: optText(2000), price: paisa, priceUnit: z.enum(['FLAT', 'PER_PERSON']),
  inclusions: z.array(text(200)).max(50).default([]), exclusions: z.array(text(200)).max(50).default([]),
  minGuests: z.number().int().min(0).optional().nullable(), maxGuests: z.number().int().min(0).optional().nullable(), active: z.boolean().default(true),
});
export const AddOnSchema = z.object({ name: text(120), price: paisa });
export const ListingDecisionSchema = z.object({ decision: z.enum(['APPROVE', 'REJECT', 'PAUSE']), reason: optText(1000) });
export const BlockDatesSchema = z.object({ dates: z.array(isoDate).min(1).max(120), slot: z.enum(Slot).default('FULL_DAY'), note: optText(200) });

export const WeddingSchema = z.object({
  title: text(120), cityId: optUuid, budget: paisa.optional().nullable(), guestCount: z.number().int().min(0).max(100000).optional().nullable(),
  dateFrom: isoDate.optional().nullable(), dateTo: isoDate.optional().nullable(), eventTypes: z.array(z.enum(EventType)).max(10).default([]),
});
export const EventSchema = z.object({
  type: z.enum(EventType), name: optText(100), date: isoDate.optional().nullable(), slot: z.enum(Slot).optional().nullable(), venue: optText(200),
  guestCount: z.number().int().min(0).max(100000).optional().nullable(), budget: paisa.optional().nullable(),
});
export const BudgetItemSchema = z.object({ label: text(100), categoryId: optUuid, planned: paisa });
export const ChecklistItemSchema = z.object({ title: text(200), dueDate: isoDate.optional().nullable(), done: z.boolean().optional() });

export const EnquirySchema = z.object({
  listingIds: z.array(uuid).min(1).max(10), packageId: optUuid, weddingId: optUuid, eventId: optUuid,
  eventDate: isoDate, slot: z.enum(Slot).default('FULL_DAY'), guestCount: z.number().int().min(1).max(100000),
  budget: paisa.optional().nullable(), requirements: text(3000),
});
export const DeclineSchema = z.object({ reason: text(1000) });
export const QuotationSchema = z.object({
  enquiryId: uuid,
  lines: z.array(z.object({ description: text(200), quantity: z.number().int().min(1).max(100000), unitPrice: paisa })).min(1).max(50),
  discount: paisa.default(0), taxBps: bps.default(0), notes: optText(2000), terms: optText(4000),
  cancellationPolicyId: uuid, validForHours: z.number().int().min(1).max(720).optional(),
  milestones: z.array(z.object({
    label: text(80), shareBps: z.number().int().min(1).max(10_000),
    dueRule: z.enum(['ON_BOOKING', 'DAYS_BEFORE_EVENT', 'ON_COMPLETION']), dueDays: z.number().int().min(0).max(365).optional().nullable(),
  })).min(1).max(8),
  send: z.boolean().default(false),
}).refine((v) => v.milestones.reduce((a, m) => a + m.shareBps, 0) === 10_000, { message: 'Payment schedule must add up to 100%', path: ['milestones'] })
  .refine((v) => v.milestones[0]?.dueRule === 'ON_BOOKING', { message: 'The first instalment must be due on booking', path: ['milestones'] });

export const ReasonSchema = z.object({ reason: text(1000) });
export const OptionalReasonSchema = z.object({ reason: optText(1000) });
export const StartPaymentSchema = z.object({ milestoneId: uuid });
export const ManualPaymentSchema = z.object({ milestoneId: uuid, reference: text(120), reason: text(500) });
export const RefundDecisionSchema = z.object({ approve: z.boolean(), amount: paisa.optional(), reason: text(500) });
export const RefundRequestSchema = z.object({ paymentId: uuid, amount: paisa.optional(), reason: text(1000) });
export const PayoutDecisionSchema = z.object({ action: z.enum(['APPROVE', 'MARK_PAID', 'FAIL']), reference: optText(120), reason: optText(500) });
export const CommissionReceiptSchema = z.object({ vendorId: uuid, amount: paisa.min(1), reference: text(120) });
export const LedgerAdjustmentSchema = z.object({ vendorId: optUuid, bookingId: optUuid, amount: z.number().int().min(-MAX_AMOUNT).max(MAX_AMOUNT), memo: text(500) });

export const DisputeResolutionSchema = z.object({ outcome: z.enum(['CONFIRMED', 'COMPLETED', 'CANCELLED']), reason: text(1000) });
export const ReviewSchema = z.object({ rating: z.number().int().min(1).max(5), comment: text(3000), photos: z.array(url).max(6).default([]) });
export const ReviewReplySchema = z.object({ reply: text(2000) });
export const ReviewModerationSchema = z.object({ action: z.enum(['HIDE', 'RESTORE', 'DISMISS']), reason: text(500) });
export const MessageSchema = z.object({ body: text(4000) });
export const StartConversationSchema = z.object({ vendorId: uuid, body: text(4000) });
export const TicketSchema = z.object({ category: z.enum(TicketCategory), subject: text(160), body: text(4000), bookingId: optUuid });
export const TicketReplySchema = z.object({ body: text(4000), internal: z.boolean().default(false) });
export const TicketUpdateSchema = z.object({ status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(), priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(), assignedToId: uuid.nullable().optional() });
export const AdminInviteSchema = z.object({ email, roleId: uuid });
export const AdminRoleSchema = z.object({ name: text(60), permissions: z.array(z.string().max(40)).max(40) });
export const UserStatusSchema = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'BLOCKED']), reason: text(500) });
export const ContactSchema = z.object({ name: text(100), email, phone: optText(30), message: text(3000) });
