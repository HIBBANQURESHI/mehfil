'use client';
import { formatPKR } from '@mehfil/shared';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { QuoteBuilder } from '@/components/quote-builder';
import { Card, ErrorBox, PageHeader, ReasonAction, Spinner, Status } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { fmtDate, SLOT_LABEL } from '@/lib/format';

export default function Page() {
  const { id } = useParams<{ id: string }>();
  const { data: e, error, isLoading, mutate } = useApi<any>(`/vendor/enquiries/${id}`);
  const router = useRouter();
  if (error) return <ErrorBox error={error} retry={() => mutate()} />;
  if (isLoading || !e) return <Spinner />;
  const open = ['NEW', 'VIEWED', 'RESPONDED'].includes(e.status);
  const hasLive = e.quotations.some((q: any) => ['SENT', 'VIEWED', 'ACCEPTED'].includes(q.status));
  return (
    <>
      <PageHeader title={e.customer.name} sub={`${e.code} · ${e.listing.title}`} action={<div className="flex items-center gap-2"><Status value={e.status} />{open && <ReasonAction label="Decline" variant="danger" placeholder="Tell the customer why" onSubmit={async (reason) => { await api(`/vendor/enquiries/${id}/decline`, { body: { reason } }); mutate(); }} />}</div>} />
      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <div className="space-y-5">
          <Card title="Request"><dl className="space-y-2 text-sm"><div className="flex justify-between"><dt className="text-muted">Date</dt><dd>{fmtDate(e.eventDate)}</dd></div><div className="flex justify-between"><dt className="text-muted">Time</dt><dd>{SLOT_LABEL[e.slot]}</dd></div><div className="flex justify-between"><dt className="text-muted">Guests</dt><dd className="tnum">{e.guestCount}</dd></div><div className="flex justify-between"><dt className="text-muted">Budget</dt><dd className="tnum">{formatPKR(e.budget)}</dd></div>{e.package && <div className="flex justify-between"><dt className="text-muted">Package</dt><dd>{e.package.name}</dd></div>}</dl><p className="mt-3 whitespace-pre-line text-sm">{e.requirements}</p><p className="mt-3 text-xs text-muted">The customer's contact details are shared once a booking is confirmed.</p></Card>
          {e.quotations.length > 0 && <Card title="Quotations"><ul className="divide-y divide-line">{e.quotations.map((q: any) => <li key={q.id}><Link href={`/vendor/quotations/${q.id}`} className="flex items-center justify-between gap-2 py-2 text-sm"><span>{q.code} v{q.version}</span><span className="flex items-center gap-2"><span className="tnum">{formatPKR(q.total)}</span><Status value={q.status} /></span></Link></li>)}</ul></Card>}
        </div>
        {!hasLive && !['DECLINED', 'EXPIRED', 'CLOSED'].includes(e.status) ? <div><h2 className="mb-3 text-xl">Create quotation</h2><QuoteBuilder enquiry={e} onDone={(q) => router.push(`/vendor/quotations/${q}`)} /></div> : <Card><p className="text-sm text-muted">{hasLive ? 'A quotation is already with this customer. Open it to revise or withdraw.' : 'This enquiry is closed.'}</p></Card>}
      </div>
    </>
  );
}
