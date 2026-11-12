'use client';
import { Bell, CalendarDays, ChartColumn, ClipboardCheck, CreditCard, FileText, Headphones, Heart, HeartHandshake, History, Inbox, LayoutDashboard, LifeBuoy, ListChecks, LogOut, Mail, Menu, MessageCircle, PiggyBank, Settings, ShieldCheck, Star, Store, Tags, Users, Wallet, X, BookOpen, Landmark, Receipt, Banknote, FileBarChart } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useState } from 'react';
import { brand } from '@mehfil/shared';
import { Logo } from './brand';

// Burgundy, the brand's deepest tone, with blush text and gold accents.
const SIDEBAR = 'relative overflow-hidden bg-[linear-gradient(180deg,#5E1F31_0%,#4A1726_55%,#3A1220_100%)] text-blush';
import { session, useApi } from '@/lib/api';

const ICONS = { Bell, CalendarDays, ChartColumn, ClipboardCheck, CreditCard, FileText, Headphones, Heart, HeartHandshake, History, Inbox, LayoutDashboard, LifeBuoy, ListChecks, Mail, MessageCircle, PiggyBank, Settings, ShieldCheck, Star, Store, Tags, Users, Wallet, BookOpen, Landmark, Receipt, Banknote, FileBarChart };
export type IconName = keyof typeof ICONS;
export interface NavItem { href: string; label: string; icon: IconName }
export interface NavSection { title?: string; items: NavItem[] }

export function Shell({ sections, root, notificationsHref, userName, subtitle, children }: { sections: NavSection[]; root: string; notificationsHref: string; userName: string; subtitle?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const { data } = useApi<{ unread: number }>('/notifications?pageSize=1', { refreshInterval: 45_000 });
  const logout = async () => { await session('logout'); window.location.href = root === '/admin' ? '/admin/login' : '/'; };
  const isActive = (href: string) => (href === root ? path === root : path === href || path.startsWith(`${href}/`));
  const nav = (
    <nav className="sidebar-scroll flex-1 space-y-5 overflow-y-auto px-3 pb-6 pt-2">
      {sections.map((s, i) => (
        <div key={i}>
          {s.title && <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[.14em] text-rose/80">{s.title}</p>}
          {s.items.map((item) => { const Icon = ICONS[item.icon]; const active = isActive(item.href); return (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)} aria-current={active ? 'page' : undefined} className={`relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${active ? 'bg-white/12 font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.12)] ring-1 ring-white/10' : 'text-blush/80 hover:bg-white/8 hover:text-white'}`}>{active && <span aria-hidden className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-gold" />}<Icon className={`size-4 shrink-0 ${active ? 'text-gold' : 'text-rose'}`} aria-hidden />{item.label}</Link>
          ); })}
        </div>
      ))}
    </nav>
  );
  const glow = <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(ellipse_at_30%_0%,rgba(217,140,157,.28),transparent_70%)]" />;
  const foot = <div className="relative border-t border-white/10 px-5 py-4"><p className="text-xs italic text-gold/90">{brand.tagline}</p></div>;
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[256px_1fr]">
      <aside className={`sticky top-0 hidden h-screen flex-col lg:flex ${SIDEBAR}`}>{glow}<div className="relative flex h-20 items-center px-4"><Logo href={root} size="lg" onDark /></div>{nav}{foot}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-[#2A0B14]/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className={`absolute inset-y-0 left-0 flex w-72 flex-col shadow-2xl ${SIDEBAR}`}>{glow}<div className="relative flex h-20 items-center justify-between px-4"><Logo href={root} size="lg" onDark /><button onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-full p-1.5 text-blush hover:bg-white/10 hover:text-white"><X className="size-5" /></button></div>{nav}{foot}</aside>
        </div>
      )}
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-line bg-warm/95 px-4 backdrop-blur lg:px-8">
          <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="size-6" /></button>
          <p className="hidden truncate text-sm text-muted sm:block">{subtitle}</p>
          <div className="flex items-center gap-3">
            <Link href={notificationsHref} aria-label={`Notifications${data?.unread ? `, ${data.unread} unread` : ''}`} className="relative rounded-full p-2 hover:bg-blush"><Bell className="size-5" />{!!data?.unread && <span className="tnum absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-ruby px-1 text-[11px] font-semibold text-white">{data.unread > 99 ? '99+' : data.unread}</span>}</Link>
            <span className="hidden text-sm font-medium sm:block">{userName}</span>
            <button onClick={logout} aria-label="Sign out" title="Sign out" className="rounded-full p-2 hover:bg-blush"><LogOut className="size-5" /></button>
          </div>
        </header>
        <main className="mx-auto max-w-6xl p-4 pb-16 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
