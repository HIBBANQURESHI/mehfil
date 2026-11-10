'use client';
import { formatPKR, statusLabel } from '@mehfil/shared';
import Link from 'next/link';
import { Card, Empty, ErrorBox, PageHeader, Spinner } from '@/components/ui';
import { Paged, useApi } from '@/lib/api';
import { fmtDate } from '@/lib/format';

export default function Calendar() {
  const bookings = useApi<Paged>('/bookings?pageSize=100');
  const weddings = useApi<any[]>('/weddings');
  if (bookings.error || weddings.error) return <ErrorBox error={bookings.error ?? weddings.error} />;
  if (!bookings.data || !weddings.data) return <Spinner />;
  const live = bookings.data.items.filter((b) => b.status !== 'CANCELLED');
  const entries = [
    ...weddings.data.flatMap((w) => w.events.filter((e: any) => e.date).map((e: any) => ({ date: e.date, title: e.name ?? statusLabel(e.type), sub: w.title, href: `/account/weddings/${w.id}` }))),
    ...live.map((b) => ({ date: b.eventDate, title: b.listing.title, sub: `Booking ${b.code}`, href: `/account/bookings/${b.id}` })),
    ...live.flatMap((b) => b.milestones.filter((m: any) => m.dueDate && m.status === 'PENDING').map((m: any) => ({ date: m.dueDate, title: `${m.label}: ${formatPKR(m.amount)}`, sub: `Payment due, ${b.code}`, href: `/account/bookings/${b.id}` }))),
  ].sort((a, b) => a.date.localeCompare(b.date));
  return <><PageHeader title="Calendar" sub="Functions, bookings and payment dates." /><Card className="!p-0">{!entries.length ? <Empty title="Nothing scheduled yet" /> : <ul className="divide-y divide-line">{entries.map((e, i) => <li key={i}><Link href={e.href} className="flex gap-4 px-5 py-3 hover:bg-blush/40"><span className="tnum w-28 shrink-0 text-sm font-medium text-ruby">{fmtDate(e.date)}</span><span className="text-sm"><span className="block font-medium">{e.title}</span><span className="text-xs text-muted">{e.sub}</span></span></Link></li>)}</ul>}</Card></>;
}
