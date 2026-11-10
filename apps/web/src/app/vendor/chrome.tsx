'use client';
import { statusLabel, VENDOR_ROLE_AREAS, VendorArea, VendorRole } from '@mehfil/shared';
import Link from 'next/link';
import { NavItem, NavSection, Shell } from '@/components/shell';

const ITEMS: { title?: string; items: (NavItem & { area?: VendorArea })[] }[] = [
  { items: [{ href: '/vendor', label: 'Overview', icon: 'LayoutDashboard' }, { href: '/vendor/onboarding', label: 'Business profile', icon: 'Store', area: 'business' }] },
  { title: 'Catalogue', items: [{ href: '/vendor/listings', label: 'Listings and packages', icon: 'Tags', area: 'listings' }, { href: '/vendor/calendar', label: 'Calendar', icon: 'CalendarDays', area: 'calendar' }] },
  { title: 'Sales', items: [{ href: '/vendor/enquiries', label: 'Enquiries', icon: 'Inbox', area: 'enquiries' }, { href: '/vendor/quotations', label: 'Quotations', icon: 'FileText', area: 'enquiries' }, { href: '/vendor/bookings', label: 'Bookings', icon: 'ClipboardCheck', area: 'bookings' }, { href: '/vendor/customers', label: 'Customers', icon: 'Users', area: 'enquiries' }, { href: '/vendor/messages', label: 'Messages', icon: 'MessageCircle', area: 'enquiries' }] },
  { title: 'Money', items: [{ href: '/vendor/earnings', label: 'Earnings', icon: 'Wallet', area: 'finance' }, { href: '/vendor/payouts', label: 'Payouts', icon: 'PiggyBank', area: 'finance' }] },
  { title: 'Growth', items: [{ href: '/vendor/reviews', label: 'Reviews', icon: 'Star', area: 'reviews' }, { href: '/vendor/analytics', label: 'Analytics', icon: 'ChartColumn' }] },
  { title: 'Account', items: [{ href: '/vendor/team', label: 'Team', icon: 'Users', area: 'team' }, { href: '/vendor/support', label: 'Help and support', icon: 'LifeBuoy' }, { href: '/vendor/settings', label: 'Settings', icon: 'Settings' }] },
];

export function VendorChrome({ name, business, status, reason, role, children }: { name: string; business: string; status: string; reason: string | null; role: string; children: React.ReactNode }) {
  const areas = VENDOR_ROLE_AREAS[role as VendorRole];
  const sections: NavSection[] = ITEMS.map((s) => ({ ...s, items: s.items.filter((i) => !i.area || areas.includes(i.area)) })).filter((s) => s.items.length);
  const banner = status === 'APPROVED' ? null : status === 'SUBMITTED' || status === 'UNDER_REVIEW' ? 'Your application is being reviewed. We will notify you when it is done.' : status === 'SUSPENDED' ? `Your business is suspended: ${reason ?? ''}` : status === 'CHANGES_REQUIRED' ? `Changes needed: ${reason ?? ''}` : status === 'REJECTED' ? `Application not approved: ${reason ?? ''}` : 'Finish your application to start receiving enquiries.';
  return (
    <Shell sections={sections} root="/vendor" notificationsHref="/vendor/notifications" userName={name} subtitle={`${business} · ${statusLabel(status)}`}>
      {banner && <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gold/20 p-4 text-sm"><span>{banner}</span>{['DRAFT', 'CHANGES_REQUIRED', 'REJECTED'].includes(status) && <Link href="/vendor/onboarding" className="font-semibold text-ruby">Continue application</Link>}</div>}
      {children}
    </Shell>
  );
}
