'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, ErrorBox, FormError, PageHeader, Select, Spinner, Status, Textarea, useForm } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
export default function Page() {
  const { id } = useParams<{ id: string }>();
  const { data: t, error, isLoading, mutate } = useApi<any>(`/admin/tickets/${id}`);
  const f = useForm({ body: '' });
  const [internal, setInternal] = useState(false);
  if (error) return <ErrorBox error={error} retry={() => mutate()} />;
  if (isLoading || !t) return <Spinner />;
  const patch = async (body: object) => { await api(`/admin/tickets/${id}`, { method: 'PATCH', body }); mutate(); };
  return <><PageHeader title={t.subject} sub={`${t.code} · ${t.user.name} · ${t.user.phone ?? t.user.email}`} action={<Status value={t.status} />} /><div className="grid gap-5 lg:grid-cols-[1fr_280px]"><Card><ul className="space-y-3">{t.messages.map((m: any) => <li key={m.id} className={`rounded-lg p-3 text-sm ${m.internal ? 'border border-dashed border-gold bg-gold/10' : m.fromStaff ? 'bg-blush' : 'bg-warm'}`}><p className="text-xs font-medium">{m.internal ? 'Internal note' : m.fromStaff ? 'Staff' : t.user.name} · {fmtDateTime(m.createdAt)}</p><p className="mt-1 whitespace-pre-line">{m.body}</p></li>)}</ul><div className="mt-4 space-y-2"><Textarea label="Reply" {...f.bind('body')} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[#8F3048]" checked={internal} onChange={(e) => setInternal(e.target.checked)} />Internal note (customer can't see this)</label><FormError message={f.formError} /><Button busy={f.busy} disabled={!f.values.body.trim()} onClick={() => f.submit(async () => { await api(`/admin/tickets/${id}/messages`, { body: { body: f.values.body, internal } }); f.set('body', ''); mutate(); })}>Send</Button></div></Card><aside className="space-y-4"><Card><div className="space-y-3"><Select label="Status" value={t.status} onChange={(e) => patch({ status: e.target.value })}><option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option><option value="RESOLVED">Resolved</option><option value="CLOSED">Closed</option></Select><Select label="Priority" value={t.priority} onChange={(e) => patch({ priority: e.target.value })}><option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></Select>{t.booking && <Link className="block text-sm text-ruby" href={`/admin/bookings/${t.booking.id}`}>Open booking {t.booking.code}</Link>}</div></Card></aside></div></>;
}
