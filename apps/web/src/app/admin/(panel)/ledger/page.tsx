'use client';
import { formatPKR, statusLabel, rupeesToPaisa } from '@mehfil/shared';
import { useState } from 'react';
import { ListPage } from '@/components/list-page';
import { Button, FormError, Input, Modal, useForm } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
export default function Page() {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(0);
  const f = useForm({ amount: '', memo: '' });
  return <><ListPage<any> key={v} title="Ledger" sub="Append-only. Corrections are made with a new adjustment entry." action={<Button variant="outline" onClick={() => setOpen(true)}>Add adjustment</Button>} endpoint="/admin/ledger" columns={[{ h: 'Date', c: (e) => fmtDateTime(e.createdAt) }, { h: 'Type', c: (e) => statusLabel(e.type) }, { h: 'Booking', c: (e) => e.booking?.code ?? '—' }, { h: 'Vendor', c: (e) => e.vendor?.businessName ?? '—' }, { h: 'Memo', c: (e) => e.memo ?? '' }, { h: 'Amount', right: true, c: (e) => (e.amount < 0 ? `−${formatPKR(-e.amount)}` : formatPKR(e.amount)) }]} />{open && <Modal title="Ledger adjustment" onClose={() => setOpen(false)}><div className="space-y-3"><Input label="Amount (Rs., negative to reduce)" type="number" {...f.bind('amount')} /><Input label="Reason" {...f.bind('memo')} /><FormError message={f.formError} /><Button className="w-full" busy={f.busy} onClick={() => f.submit(async () => { await api('/admin/ledger/adjustments', { body: { amount: rupeesToPaisa(Number(f.values.amount || 0)), memo: f.values.memo } }); setOpen(false); setV(v + 1); f.setValues({ amount: '', memo: '' }); })}>Record</Button></div></Modal>}</>;
}
