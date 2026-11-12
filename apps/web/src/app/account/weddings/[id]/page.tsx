'use client';
import { formatPKR } from '@mehfil/shared';
import { Check, CheckCircle2, Settings2, Sparkles, Star } from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Button, Card, ErrorBox, FormError, Input, LinkButton, Modal, Select, Spinner, Textarea, useForm, useToast } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { fmtDate } from '@/lib/format';

const monthLabel = (m?: string | null) => (m ? new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-PK', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : null);
const PROGRESS: Record<string, [string, string]> = {
  BOOKED: ['Booked', 'bg-good/12 text-good'],
  BOOKING: ['Quote accepted', 'bg-gold/20 text-warn'],
  QUOTES_REQUESTED: ['Quotes requested', 'bg-gold/20 text-warn'],
};

function PickCard({ l }: { l: any }) {
  return (
    <div className="flex flex-col rounded-2xl border border-line bg-white p-4">
      <div className="flex items-start gap-3">
        {l.vendor.logoUrl ? <img src={l.vendor.logoUrl} alt="" className="size-11 shrink-0 rounded-xl object-cover" /> : <div className="size-11 shrink-0 rounded-xl bg-blush" />}
        <div className="min-w-0">
          <Link href={`/vendors/${l.slug}`} className="block truncate font-semibold hover:text-ruby">{l.title}</Link>
          <p className="truncate text-xs text-muted">{l.vendor.businessName}</p>
        </div>
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-2">
        <p className="tnum font-semibold">{formatPKR(l.estimate)}<span className="text-xs font-normal text-muted">{l.priceUnit === 'PER_PERSON' ? ' est. total' : ' from'}</span></p>
        {l.reviewCount > 0 && <p className="tnum flex items-center gap-1 text-sm"><Star className="size-4 fill-gold text-gold" aria-hidden />{l.avgRating.toFixed(1)}</p>}
      </div>
      <ul className="mt-3 flex-1 space-y-1 text-xs text-muted">{l.reasons.map((r: string) => <li key={r} className="flex gap-1.5"><Check className="mt-0.5 size-3.5 shrink-0 text-good" aria-hidden />{r}</li>)}</ul>
      <Link href={`/vendors/${l.slug}`} className="mt-3 text-sm font-medium text-ruby">View details</Link>
    </div>
  );
}

function RequestQuotes({ r, group, onClose, onDone }: { r: any; group: any; onClose: () => void; onDone: () => void }) {
  const first = r.events.find((e: any) => e.date) ?? r.events[0];
  const f = useForm({
    eventId: first?.id ?? '', eventDate: first?.date ?? '', slot: 'FULL_DAY', guestCount: String(first?.guestCount ?? r.guests ?? ''),
    requirements: `We are looking for ${group.label.toLowerCase()} for our ${first?.name ?? 'wedding'}${r.city ? ` in ${r.city}` : ''}. Please send us your best quotation.`,
  });
  const pickEvent = (eventId: string) => {
    const e = r.events.find((x: any) => x.id === eventId);
    f.setValues({ ...f.values, eventId, eventDate: e?.date ?? f.values.eventDate, guestCount: String(e?.guestCount ?? f.values.guestCount) });
  };
  return (
    <Modal title={`Request quotes for ${group.label.toLowerCase()}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-muted">Sent to {group.picks.map((p: any) => p.vendor.businessName).join(', ')}. Each vendor confirms the date and sends their own price. Nothing is booked or paid yet.</p>
        {r.events.length > 1 && <Select label="For which event?" value={f.values.eventId} onChange={(e) => pickEvent(e.target.value)}>{r.events.map((e: any) => <option key={e.id} value={e.id}>{e.name}{e.date ? ` · ${fmtDate(e.date)}` : ''}</option>)}</Select>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Date" type="date" min={new Date().toISOString().slice(0, 10)} {...f.bind('eventDate')} />
          <Input label="Guests" type="number" min={1} {...f.bind('guestCount')} />
        </div>
        <Select label="Time" {...f.bind('slot')}><option value="FULL_DAY">Full day</option><option value="LUNCH">Lunch</option><option value="DINNER">Dinner</option></Select>
        <Textarea label="Message to vendors" {...f.bind('requirements')} />
        <FormError message={f.formError} />
        <Button className="w-full" busy={f.busy} disabled={!f.values.eventDate || !Number(f.values.guestCount)} onClick={() => f.submit(async () => {
          await api('/enquiries', { body: { listingIds: group.picks.map((p: any) => p.id), weddingId: r.id, eventId: f.values.eventId || undefined, eventDate: f.values.eventDate, slot: f.values.slot, guestCount: Number(f.values.guestCount), requirements: f.values.requirements } });
          onDone();
        })}>Send {group.picks.length === 1 ? 'request' : `${group.picks.length} requests`}</Button>
      </div>
    </Modal>
  );
}

function Plan() {
  const { id } = useParams<{ id: string }>();
  const welcome = useSearchParams().get('welcome');
  const { data: r, error, isLoading, mutate } = useApi<any>(`/weddings/${id}/results`);
  const [asking, setAsking] = useState<any>(null);
  const toast = useToast();
  // Gemini's note and budget split arrive in the background, so the page checks back until they land.
  useEffect(() => {
    if (r?.ai.status !== 'PENDING') return;
    const t = setInterval(() => mutate(), 6000);
    return () => clearInterval(t);
  }, [r?.ai.status, mutate]);
  if (error) return <ErrorBox error={error} retry={() => mutate()} />;
  if (isLoading || !r) return <Spinner />;

  const firstDate = r.events.find((e: any) => e.date)?.date;
  const when = firstDate ? fmtDate(firstDate) : monthLabel(r.targetMonth);
  const summary = [r.events.length ? r.events.map((e: any) => e.name).join(', ') : null, r.guests ? `${r.guests} guests` : null, r.city, when].filter(Boolean).join(' · ');
  const totalPlanned = r.budgetSplit.reduce((s: number, b: any) => s + b.planned, 0);
  const toggle = async (c: any) => {
    try { await api(`/weddings/${id}/checklist/${c.id}`, { method: 'PATCH', body: { title: c.title, done: true, dueDate: c.dueDate?.slice(0, 10) ?? null } }); mutate(); } catch (e) { toast((e as Error).message, true); }
  };
  const applySplit = async () => {
    try { await api(`/weddings/${id}/budget/apply-suggestion`, { method: 'POST', body: {} }); toast('Budget updated'); mutate(); } catch (e) { toast((e as Error).message, true); }
  };

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl bg-[radial-gradient(ellipse_at_80%_0%,#D98C9D_0%,#8F3048_45%,#5E1F31_100%)] p-6 text-white md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-white/75">{welcome ? 'Your plan is ready' : 'Your wedding plan'}</p>
            <h1 className="mt-1 text-3xl text-white md:text-4xl">{r.title}</h1>
          </div>
          <Link href={`/account/weddings/${id}/manage`} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-sm text-white hover:bg-white/25"><Settings2 className="size-4" aria-hidden />Manage</Link>
        </div>
        {summary && <p className="mt-2 text-white/85">{summary}</p>}
        {r.budget !== null && <p className="tnum mt-1 text-white/85">Budget {formatPKR(r.budget)}</p>}
      </div>

      {r.ai.status === 'READY' && r.ai.note && <div className="flex gap-3 rounded-2xl border border-gold/50 bg-gold/10 p-4"><Sparkles className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden /><p className="text-sm leading-6">{r.ai.note}</p></div>}
      {r.ai.status === 'PENDING' && <p className="flex items-center gap-2 rounded-2xl bg-blush/60 p-4 text-sm"><Sparkles className="size-4 text-ruby motion-safe:animate-pulse" aria-hidden />Personalising your budget and checklist. This can take a minute.</p>}

      <section className="space-y-6">
        <div>
          <h2 className="text-2xl">Our best picks for you</h2>
          <p className="mt-1 text-sm text-muted">Chosen from real Mehfil vendors for your city, guests and budget.{r.dateChecked ? ` Vendors already fully booked on ${fmtDate(r.dateChecked)} are left out; each one confirms your date when you ask for a quote.` : ''}</p>
        </div>
        {!r.services.length && <Card><p className="text-sm text-muted">Tell us which services you need and we will pick vendors for you.</p><LinkButton className="mt-3" variant="outline" href={`/account/weddings/${id}/manage?tab=settings`}>Choose services</LinkButton></Card>}
        {r.services.map((g: any) => {
          const q = new URLSearchParams(Object.entries(g.explore).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => [k, String(v)]));
          const done = PROGRESS[g.progress];
          return (
            <div key={g.service} className="rounded-3xl border border-line bg-blush/30 p-4 md:p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="flex items-center gap-2 text-lg">{g.label}{done && <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${done[1]}`}>{done[0]}</span>}</h3>
                  <p className="text-xs text-muted">{g.allocation ? `${formatPKR(g.allocation)} in your budget` : 'No budget set'}{g.matches ? ` · ${g.matches} match${g.matches === 1 ? '' : 'es'}` : ''}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Link href={`/search?${q}`} className="text-sm text-ruby">See all</Link>
                  {g.picks.length > 0 && g.progress === 'OPEN' && <Button onClick={() => setAsking(g)}>Request {g.picks.length === 1 ? 'a quote' : `quotes from all ${g.picks.length}`}</Button>}
                </div>
              </div>
              {g.overBudget && <p className="mb-3 rounded-xl bg-gold/20 p-3 text-sm">Nothing fits your {g.label.toLowerCase()} budget yet, so these are the closest options. You can move money between services in your budget.</p>}
              {!g.picks.length ? <p className="rounded-2xl border border-dashed border-line bg-white p-4 text-sm text-muted">No vendors match yet. Try “See all” with fewer filters, or check back as new vendors join.</p>
                : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{g.picks.map((l: any) => <PickCard key={l.id} l={l} />)}</div>}
            </div>
          );
        })}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Your budget split" action={<Link href={`/account/weddings/${id}/manage?tab=budget`} className="text-sm text-ruby">Adjust</Link>}>
          {!r.budgetSplit.length ? <p className="text-sm text-muted">Set a budget to see how it splits across your services.</p> : <>
            <ul className="space-y-3 text-sm">{r.budgetSplit.map((b: any) => {
              const pct = totalPlanned ? Math.round((b.planned / totalPlanned) * 100) : 0;
              return (
                <li key={b.id}>
                  <div className="flex justify-between gap-3"><span>{b.label}</span><span className="tnum font-medium">{formatPKR(b.planned)}</span></div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-blush" aria-hidden><div className="h-full rounded-full bg-ruby" style={{ width: `${pct}%` }} /></div>
                  {b.suggested !== null && b.suggested !== b.planned && <p className="tnum mt-1 text-xs text-muted">Suggested for you: {formatPKR(b.suggested)}</p>}
                </li>
              );
            })}</ul>
            {r.suggestionAvailable && r.budgetSplit.some((b: any) => b.suggested !== null && b.suggested !== b.planned) && <Button variant="outline" className="mt-4" onClick={applySplit}><Sparkles className="size-4" aria-hidden />Use the suggested split</Button>}
          </>}
        </Card>
        <Card title="Next steps" action={<Link href={`/account/weddings/${id}/manage?tab=checklist`} className="text-sm text-ruby">Full checklist</Link>}>
          {!r.nextSteps.length ? <p className="flex items-center gap-2 text-sm text-good"><CheckCircle2 className="size-4" aria-hidden />You are all caught up.</p> : (
            <ul className="space-y-2 text-sm">{r.nextSteps.map((c: any) => (
              <li key={c.id} className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-3"><input type="checkbox" className="size-4 accent-[#8F3048]" onChange={() => toggle(c)} />{c.title}</label>
                <span className="shrink-0 text-xs text-muted">{c.dueDate ? fmtDate(c.dueDate) : ''}</span>
              </li>
            ))}</ul>
          )}
          <p className="mt-3 text-xs text-muted">{r.tasks.done} of {r.tasks.total} tasks done</p>
        </Card>
      </div>

      {asking && <RequestQuotes r={r} group={asking} onClose={() => setAsking(null)} onDone={() => { setAsking(null); toast('Requests sent. Vendors will reply with their quotations.'); mutate(); }} />}
    </div>
  );
}

export default function Page() { return <Suspense><Plan /></Suspense>; }
