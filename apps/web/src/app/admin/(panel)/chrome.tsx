'use client';
import { AdminPermission } from '@mehfil/shared';
import { NavItem, NavSection, Shell } from '@/components/shell';

const ITEMS: { title?: string; items: (NavItem & { perm?: AdminPermission })[] }[] = [
  { items: [{ href: '/admin', label: 'Dashboard', icon: 'LayoutDashboard' }] },
  { title: 'Marketplace', items: [{ href: '/admin/vendors', label: 'Vendors', icon: 'Store', perm: 'vendors.review' }, { href: '/admin/listings', label: 'Listings', icon: 'Tags', perm: 'listings.manage' }, { href: '/admin/customers', label: 'Customers', icon: 'Users', perm: 'users.manage' }, { href: '/admin/catalog', label: 'Categories and cities', icon: 'BookOpen', perm: 'catalog.manage' }] },
  { title: 'Operations', items: [{ href: '/admin/bookings', label: 'Bookings', icon: 'ClipboardCheck', perm: 'bookings.manage' }, { href: '/admin/enquiries', label: 'Enquiries', icon: 'Inbox', perm: 'bookings.manage' }, { href: '/admin/quotations', label: 'Quotations', icon: 'FileText', perm: 'bookings.manage' }, { href: '/admin/reviews', label: 'Reviews', icon: 'Star', perm: 'reviews.moderate' }, { href: '/admin/support', label: 'Support', icon: 'Headphones', perm: 'support.manage' }, { href: '/admin/contact', label: 'Contact messages', icon: 'Mail', perm: 'support.manage' }] },
  { title: 'Finance', items: [{ href: '/admin/payments', label: 'Payments', icon: 'CreditCard', perm: 'finance.view' }, { href: '/admin/refunds', label: 'Refunds', icon: 'Receipt', perm: 'finance.view' }, { href: '/admin/payouts', label: 'Vendor payouts', icon: 'Banknote', perm: 'finance.view' }, { href: '/admin/commissions', label: 'Commissions', icon: 'Landmark', perm: 'finance.view' }, { href: '/admin/ledger', label: 'Ledger', icon: 'ListChecks', perm: 'finance.view' }, { href: '/admin/reports', label: 'Reports', icon: 'FileBarChart', perm: 'finance.view' }] },
  { title: 'System', items: [{ href: '/admin/settings', label: 'Settings and policies', icon: 'Settings', perm: 'settings.manage' }, { href: '/admin/staff', label: 'Staff and roles', icon: 'ShieldCheck', perm: 'admins.manage' }, { href: '/admin/audit-logs', label: 'Audit logs', icon: 'History', perm: 'audit.view' }, { href: '/admin/account', label: 'My security', icon: 'Wallet' }] },
];

export function AdminChrome({ name, role, isSuper, permissions, children }: { name: string; role: string; isSuper: boolean; permissions: string[]; children: React.ReactNode }) {
  const sections: NavSection[] = ITEMS.map((s) => ({ ...s, items: s.items.filter((i) => !i.perm || isSuper || permissions.includes(i.perm)) })).filter((s) => s.items.length);
  return <Shell sections={sections} root="/admin" notificationsHref="/admin/notifications" userName={name} subtitle={role}>{children}</Shell>;
}
