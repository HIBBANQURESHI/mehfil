'use client';
import { formatPKR } from '@mehfil/shared';
import Link from 'next/link';
import { Card, Empty, ErrorBox, LinkButton, PageHeader, Spinner, Stat } from '@/components/ui';
import { useApi } from '@/lib/api';
import { fmtDate } from '@/lib/format';

export default function Dashboard() {
  const { data, error, isLoading, mutate } = useApi<any>('/dashboard');
  if (error) return <ErrorBox error={error} retry={() => mutate()} />;
  if (isLoading || !data) return <Spinner />;
  return (
    <>
      <PageHeader title="Your planning at a glance" action={<LinkButton href="/search">Find vendors</LinkButton>} />
      <div className="grid gap-3 sm:grid-cols-3"><Link href="/account/enquiries"><Stat label="Open enquiries" value={data.openEnquiries} /></Link><Link href="/account/quotations"><Stat label="Quotations to review" value={data.openQuotations} /></Link><Link href="/account/bookings"><Stat label="Active bookings" value={data.activeBookings} /></Link></div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="My wedding">{data.wedding ? <div><p className="display text-xl">{data.wedding.title}</p><p className="mt-1 text-sm text-muted">{data.wedding.dateFrom ? fmtDate(data.wedding.dateFrom) : 'Date not set'}</p><LinkButton href={`/account/weddings/${data.wedding.id}`} variant="secondary" className="mt-4">Open plan</LinkButton></div> : <Empty title="Plan your wedding" body="Add your functions, budget and checklist in one place." action={<LinkButton href="/account/weddings">Create wedding</LinkButton>} />}</Card>
        <Card title="Upcoming payments">{!data.upcomingPayments.length ? <Empty title="No payments due" /> : <ul className="divide-y divide-line">{data.upcomingPayments.map((m: any) => <li key={m.id}><Link href={`/account/bookings/${m.booking.id}`} className="flex justify-between gap-3 py-3 text-sm"><span><span className="block font-medium">{m.label}</span><span className="text-xs text-muted">{m.booking.listing.title}{m.dueDate ? ` · ${fmtDate(m.dueDate)}` : ''}</span></span><span className="tnum font-medium">{formatPKR(m.amount)}</span></Link></li>)}</ul>}</Card>
      </div>
    </>
  );
}
