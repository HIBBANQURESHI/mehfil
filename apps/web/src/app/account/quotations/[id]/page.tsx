'use client';
import { formatBps, formatPKR } from '@mehfil/shared';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { QuoteBreakdown } from '@/components/shared-pages';
import { Button, Card, ErrorBox, LinkButton, PageHeader, ReasonAction, Spinner, Status, useToast } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { fmtDate, fmtDateTime, SLOT_LABEL } from '@/lib/format';

export default function QuoteDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: q, error, isLoading, mutate } = useApi<any>(`/quotations/${id}`);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const router = useRouter();
  if (error) return <ErrorBox error={error} retry={() => mutate()} />;
  if (isLoading || !q) return <Spinner />;
  const open = ['SENT', 'VIEWED'].includes(q.status);
  const accept = async () => {
    setBusy(true);
    try { const b = await api(`/quotations/${id}/accept`, { method: 'POST', body: {} }); toast('Accepted. The vendor will now reconfirm your date.'); router.push(`/account/bookings/${b.id}`); }
    catch (e) { toast((e as Error).message, true); mutate(); } finally { setBusy(false); }
  };
  return (
    <>
      <PageHeader title={q.vendor.businessName} sub={`${q.code} · ${q.enquiry.listing.title} · ${fmtDate(q.enquiry.eventDate)} (${SLOT_LABEL[q.enquiry.slot]})`} action={<Status value={q.status} />} />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card title="Price"><QuoteBreakdown q={q} />{q.notes && <p className="mt-4 whitespace-pre-line text-sm text-muted">{q.notes}</p>}</Card>
          <Card title="Payment schedule"><ul className="divide-y divide-line text-sm">{q.milestones.map((m: any) => <li key={m.id} className="flex justify-between py-2"><span>{m.label} <span className="text-muted">({formatBps(m.shareBps)})</span></span><span className="tnum font-medium">{formatPKR(m.amount)}</span></li>)}</ul></Card>
          <Card title="Cancellation policy"><p className="font-medium">{q.cancellationPolicy.name}</p><p className="mt-2 whitespace-pre-line text-sm">{q.cancellationPolicy.body}</p><ul className="mt-3 space-y-1 text-sm text-muted">{[...q.cancellationPolicy.tiers].sort((a: any, b: any) => b.daysBefore - a.daysBefore).map((t: any) => <li key={t.daysBefore}>{t.daysBefore}+ days before: {formatBps(t.refundBps)} refund</li>)}</ul></Card>
          {q.terms && <Card title="Vendor terms"><p className="whitespace-pre-line text-sm">{q.terms}</p></Card>}
        </div>
        <aside><Card className="sticky top-24">{open ? <><p className="text-sm text-muted">Valid until {fmtDateTime(q.validUntil)}</p><p className="mt-3 text-sm">Accepting asks the vendor to reconfirm your date. Your booking is confirmed after you pay the advance.</p><Button className="mt-4 w-full" busy={busy} onClick={accept}>Accept quotation</Button><div className="mt-2 [&>button]:w-full"><ReasonAction label="Decline" optional onSubmit={async (reason) => { await api(`/quotations/${id}/reject`, { body: { reason: reason || null } }); mutate(); }} /></div></> : q.booking ? <LinkButton href={`/account/bookings/${q.booking.id}`} className="w-full">View booking {q.booking.code}</LinkButton> : <p className="text-sm text-muted">This quotation is no longer open.</p>}</Card></aside>
      </div>
    </>
  );
}
