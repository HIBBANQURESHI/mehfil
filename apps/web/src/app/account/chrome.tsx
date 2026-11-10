'use client';
import { NavSection, Shell } from '@/components/shell';
const SECTIONS: NavSection[] = [
  { items: [{ href: '/account', label: 'Dashboard', icon: 'LayoutDashboard' }, { href: '/account/weddings', label: 'My wedding', icon: 'HeartHandshake' }, { href: '/search', label: 'Find vendors', icon: 'Store' }, { href: '/account/saved', label: 'Saved vendors', icon: 'Heart' }] },
  { title: 'Bookings', items: [{ href: '/account/enquiries', label: 'My enquiries', icon: 'Inbox' }, { href: '/account/quotations', label: 'Quotations', icon: 'FileText' }, { href: '/account/bookings', label: 'My bookings', icon: 'ClipboardCheck' }, { href: '/account/payments', label: 'Payments', icon: 'CreditCard' }, { href: '/account/calendar', label: 'Calendar', icon: 'CalendarDays' }] },
  { title: 'More', items: [{ href: '/account/messages', label: 'Messages', icon: 'MessageCircle' }, { href: '/account/reviews', label: 'My reviews', icon: 'Star' }, { href: '/account/support', label: 'Help and support', icon: 'LifeBuoy' }, { href: '/account/settings', label: 'Profile and settings', icon: 'Settings' }] },
];
export function AccountChrome({ name, children }: { name: string; children: React.ReactNode }) {
  return <Shell sections={SECTIONS} root="/account" notificationsHref="/account/notifications" userName={name}>{children}</Shell>;
}
