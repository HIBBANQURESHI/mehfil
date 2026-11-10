'use client';
import { formatBps, formatPKR, statusLabel } from '@mehfil/shared';
import { Flag } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { MilestoneTable, QuoteBreakdown, Timeline } from '@/components/shared-pages';
import { Button, Card, ErrorBox, FormError, Input, Modal, PageHeader, ReasonAction, Select, Spinner, Stat, Status, Textarea, useForm, useToast } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { fmtDate, fmtDateTime, SLOT_LABEL } from '@/lib/format';

export default function Page() {
  const { id } = useParams<{ id: string }>();
  const { data: b, error, isLoading, mutate } = useApi<any>(`/admin/bookings/${id}`);
  const [notes, setNotes] = useState('');
  const [manual, setManual] = useState<any>(null);
  const [cancel, setCancel] = useState(false);
  const m = useForm({ reference: '', reason: '' });
  const c = useForm({ reason: '', mode: 'policy', percent: '' });
  const d = useForm({ outcome: 'CONFIRMED', reason: '' });
  const toast = useToast();
  const loaded = b?.adminNotes;
  useEffect(() => { setNotes(loaded ?? ''); }, [loaded]);
  if (error) return <ErrorBox error={error} retry={() => mutate()} />;
  if (isLoading || !b) return <Spinner />;
  const paid = b.payments.filter((p: any) => ['SUCCEEDED', 'PARTIALLY_REFUNDED'].includes(p.status)).reduce((s: number, p: any) => s + p.amount - p.refundedAmount, 0);
  const canManual = ['AWAITING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS', 'SERVICE_COMPLETED', 'COMPLETED'].includes(b.status);
  const canCancel = !['CANCELLED', 'COMPLETED', 'SERVICE_COMPLETED', 'PENDING_VENDOR_CONFIRMATION', 'AWAITING_PAYMENT', 'DISPUTED'].includes(b.status);
  return (
    <>
      <PageHeader title={b.code} sub={`${b.listing.title} · ${fmtDate(b.eventDate)} (${SLOT_LABEL[b.slot]})`} action={<div className="flex items-center gap-2">{b.flagged && <Flag className="size-5 text-bad" aria-label="Flagged" />}<Status value={b.status} /></div>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Agreed" value={formatPKR(b.totalAmount)} /><Stat label="Collected" value={formatPKR(paid)} /><Stat label={`Commission (${formatBps(b.commissionBps)})`} value={formatPKR(b.commissionTotal)} /><Stat label="Balance" value={formatPKR(b.totalAmount - paid)} /></div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card title="Payment schedule"><MilestoneTable milestones={b.milestones} onPay={canManual ? setManual : undefined} payingEnabled={canManual} /><p className="mt-2 text-xs text-muted">“Pay” here records money the customer paid the vendor directly. Use only with proof.</p></Card>
          <Card title="Transactions">{!b.payments.length ? <p className="text-sm text-muted">None yet.</p> : <ul className="divide-y divide-line text-sm">{b.payments.map((p: any) => <li key={p.id} className="flex items-center justify-between gap-3 py-2"><span>{p.code} <span className="text-xs text-muted">{p.provider} · {fmtDateTime(p.createdAt)}</span>{p.failureReason && <span className="block text-xs text-bad">{p.failureReason}</span>}</span><span className="flex items-center gap-2"><span className="tnum">{formatPKR(p.amount)}</span><Status value={p.status} /></span></li>)}</ul>}</Card>
          <Card title="Ledger">{!b.ledger.length ? <p className="text-sm text-muted">No entries yet.</p> : <ul className="divide-y divide-line text-sm">{b.ledger.map((l: any) => <li key={l.id} className="flex justify-between py-1.5"><span>{statusLabel(l.type)}</span><span className="tnum">{formatPKR(l.amount)}</span></li>)}</ul>}</Card>
          <Card title="Original quotation"><QuoteBreakdown q={b.quotation} /></Card>
        </div>
        <aside className="space-y-5">
          <Card title="Parties"><p className="text-xs text-muted">Customer</p><p className="text-sm font-medium">{b.customer.name}</p><p className="tnum text-sm text-muted">{b.customer.phone} {b.customer.email}</p><p className="mt-3 text-xs text-muted">Vendor</p><p className="text-sm font-medium">{b.vendor.businessName}</p><p className="tnum text-sm text-muted">{b.vendor.phone}</p></Card>
          <Card title="Actions"><div className="space-y-2">
            {b.status === 'CANCELLATION_REQUESTED' && <><p className="text-sm">Customer reason: {b.cancelReason}</p><ReasonAction label="Keep the booking" onSubmit={async (reason) => { await api(`/admin/bookings/${id}/reject-cancellation`, { body: { reason } }); mutate(); }} /></>}
            {canCancel && <Button variant="danger" className="w-full" onClick={() => setCancel(true)}>{b.status === 'CANCELLATION_REQUESTED' ? 'Approve cancellation' : 'Cancel booking'}</Button>}
            {b.status === 'DISPUTED' && <div className="space-y-2"><Select label="Resolve as" {...d.bind('outcome')}><option value="CONFIRMED">Booking continues</option><option value="COMPLETED">Service delivered, release payout</option><option value="CANCELLED">Cancel and refund in full</option></Select><Textarea label="Resolution" {...d.bind('reason')} /><FormError message={d.formError} /><Button className="w-full" busy={d.busy} onClick={() => d.submit(async () => { await api(`/admin/bookings/${id}/resolve-dispute`, { body: d.values }); mutate(); })}>Resolve dispute</Button></div>}
            <Button variant="outline" className="w-full" onClick={async () => { await api(`/admin/bookings/${id}/notes`, { method: 'PATCH', body: { flagged: !b.flagged } }); mutate(); }}>{b.flagged ? 'Remove flag' : 'Flag as suspicious'}</Button>
          </div></Card>
          <Card title="Internal notes"><Textarea aria-label="Internal notes" value={notes} onChange={(e) => setNotes(e.target.value)} /><Button variant="secondary" className="mt-2" onClick={async () => { await api(`/admin/bookings/${id}/notes`, { method: 'PATCH', body: { adminNotes: notes } }); toast('Saved'); mutate(); }}>Save notes</Button></Card>
          <Card title="Timeline"><Timeline events={b.timeline} /></Card>
        </aside>
      </div>
      {manual && <Modal title={`Record ${manual.label}: ${formatPKR(manual.amount)}`} onClose={() => setManual(null)}><div className="space-y-3"><p className="rounded-lg bg-gold/20 p-3 text-sm">This records a payment the vendor collected directly. Commission becomes owed by the vendor.</p><Input label="Bank or receipt reference" {...m.bind('reference')} /><Textarea label="Reason and evidence" {...m.bind('reason')} /><FormError message={m.formError} /><Button className="w-full" busy={m.busy} onClick={() => m.submit(async () => { await api(`/admin/bookings/${id}/manual-payment`, { body: { milestoneId: manual.id, ...m.values } }); setManual(null); m.setValues({ reference: '', reason: '' }); mutate(); })}>Record payment</Button></div></Modal>}
      {cancel && <Modal title="Cancel booking" onClose={() => setCancel(false)}><div className="space-y-3"><Select label="Refund" {...c.bind('mode')}><option value="policy">Follow the booking's cancellation policy</option><option value="override">Override (logged)</option></Select>{c.values.mode === 'override' && <Input label="Refund (%)" type="number" min={0} max={100} {...c.bind('percent')} />}<Textarea label="Reason" {...c.bind('reason')} /><FormError message={c.formError} /><Button className="w-full" busy={c.busy} onClick={() => c.submit(async () => { await api(`/admin/bookings/${id}/cancel`, { body: { reason: c.values.reason, ...(c.values.mode === 'override' ? { refundBps: Math.round(Number(c.values.percent) * 100) } : {}) } }); setCancel(false); mutate(); })}>Confirm cancellation</Button></div></Modal>}
    </>
  );
}
