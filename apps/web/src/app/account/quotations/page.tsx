'use client';
import { formatPKR } from '@mehfil/shared';
import { Star } from 'lucide-react';
import Link from 'next/link';
import { Card, Empty, ErrorBox, LinkButton, PageHeader, Spinner, Status } from '@/components/ui';
import { Paged, useApi } from '@/lib/api';
import { fmtDate, fmtDateTime } from '@/lib/format';

/** Side-by-side comparison, one of the screens the whole marketplace depends on. */
export default function Quotations() {
  const { data, error, isLoading, mutate } = useApi<Paged>('/quotations?pageSize=50');
  if (error) return <ErrorBox error={error} retry={() => mutate()} />;
  if (isLoading || !data) return <Spinner />;
  const live = data.items.filter((q) => ['SENT', 'VIEWED'].includes(q.status));
  const rest = data.items.filter((q) => !['SENT', 'VIEWED'].includes(q.status));
  const amounts = live.map((q) => q.total);
  const lowest = new Set(amounts).size > 1 ? Math.min(...amounts) : null;
  const rows: [string, (q: any) => React.ReactNode][] = [
    ['Total', (q) => <span className="tnum text-base font-semibold">{formatPKR(q.total)}{q.total === lowest && <span className="ml-2 rounded-full bg-good/12 px-2 py-0.5 text-[11px] font-medium text-good">Lowest</span>}</span>],
    ['Pay now', (q) => <span className="tnum">{formatPKR(q.milestones[0].amount)}</span>],
    ['Event', (q) => fmtDate(q.enquiry.eventDate)],
    ['Rating', (q) => q.vendor.reviewCount ? <span className="tnum inline-flex items-center gap-1"><Star className="size-3.5 fill-gold text-gold" aria-hidden />{q.vendor.avgRating.toFixed(1)} ({q.vendor.reviewCount})</span> : 'No reviews yet'],
    ['Capacity', (q) => q.enquiry.listing.capacityMax ?? '—'],
    ['Location', (q) => [q.enquiry.listing.area?.name, q.enquiry.listing.city.name].filter(Boolean).join(', ')],
    ['Facilities', (q) => q.enquiry.listing.amenities.slice(0, 5).join(', ') || '—'],
    ['Cancellation', (q) => q.cancellationPolicy.name],
    ['Valid until', (q) => fmtDateTime(q.validUntil)],
  ];
  return (
    <>
      <PageHeader title="Quotations" sub="Compare offers side by side, then open one to accept." />
      {!data.items.length && <Card><Empty title="No quotations yet" body="Quotations from vendors will appear here." action={<LinkButton href="/search">Find vendors</LinkButton>} /></Card>}
      {live.length > 0 && <div className="overflow-x-auto rounded-xl border border-line bg-white"><table className="w-full min-w-[560px] text-left text-sm"><thead><tr className="border-b border-line"><th className="w-28 p-4" />{live.map((q) => <th key={q.id} className="p-4 align-top font-normal"><Link href={`/vendors/${q.enquiry.listing.slug}`} className="display block text-base font-semibold hover:text-ruby">{q.vendor.businessName}</Link><span className="text-xs text-muted">{q.enquiry.listing.title}</span></th>)}</tr></thead><tbody>{rows.map(([label, cell]) => <tr key={label} className="border-b border-line last:border-0"><th className="p-4 text-xs font-medium text-muted">{label}</th>{live.map((q) => <td key={q.id} className="p-4">{cell(q)}</td>)}</tr>)}<tr><th /><td colSpan={live.length} className="p-0"><div className="grid" style={{ gridTemplateColumns: `repeat(${live.length}, minmax(0, 1fr))` }}>{live.map((q) => <div key={q.id} className="p-4"><LinkButton href={`/account/quotations/${q.id}`}>Review</LinkButton></div>)}</div></td></tr></tbody></table></div>}
      {rest.length > 0 && <Card title="Earlier" className="mt-5"><ul className="divide-y divide-line">{rest.map((q) => <li key={q.id}><Link href={`/account/quotations/${q.id}`} className="flex items-center justify-between gap-3 py-3 text-sm"><span>{q.vendor.businessName} <span className="text-muted">{q.code}</span></span><span className="flex items-center gap-3"><span className="tnum">{formatPKR(q.total)}</span><Status value={q.status} /></span></Link></li>)}</ul></Card>}
    </>
  );
}
