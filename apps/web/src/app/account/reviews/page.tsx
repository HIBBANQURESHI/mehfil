'use client';
import { Star } from 'lucide-react';
import { Card, Empty, ErrorBox, PageHeader, Spinner } from '@/components/ui';
import { useApi } from '@/lib/api';
import { fmtDate } from '@/lib/format';
export default function Reviews() {
  const { data, error, isLoading, mutate } = useApi<any[]>('/my-reviews');
  if (error) return <ErrorBox error={error} retry={() => mutate()} />;
  if (isLoading || !data) return <Spinner />;
  return <><PageHeader title="My reviews" /><Card className="!p-0">{!data.length ? <Empty title="No reviews yet" body="After a completed booking you can share your experience." /> : <ul className="divide-y divide-line">{data.map((r) => <li key={r.id} className="p-5"><p className="font-medium">{r.listing.title}</p><p className="tnum mt-1 flex items-center gap-1 text-sm"><Star className="size-4 fill-gold text-gold" aria-hidden />{r.rating} <span className="text-muted">· {fmtDate(r.createdAt)}</span></p><p className="mt-2 text-sm">{r.comment}</p></li>)}</ul>}</Card></>;
}
