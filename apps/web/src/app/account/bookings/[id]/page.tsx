'use client';
import { formatBps, formatPKR } from '@mehfil/shared';
import { Phone, Star } from 'lucide-react';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { CustomerCash } from '@/components/cash';
import { MilestoneTable, QuoteBreakdown, Timeline } from '@/components/shared-pages';
import { Button, Card, ErrorBox, FormError, PageHeader, ReasonAction, Spinner, Stat, Status, Textarea, useForm, useToast } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { fmtDate, fmtDateTime, SLOT_LABEL } from '@/lib/format';

function Detail() {
  const { id } = useParams<{ id: string }>();
  const payment = useSearchParams().get('payment');
  // Right after checkout the gateway may still be confirming, so the page checks back for a short while.
  const { data: b, error, isLoading, mutate } = useApi<any>(`/bookings/${id}`, { refreshInterval: (d: any) => (payment === 'pending' && d?.status === 'AWAITING_PAYMENT' ? 4000 : 0) });
  const toast = useToast();
  const [rating, setRating] = useState(0);
  const review = useForm({ comment: '' });
  if (error) return <ErrorBox error={error} retry={() => mutate()} />;
  if (isLoading || !b) return <Spinner />;
  const payable = ['AWAITING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS', 'SERVICE_COMPLETED', 'COMPLETED'].includes(b.status);
  const pay = async (m: any) => { try { const r = await api(`/bookings/${id}/pay`, { body: { milestoneId: m.id } }); window.location.href = r.checkoutUrl; } catch (e) { toast((e as Error).message, true); } };
  const canCancel = ['PENDING_VENDOR_CONFIRMATION', 'AWAITING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS'].includes(b.status);
  const canDispute = ['CONFIRMED', 'IN_PROGRESS', 'SERVICE_COMPLETED', 'COMPLETED'].includes(b.status);
  const c = b.cancellation;
  return (
    <>
      <PageHeader title={b.listing.title} sub={`${b.code} · ${b.vendor.businessName} · ${fmtDate(b.eventDate)} (${SLOT_LABEL[b.slot]})`} action={<Status value={b.status} />} />
      {payment === 'success' && <p className="mb-4 rounded-lg bg-good/10 p-3 text-sm text-good">Thank you. Your booking updates as soon as the payment is verified.</p>}
      {payment === 'pending' && <p className="mb-4 rounded-lg bg-gold/20 p-3 text-sm">We are confirming your payment with the bank. This page updates on its own in a moment.</p>}
      {payment === 'cancelled' && <p className="mb-4 rounded-lg bg-blush p-3 text-sm">Payment cancelled. Nothing was charged. You can pay whenever you are ready.</p>}
      {payment === 'fail' && <p className="mb-4 rounded-lg bg-bad/8 p-3 text-sm text-bad">That payment did not go through. You can try again.</p>}
      {b.status === 'AWAITING_PAYMENT' && b.holdExpiresAt && <p className="mb-4 rounded-lg bg-gold/20 p-3 text-sm">Your date is held until <b>{fmtDateTime(b.holdExpiresAt)}</b>. Pay the advance to confirm it.</p>}
      {b.status === 'PENDING_VENDOR_CONFIRMATION' && <p className="mb-4 rounded-lg bg-blush p-3 text-sm">Waiting for the vendor to reconfirm your date. Nothing to pay yet.</p>}
      <div className="grid gap-3 sm:grid-cols-3"><Stat label="Agreed total" value={formatPKR(b.totalAmount)} /><Stat label="Paid" value={formatPKR(b.paid)} /><Stat label="Balance" value={formatPKR(b.balance)} /></div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card title="Payment schedule"><MilestoneTable milestones={b.milestones} onPay={pay} payingEnabled={payable} /></Card>
          <CustomerCash b={b} mutate={() => mutate()} />
          <Card title="What you agreed"><QuoteBreakdown q={b.quotation} /></Card>
          {b.status === 'SERVICE_COMPLETED' && <Card title="Was your event completed?"><p className="text-sm text-muted">The vendor marked this as complete. Please confirm, or tell us if something went wrong.</p><div className="mt-3 flex flex-wrap gap-2"><Button onClick={async () => { await api(`/bookings/${id}/confirm-completion`, { method: 'POST', body: {} }); mutate(); }}>Yes, all done</Button></div></Card>}
          {b.status === 'COMPLETED' && !b.review && <Card title="Leave a review"><div className="mb-3 flex gap-1" role="radiogroup" aria-label="Rating">{[1, 2, 3, 4, 5].map((n) => <button key={n} role="radio" aria-checked={rating === n} aria-label={`${n} stars`} onClick={() => setRating(n)}><Star className={`size-7 ${n <= rating ? 'fill-gold text-gold' : 'text-line'}`} /></button>)}</div><Textarea label="Your experience" {...review.bind('comment')} /><div className="mt-2"><FormError message={review.formError} /></div><Button className="mt-3" busy={review.busy} disabled={!rating} onClick={() => review.submit(async () => { await api(`/bookings/${id}/review`, { body: { rating, comment: review.values.comment } }); mutate(); })}>Submit review</Button></Card>}
          {b.review && <Card title="Your review"><p className="tnum flex items-center gap-1 text-sm"><Star className="size-4 fill-gold text-gold" aria-hidden />{b.review.rating}</p><p className="mt-2 text-sm">{b.review.comment}</p></Card>}
          {b.payments.length > 0 && <Card title="Transactions"><ul className="divide-y divide-line text-sm">{b.payments.map((p: any) => <li key={p.id} className="flex items-center justify-between gap-3 py-2"><span>{p.code} <span className="text-xs text-muted">{fmtDateTime(p.succeededAt ?? p.createdAt)}</span></span><span className="flex items-center gap-3"><span className="tnum">{formatPKR(p.amount)}</span><Status value={p.status} /></span></li>)}</ul></Card>}
        </div>
        <aside className="space-y-5">
          {b.confirmedAt && (b.vendor.phone || b.vendor.whatsapp) && <Card title="Vendor contact"><p className="flex items-center gap-2 text-sm"><Phone className="size-4 text-muted" aria-hidden />{b.vendor.phone}</p>{b.vendor.address && <p className="mt-2 text-sm text-muted">{b.vendor.address}</p>}</Card>}
          <Card title="Cancellation"><p className="text-sm font-medium">{b.cancellationPolicyName}</p><p className="mt-1 whitespace-pre-line text-sm text-muted">{b.cancellationPolicyBody}</p>
            {canCancel && <div className="mt-4"><ReasonAction label="Cancel booking" variant="danger" title="Cancel this booking?" placeholder="Why are you cancelling?" onSubmit={async (reason) => { await api(`/bookings/${id}/cancel`, { body: { reason } }); mutate(); }}>
              <p className="mb-3 rounded-lg bg-blush p-3 text-sm">{c.paid > 0 ? <>Under your policy, cancelling {c.daysBefore} days before the event refunds <b>{formatBps(c.refundBps)}</b>: <b className="tnum">{formatPKR(c.refundAmount)}</b> of the {formatPKR(c.paid)} you paid. Our team confirms this before it is processed.</> : 'Nothing has been paid yet, so this cancels straight away.'}</p>
            </ReasonAction></div>}
            {b.status === 'CANCELLATION_REQUESTED' && <p className="mt-3 text-sm text-warn">Your cancellation request is being reviewed.</p>}
          </Card>
          {canDispute && <Card title="Problem with this booking?"><ReasonAction label="Raise a dispute" placeholder="What went wrong?" onSubmit={async (reason) => { await api(`/bookings/${id}/dispute`, { body: { reason } }); mutate(); }} /></Card>}
          <Card title="Timeline"><Timeline events={b.timeline} /></Card>
        </aside>
      </div>
    </>
  );
}
export default function Page() { return <Suspense><Detail /></Suspense>; }
