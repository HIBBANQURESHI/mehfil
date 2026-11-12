'use client';
import { formatPKR, rupeesToPaisa } from '@mehfil/shared';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Button, Card, Empty, ErrorBox, Input, PageHeader, Spinner, Stat, Status, useToast } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { fmtDate } from '@/lib/format';

// DUE already means "ready for payout" elsewhere, so commission lines use their own code.
const LINE_STATUS: Record<string, string> = { DUE: 'COMMISSION_DUE' };

function Statement() {
  const back = useSearchParams().get('payment');
  const { data, error, mutate } = useApi<any>('/vendor/commission', { refreshInterval: back === 'pending' ? 5000 : 0 });
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  if (error) return <ErrorBox error={error} retry={() => mutate()} />;
  if (!data) return <Spinner />;
  const t = data.totals;
  const pay = async () => {
    setBusy(true);
    try {
      const r = await api('/vendor/commission/pay', { body: amount ? { amount: rupeesToPaisa(Number(amount)) } : {} });
      window.location.href = r.checkoutUrl;
    } catch (e) { toast((e as Error).message, true); setBusy(false); }
  };
  return (
    <>
      <PageHeader title="Mehfil commission" sub="Commission on payments you collected yourself, in cash or by direct transfer. Online payments through Mehfil are settled automatically." />
      {back === 'success' && <p className="mb-4 rounded-lg bg-good/10 p-3 text-sm text-good">Thank you. Your balance updates as soon as the payment is verified.</p>}
      {back === 'pending' && <p className="mb-4 rounded-lg bg-gold/20 p-3 text-sm">We are confirming your payment with the bank. Your balance updates in a moment.</p>}
      {back === 'cancelled' && <p className="mb-4 rounded-lg bg-blush p-3 text-sm">Payment cancelled. Nothing was charged.</p>}
      {data.restricted && <p className="mb-4 rounded-lg bg-bad/8 p-3 text-sm text-bad">You have <b className="tnum">{formatPKR(t.overdue)}</b> overdue. Sending quotations and confirming new bookings is paused until it is paid. Your existing bookings carry on as normal.</p>}
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Outstanding" value={formatPKR(t.outstanding)} sub={t.nextDueAt ? `Next due ${fmtDate(t.nextDueAt)}` : undefined} />
        <Stat label="Overdue" value={formatPKR(t.overdue)} />
        <Stat label="Paid to Mehfil" value={formatPKR(t.received)} />
        <Stat label="Credit" value={formatPKR(t.credit)} sub="Paid ahead, used on future charges" />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_340px]">
        <Card title="Statement">
          {!data.lines.length ? <Empty title="Nothing owed" body="When a customer confirms a cash payment, its commission appears here." /> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm">
              <thead><tr className="border-b border-line text-xs text-muted"><th className="py-2 font-medium">Booking</th><th className="font-medium">Instalment</th><th className="text-right font-medium">Collected</th><th className="text-right font-medium">Commission</th><th className="text-right font-medium">Outstanding</th><th className="pl-3 font-medium">Due</th><th /></tr></thead>
              <tbody>{data.lines.map((l: any) => (
                <tr key={l.paymentId} className="border-b border-line last:border-0">
                  <td className="py-2"><Link className="font-medium text-ruby" href={`/vendor/bookings/${l.bookingId}`}>{l.bookingCode}</Link><span className="block text-xs text-muted">{l.paymentCode} · {l.method}</span></td>
                  <td>{l.label}</td>
                  <td className="tnum text-right">{formatPKR(l.collected)}</td>
                  <td className="tnum text-right">{formatPKR(l.commission)}</td>
                  <td className="tnum text-right">{formatPKR(l.outstanding)}</td>
                  <td className="pl-3 text-xs">{fmtDate(l.dueAt)}</td>
                  <td className="pl-3 text-right"><Status value={LINE_STATUS[l.status] ?? l.status} /></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>
        <aside className="space-y-5">
          <Card title="Pay commission">
            {t.outstanding <= 0 ? <p className="text-sm text-muted">You are all paid up.</p> : (
              <div className="space-y-3 text-sm">
                {data.payOnline ? <>
                  <Input label="Amount (Rs.)" type="number" min={1} placeholder={`Full balance: ${formatPKR(t.outstanding)}`} value={amount} onChange={(e) => setAmount(e.target.value)} hint="Leave empty to pay the full outstanding balance." />
                  <Button className="w-full" busy={busy} onClick={pay}>Pay online</Button>
                </> : <p className="text-muted">Online payment is not available yet.</p>}
                {data.instructions && <div className="rounded-lg bg-blush p-3"><p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Bank transfer</p><p className="whitespace-pre-line">{data.instructions}</p><p className="mt-2 text-xs text-muted">Our team records transfers once received.</p></div>}
              </div>
            )}
          </Card>
          <Card title="How this works"><ul className="list-disc space-y-1 pl-4 text-sm text-muted">
            <li>Commission is charged when the customer confirms a cash payment.</li>
            <li>Each charge is due {data.dueDays} days later.</li>
            <li>A refund to the customer reduces the commission on it.</li>
            <li>Charges on a booking under dispute are paused until it is resolved.</li>
          </ul></Card>
        </aside>
      </div>
    </>
  );
}
export default function Page() { return <Suspense><Statement /></Suspense>; }
