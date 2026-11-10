'use client';
import { formatPKR } from '@mehfil/shared';
import { AlertTriangle, Check } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { BarChart } from '@/components/chart';
import { Card, Empty, ErrorBox, PageHeader, Select, Spinner, Stat, Status } from '@/components/ui';
import { useApi } from '@/lib/api';
import { fmtDate, fmtDateTime } from '@/lib/format';

const RANGES: Record<string, number | null> = { 'All time': null, 'Today': 0, '7 days': 7, '30 days': 30, '90 days': 90 };
const iso = (d: Date) => d.toISOString().slice(0, 10);

function Setup() {
  const { data: s } = useApi<any>('/admin/setup');
  if (!s) return null;
  const items: [string, boolean, string, string?][] = [
    ['Commission set on every category', s.unpricedCategories.length === 0, '/admin/catalog', s.unpricedCategories.length ? `Missing: ${s.unpricedCategories.join(', ')}` : undefined],
    ['At least one cancellation policy', s.cancellationPolicies > 0, '/admin/settings'],
    ['First vendor approved', s.approvedVendors > 0, '/admin/vendors'],
    ['Payment gateway connected', s.paymentProvider !== 'none' && s.paymentProvider !== 'sandbox', '/admin/settings', s.paymentProvider === 'sandbox' ? 'Sandbox mode: no real money' : s.paymentProvider === 'none' ? 'Checkout is off. Manual records still work.' : undefined],
    ['SMS provider connected', s.smsConfigured, '/admin/settings'],
    ['Email connected', s.emailConfigured, '/admin/settings'],
  ];
  if (items.every(([, ok]) => ok)) return null;
  return <Card title="Launch checklist" className="mb-5"><ul className="grid gap-2 sm:grid-cols-2">{items.map(([label, ok, href, note]) => <li key={label}><Link href={href} className="flex items-start gap-2 text-sm"><span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${ok ? 'bg-good text-white' : 'bg-gold/30 text-warn'}`}>{ok ? <Check className="size-3" aria-label="Done" /> : <AlertTriangle className="size-3" aria-label="To do" />}</span><span>{label}{note && <span className="block text-xs text-muted">{note}</span>}</span></Link></li>)}</ul></Card>;
}

export default function AdminHome() {
  const [range, setRange] = useState('All time');
  const days = RANGES[range];
  const qs = days === null ? '' : `?from=${iso(new Date(Date.now() - days * 86_400_000))}&to=${iso(new Date())}`;
  const { data: d, error, isLoading, mutate } = useApi<any>(`/admin/overview${qs}`);
  const { data: me } = useApi<any>('/auth/me');
  const canFinance = me?.admin?.isSuper || me?.admin?.permissions.includes('finance.view');
  const [bucket, setBucket] = useState('day');
  const revenue = useApi<any[]>(canFinance ? `/admin/analytics/revenue?bucket=${bucket}` : null);
  if (error) return <ErrorBox error={error} retry={() => mutate()} />;
  if (isLoading || !d) return <Spinner />;
  const k = d.kpis;
  const a = d.alerts;
  const alerts: [number, string, string][] = [[a.reconcile, 'payments need reconciliation', '/admin/payments'], [a.disputes, 'open disputes', '/admin/bookings'], [a.openTickets, 'open tickets', '/admin/support'], [a.failedPayments, 'failed payments this week', '/admin/payments']];
  const label = (t: string) => new Date(t).toLocaleDateString('en-PK', bucket === 'month' ? { month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' });
  return (
    <>
      <PageHeader title="Dashboard" action={<Select aria-label="Date range" value={range} onChange={(e) => setRange(e.target.value)}>{Object.keys(RANGES).map((r) => <option key={r}>{r}</option>)}</Select>} />
      <Setup />
      {alerts.some(([n]) => n > 0) && <div className="mb-5 flex flex-wrap gap-2">{alerts.filter(([n]) => n > 0).map(([n, t, h]) => <Link key={t} href={h} className="tnum flex items-center gap-2 rounded-full bg-bad/10 px-3 py-1.5 text-sm text-bad"><AlertTriangle className="size-4" aria-hidden />{n} {t}</Link>)}</div>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Customers" value={k.customers} /><Stat label="Vendors" value={k.vendors} /><Stat label="Pending vendors" value={k.pendingVendors} /><Stat label="Active listings" value={k.activeListings} />
        <Stat label="Bookings" value={k.totalBookings} /><Stat label="Confirmed bookings" value={k.confirmedBookings} /><Stat label="Gross booking value" value={formatPKR(k.gmv)} /><Stat label="Collected" value={formatPKR(k.collected)} />
        <Stat label="Platform revenue" value={formatPKR(k.platformRevenue)} sub="Commission after reversals" /><Stat label="Refunds" value={formatPKR(k.refunds)} /><Stat label="Owed to vendors" value={formatPKR(k.vendorPayable)} />
      </div>
      {canFinance && <Card title="Platform revenue, last 30 days" className="mt-5" action={<Select aria-label="Group by" value={bucket} onChange={(e) => setBucket(e.target.value)}><option value="day">Daily</option><option value="week">Weekly</option></Select>}><BarChart title="Platform revenue" points={(revenue.data ?? []).map((r) => ({ label: label(r.bucket), value: r.revenue, display: formatPKR(r.revenue) }))} /></Card>}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="Waiting for verification">{!d.pendingVendors.length ? <Empty title="No vendors waiting" /> : <ul className="divide-y divide-line">{d.pendingVendors.map((v: any) => <li key={v.id}><Link href={`/admin/vendors/${v.id}`} className="flex items-center justify-between py-3 text-sm"><span><span className="block font-medium">{v.businessName}</span><span className="text-xs text-muted">Submitted {fmtDate(v.submittedAt)}</span></span><Status value={v.status} /></Link></li>)}</ul>}</Card>
        <Card title="Recent transactions">{!d.recentPayments.length ? <Empty title="No transactions yet" /> : <ul className="divide-y divide-line">{d.recentPayments.map((p: any) => <li key={p.id}><Link href={`/admin/bookings/${p.booking.id}`} className="flex items-center justify-between gap-3 py-3 text-sm"><span>{p.code} <span className="text-xs text-muted">{p.booking.code}</span></span><span className="flex items-center gap-3"><span className="tnum">{formatPKR(p.amount)}</span><Status value={p.status} /></span></Link></li>)}</ul>}</Card>
        <Card title="New registrations"><ul className="divide-y divide-line">{d.recentUsers.map((u: any) => <li key={u.id} className="flex justify-between py-2.5 text-sm"><span>{u.name}{u.vendorMembers[0] && <span className="text-xs text-muted"> · {u.vendorMembers[0].vendor.businessName}</span>}</span><span className="text-muted">{fmtDate(u.createdAt)}</span></li>)}</ul></Card>
        <Card title="Team activity">{!d.activity.length ? <Empty title="No activity yet" /> : <ul className="divide-y divide-line">{d.activity.map((l: any) => <li key={l.id} className="py-2.5 text-sm"><span className="font-medium">{l.actor?.name ?? 'System'}</span> <span className="text-muted">{l.action}</span><span className="block text-xs text-muted">{fmtDateTime(l.createdAt)}</span></li>)}</ul>}</Card>
      </div>
    </>
  );
}
