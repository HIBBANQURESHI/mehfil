'use client';
import { formatPKR } from '@mehfil/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button, Card, Empty, ErrorBox, PageHeader, Spinner, Status } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { fmtDate, SLOT_LABEL } from '@/lib/format';
export default function EnquiryDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: e, error, isLoading, mutate } = useApi<any>(`/enquiries/${id}`);
  if (error) return <ErrorBox error={error} retry={() => mutate()} />;
  if (isLoading || !e) return <Spinner />;
  return (
    <>
      <PageHeader title={e.vendor.businessName} sub={`${e.code} · ${e.listing.title}`} action={<Status value={e.status} />} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Your request"><dl className="space-y-2 text-sm"><div className="flex justify-between"><dt className="text-muted">Date</dt><dd>{fmtDate(e.eventDate)} ({SLOT_LABEL[e.slot]})</dd></div><div className="flex justify-between"><dt className="text-muted">Guests</dt><dd className="tnum">{e.guestCount}</dd></div>{e.budget !== null && <div className="flex justify-between"><dt className="text-muted">Budget</dt><dd className="tnum">{formatPKR(e.budget)}</dd></div>}</dl><p className="mt-3 whitespace-pre-line text-sm">{e.requirements}</p>{e.declineReason && <p className="mt-3 rounded-lg bg-bad/8 p-3 text-sm text-bad">Declined: {e.declineReason}</p>}{['NEW', 'VIEWED', 'RESPONDED', 'QUOTATION_SENT'].includes(e.status) && <Button variant="outline" className="mt-4" onClick={async () => { await api(`/enquiries/${id}/close`, { method: 'POST', body: {} }); mutate(); }}>Close enquiry</Button>}</Card>
        <Card title="Quotations">{!e.quotations.length ? <Empty title="Waiting for the vendor" body="You will be notified when a quotation arrives." /> : <ul className="divide-y divide-line">{e.quotations.map((q: any) => <li key={q.id}><Link href={`/account/quotations/${q.id}`} className="flex items-center justify-between gap-3 py-3 text-sm"><span>{q.code} <span className="text-muted">v{q.version}</span></span><span className="flex items-center gap-3"><span className="tnum font-medium">{formatPKR(q.total)}</span><Status value={q.status} /></span></Link></li>)}</ul>}</Card>
      </div>
    </>
  );
}
