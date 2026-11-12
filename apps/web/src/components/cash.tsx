'use client';
import { formatPKR } from '@mehfil/shared';
import { Banknote, CreditCard } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, Input, ReasonAction, Status, useToast } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { fmtDate, fmtDateTime } from '@/lib/format';

type PayConfig = { online: boolean; allowCash: boolean; requireOnlineDeposit: boolean; cashAutoConfirmDays: number };

function ReceiptList({ receipts, actions }: { receipts: any[]; actions?: (r: any) => React.ReactNode }) {
  return (
    <ul className="divide-y divide-line text-sm">
      {receipts.map((r) => (
        <li key={r.id} className="py-3">
          <div className="flex items-center justify-between gap-3">
            <span><span className="tnum font-medium">{formatPKR(r.amount)}</span> <span className="text-xs text-muted">received {fmtDate(r.receivedOn)} · recorded {fmtDateTime(r.createdAt)}</span></span>
            <Status value={r.status} />
          </div>
          {r.note && <p className="mt-1 text-xs text-muted">{r.note}</p>}
          {r.disputeReason && <p className="mt-1 text-xs text-bad">{r.status === 'REJECTED' ? 'Not accepted' : 'Reported'}: {r.disputeReason}</p>}
          {r.autoConfirmed && <p className="mt-1 text-xs text-muted">Confirmed automatically after the confirmation window.</p>}
          {actions?.(r)}
        </li>
      ))}
    </ul>
  );
}

/** Customer: choose how the next instalment is paid, and confirm or question cash the vendor recorded. */
export function CustomerCash({ b, mutate }: { b: any; mutate: () => void }) {
  const { data: cfg } = useApi<PayConfig>('/payments-config');
  const toast = useToast();
  const next = b.milestones.find((m: any) => m.status === 'PENDING');
  const receipts: any[] = b.cashReceipts ?? [];
  const live = ['AWAITING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS', 'SERVICE_COMPLETED', 'COMPLETED'].includes(b.status);
  if (!cfg || (!cfg.allowCash && !receipts.length)) return null;
  const cashAllowed = cfg.allowCash && !(cfg.requireOnlineDeposit && next?.sortOrder === 0);
  const choose = async (method: 'ONLINE' | 'CASH') => {
    try { await api(`/bookings/${b.id}/milestones/${next.id}/method`, { body: { method } }); mutate(); } catch (e) { toast((e as Error).message, true); }
  };
  const confirm = async (r: any) => {
    try { await api(`/bookings/${b.id}/cash/${r.id}/confirm`, { method: 'POST', body: {} }); toast('Thank you, the payment is confirmed.'); mutate(); } catch (e) { toast((e as Error).message, true); }
  };
  const pending = receipts.filter((r) => r.status === 'PENDING');
  return (
    <Card title="Paying in cash">
      {pending.map((r) => (
        <div key={r.id} className="mb-4 rounded-lg bg-gold/20 p-3 text-sm">
          <p>Your vendor says they received <b className="tnum">{formatPKR(r.amount)}</b> in cash on {fmtDate(r.receivedOn)}. Is that right?</p>
          <p className="mt-1 text-xs text-muted">If you do nothing, it is confirmed automatically {cfg.cashAutoConfirmDays} days after it was recorded.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => confirm(r)}>Yes, I paid this</Button>
            <ReasonAction label="No, report a problem" variant="danger" title="Report a problem with this cash payment" placeholder="For example: I paid a different amount, or I have not paid yet" onSubmit={async (reason) => { await api(`/bookings/${b.id}/cash/${r.id}/dispute`, { body: { reason } }); mutate(); }} />
          </div>
        </div>
      ))}
      {live && next && !pending.length && (
        <div className="text-sm">
          <p className="mb-2">How will you pay <b>{next.label}</b> (<span className="tnum">{formatPKR(next.amount)}</span>)?</p>
          <div className="flex flex-wrap gap-2">
            <Button variant={next.preferredMethod === 'CASH' ? 'outline' : 'primary'} onClick={() => choose('ONLINE')}><CreditCard className="size-4" aria-hidden />Online</Button>
            {cashAllowed && <Button variant={next.preferredMethod === 'CASH' ? 'primary' : 'outline'} onClick={() => choose('CASH')}><Banknote className="size-4" aria-hidden />Cash to vendor</Button>}
          </div>
          {!cashAllowed && cfg.allowCash && <p className="mt-2 text-xs text-muted">The booking advance must be paid online. Later instalments can be paid in cash.</p>}
          {next.preferredMethod === 'CASH' && <p className="mt-2 text-xs text-muted">Pay the vendor directly. Once they record it, you will be asked to confirm here. Only confirm money you actually paid.</p>}
        </div>
      )}
      {receipts.length > 0 && <div className="mt-4"><p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Cash records</p><ReceiptList receipts={receipts} /></div>}
    </Card>
  );
}

/** Vendor: record cash in hand for the next instalment. The customer then confirms it. */
export function VendorCash({ b, mutate }: { b: any; mutate: () => void }) {
  const { data: cfg } = useApi<PayConfig>('/payments-config');
  const toast = useToast();
  const [receivedOn, setReceivedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const next = b.milestones.find((m: any) => m.status === 'PENDING');
  const receipts: any[] = b.cashReceipts ?? [];
  const waiting = receipts.some((r) => ['PENDING', 'DISPUTED'].includes(r.status));
  const live = ['AWAITING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS', 'SERVICE_COMPLETED', 'COMPLETED'].includes(b.status);
  if (!cfg || (!cfg.allowCash && !receipts.length)) return null;
  const depositOnline = cfg.requireOnlineDeposit && next?.sortOrder === 0;
  const submit = async () => {
    setBusy(true);
    try { await api(`/vendor/bookings/${b.id}/cash`, { body: { milestoneId: next.id, receivedOn, note: note || undefined } }); setNote(''); toast('Recorded. The customer has been asked to confirm.'); mutate(); } catch (e) { toast((e as Error).message, true); } finally { setBusy(false); }
  };
  return (
    <Card title="Cash payments">
      {cfg.allowCash && live && next && !waiting && !depositOnline && (
        <div className="space-y-3 text-sm">
          <p>Received <b>{next.label}</b> of <b className="tnum">{formatPKR(next.amount)}</b> in cash?{next.preferredMethod === 'CASH' && <span className="text-muted"> The customer said they will pay in cash.</span>}</p>
          <Input label="Date received" type="date" value={receivedOn} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setReceivedOn(e.target.value)} />
          <Input label="Note (optional)" value={note} maxLength={300} placeholder="Receipt number or where it was paid" onChange={(e) => setNote(e.target.value)} />
          <Button className="w-full" busy={busy} onClick={submit}>Record cash received</Button>
          <p className="text-xs text-muted">Mehfil commission on cash is added to your commission statement once the customer confirms.</p>
        </div>
      )}
      {depositOnline && next && <p className="text-sm text-muted">The booking advance must be paid online by the customer.</p>}
      {waiting && <p className="mb-2 text-sm text-muted">Waiting for the customer, or for our team if they reported a problem.</p>}
      {receipts.length > 0 && <div className="mt-3"><ReceiptList receipts={receipts} /></div>}
    </Card>
  );
}

/** Admin: settle a cash receipt the customer questioned (or confirm one on their behalf). */
export function AdminCash({ b, mutate }: { b: any; mutate: () => void }) {
  const receipts: any[] = b.cashReceipts ?? [];
  if (!receipts.length) return null;
  return (
    <Card title="Cash receipts">
      <ReceiptList receipts={receipts} actions={(r) => ['PENDING', 'DISPUTED'].includes(r.status) && (
        <div className="mt-2 flex flex-wrap gap-2">
          <ReasonAction label="Confirm received" title="Confirm this cash payment" placeholder="What confirmed it?" onSubmit={async (reason) => { await api(`/admin/cash-receipts/${r.id}/resolve`, { body: { action: 'CONFIRM', reason } }); mutate(); }} />
          <ReasonAction label="Reject" variant="danger" title="Reject this cash record" placeholder="Why is it rejected?" onSubmit={async (reason) => { await api(`/admin/cash-receipts/${r.id}/resolve`, { body: { action: 'REJECT', reason } }); mutate(); }} />
        </div>
      )} />
    </Card>
  );
}
