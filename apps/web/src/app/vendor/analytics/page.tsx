'use client';
import { formatPKR } from '@mehfil/shared';
import { BarChart } from '@/components/chart';
import { Card, ErrorBox, PageHeader, Spinner, Stat } from '@/components/ui';
import { useApi } from '@/lib/api';
export default function Page() {
  const { data: d, error } = useApi<any>('/vendor/analytics');
  if (error) return <ErrorBox error={error} />;
  if (!d) return <Spinner />;
  const f = d.funnel;
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}% of previous step` : undefined);
  return <><PageHeader title="Analytics" sub="Last 180 days" /><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Enquiries" value={f.enquiries} /><Stat label="Quotations sent" value={f.quotes} sub={pct(f.quotes, f.enquiries)} /><Stat label="Quotations accepted" value={f.accepted} sub={pct(f.accepted, f.quotes)} /><Stat label="Confirmed bookings" value={f.bookings} sub={pct(f.bookings, f.accepted)} /></div>{d.revenue && <Card title="Collected per month" className="mt-5"><BarChart title="Collected per month" points={d.revenue.map((r: any) => ({ label: r.month, value: r.amount, display: formatPKR(r.amount) }))} /></Card>}</>;
}
