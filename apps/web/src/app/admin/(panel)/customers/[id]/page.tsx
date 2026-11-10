'use client';
import { formatPKR } from '@mehfil/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, ErrorBox, PageHeader, ReasonAction, Spinner, Status } from '@/components/ui';
import { api, useApi } from '@/lib/api';
export default function Page() {
  const { id } = useParams<{ id: string }>();
  const { data: u, error, isLoading, mutate } = useApi<any>(`/admin/users/${id}`);
  if (error) return <ErrorBox error={error} retry={() => mutate()} />;
  if (isLoading || !u) return <Spinner />;
  const set = (status: string) => async (reason: string) => { await api(`/admin/users/${id}/status`, { method: 'PATCH', body: { status, reason } }); mutate(); };
  return <><PageHeader title={u.name} sub={[u.phone, u.email].filter(Boolean).join(' · ')} action={<div className="flex items-center gap-2"><Status value={u.status} />{u.status === 'ACTIVE' ? <><ReasonAction label="Suspend" onSubmit={set('SUSPENDED')} /><ReasonAction label="Block" variant="danger" onSubmit={set('BLOCKED')} /></> : <ReasonAction label="Reactivate" onSubmit={set('ACTIVE')} />}</div>} /><div className="grid gap-5 lg:grid-cols-2"><Card title="Bookings"><ul className="divide-y divide-line">{u.bookings.map((b: any) => <li key={b.id}><Link href={`/admin/bookings/${b.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm"><span>{b.code} · {b.vendor.businessName}</span><span className="flex items-center gap-2"><span className="tnum">{formatPKR(b.totalAmount)}</span><Status value={b.status} /></span></Link></li>)}</ul></Card><Card title="Support history"><ul className="divide-y divide-line">{u.tickets.map((t: any) => <li key={t.id}><Link href={`/admin/support/${t.id}`} className="flex items-center justify-between py-2.5 text-sm"><span>{t.subject}</span><Status value={t.status} /></Link></li>)}</ul></Card></div></>;
}
