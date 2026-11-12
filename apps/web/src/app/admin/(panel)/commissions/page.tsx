'use client';
import { formatPKR, rupeesToPaisa } from '@mehfil/shared';
import Link from 'next/link';
import { useState } from 'react';
import { Button, Card, Empty, ErrorBox, FormError, Input, Modal, PageHeader, Spinner, Stat, Status, useForm } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { fmtDate, fmtDateTime } from '@/lib/format';

export default function Page() {
  const earned = useApi<any[]>('/admin/commissions');
  const owed = useApi<any[]>('/admin/commission-statements');
  const cash = useApi<any[]>('/admin/cash-receipts');
  const [row, setRow] = useState<any>(null);
  const f = useForm({ amount: '', reference: '' });
  const err = earned.error ?? owed.error;
  if (err) return <ErrorBox error={err} retry={() => { earned.mutate(); owed.mutate(); }} />;
  if (!earned.data || !owed.data) return <Spinner />;
  const sum = (k: string) => owed.data!.reduce((a, r) => a + r[k], 0);
  return (
    <>
      <PageHeader title="Commissions" sub="Commission earned on every booking, and what vendors owe on money they collected themselves." />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Owed by vendors" value={formatPKR(sum('outstanding'))} />
        <Stat label="Overdue" value={formatPKR(sum('overdue'))} />
        <Stat label="Cash awaiting review" value={String(cash.data?.length ?? 0)} />
      </div>
      <div className="mt-5 space-y-5">
        <Card title="Vendor-collected commission">
          {!owed.data.length ? <Empty title="No vendor-collected payments yet" /> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm">
              <thead><tr className="border-b border-line text-xs text-muted"><th className="py-2 font-medium">Vendor</th><th className="text-right font-medium">Charged</th><th className="text-right font-medium">Received</th><th className="text-right font-medium">Outstanding</th><th className="text-right font-medium">Overdue</th><th className="pl-3 font-medium">Next due</th><th /></tr></thead>
              <tbody>{owed.data.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="py-2 font-medium"><Link className="text-ruby" href={`/admin/vendors/${r.id}`}>{r.businessName}</Link></td>
                  <td className="tnum text-right">{formatPKR(r.owed)}</td>
                  <td className="tnum text-right">{formatPKR(r.received)}</td>
                  <td className="tnum text-right">{formatPKR(r.outstanding)}</td>
                  <td className={`tnum text-right ${r.overdue > 0 ? 'font-medium text-bad' : ''}`}>{formatPKR(r.overdue)}</td>
                  <td className="pl-3 text-xs">{fmtDate(r.nextDueAt)}</td>
                  <td className="p-2 text-right">{r.outstanding > 0 && <Button variant="secondary" onClick={() => setRow(r)}>Record receipt</Button>}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>
        <Card title="Cash waiting for confirmation or in dispute">
          {!cash.data ? <Spinner /> : !cash.data.length ? <p className="text-sm text-muted">Nothing waiting.</p> : (
            <ul className="divide-y divide-line text-sm">{cash.data.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <span><Link className="font-medium text-ruby" href={`/admin/bookings/${r.booking.id}`}>{r.booking.code}</Link> <span className="text-xs text-muted">{r.booking.vendor.businessName} → {r.booking.customer.name} · recorded {fmtDateTime(r.createdAt)}</span>{r.disputeReason && <span className="block text-xs text-bad">{r.disputeReason}</span>}</span>
                <span className="flex items-center gap-2"><span className="tnum">{formatPKR(r.amount)}</span><Status value={r.status} /></span>
              </li>
            ))}</ul>
          )}
        </Card>
        <Card title="Commission earned by vendor">
          {!earned.data.length ? <Empty title="No commission yet" /> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[480px] text-left text-sm">
              <thead><tr className="border-b border-line text-xs text-muted"><th className="py-2 font-medium">Vendor</th><th className="text-right font-medium">Collected</th><th className="text-right font-medium">Commission</th></tr></thead>
              <tbody>{earned.data.map((r) => <tr key={r.id} className="border-b border-line last:border-0"><td className="py-2 font-medium">{r.businessName}</td><td className="tnum text-right">{formatPKR(r.collected)}</td><td className="tnum text-right">{formatPKR(r.commission)}</td></tr>)}</tbody>
            </table></div>
          )}
        </Card>
      </div>
      {row && <Modal title={`Commission received from ${row.businessName}`} onClose={() => setRow(null)}><div className="space-y-3"><p className="text-sm text-muted">Outstanding: <span className="tnum">{formatPKR(row.outstanding)}</span>. Receipts are applied to the oldest charges first.</p><Input label="Amount (Rs.)" type="number" min={0} {...f.bind('amount')} /><Input label="Bank or receipt reference" {...f.bind('reference')} /><FormError message={f.formError} /><Button className="w-full" busy={f.busy} onClick={() => f.submit(async () => { await api('/admin/commission-receipts', { body: { vendorId: row.id, amount: rupeesToPaisa(Number(f.values.amount || 0)), reference: f.values.reference } }); setRow(null); f.setValues({ amount: '', reference: '' }); owed.mutate(); earned.mutate(); })}>Record</Button></div></Modal>}
    </>
  );
}
