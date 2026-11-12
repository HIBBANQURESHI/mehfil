export const BookingStatus = ['PENDING_VENDOR_CONFIRMATION', 'AWAITING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS', 'SERVICE_COMPLETED', 'COMPLETED', 'CANCELLATION_REQUESTED', 'CANCELLED', 'DISPUTED'] as const;
export type BookingStatus = (typeof BookingStatus)[number];

/** The only booking moves the API will accept. Every move is validated here and logged to the timeline. */
export const BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  PENDING_VENDOR_CONFIRMATION: ['AWAITING_PAYMENT', 'CANCELLED'],
  AWAITING_PAYMENT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['IN_PROGRESS', 'SERVICE_COMPLETED', 'CANCELLATION_REQUESTED', 'CANCELLED', 'DISPUTED'],
  IN_PROGRESS: ['SERVICE_COMPLETED', 'CANCELLATION_REQUESTED', 'CANCELLED', 'DISPUTED'],
  SERVICE_COMPLETED: ['COMPLETED', 'DISPUTED'],
  COMPLETED: ['DISPUTED'],
  CANCELLATION_REQUESTED: ['CONFIRMED', 'CANCELLED', 'DISPUTED'],
  CANCELLED: [],
  DISPUTED: ['CONFIRMED', 'COMPLETED', 'CANCELLED'],
};

export const canTransition = (from: BookingStatus, to: BookingStatus) => BOOKING_TRANSITIONS[from].includes(to);

const titleCase = (s: string) => s.toLowerCase().split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

const OVERRIDES: Record<string, string> = {
  PENDING_VENDOR_CONFIRMATION: 'Awaiting vendor',
  NOT_DUE: 'Not due yet',
  DUE: 'Ready for payout',
  QUOTATION_SENT: 'Quote sent',
  COMMISSION_DUE: 'Due',
};
export const statusLabel = (s: string) => OVERRIDES[s] ?? titleCase(s);

export type StatusTone = 'good' | 'warn' | 'bad' | 'neutral' | 'info';
const GOOD = ['ACTIVE', 'APPROVED', 'PUBLISHED', 'ACCEPTED', 'CONFIRMED', 'COMPLETED', 'SUCCEEDED', 'PAID', 'RESOLVED', 'PROCESSED'];
const BAD = ['BLOCKED', 'REJECTED', 'DECLINED', 'CANCELLED', 'FAILED', 'DISPUTED', 'SUSPENDED', 'DELETED', 'WITHDRAWN', 'REFUNDED', 'OVERDUE'];
const WARN = ['PENDING_VENDOR_CONFIRMATION', 'AWAITING_PAYMENT', 'SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUIRED', 'PENDING_REVIEW', 'CANCELLATION_REQUESTED', 'RECONCILIATION_REQUIRED', 'REQUESTED', 'ON_HOLD', 'PARTIALLY_REFUNDED', 'OPEN', 'NEW', 'PENDING'];
const INFO = ['SENT', 'VIEWED', 'RESPONDED', 'QUOTATION_SENT', 'IN_PROGRESS', 'SERVICE_COMPLETED', 'DUE', 'PROCESSING', 'INITIATED', 'COMMISSION_DUE'];
export function statusTone(s: string): StatusTone {
  if (GOOD.includes(s)) return 'good';
  if (BAD.includes(s)) return 'bad';
  if (WARN.includes(s)) return 'warn';
  if (INFO.includes(s)) return 'info';
  return 'neutral';
}

export const ADMIN_PERMISSIONS = {
  'vendors.review': 'Verify and moderate vendors',
  'listings.manage': 'Moderate listings',
  'catalog.manage': 'Manage cities and categories',
  'bookings.manage': 'Manage bookings and disputes',
  'users.manage': 'Manage customers',
  'finance.view': 'View payments and reports',
  'finance.manage': 'Refunds, payouts and commission',
  'reviews.moderate': 'Moderate reviews',
  'support.manage': 'Handle support tickets',
  'settings.manage': 'Platform settings and policies',
  'admins.manage': 'Manage admin users and roles',
  'audit.view': 'View audit logs',
} as const;
export type AdminPermission = keyof typeof ADMIN_PERMISSIONS;

export const VendorRole = ['OWNER', 'MANAGER', 'SALES', 'FINANCE', 'COORDINATOR'] as const;
export type VendorRole = (typeof VendorRole)[number];
export type VendorArea = 'business' | 'listings' | 'enquiries' | 'bookings' | 'calendar' | 'finance' | 'team' | 'reviews';

export const VENDOR_ROLE_AREAS: Record<VendorRole, VendorArea[]> = {
  OWNER: ['business', 'listings', 'enquiries', 'bookings', 'calendar', 'finance', 'team', 'reviews'],
  MANAGER: ['listings', 'enquiries', 'bookings', 'calendar', 'reviews'],
  SALES: ['enquiries'],
  FINANCE: ['finance'],
  COORDINATOR: ['calendar', 'bookings'],
};

export const Slot = ['LUNCH', 'DINNER', 'FULL_DAY'] as const;
export type Slot = (typeof Slot)[number];
export const EventType = ['DHOLKI', 'MAYUN', 'MEHNDI', 'NIKAH', 'BARAAT', 'WALIMA', 'ENGAGEMENT', 'OTHER'] as const;
export type EventType = (typeof EventType)[number];
export const DocumentType = ['CNIC_FRONT', 'CNIC_BACK', 'BUSINESS_REGISTRATION', 'OWNERSHIP_PROOF', 'NTN_CERTIFICATE', 'OTHER'] as const;
export type DocumentType = (typeof DocumentType)[number];
export const TicketCategory = ['VENDOR_NOT_RESPONDING', 'VENDOR_CANCELLED', 'PAYMENT_ISSUE', 'WRONG_PRICING', 'SERVICE_NOT_DELIVERED', 'REFUND_REQUEST', 'ACCOUNT', 'OTHER'] as const;
export type TicketCategory = (typeof TicketCategory)[number];
