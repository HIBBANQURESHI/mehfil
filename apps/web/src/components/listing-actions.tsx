'use client';
import { formatPKR, rupeesToPaisa } from '@mehfil/shared';
import { Heart, MessageCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, ApiError, useApi } from '@/lib/api';
import { Button, FormError, Input, Modal, Select, Textarea, useForm, useToast } from './ui';

const toLogin = (query = '') => { window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + query)}`; };

/** The availability calendar asks for a quote on a date through this browser event (they are separate parts of the page). */
export const QUOTE_DATE_EVENT = 'mehfil:quote-date';
const SLOT_LABEL: Record<string, string> = { FULL_DAY: 'Full day', LUNCH: 'Lunch', DINNER: 'Dinner' };

async function isSignedIn() {
  const res = await fetch('/api/proxy/v1/auth/me');
  return res.ok;
}

export function SaveButton({ listingId }: { listingId: string }) {
  const [saved, setSaved] = useState(false);
  const toast = useToast();
  const toggle = async () => {
    if (!(await isSignedIn())) return toLogin();
    try { setSaved((await api(`/saved/${listingId}/toggle`, { method: 'POST', body: {} })).saved); }
    catch (e) { toast((e as Error).message, true); }
  };
  return <button onClick={toggle} aria-pressed={saved} aria-label={saved ? 'Remove from saved' : 'Save'} className="rounded-full border border-line bg-white p-2.5 hover:border-rose"><Heart className={`size-5 ${saved ? 'fill-ruby text-ruby' : 'text-muted'}`} /></button>;
}

export function RequestForm({ listingIds, packages, onDone, initialDate }: { listingIds: string[]; packages?: { id: string; name: string }[]; onDone: () => void; initialDate?: string }) {
  const { data: weddings } = useApi<any[]>('/weddings');
  const f = useForm({ eventDate: initialDate ?? '', slot: 'FULL_DAY', guestCount: '', budget: '', requirements: '', packageId: '', weddingId: '' });
  const toast = useToast();
  // For a single listing, the times already taken on the chosen date are switched off.
  const single = listingIds.length === 1 ? listingIds[0] : null;
  const month = /^\d{4}-\d{2}-\d{2}$/.test(f.values.eventDate) ? f.values.eventDate.slice(0, 7) : null;
  const { data: avail } = useApi<{ unavailable: Record<string, { LUNCH: boolean; DINNER: boolean }> }>(single && month ? `/listings/${single}/availability?month=${month}` : null);
  const day = avail?.unavailable[f.values.eventDate];
  const taken = { LUNCH: !!day && !day.LUNCH, DINNER: !!day && !day.DINNER };
  const blocked: Record<string, boolean> = { FULL_DAY: taken.LUNCH || taken.DINNER, LUNCH: taken.LUNCH, DINNER: taken.DINNER };
  const fullyBooked = taken.LUNCH && taken.DINNER;
  const { set } = f;
  useEffect(() => {
    if (!blocked[f.values.slot]) return;
    const free = (['FULL_DAY', 'LUNCH', 'DINNER'] as const).find((s) => !blocked[s]);
    if (free) set('slot', free);
  }, [blocked.FULL_DAY, blocked.LUNCH, blocked.DINNER, f.values.slot, set]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = () => f.submit(async () => {
    const v = f.values;
    await api('/enquiries', { body: { listingIds, eventDate: v.eventDate, slot: v.slot, guestCount: Number(v.guestCount), requirements: v.requirements, budget: v.budget ? rupeesToPaisa(Number(v.budget)) : null, packageId: v.packageId || null, weddingId: v.weddingId || null } });
    toast('Your request was sent. You will be notified when quotations arrive.');
    onDone();
  });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3"><Input label="Event date" type="date" {...f.bind('eventDate')} /><Select label="Time" {...f.bind('slot')}>{['FULL_DAY', 'LUNCH', 'DINNER'].map((s) => <option key={s} value={s} disabled={blocked[s]}>{SLOT_LABEL[s]}{blocked[s] ? ' (booked)' : ''}</option>)}</Select></div>
      {fullyBooked ? <p className="rounded-lg bg-bad/8 p-3 text-sm text-bad">This date is already fully booked. Please choose another date.</p> : (taken.LUNCH || taken.DINNER) && <p className="rounded-lg bg-gold/20 p-3 text-sm">{taken.LUNCH ? 'Lunch' : 'Dinner'} is already booked on this date, so you can request {taken.LUNCH ? 'dinner' : 'lunch'}.</p>}
      <div className="grid grid-cols-2 gap-3"><Input label="Guests" type="number" min={1} {...f.bind('guestCount')} /><Input label="Budget (Rs., optional)" type="number" min={0} {...f.bind('budget')} /></div>
      {packages && packages.length > 0 && <Select label="Package (optional)" {...f.bind('packageId')}><option value="">Not sure yet</option>{packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}
      {weddings && weddings.length > 0 && <Select label="Add to wedding (optional)" {...f.bind('weddingId')}><option value="">None</option>{weddings.map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}</Select>}
      <Textarea label="What do you need?" placeholder="Tell the vendor about your event" {...f.bind('requirements')} />
      <FormError message={f.formError} />
      <Button className="w-full" busy={f.busy} disabled={fullyBooked} onClick={send}>Send request</Button>
    </div>
  );
}

export function ListingActions({ listing }: { listing: { id: string; title: string; startingPrice: number; priceUnit: string; vendorId: string; packages: { id: string; name: string }[] } }) {
  const [mode, setMode] = useState<'quote' | 'message' | null>(null);
  const [date, setDate] = useState<string | undefined>();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const router = useRouter();
  useEffect(() => {
    // Back from sign-in with a date picked on the calendar, or an old #quote link.
    const picked = new URLSearchParams(window.location.search).get('quote');
    if (picked && /^\d{4}-\d{2}-\d{2}$/.test(picked)) { setDate(picked); setMode('quote'); window.history.replaceState(null, '', window.location.pathname); }
    else if (window.location.hash === '#quote') setMode('quote');
    const onPick = async (e: Event) => {
      const d = (e as CustomEvent<string>).detail;
      if (await isSignedIn()) { setDate(d); setMode('quote'); } else toLogin(`?quote=${d}`);
    };
    window.addEventListener(QUOTE_DATE_EVENT, onPick);
    return () => window.removeEventListener(QUOTE_DATE_EVENT, onPick);
  }, []);
  const open = async (m: 'quote' | 'message') => { if (await isSignedIn()) { setDate(undefined); setMode(m); } else toLogin(); };
  const send = async () => {
    setBusy(true);
    try { const c = await api('/conversations', { body: { vendorId: listing.vendorId, body: text } }); router.push(`/account/messages/${c.id}`); }
    catch (e) { toast((e as ApiError).message, true); }
    finally { setBusy(false); }
  };
  const price = <p><span className="text-xs text-muted">From </span><span className="tnum text-xl font-semibold">{formatPKR(listing.startingPrice)}</span>{listing.priceUnit === 'PER_PERSON' && <span className="text-xs text-muted"> /person</span>}</p>;
  return (
    <>
      <div className="sticky top-24 hidden rounded-2xl border border-line bg-white p-5 lg:block">
        {price}
        <p className="mt-2 text-sm text-muted">Tell the vendor your date and they will send you a detailed quotation.</p>
        <Button className="mt-4 w-full" onClick={() => open('quote')}>Request quotation</Button>
        <Button variant="outline" className="mt-2 w-full" onClick={() => open('message')}><MessageCircle className="size-4" aria-hidden />Message vendor</Button>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-line bg-white p-3 lg:hidden">{price}<Button onClick={() => open('quote')}>Request quotation</Button></div>
      {mode === 'quote' && <Modal title={date ? `Request a quotation for ${new Date(`${date}T00:00:00Z`).toLocaleDateString('en-PK', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}` : 'Request a quotation'} onClose={() => setMode(null)}><RequestForm key={date ?? 'none'} listingIds={[listing.id]} packages={listing.packages} initialDate={date} onDone={() => setMode(null)} /></Modal>}
      {mode === 'message' && <Modal title="Message vendor" onClose={() => setMode(null)}><Textarea label="Your message" value={text} onChange={(e) => setText(e.target.value)} /><Button className="mt-3 w-full" busy={busy} disabled={!text.trim()} onClick={send}>Send</Button></Modal>}
    </>
  );
}
