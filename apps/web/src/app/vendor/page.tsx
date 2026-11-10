'use client';
import { formatPKR } from '@mehfil/shared';
import { Star } from 'lucide-react';
import Link from 'next/link';
import { Card, Empty, ErrorBox, PageHeader, Spinner, Stat, Status } from '@/components/ui';
import { useApi } from '@/lib/api';
import { fmtDate } from '@/lib/format';

export default function Overview() {
  const { data: d, error, isLoading, mutate } = useApi<any>('/vendor/overview');
  if (error) return <ErrorBox error={error} retry={() => mutate()} />;
  if (isLoading || !d) return <Spinner />;
  return (
    <>
      <PageHeader title="Overview" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Profile views" value={d.profileViews.toLocaleString()} /><Stat label="New enquiries" value={d.newEnquiries} /><Stat label="Quotes with customers" value={d.pendingQuotes} /><Stat label="Upcoming bookings" value={d.upcomingBookings} />
        {d.monthRevenue !== null && <Stat label="Collected this month" value={formatPKR(d.monthRevenue)} />}{d.pendingPayout !== null && <Stat label="Pending payout" value={formatPKR(d.pendingPayout)} />}
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="New enquiries" action={<Link href="/vendor/enquiries" className="text-sm text-ruby">All</Link>}>{!d.recentEnquiries.length ? <Empty title="No new enquiries" /> : <ul className="divide-y divide-line">{d.recentEnquiries.map((e: any) => <li key={e.id}><Link href={`/vendor/enquiries/${e.id}`} className="flex justify-between gap-3 py-3 text-sm"><span><span className="block font-medium">{e.customer.name}</span><span className="text-xs text-muted">{e.listing.title} · {e.guestCount} guests</span></span><span className="text-muted">{fmtDate(e.eventDate)}</span></Link></li>)}</ul>}</Card>
        <Card title="Upcoming bookings" action={<Link href="/vendor/bookings" className="text-sm text-ruby">All</Link>}>{!d.nextBookings.length ? <Empty title="No upcoming bookings" /> : <ul className="divide-y divide-line">{d.nextBookings.map((b: any) => <li key={b.id}><Link href={`/vendor/bookings/${b.id}`} className="flex items-center justify-between gap-3 py-3 text-sm"><span><span className="block font-medium">{b.customer.name}</span><span className="text-xs text-muted">{fmtDate(b.eventDate)} · {b.listing.title}</span></span><Status value={b.status} /></Link></li>)}</ul>}</Card>
        <Card title="Listing performance">{!d.listings.length ? <Empty title="No listings yet" /> : <table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted"><th className="py-1 font-medium">Listing</th><th className="text-right font-medium">Views</th><th className="text-right font-medium">Enquiries</th><th className="text-right font-medium">Bookings</th></tr></thead><tbody>{d.listings.map((l: any) => <tr key={l.id} className="border-t border-line"><td className="py-2">{l.title}</td><td className="tnum text-right">{l.viewCount}</td><td className="tnum text-right">{l._count.enquiries}</td><td className="tnum text-right">{l._count.bookings}</td></tr>)}</tbody></table>}</Card>
        <Card title="Recent reviews">{!d.reviews.length ? <Empty title="No reviews yet" /> : <ul className="divide-y divide-line">{d.reviews.map((r: any) => <li key={r.id} className="py-3 text-sm"><p className="tnum flex items-center gap-1 font-medium"><Star className="size-4 fill-gold text-gold" aria-hidden />{r.rating} · {r.customer.name}</p><p className="mt-1 line-clamp-2 text-muted">{r.comment}</p></li>)}</ul>}</Card>
      </div>
    </>
  );
}
