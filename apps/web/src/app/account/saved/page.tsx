'use client';
import { formatPKR } from '@mehfil/shared';
import Link from 'next/link';
import { useState } from 'react';
import { RequestForm } from '@/components/listing-actions';
import { Button, Card, Empty, ErrorBox, LinkButton, Modal, PageHeader, Spinner } from '@/components/ui';
import { api, useApi } from '@/lib/api';

export default function Saved() {
  const { data, error, isLoading, mutate } = useApi<any[]>('/saved');
  const [picked, setPicked] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  if (error) return <ErrorBox error={error} retry={() => mutate()} />;
  if (isLoading || !data) return <Spinner />;
  return (
    <>
      <PageHeader title="Saved vendors" sub="Select several to ask them all for a quotation at once." action={<Button disabled={!picked.length} onClick={() => setOpen(true)}>Request quotes{picked.length ? ` (${picked.length})` : ''}</Button>} />
      {!data.length ? <Card><Empty title="Nothing saved yet" action={<LinkButton href="/search">Find vendors</LinkButton>} /></Card> : <div className="grid gap-3 md:grid-cols-2">{data.map((l) => { const on = picked.includes(l.id); return (
        <div key={l.id} className={`flex gap-3 rounded-2xl border bg-white p-3 ${on ? 'border-ruby' : 'border-line'}`}>
          <input type="checkbox" className="mt-1 size-4 accent-[#8F3048]" aria-label={`Select ${l.title}`} checked={on} disabled={!on && picked.length >= 10} onChange={() => setPicked(on ? picked.filter((x) => x !== l.id) : [...picked, l.id])} />
          {l.media[0] && <img src={l.media[0].url} alt="" className="size-20 rounded-lg object-cover" />}
          <div className="min-w-0 flex-1"><Link href={`/vendors/${l.slug}`} className="block truncate font-medium hover:text-ruby">{l.title}</Link><p className="text-xs text-muted">{l.category.name} · {l.city.name}</p><p className="tnum mt-1 text-sm">From {formatPKR(l.startingPrice)}</p><button className="mt-1 text-xs text-ruby" onClick={async () => { await api(`/saved/${l.id}/toggle`, { method: 'POST', body: {} }); setPicked(picked.filter((x) => x !== l.id)); mutate(); }}>Remove</button></div>
        </div>
      ); })}</div>}
      {open && <Modal title={`Request quotes from ${picked.length}`} onClose={() => setOpen(false)}><RequestForm listingIds={picked} onDone={() => { setOpen(false); setPicked([]); }} /></Modal>}
    </>
  );
}
