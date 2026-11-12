'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button, Card, Empty, ErrorBox, Input, PageHeader, Select, Spinner, Status, useToast } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import { api, useApi } from '@/lib/api';

// Each half of a day cell is one slot: top = lunch, bottom = dinner. A full-day booking fills both.
const FULL: Record<string, string> = { BOOKED: 'bg-ruby', HOLD: 'bg-gold/70', BLOCK: 'bg-ink/25' };
const SOME: Record<string, string> = { BOOKED: 'bg-ruby/45', HOLD: 'bg-gold/35', BLOCK: 'bg-ink/12' };
const LEGEND = [['bg-ruby', 'Booked'], ['bg-gold/70', 'Held (awaiting payment)'], ['bg-ink/25', 'Blocked by you'], ['bg-ruby/45', 'Some capacity left']];
const SLOTS = ['LUNCH', 'DINNER'] as const;
const SLOT_NAME: Record<string, string> = { LUNCH: 'Lunch', DINNER: 'Dinner' };
const strongest = (es: any[]) => (es.some((e) => e.kind === 'BOOKED') ? 'BOOKED' : es.some((e) => e.kind === 'HOLD') ? 'HOLD' : 'BLOCK');
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
  /** What each half of the day shows, and a description for screen readers. */
  const dayState = (d: string) => {
    const halves = SLOTS.map((slotName) => {
      const es = (byDay[d] ?? []).filter((e) => e.slot === slotName);
      if (!es.length) return { slot: slotName, cls: '', label: null as string | null };
      const kind = strongest(es);
      const full = es.length >= capacity;
      return { slot: slotName, cls: (full ? FULL : SOME)[kind], label: `${SLOT_NAME[slotName]} ${kind === 'BOOKED' ? 'booked' : kind === 'HOLD' ? 'held' : 'blocked'}${full ? '' : ` (${es.length} of ${capacity})`}` };
    });
    // A short word for the cell itself: which part of the day is booked, otherwise whether it's held or blocked.
    const kinds = SLOTS.map((slotName) => { const es = (byDay[d] ?? []).filter((e) => e.slot === slotName); return es.length ? strongest(es) : null; });
    const booked = SLOTS.filter((_, n) => kinds[n] === 'BOOKED');
    const tag = booked.length === 2 ? 'Full day' : booked.length === 1 ? SLOT_NAME[booked[0]] : kinds.includes('HOLD') ? 'Held' : kinds.includes('BLOCK') ? 'Blocked' : null;
    return { halves, tag, dark: halves.every((x) => x.cls === FULL.BOOKED), darkBottom: halves[1].cls === FULL.BOOKED, label: halves.map((x) => x.label).filter(Boolean).join(', ') };
  };
  const run = async (path: string) => { try { const r = await api(`/vendor/listings/${id}/${path}`, { body: { dates: picked, slot, note: note || null } }); if (r.skipped?.length) toast(`${r.skipped.length} date(s) were already taken and were skipped`, true); setPicked([]); setNote(''); cal.mutate(); } catch (e) { toast((e as Error).message, true); } };
  const bookings = Object.values(Object.entries(byDay).flatMap(([d, es]) => es.filter((e) => e.booking).map((e) => ({ d, ...e })))
    .reduce<Record<string, any>>((acc, e) => { (acc[e.booking.id] ??= { ...e, slots: new Set<string>() }).slots.add(e.slot); return acc; }, {}))
    .map((e) => ({ ...e, when: e.slots.size === 2 ? 'Full day' : SLOT_NAME[[...e.slots][0] as string] }));
  return (
    <>
      <PageHeader title="Calendar" action={<Select aria-label="Listing" value={id} onChange={(e) => { setListingId(e.target.value); setPicked([]); }}>{listings.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}</Select>} />
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <Card>
          <div className="mb-4 flex items-center justify-between"><Button variant="outline" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft className="size-4" /></Button><h2 className="text-lg">{first.toLocaleDateString('en-PK', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h2><Button variant="outline" onClick={() => shift(1)} aria-label="Next month"><ChevronRight className="size-4" /></Button></div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="py-1">{d}</div>)}</div>
          <div className="grid grid-cols-7 gap-1">{Array.from({ length: first.getUTCDay() }, (_, i) => <div key={i} />)}{Array.from({ length: days }, (_, i) => { const d = key(new Date(Date.UTC(y, m - 1, i + 1))); const on = picked.includes(d); const past = d < key(new Date()); const st = dayState(d); return <button key={d} disabled={past} aria-pressed={on} aria-label={st.label ? `${d}: ${st.label}` : d} title={st.label || undefined} onClick={() => setPicked(on ? picked.filter((x) => x !== d) : [...picked, d])} className={`tnum relative aspect-square overflow-hidden rounded-lg border border-line text-sm disabled:opacity-40 ${st.label ? '' : 'hover:bg-blush/60'} ${on ? 'ring-2 ring-ruby ring-offset-1' : ''}`}>{st.halves.map((h, n) => h.cls && <span key={h.slot} aria-hidden className={`absolute inset-x-0 ${n === 0 ? 'top-0' : 'bottom-0'} h-1/2 ${h.cls}`} />)}<span className={`relative flex h-full flex-col items-center justify-center gap-0.5 leading-none`}><span className={`font-medium ${st.dark ? 'text-white' : ''}`}>{i + 1}</span>{st.tag && <span className={`max-w-full truncate px-0.5 text-[9px] font-semibold uppercase tracking-wide sm:text-[10px] ${st.darkBottom ? 'text-white' : 'text-ink'}`}>{st.tag}</span>}</span></button>; })}</div>
          <ul className="mt-4 flex flex-wrap gap-4 text-xs">{LEGEND.map(([cls, l]) => <li key={l} className="flex items-center gap-1.5"><span className={`size-3 rounded ${cls}`} />{l}</li>)}</ul>
          <p className="mt-2 text-xs text-muted">Top half of a day is lunch, bottom half is dinner. A full-day booking fills both.</p>
        </Card>
        <div className="space-y-4">
          <Card title={picked.length ? `${picked.length} date(s) selected` : 'Select dates'}><div className="space-y-3"><Select label="Slot" value={slot} onChange={(e) => setSlot(e.target.value)}><option value="FULL_DAY">Full day</option><option value="LUNCH">Lunch</option><option value="DINNER">Dinner</option></Select><Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} /><Button className="w-full" disabled={!picked.length} onClick={() => run('block')}>Block dates</Button><Button variant="outline" className="w-full" disabled={!picked.length} onClick={() => run('unblock')}>Unblock dates</Button></div></Card>
          <Card title="This month">{!bookings.length ? <p className="text-sm text-muted">No bookings this month.</p> : <ul className="space-y-2 text-sm">{bookings.map((e) => <li key={e.booking.id}><Link className="flex items-center justify-between gap-2 rounded-lg p-1.5 hover:bg-blush/50" href={`/vendor/bookings/${e.booking.id}`}><span><span className="tnum font-medium">{fmtDate(e.d)}</span> · {e.when}<span className="block text-xs text-muted">{e.booking.customer.name} · {e.booking.code}</span></span><Status value={e.booking.status} /></Link></li>)}</ul>}</Card>
        </div>
      </div>
    </>
  );
}
