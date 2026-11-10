'use client';
import { useState } from 'react';
import { ListPage } from '@/components/list-page';
import { ReasonAction, Status } from '@/components/ui';
import { api } from '@/lib/api';
export default function Page() {
  const [v, setV] = useState(0);
  const mod = (id: string, action: string) => async (reason: string) => { await api(`/admin/reviews/${id}/moderate`, { body: { action, reason } }); setV(v + 1); };
  return <ListPage<any> key={v} title="Reviews" endpoint="/admin/reviews" columns={[{ h: 'Vendor', c: (r) => r.vendor.businessName }, { h: 'Customer', c: (r) => r.customer.name }, { h: 'Rating', right: true, c: (r) => r.rating }, { h: 'Comment', c: (r) => <span className="line-clamp-2 max-w-xs">{r.comment}</span> }, { h: 'Reports', c: (r) => (r.reports.length ? <span className="text-bad">{r.reports.map((x: any) => x.reason).join('; ')}</span> : '—') }, { h: 'Status', c: (r) => <Status value={r.status} /> }, { h: 'Actions', c: (r) => <div className="flex gap-1">{r.status === 'PUBLISHED' ? <ReasonAction label="Hide" variant="danger" onSubmit={mod(r.id, 'HIDE')} /> : <ReasonAction label="Restore" onSubmit={mod(r.id, 'RESTORE')} />}{r.reports.length > 0 && <ReasonAction label="Dismiss" onSubmit={mod(r.id, 'DISMISS')} />}</div> }]} />;
}
