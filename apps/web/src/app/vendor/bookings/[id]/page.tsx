'use client';
import { formatBps, formatPKR } from '@mehfil/shared';
import { useParams } from 'next/navigation';
import { VendorCash } from '@/components/cash';
import { MilestoneTable, QuoteBreakdown, Timeline } from '@/components/shared-pages';
import { Button, Card, ErrorBox, PageHeader, ReasonAction, Spinner, Stat, Status, useToast } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { fmtDate, fmtDateTime, SLOT_LABEL } from '@/lib/format';

export default function Page() {
  const { id } = useParams<{ id: string }>();
  const { data: b, error, isLoading, mutate } = useApi<any>(`/vendor/bookings/${id}`);
  const toast = useToast();
  if (error) return <ErrorBox error={error} retry={() => mutate()} />;
  if (isLoading || !b) return <Spinner />;
  const act = async (path: string) => { try { await api(`/vendor/bookings/${id}/${path}`, { method: 'POST', body: {} }); mutate(); } catch (e) { toast((e as Error).message, true); } };
  const canCancel = ['AWAITING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS', 'CANCELLATION_REQUESTED'].includes(b.status);
  return (
    <>
      <PageHeader title={b.customer.name} sub={`${b.code} · ${b.listing.title} · ${fmtDate(b.eventDate)} (${SLOT_LABEL[b.slot]}) · ${b.guestCount} guests`} action={<Status value={b.status} />} />
      {b.status === 'PENDING_VENDOR_CONFIRMATION' && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gold/20 p-4"><p className="text-sm">The customer accepted your quotation. Reconfirm the date to hold it for them.</p><div className="flex gap-2"><Button onClick={() => act('confirm')}>Confirm date</Button><ReasonAction label="Decline" variant="danger" placeholder="Tell the customer why" onSubmit={async (reason) => { await api(`/vendor/bookings/${id}/decline`, { body: { reason } }); mutate(); }} /></div></div>}
      {b.status === 'AWAITING_PAYMENT' && <p className="mb-4 rounded-lg bg-blush p-3 text-sm">Date held until {fmtDateTime(b.holdExpiresAt)} while the customer pays the advance.</p>}
      <div className="grid gap-3 sm:grid-cols-4"><Stat label="Agreed total" value={formatPKR(b.totalAmount)} /><Stat label="Collected" value={formatPKR(b.paid)} /><Stat label={`Commission (${formatBps(b.commissionBps)})`} value={formatPKR(b.commissionTotal)} /><Stat label="You receive in total" value={formatPKR(b.netPayable)} /></div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5"><Card title="Payment schedule"><MilestoneTable milestones={b.milestones} /></Card><Card title="Agreed services"><QuoteBreakdown q={b.quotation} /></Card></div>
        <aside className="space-y-5">
          <VendorCash b={b} mutate={() => mutate()} />
          <Card title="Customer"><p className="text-sm">{b.customer.name}</p><p className="tnum text-sm text-muted">{b.customer.phone}</p>{b.customer.email && <p className="text-sm text-muted">{b.customer.email}</p>}{!b.confirmedAt && <p className="mt-2 text-xs text-muted">Full contact details unlock when the booking is confirmed.</p>}</Card>
          <Card title="Actions"><div className="space-y-2">{['CONFIRMED', 'IN_PROGRESS'].includes(b.status) && <Button className="w-full" onClick={() => act('complete')}>Mark service completed</Button>}{canCancel && <ReasonAction label="Cancel booking" variant="danger" title="Cancel this booking?" placeholder="Why are you cancelling?" onSubmit={async (reason) => { await api(`/vendor/bookings/${id}/cancel`, { body: { reason } }); mutate(); }}><p className="mb-3 rounded-lg bg-bad/8 p-3 text-sm text-bad">If you cancel, everything the customer has paid is refunded in full.</p></ReasonAction>}</div></Card>
          <Card title="Timeline"><Timeline events={b.timeline} /></Card>
        </aside>
      </div>
    </>
  );
}
