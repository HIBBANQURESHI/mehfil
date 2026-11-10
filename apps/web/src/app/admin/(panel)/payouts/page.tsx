'use client';
import { formatPKR } from '@mehfil/shared';
import { useState } from 'react';
import { ListPage } from '@/components/list-page';
import { Button, FormError, Input, Modal, ReasonAction, Status, useForm, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/format';
export default function Page() {
  const [v, setV] = useState(0);
  const [pay, setPay] = useState<any>(null);
  const [bank, setBank] = useState<any>(null);
  const f = useForm({ reference: '' });
  const toast = useToast();
  const act = async (id: string, body: object) => { await api(`/admin/payouts/${id}/decision`, { body }); setV(v + 1); };
  const reveal = async (p: any) => { try { setBank(await api(`/admin/payouts/${p.id}/bank`)); setPay(p); } catch (e) { toast((e as Error).message, true); } };
  return (
    <>
      <ListPage<any> key={v} title="Vendor payouts" endpoint="/admin/payouts" tabs={[{ label: 'Requested', value: 'REQUESTED' }, { label: 'Approved', value: 'APPROVED' }, { label: 'Paid', value: 'PAID' }, { label: 'Failed', value: 'FAILED' }, { label: 'All', value: '' }]} columns={[{ h: 'Ref', c: (p) => p.code }, { h: 'Vendor', c: (p) => p.vendor.businessName }, { h: 'Bank', c: (p) => `${p.bankName} ${p.ibanMasked}` }, { h: 'Requested', c: (p) => fmtDate(p.createdAt) }, { h: 'Amount', right: true, c: (p) => formatPKR(p.amount) }, { h: 'Status', c: (p) => <Status value={p.status} /> }, { h: 'Actions', c: (p) => <div className="flex gap-1">{p.status === 'REQUESTED' && <Button variant="secondary" onClick={() => act(p.id, { action: 'APPROVE' })}>Approve</Button>}{p.status === 'APPROVED' && <Button variant="secondary" onClick={() => reveal(p)}>Pay</Button>}{['REQUESTED', 'APPROVED'].includes(p.status) && <ReasonAction label="Fail" variant="danger" onSubmit={(reason) => act(p.id, { action: 'FAIL', reason })} />}</div> }]} />
      {pay && bank && <Modal title={`Pay ${formatPKR(pay.amount)}`} onClose={() => setPay(null)}><div className="space-y-3"><dl className="rounded-lg bg-blush p-3 text-sm"><dt className="text-xs text-muted">Bank</dt><dd>{bank.bankName}</dd><dt className="mt-1 text-xs text-muted">Account title</dt><dd>{bank.accountTitle}</dd><dt className="mt-1 text-xs text-muted">IBAN</dt><dd className="tnum break-all">{bank.iban}</dd></dl><Input label="Bank transfer reference" {...f.bind('reference')} /><FormError message={f.formError} /><Button className="w-full" busy={f.busy} onClick={() => f.submit(async () => { await act(pay.id, { action: 'MARK_PAID', reference: f.values.reference }); setPay(null); f.set('reference', ''); })}>Mark as paid</Button></div></Modal>}
    </>
  );
}
