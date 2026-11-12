'use client';
import { Bell, CalendarDays, ChartColumn, ClipboardCheck, CreditCard, FileText, Headphones, Heart, HeartHandshake, History, Inbox, LayoutDashboard, LifeBuoy, ListChecks, LogOut, Mail, Menu, MessageCircle, PiggyBank, Settings, ShieldCheck, Star, Store, Tags, Users, Wallet, X, BookOpen, Landmark, Receipt, Banknote, FileBarChart } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useState } from 'react';
import { Logo } from './brand';
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
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
      {sections.map((s, i) => (
        <div key={i}>
          {s.title && <p className="mb-1 px-3 text-xs font-medium uppercase tracking-wide text-muted">{s.title}</p>}
          {s.items.map((item) => { const Icon = ICONS[item.icon]; const active = isActive(item.href); return (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)} aria-current={active ? 'page' : undefined} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${active ? 'bg-blush font-semibold text-ruby' : 'hover:bg-blush/60'}`}><Icon className="size-4 shrink-0" aria-hidden />{item.label}</Link>
          ); })}
        </div>
      ))}
    </nav>
  );
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[256px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-line bg-white lg:flex"><div className="flex h-16 items-center px-5"><Logo href={root} size="sm" /></div>{nav}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white"><div className="flex h-16 items-center justify-between px-5"><Logo href={root} size="sm" /><button onClick={() => setOpen(false)} aria-label="Close menu"><X className="size-5" /></button></div>{nav}</aside>
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
