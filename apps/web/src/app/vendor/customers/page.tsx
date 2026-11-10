'use client';
import { formatPKR } from '@mehfil/shared';
import { Card, Empty, ErrorBox, PageHeader, Spinner } from '@/components/ui';
import { useApi } from '@/lib/api';
import { fmtDate } from '@/lib/format';
export default function Page() {
  const { data, error, isLoading, mutate } = useApi<any[]>('/vendor/customers');
  if (error) return <ErrorBox error={error} retry={() => mutate()} />;
  if (isLoading || !data) return <Spinner />;
  return <><PageHeader title="Customers" sub="Contact details appear after a confirmed booking." />{!data.length ? <Card><Empty title="No customers yet" /></Card> : <div className="overflow-x-auto rounded-xl border border-line bg-white"><table className="w-full min-w-[560px] text-left text-sm"><thead><tr className="border-b border-line text-xs text-muted"><th className="p-4 font-medium">Customer</th><th className="font-medium">Phone</th><th className="font-medium">Last enquiry</th><th className="text-right font-medium">Bookings</th><th className="p-4 text-right font-medium">Value</th></tr></thead><tbody>{data.map((c) => <tr key={c.customerId} className="border-b border-line last:border-0"><td className="p-4 font-medium">{c.name}</td><td className="tnum">{c.phone ?? '—'}</td><td>{fmtDate(c.lastEnquiryAt)}</td><td className="tnum text-right">{c.bookings}</td><td className="tnum p-4 text-right">{formatPKR(c.totalValue)}</td></tr>)}</tbody></table></div>}</>;
}
