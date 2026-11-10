'use client';
import { formatPKR, rupeesToPaisa } from '@mehfil/shared';
import { useState } from 'react';
import { Button, Card, Empty, ErrorBox, FormError, Input, Modal, PageHeader, Spinner, useForm } from '@/components/ui';
import { api, useApi } from '@/lib/api';
export default function Page() {
  const { data, error, mutate } = useApi<any[]>('/admin/commissions');
  const [row, setRow] = useState<any>(null);
  const f = useForm({ amount: '', reference: '' });
  if (error) return <ErrorBox error={error} retry={() => mutate()} />;
  if (!data) return <Spinner />;
  const owed = (r: any) => r.directCommission - r.received;
  return <><PageHeader title="Commissions" sub="Earned per vendor, and what is owed on payments vendors collected directly." />{!data.length ? <Card><Empty title="No commission yet" /></Card> : <div className="overflow-x-auto rounded-xl border border-line bg-white"><table className="w-full min-w-[640px] text-left text-sm"><thead><tr className="border-b border-line text-xs text-muted"><th className="p-4 font-medium">Vendor</th><th className="text-right font-medium">Collected</th><th className="text-right font-medium">Commission</th><th className="text-right font-medium">Owed to Mehfil</th><th /></tr></thead><tbody>{data.map((r) => <tr key={r.id} className="border-b border-line last:border-0"><td className="p-4 font-medium">{r.businessName}</td><td className="tnum text-right">{formatPKR(r.collected)}</td><td className="tnum text-right">{formatPKR(r.commission)}</td><td className="tnum text-right">{formatPKR(owed(r))}</td><td className="p-3 text-right">{owed(r) > 0 && <Button variant="secondary" onClick={() => setRow(r)}>Record receipt</Button>}</td></tr>)}</tbody></table></div>}{row && <Modal title={`Commission received from ${row.businessName}`} onClose={() => setRow(null)}><div className="space-y-3"><Input label="Amount (Rs.)" type="number" min={0} {...f.bind('amount')} /><Input label="Reference" {...f.bind('reference')} /><FormError message={f.formError} /><Button className="w-full" busy={f.busy} onClick={() => f.submit(async () => { await api('/admin/commission-receipts', { body: { vendorId: row.id, amount: rupeesToPaisa(Number(f.values.amount || 0)), reference: f.values.reference } }); setRow(null); f.setValues({ amount: '', reference: '' }); mutate(); })}>Record</Button></div></Modal>}</>;
}
