'use client';
import { formatPKR } from '@mehfil/shared';
import { useState } from 'react';
import { ListPage } from '@/components/list-page';
import { ReasonAction, Status } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
export default function Page() {
  const [v, setV] = useState(0);
  const decide = (id: string, approve: boolean) => async (reason: string) => { await api(`/admin/refunds/${id}/decision`, { body: { approve, reason } }); setV(v + 1); };
  return <ListPage<any> key={v} title="Refunds" endpoint="/admin/refunds" tabs={[{ label: 'Requested', value: 'REQUESTED' }, { label: 'Approved (retry)', value: 'APPROVED' }, { label: 'Processed', value: 'PROCESSED' }, { label: 'Rejected', value: 'REJECTED' }, { label: 'All', value: '' }]} columns={[{ h: 'Ref', c: (r) => r.code }, { h: 'Booking', c: (r) => r.payment.booking.code }, { h: 'Customer', c: (r) => r.payment.booking.customer.name }, { h: 'Reason', c: (r) => r.reason }, { h: 'Requested', c: (r) => fmtDateTime(r.createdAt) }, { h: 'Amount', right: true, c: (r) => formatPKR(r.amount) }, { h: 'Status', c: (r) => <Status value={r.status} /> }, { h: 'Decision', c: (r) => (['REQUESTED', 'APPROVED'].includes(r.status) ? <div className="flex gap-1"><ReasonAction label="Approve" variant="secondary" onSubmit={decide(r.id, true)} />{r.status === 'REQUESTED' && <ReasonAction label="Reject" variant="danger" onSubmit={decide(r.id, false)} />}</div> : '—') }]} />;
}
