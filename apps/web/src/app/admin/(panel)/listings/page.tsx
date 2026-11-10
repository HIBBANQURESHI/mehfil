'use client';
import { formatPKR } from '@mehfil/shared';
import { useState } from 'react';
import { ListPage } from '@/components/list-page';
import { ReasonAction, Status, useToast, Button } from '@/components/ui';
import { api } from '@/lib/api';
export default function Page() {
  const [v, setV] = useState(0);
  const toast = useToast();
  const act = async (id: string, decision: string, reason?: string) => { try { await api(`/admin/listings/${id}/decision`, { body: { decision, reason: reason ?? null } }); setV(v + 1); } catch (e) { toast((e as Error).message, true); throw e; } };
  return <ListPage<any> key={v} title="Listings" endpoint="/admin/listings" search tabs={[{ label: 'Pending review', value: 'PENDING_REVIEW' }, { label: 'All', value: '' }, { label: 'Published', value: 'PUBLISHED' }, { label: 'Paused', value: 'PAUSED' }, { label: 'Rejected', value: 'REJECTED' }]} columns={[{ h: 'Photo', c: (l) => (l.media[0] ? <img src={l.media[0].url} alt="" className="size-12 rounded-lg object-cover" /> : '—') }, { h: 'Listing', c: (l) => <><span className="font-medium">{l.title}</span><br /><span className="text-xs text-muted">{l.vendor.businessName}</span></> }, { h: 'Category', c: (l) => l.category.name }, { h: 'From', right: true, c: (l) => formatPKR(l.startingPrice) }, { h: 'Status', c: (l) => <Status value={l.status} /> }, { h: 'Actions', c: (l) => <div className="flex gap-1">{l.status !== 'PUBLISHED' && <Button variant="secondary" onClick={() => act(l.id, 'APPROVE')}>Publish</Button>}{l.status === 'PUBLISHED' && <ReasonAction label="Pause" onSubmit={(r) => act(l.id, 'PAUSE', r)} />}{l.status !== 'REJECTED' && <ReasonAction label="Reject" variant="danger" onSubmit={(r) => act(l.id, 'REJECT', r)} />}</div> }]} />;
}
