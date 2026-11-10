'use client';
import { formatPKR } from '@mehfil/shared';
import Link from 'next/link';
import { Card, Empty, ErrorBox, LinkButton, PageHeader, Spinner, Status } from '@/components/ui';
import { useApi } from '@/lib/api';
export default function Listings() {
  const { data, error, isLoading, mutate } = useApi<any[]>('/vendor/listings');
  if (error) return <ErrorBox error={error} retry={() => mutate()} />;
  if (isLoading || !data) return <Spinner />;
  return <><PageHeader title="Listings and packages" action={<LinkButton href="/vendor/listings/new">Add listing</LinkButton>} />{!data.length ? <Card><Empty title="No listings yet" body="Add what customers can book." action={<LinkButton href="/vendor/listings/new">Add listing</LinkButton>} /></Card> : <div className="grid gap-4 md:grid-cols-2">{data.map((l) => <Link key={l.id} href={`/vendor/listings/${l.id}`} className="flex gap-4 rounded-2xl border border-line bg-white p-3 hover:border-rose"><div className="size-24 shrink-0 overflow-hidden rounded-xl bg-blush">{l.media[0] && <img src={l.media[0].url} alt="" className="size-full object-cover" />}</div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><h2 className="truncate text-lg">{l.title}</h2><Status value={l.status} /></div><p className="text-xs text-muted">{l.category.name} · {l.city.name}</p><p className="tnum mt-1 text-sm">From {formatPKR(l.startingPrice)}</p><p className="tnum mt-1 text-xs text-muted">{l._count.media} photos · {l._count.packages} packages · {l._count.enquiries} enquiries</p>{l.statusReason && <p className="mt-1 text-xs text-bad">{l.statusReason}</p>}</div></Link>)}</div>}</>;
}
