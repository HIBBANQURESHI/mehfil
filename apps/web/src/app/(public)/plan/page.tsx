'use client';
import { BUDGET_BANDS, EventType, formatPKR, GUEST_PRESETS, labelOf, PLANNING_STATUS, rupeesToPaisa, statusLabel, VENUE_PREFERENCES, VENUE_STATUS, WEDDING_SERVICES, WEDDING_STYLES, workingBudget } from '@mehfil/shared';
import { Check, ChevronLeft, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { GlowingLogo } from '@/components/brand';
import { Button, FormError, Input, Select, Textarea } from '@/components/ui';
import { api, ApiError, useApi } from '@/lib/api';

interface PlanEvent { type: string; name: string; date: string; guestCount: string; cityId: string; areaId: string; venueStatus: string; budget: string }
interface Draft {
  step: number; partnerOne: string; partnerTwo: string; dateKnown: 'date' | 'month' | 'unknown'; weddingDate: string; targetMonth: string;
  cityId: string; guestCount: string; planningStatus: string; events: PlanEvent[]; budgetBand: string; budget: string;
  style: string; venuePreference: string; services: string[]; notes: string;
}

const KEY = 'mehfil.planDraft';
const EMPTY: Draft = { step: 0, partnerOne: '', partnerTwo: '', dateKnown: 'month', weddingDate: '', targetMonth: '', cityId: '', guestCount: '', planningStatus: '', events: [], budgetBand: '', budget: '', style: '', venuePreference: '', services: [], notes: '' };
const STEPS = ['Wedding basics', 'Your events', 'Your budget', 'Your preferences', 'Review'];
const MAIN_EVENTS = ['MEHNDI', 'BARAAT', 'WALIMA', 'NIKAH'];
const EXTRA_EVENTS = EventType.filter((t) => !MAIN_EVENTS.includes(t) && t !== 'OTHER');

// The draft lives in this browser so nothing is lost while the customer signs up. Storage can be unavailable
// (private windows, blocked site data), so every access is guarded.
const load = (): Draft | null => { try { const v = localStorage.getItem(KEY); return v ? { ...EMPTY, ...JSON.parse(v) } : null; } catch { return null; } };
const save = (d: Draft) => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* the wizard still works, just without resume */ } };
const clear = () => { try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ } };

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-pressed={on} onClick={onClick} className={`rounded-full border px-4 py-2 text-sm transition-colors ${on ? 'border-ruby bg-ruby text-white' : 'border-line bg-white hover:border-rose'}`}>{children}</button>;
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return <section className="space-y-3"><div><h3 className="text-base font-semibold">{title}</h3>{sub && <p className="text-sm text-muted">{sub}</p>}</div>{children}</section>;
}

export default function PlanMyWedding() {
  const [d, setD] = useState<Draft>(EMPTY);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsAccount, setNeedsAccount] = useState(false);
  const { data: cities } = useApi<any[]>('/cities');
  const router = useRouter();

  useEffect(() => { const saved = load(); if (saved) setD(saved); setReady(true); }, []);
  useEffect(() => { if (ready) save(d); }, [d, ready]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const go = (step: number) => { setError(null); setD((x) => ({ ...x, step })); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const city = (id: string) => cities?.find((c) => c.id === id);
  const toggleEvent = (type: string) => setD((x) => ({ ...x, events: x.events.some((e) => e.type === type) ? x.events.filter((e) => e.type !== type) : [...x.events, { type, name: '', date: '', guestCount: '', cityId: '', areaId: '', venueStatus: '', budget: '' }] }));
  const setEvent = (i: number, patch: Partial<PlanEvent>) => setD((x) => ({ ...x, events: x.events.map((e, n) => (n === i ? { ...e, ...patch } : e)) }));
  const toggleService = (key: string) => setD((x) => ({ ...x, services: x.services.includes(key) ? x.services.filter((s) => s !== key) : [...x.services, key] }));
  const n = (v: string) => (v ? Number(v) : null);
  const budgetPreview = d.budgetBand === 'CUSTOM' ? (d.budget ? rupeesToPaisa(Number(d.budget)) : null) : workingBudget(d.budgetBand);

  const create = async () => {
    setBusy(true); setError(null);
    try {
      if (!(await fetch('/api/proxy/v1/auth/me')).ok) { setNeedsAccount(true); return; }
      const body = {
        partnerOne: d.partnerOne || null, partnerTwo: d.partnerTwo || null,
        weddingDate: d.dateKnown === 'date' && d.weddingDate ? d.weddingDate : null, targetMonth: d.dateKnown === 'month' && d.targetMonth ? d.targetMonth : null,
        cityId: d.cityId || null, guestCount: n(d.guestCount), planningStatus: d.planningStatus || null,
        events: d.events.map((e) => ({ type: e.type, name: e.name || null, date: e.date || null, guestCount: n(e.guestCount), cityId: e.cityId || null, areaId: e.areaId || null, venueStatus: e.venueStatus || null, budget: e.budget ? rupeesToPaisa(Number(e.budget)) : null })),
        budgetBand: d.budgetBand || null, budget: d.budgetBand === 'CUSTOM' && d.budget ? rupeesToPaisa(Number(d.budget)) : null,
        style: d.style || null, venuePreference: d.venuePreference || null, services: d.services, notes: d.notes || null,
      };
      const w = await api('/weddings/plan', { body });
      clear();
      router.push(`/account/weddings/${w.id}?welcome=1`);
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.'); }
    finally { setBusy(false); }
  };

  if (!ready) return null;

  if (d.step === 0) return (
    <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 md:grid-cols-2">
      <div>
        <p className="flex items-center gap-2 text-sm font-medium text-ruby"><Sparkles className="size-4" aria-hidden />Plan my wedding</p>
        <h1 className="mt-3 text-4xl leading-tight md:text-5xl">Let&apos;s plan your perfect wedding</h1>
        <p className="mt-4 text-lg text-muted">Tell us a little about your wedding so we can personalise your experience. You&apos;ll get your own planning space with your events, budget, checklist and vendors picked for you.</p>
        <p className="mt-2 text-sm text-muted">Takes about 3 minutes. Not sure about something yet? Skip it and fill it in later.</p>
        <div className="mt-8 flex flex-wrap gap-3"><Button onClick={() => go(1)}>{d.events.length || d.cityId ? 'Continue planning' : 'Start planning'}</Button>{(d.events.length > 0 || !!d.cityId) && <Button variant="ghost" onClick={() => { clear(); setD({ ...EMPTY, step: 1 }); }}>Start over</Button>}</div>
      </div>
      <GlowingLogo className="mx-auto w-full max-w-md" />
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <ol className="mb-8 grid grid-cols-5 gap-2" aria-label="Progress">
        {STEPS.map((s, i) => { const n2 = i + 1; const state = n2 < d.step ? 'done' : n2 === d.step ? 'now' : 'next'; return (
          <li key={s}><button type="button" onClick={() => n2 < d.step && go(n2)} disabled={n2 >= d.step} className="w-full text-left" aria-current={state === 'now' ? 'step' : undefined}>
            <span className={`block h-1.5 rounded-full ${state === 'next' ? 'bg-line' : 'bg-ruby'}`} />
            <span className={`mt-2 hidden text-xs sm:block ${state === 'now' ? 'font-semibold text-ruby' : 'text-muted'}`}>{String(n2).padStart(2, '0')} {s}</span>
          </button></li>
        ); })}
      </ol>

      <div className="rounded-3xl border border-line bg-white p-6 md:p-8">
        <h2 className="text-2xl">{STEPS[d.step - 1]}</h2>

        {d.step === 1 && <div className="mt-6 space-y-6">
          <div className="grid gap-3 sm:grid-cols-2"><Input label="Bride's name (optional)" value={d.partnerOne} onChange={(e) => set('partnerOne', e.target.value)} /><Input label="Groom's name (optional)" value={d.partnerTwo} onChange={(e) => set('partnerTwo', e.target.value)} /></div>
          <Section title="When is the wedding?">
            <div className="flex flex-wrap gap-2"><Chip on={d.dateKnown === 'date'} onClick={() => set('dateKnown', 'date')}>I know the date</Chip><Chip on={d.dateKnown === 'month'} onClick={() => set('dateKnown', 'month')}>Roughly which month</Chip><Chip on={d.dateKnown === 'unknown'} onClick={() => set('dateKnown', 'unknown')}>Not decided</Chip></div>
            {d.dateKnown === 'date' && <Input type="date" aria-label="Wedding date" min={new Date().toISOString().slice(0, 10)} value={d.weddingDate} onChange={(e) => set('weddingDate', e.target.value)} className="max-w-xs" />}
            {d.dateKnown === 'month' && <Input type="month" aria-label="Wedding month" min={new Date().toISOString().slice(0, 7)} value={d.targetMonth} onChange={(e) => set('targetMonth', e.target.value)} className="max-w-xs" />}
          </Section>
          <Section title="City"><div className="flex flex-wrap gap-2">{cities?.map((c) => <Chip key={c.id} on={d.cityId === c.id} onClick={() => set('cityId', d.cityId === c.id ? '' : c.id)}>{c.name}</Chip>)}</div></Section>
          <Section title="Estimated guests">
            <div className="flex flex-wrap gap-2">{GUEST_PRESETS.map((g) => <Chip key={g} on={d.guestCount === String(g)} onClick={() => set('guestCount', String(g))}>{g === 1000 ? '1000+' : g}</Chip>)}</div>
            <Input type="number" min={1} aria-label="Exact guest count" placeholder="Or type a number" value={d.guestCount} onChange={(e) => set('guestCount', e.target.value)} className="max-w-xs" />
          </Section>
          <Section title="Where are you with planning?"><div className="flex flex-wrap gap-2">{PLANNING_STATUS.map((s) => <Chip key={s.key} on={d.planningStatus === s.key} onClick={() => set('planningStatus', s.key)}>{s.label}</Chip>)}</div></Section>
        </div>}

        {d.step === 2 && <div className="mt-6 space-y-6">
          <Section title="Which functions are you planning?" sub="Pick as many as you like.">
            <div className="flex flex-wrap gap-2">{[...MAIN_EVENTS, ...EXTRA_EVENTS].map((t) => <Chip key={t} on={d.events.some((e) => e.type === t)} onClick={() => toggleEvent(t)}>{statusLabel(t)}</Chip>)}<Chip on={false} onClick={() => setD((x) => ({ ...x, events: [...x.events, { type: 'OTHER', name: '', date: '', guestCount: '', cityId: '', areaId: '', venueStatus: '', budget: '' }] }))}>+ Other function</Chip></div>
          </Section>
          {d.events.map((e, i) => { const c = city(e.cityId || d.cityId); return (
            <fieldset key={i} className="space-y-3 rounded-2xl border border-line p-4">
              <legend className="px-1 font-semibold">{e.type === 'OTHER' ? (e.name || 'Other function') : statusLabel(e.type)}</legend>
              {e.type === 'OTHER' && <Input label="Name" value={e.name} onChange={(x) => setEvent(i, { name: x.target.value })} />}
              <div className="grid gap-3 sm:grid-cols-3">
                <Input label="Date (if known)" type="date" min={new Date().toISOString().slice(0, 10)} value={e.date} onChange={(x) => setEvent(i, { date: x.target.value })} />
                <Input label="Guests" type="number" min={1} placeholder={d.guestCount || ''} value={e.guestCount} onChange={(x) => setEvent(i, { guestCount: x.target.value })} />
                <Input label="Budget (Rs., optional)" type="number" min={0} value={e.budget} onChange={(x) => setEvent(i, { budget: x.target.value })} />
                <Select label="City" value={e.cityId || d.cityId} onChange={(x) => setEvent(i, { cityId: x.target.value, areaId: '' })}><option value="">Not sure</option>{cities?.map((cc) => <option key={cc.id} value={cc.id}>{cc.name}</option>)}</Select>
                <Select label="Area" value={e.areaId} onChange={(x) => setEvent(i, { areaId: x.target.value })}><option value="">Any area</option>{c?.areas.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
                <Select label="Venue" value={e.venueStatus} onChange={(x) => setEvent(i, { venueStatus: x.target.value })}><option value="">Choose</option>{VENUE_STATUS.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}</Select>
              </div>
              <button type="button" className="text-sm text-muted hover:text-bad" onClick={() => setD((x) => ({ ...x, events: x.events.filter((_, n2) => n2 !== i) }))}>Remove</button>
            </fieldset>
          ); })}
        </div>}

        {d.step === 3 && <div className="mt-6 space-y-4">
          <p className="text-sm text-muted">Your approximate total for all functions. We use it to suggest a starting split you can change anytime.</p>
          <div className="grid gap-2 sm:grid-cols-2">{BUDGET_BANDS.map((b) => <button key={b.key} type="button" aria-pressed={d.budgetBand === b.key} onClick={() => set('budgetBand', b.key)} className={`rounded-2xl border p-4 text-left text-sm ${d.budgetBand === b.key ? 'border-ruby bg-blush/50 font-semibold text-ruby' : 'border-line hover:border-rose'}`}>{b.label}</button>)}</div>
          {d.budgetBand === 'CUSTOM' && <Input label="Total budget (Rs.)" type="number" min={1} value={d.budget} onChange={(e) => set('budget', e.target.value)} className="max-w-xs" />}
          {budgetPreview !== null && d.budgetBand !== 'CUSTOM' && <p className="text-sm text-muted">We&apos;ll plan around <b className="text-ink">{formatPKR(budgetPreview)}</b>, the middle of your range. You can set an exact amount later.</p>}
        </div>}

        {d.step === 4 && <div className="mt-6 space-y-6">
          <Section title="What services do you need?" sub="We'll recommend vendors for these.">
            <div className="grid gap-2 sm:grid-cols-3">{WEDDING_SERVICES.map((s) => { const on = d.services.includes(s.key); return <button key={s.key} type="button" aria-pressed={on} onClick={() => toggleService(s.key)} className={`flex items-center justify-between gap-2 rounded-2xl border p-3 text-left text-sm ${on ? 'border-ruby bg-blush/50 font-semibold text-ruby' : 'border-line hover:border-rose'}`}>{s.label}{on && <Check className="size-4 shrink-0" aria-hidden />}</button>; })}</div>
          </Section>
          <Section title="Wedding style"><div className="flex flex-wrap gap-2">{WEDDING_STYLES.map((s) => <Chip key={s.key} on={d.style === s.key} onClick={() => set('style', s.key)}>{s.label}</Chip>)}</div></Section>
          <Section title="Venue preference"><div className="flex flex-wrap gap-2">{VENUE_PREFERENCES.map((s) => <Chip key={s.key} on={d.venuePreference === s.key} onClick={() => set('venuePreference', s.key)}>{s.label}</Chip>)}</div></Section>
          <Textarea label="Anything else we should know? (optional)" rows={3} value={d.notes} onChange={(e) => set('notes', e.target.value)} />
        </div>}

        {d.step === 5 && <div className="mt-6 space-y-4 text-sm">
          {[
            [1, 'Wedding basics', [[d.partnerOne, d.partnerTwo].filter(Boolean).join(' & ') || 'Names not added', d.dateKnown === 'date' ? d.weddingDate || 'Date not set' : d.dateKnown === 'month' ? d.targetMonth || 'Month not set' : 'Date not decided', city(d.cityId)?.name ?? 'City not chosen', d.guestCount ? `${d.guestCount} guests` : 'Guest count not set', labelOf(PLANNING_STATUS, d.planningStatus)].filter(Boolean).join(' · ')],
            [2, 'Your events', d.events.length ? d.events.map((e) => `${e.type === 'OTHER' ? e.name || 'Other' : statusLabel(e.type)}${e.date ? ` (${e.date})` : ''}`).join(' · ') : 'No functions added'],
            [3, 'Your budget', budgetPreview !== null ? `${labelOf(BUDGET_BANDS, d.budgetBand)}${d.budgetBand === 'CUSTOM' ? `: ${formatPKR(budgetPreview)}` : ''}` : 'Not decided yet'],
            [4, 'Your preferences', [d.services.map((s) => WEDDING_SERVICES.find((x) => x.key === s)?.label).join(', ') || 'No services chosen', labelOf(WEDDING_STYLES, d.style), labelOf(VENUE_PREFERENCES, d.venuePreference)].filter(Boolean).join(' · ')],
          ].map(([step, title, text]) => (
            <div key={String(step)} className="flex items-start justify-between gap-4 rounded-2xl border border-line p-4"><div><p className="font-semibold">{String(title)}</p><p className="mt-1 text-muted">{String(text)}</p></div><button type="button" className="shrink-0 text-ruby" onClick={() => go(Number(step))}>Edit</button></div>
          ))}
          {needsAccount && <div className="rounded-2xl bg-blush p-4"><p className="font-semibold">Create a free account to save your wedding</p><p className="mt-1 text-muted">Your answers are kept on this device, so you&apos;ll come straight back here.</p><div className="mt-3 flex flex-wrap gap-2"><Link href="/register?next=/plan" className="rounded-lg bg-ruby px-4 py-2 font-semibold text-white">Create account</Link><Link href="/login?next=/plan" className="rounded-lg border border-line bg-white px-4 py-2 font-semibold">I have an account</Link></div></div>}
          <FormError message={error} />
        </div>}

        <div className="mt-8 flex items-center justify-between gap-3 border-t border-line pt-5">
          <Button variant="ghost" onClick={() => go(d.step - 1)}><ChevronLeft className="size-4" aria-hidden />Back</Button>
          {d.step < 5 ? <div className="flex gap-2">{d.step !== 4 && <Button variant="outline" onClick={() => go(d.step + 1)}>Skip</Button>}<Button onClick={() => go(d.step + 1)}>Continue</Button></div> : <Button busy={busy} onClick={create}>Create my wedding</Button>}
        </div>
      </div>
    </div>
  );
}
