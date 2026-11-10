'use client';
import { formatPKR } from '@mehfil/shared';
import { useState } from 'react';
import { BarChart } from '@/components/chart';
import { Card, Empty, ErrorBox, Input, PageHeader, Spinner } from '@/components/ui';
import { useApi } from '@/lib/api';
export default function Page() {
  const cats = useApi<any[]>('/admin/analytics/categories');
  const top = useApi<any[]>('/admin/analytics/top-vendors');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  if (cats.error || top.error) return <ErrorBox error={cats.error ?? top.error} />;
  if (!cats.data || !top.data) return <Spinner />;
  const qs = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString();
  return <><PageHeader title="Reports" /><div className="space-y-5"><Card title="Export"><div className="flex flex-wrap items-end gap-3"><Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /><Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} /><a className="rounded-lg bg-blush px-4 py-2.5 text-sm font-semibold text-ruby" href={`/api/proxy/v1/admin/reports/bookings.csv?${qs}`}>Bookings CSV</a><a className="rounded-lg bg-blush px-4 py-2.5 text-sm font-semibold text-ruby" href={`/api/proxy/v1/admin/reports/ledger.csv?${qs}`}>Ledger CSV</a></div></Card><Card title="Booking value by category"><BarChart title="Booking value by category" points={cats.data.map((c) => ({ label: c.name, value: c.value, display: formatPKR(c.value) }))} /></Card><Card title="Top vendors">{!top.data.length ? <Empty title="No bookings yet" /> : <table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted"><th className="py-1 font-medium">Vendor</th><th className="text-right font-medium">Bookings</th><th className="text-right font-medium">Value</th></tr></thead><tbody>{top.data.map((v) => <tr key={v.id} className="border-t border-line"><td className="py-2">{v.businessName}</td><td className="tnum text-right">{v.bookings}</td><td className="tnum text-right">{formatPKR(v.value)}</td></tr>)}</tbody></table>}</Card></div></>;
}
