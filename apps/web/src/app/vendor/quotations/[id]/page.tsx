'use client';
import { formatBps, formatPKR } from '@mehfil/shared';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { QuoteBuilder } from '@/components/quote-builder';
import { QuoteBreakdown } from '@/components/shared-pages';
import { Button, Card, ErrorBox, LinkButton, PageHeader, Spinner, Status, useToast } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

export default function Page() {
  const { id } = useParams<{ id: string }>();
  const { data: q, error, isLoading, mutate } = useApi<any>(`/vendor/quotations/${id}`);
  const [revising, setRevising] = useState(false);
  const toast = useToast();
  const router = useRouter();
  if (error) return <ErrorBox error={error} retry={() => mutate()} />;
  if (isLoading || !q) return <Spinner />;
  const act = async (path: string) => { try { await api(`/vendor/quotations/${id}/${path}`, { method: 'POST', body: {} }); mutate(); } catch (e) { toast((e as Error).message, true); } };
  const live = ['SENT', 'VIEWED'].includes(q.status);
  if (revising) return <><PageHeader title={`Revise ${q.code}`} /><QuoteBuilder enquiry={{ id: q.enquiryId, listing: { title: q.enquiry.listing.title, category: q.enquiry.listing.category } }} reviseId={id} initial={q} onDone={(n) => { setRevising(false); router.push(`/vendor/quotations/${n}`); }} /></>;
  return (
    <>
      <PageHeader title={q.code} sub={`${q.customer.name} · ${q.enquiry.listing.title}`} action={<Status value={q.status} />} />
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <Card title="Price"><QuoteBreakdown q={q} /></Card>
          <Card title="Payment schedule"><ul className="divide-y divide-line text-sm">{q.milestones.map((m: any) => <li key={m.id} className="flex justify-between py-2"><span>{m.label} <span className="text-muted">({formatBps(m.shareBps)})</span></span><span className="tnum">{formatPKR(m.amount)}</span></li>)}</ul></Card>
          {q.notes && <Card title="Notes"><p className="whitespace-pre-line text-sm">{q.notes}</p></Card>}
        </div>
        <aside className="space-y-5">
          {q.commissionPreview && <Card title="What you receive"><dl className="space-y-1 text-sm"><div className="flex justify-between"><dt className="text-muted">Customer pays</dt><dd className="tnum">{formatPKR(q.total)}</dd></div><div className="flex justify-between"><dt className="text-muted">Mehfil commission ({formatBps(q.commissionPreview.bps)})</dt><dd className="tnum">−{formatPKR(q.commissionPreview.amount)}</dd></div><div className="flex justify-between border-t border-line pt-1 font-semibold"><dt>You receive</dt><dd className="tnum">{formatPKR(q.commissionPreview.net)}</dd></div></dl></Card>}
          <Card title="Actions"><div className="space-y-2">{q.validUntil && <p className="text-sm text-muted">Valid until {fmtDateTime(q.validUntil)}</p>}{q.status === 'DRAFT' && <Button className="w-full" onClick={() => act('send')}>Send to customer</Button>}{live && <Button variant="secondary" className="w-full" onClick={() => setRevising(true)}>Revise</Button>}{live && <Button variant="danger" className="w-full" onClick={() => act('withdraw')}>Withdraw</Button>}{['REJECTED', 'EXPIRED'].includes(q.status) && <Button variant="secondary" className="w-full" onClick={() => setRevising(true)}>Send a new version</Button>}{q.booking && <LinkButton className="w-full" href={`/vendor/bookings/${q.booking.id}`}>Open booking {q.booking.code}</LinkButton>}</div></Card>
        </aside>
      </div>
    </>
  );
}
