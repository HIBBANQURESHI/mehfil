'use client';
import { EventType, statusLabel, rupeesToPaisa, formatPKR } from '@mehfil/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, Empty, ErrorBox, FormError, Input, Modal, PageHeader, Spinner, useForm } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { fmtDate } from '@/lib/format';

export default function Weddings() {
  const { data, error, isLoading, mutate } = useApi<any[]>('/weddings');
  const [open, setOpen] = useState(false);
  const f = useForm({ title: '', budget: '', guestCount: '', dateFrom: '', dateTo: '' });
  const [types, setTypes] = useState<string[]>([]);
  const router = useRouter();
  if (error) return <ErrorBox error={error} retry={() => mutate()} />;
  if (isLoading || !data) return <Spinner />;
  const create = () => f.submit(async () => {
    const v = f.values;
    const w = await api('/weddings', { body: { title: v.title, budget: v.budget ? rupeesToPaisa(Number(v.budget)) : null, guestCount: v.guestCount ? Number(v.guestCount) : null, dateFrom: v.dateFrom || null, dateTo: v.dateTo || null, eventTypes: types } });
    router.push(`/account/weddings/${w.id}`);
  });
  return (
    <>
      <PageHeader title="My wedding" action={<Button onClick={() => setOpen(true)}>Create wedding</Button>} />
      {!data.length ? <Card><Empty title="Start your wedding plan" body="Track each function, your budget, checklist and vendors together." action={<Button onClick={() => setOpen(true)}>Create wedding</Button>} /></Card> : <div className="grid gap-4 md:grid-cols-2">{data.map((w) => <Link key={w.id} href={`/account/weddings/${w.id}`} className="rounded-2xl border border-line bg-white p-5 hover:border-rose"><h2 className="text-xl">{w.title}</h2><p className="mt-1 text-sm text-muted">{w.dateFrom ? fmtDate(w.dateFrom) : 'Date not set'}{w.budget !== null ? ` · Budget ${formatPKR(w.budget)}` : ''}</p><p className="mt-2 text-sm">{w.events.map((e: any) => e.name ?? statusLabel(e.type)).join(' · ')}</p></Link>)}</div>}
      {open && <Modal title="Create your wedding" onClose={() => setOpen(false)}><div className="space-y-3"><Input label="Wedding name" placeholder="e.g. your names" {...f.bind('title')} /><div className="grid grid-cols-2 gap-3"><Input label="From" type="date" {...f.bind('dateFrom')} /><Input label="To" type="date" {...f.bind('dateTo')} /></div><div className="grid grid-cols-2 gap-3"><Input label="Total budget (Rs.)" type="number" min={0} {...f.bind('budget')} /><Input label="Guests" type="number" min={0} {...f.bind('guestCount')} /></div>
        <fieldset><legend className="mb-1.5 text-sm font-medium">Functions</legend><div className="flex flex-wrap gap-2">{EventType.filter((t) => t !== 'OTHER').map((t) => { const on = types.includes(t); return <button type="button" key={t} aria-pressed={on} onClick={() => setTypes(on ? types.filter((x) => x !== t) : [...types, t])} className={`rounded-full border px-3 py-1.5 text-sm ${on ? 'border-ruby bg-ruby text-white' : 'border-line'}`}>{statusLabel(t)}</button>; })}</div></fieldset>
        <FormError message={f.formError} /><Button className="w-full" busy={f.busy} onClick={create}>Create</Button></div></Modal>}
    </>
  );
}
