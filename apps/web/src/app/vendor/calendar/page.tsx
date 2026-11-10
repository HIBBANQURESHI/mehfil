'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button, Card, Empty, ErrorBox, Input, PageHeader, Select, Spinner, useToast } from '@/components/ui';
import { api, useApi } from '@/lib/api';

const TONE: Record<string, string> = { BOOKED: 'bg-ruby text-white', HOLD: 'bg-gold/50', BLOCK: 'bg-ink/15', PART: 'bg-blush' };
const LEGEND = [['BOOKED', 'Booked'], ['HOLD', 'Held'], ['BLOCK', 'Blocked'], ['PART', 'Partly taken']];
const key = (d: Date) => d.toISOString().slice(0, 10);

export default function CalendarPage() {
  const { data: listings, error } = useApi<any[]>('/vendor/listings');
  const [listingId, setListingId] = useState('');
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [picked, setPicked] = useState<string[]>([]);
  const [slot, setSlot] = useState('FULL_DAY');
  const [note, setNote] = useState('');
  const toast = useToast();
  const id = listingId || listings?.[0]?.id;
  const cal = useApi<any>(id ? `/vendor/listings/${id}/calendar?month=${month}` : null);
  if (error) return <ErrorBox error={error} />;
  if (!listings) return <Spinner />;
  if (!listings.length) return <><PageHeader title="Calendar" /><Card><Empty title="Add a listing first" /></Card></>;
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const shift = (n: number) => { setMonth(key(new Date(Date.UTC(y, m - 1 + n, 1))).slice(0, 7)); setPicked([]); };
  const byDay: Record<string, any[]> = {};
  for (const e of cal.data?.entries ?? []) (byDay[e.date.slice(0, 10)] ??= []).push(e);
  const capacity = cal.data?.dailyCapacity ?? 1;
  const tone = (d: string) => {
    const es = byDay[d] ?? [];
    if (!es.length) return '';
    if (es.length < capacity * 2) return TONE.PART;
    return TONE[es.some((e) => e.kind === 'BOOKED') ? 'BOOKED' : es.some((e) => e.kind === 'HOLD') ? 'HOLD' : 'BLOCK'];
  };
  const run = async (path: string) => { try { const r = await api(`/vendor/listings/${id}/${path}`, { body: { dates: picked, slot, note: note || null } }); if (r.skipped?.length) toast(`${r.skipped.length} date(s) were already taken and were skipped`, true); setPicked([]); setNote(''); cal.mutate(); } catch (e) { toast((e as Error).message, true); } };
  const bookings = Object.entries(byDay).flatMap(([d, es]) => es.filter((e) => e.booking).map((e) => ({ d, ...e }))).filter((e, i, a) => a.findIndex((x) => x.booking.id === e.booking.id) === i);
  return (
    <>
      <PageHeader title="Calendar" action={<Select aria-label="Listing" value={id} onChange={(e) => { setListingId(e.target.value); setPicked([]); }}>{listings.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}</Select>} />
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <Card>
          <div className="mb-4 flex items-center justify-between"><Button variant="outline" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft className="size-4" /></Button><h2 className="text-lg">{first.toLocaleDateString('en-PK', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h2><Button variant="outline" onClick={() => shift(1)} aria-label="Next month"><ChevronRight className="size-4" /></Button></div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="py-1">{d}</div>)}</div>
          <div className="grid grid-cols-7 gap-1">{Array.from({ length: first.getUTCDay() }, (_, i) => <div key={i} />)}{Array.from({ length: days }, (_, i) => { const d = key(new Date(Date.UTC(y, m - 1, i + 1))); const on = picked.includes(d); const past = d < key(new Date()); return <button key={d} disabled={past} aria-pressed={on} aria-label={d} onClick={() => setPicked(on ? picked.filter((x) => x !== d) : [...picked, d])} className={`tnum aspect-square rounded-lg text-sm disabled:opacity-35 ${tone(d) || 'hover:bg-blush/60'} ${on ? 'ring-2 ring-ruby' : ''}`}>{i + 1}</button>; })}</div>
          <ul className="mt-4 flex flex-wrap gap-4 text-xs">{LEGEND.map(([k, l]) => <li key={k} className="flex items-center gap-1.5"><span className={`size-3 rounded ${TONE[k]}`} />{l}</li>)}</ul>
        </Card>
        <div className="space-y-4">
          <Card title={picked.length ? `${picked.length} date(s) selected` : 'Select dates'}><div className="space-y-3"><Select label="Slot" value={slot} onChange={(e) => setSlot(e.target.value)}><option value="FULL_DAY">Full day</option><option value="LUNCH">Lunch</option><option value="DINNER">Dinner</option></Select><Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} /><Button className="w-full" disabled={!picked.length} onClick={() => run('block')}>Block dates</Button><Button variant="outline" className="w-full" disabled={!picked.length} onClick={() => run('unblock')}>Unblock dates</Button></div></Card>
          <Card title="This month">{!bookings.length ? <p className="text-sm text-muted">No bookings this month.</p> : <ul className="space-y-2 text-sm">{bookings.map((e) => <li key={e.booking.id}><Link className="hover:text-ruby" href={`/vendor/bookings/${e.booking.id}`}><span className="tnum font-medium">{e.d}</span> · {e.booking.customer.name}</Link></li>)}</ul>}</Card>
        </div>
      </div>
    </>
  );
}
