'use client';
import { BUDGET_BANDS, EventType, formatBps, formatPKR, labelOf, PLANNING_STATUS, rupeesToPaisa, paisaToRupees, statusLabel, VENUE_PREFERENCES, VENUE_STATUS, WEDDING_SERVICES, WEDDING_STYLES } from '@mehfil/shared';
import { ArrowLeft, Pencil, Sparkles, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { ListingCard } from '@/components/listing-card';
import { Button, Card, Empty, ErrorBox, FormError, Input, LinkButton, Select, Spinner, Status, Tabs, Textarea, useForm, useToast } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { fmtDate } from '@/lib/format';


function EventsTab({ w, id, mutate }: { w: any; id: string; mutate: () => void }) {
  const { data: cities } = useApi<any[]>('/cities');
  const ev = useForm({ type: 'MEHNDI', name: '', date: '', guestCount: '', cityId: w.cityId ?? '', venueStatus: '', budget: '' });
  const toast = useToast();
  return (
    <div className="space-y-5">
      <Card>{!w.events.length ? <Empty title="No functions yet" /> : <ul className="divide-y divide-line">{w.events.map((e: any) => { const [label, tone] = EVENT_STATE[w.eventStatus[e.id]] ?? EVENT_STATE.NOT_PLANNED; return (
        <li key={e.id} className="flex items-center justify-between gap-3 py-3 text-sm"><span><span className="block font-medium">{e.name ?? statusLabel(e.type)}</span><span className="text-xs text-muted">{[e.date ? fmtDate(e.date) : 'Date not set', e.guestCount && `${e.guestCount} guests`, e.area?.name ?? e.city?.name, labelOf(VENUE_STATUS, e.venueStatus), e.budget !== null && `Budget ${formatPKR(e.budget)}`].filter(Boolean).join(' · ')}</span></span><span className="flex items-center gap-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>{label}</span><button aria-label={`Remove ${e.name}`} onClick={async () => { try { await api(`/weddings/${id}/events/${e.id}`, { method: 'DELETE' }); mutate(); } catch (x) { toast((x as Error).message, true); } }}><Trash2 className="size-4 text-muted" /></button></span></li>
      ); })}</ul>}</Card>
      <Card title="Add a function">
        <div className="grid gap-3 sm:grid-cols-3">
          <Select label="Function" {...ev.bind('type')}>{EventType.map((t) => <option key={t} value={t}>{statusLabel(t)}</option>)}</Select>
          {ev.values.type === 'OTHER' && <Input label="Name" {...ev.bind('name')} />}
          <Input label="Date" type="date" {...ev.bind('date')} /><Input label="Guests" type="number" min={1} {...ev.bind('guestCount')} />
          <Select label="City" {...ev.bind('cityId')}><option value="">Not sure</option>{cities?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          <Select label="Venue" {...ev.bind('venueStatus')}><option value="">Choose</option>{VENUE_STATUS.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}</Select>
          <Input label="Budget (Rs.)" type="number" min={0} {...ev.bind('budget')} />
        </div>
        <div className="mt-3"><FormError message={ev.formError} /></div>
        <Button className="mt-3" busy={ev.busy} onClick={() => ev.submit(async () => { const v = ev.values; await api(`/weddings/${id}/events`, { body: { type: v.type, name: v.type === 'OTHER' ? v.name || null : statusLabel(v.type), date: v.date || null, guestCount: v.guestCount ? Number(v.guestCount) : null, cityId: v.cityId || null, venueStatus: v.venueStatus || null, budget: v.budget ? rupeesToPaisa(Number(v.budget)) : null } }); ev.setValues({ type: 'MEHNDI', name: '', date: '', guestCount: '', cityId: w.cityId ?? '', venueStatus: '', budget: '' }); mutate(); })}>Add function</Button>
      </Card>
    </div>
  );
}

function VendorsTab({ w }: { w: any }) {
  return (
    <div className="space-y-5">
      <Card title="Booked">{!w.bookings.length ? <Empty title="Nothing booked yet" body="Bookings you make for this wedding appear here." /> : <ul className="divide-y divide-line">{w.bookings.map((b: any) => <li key={b.id}><Link href={`/account/bookings/${b.id}`} className="flex items-center justify-between gap-3 py-3 text-sm"><span><span className="block font-medium">{b.vendorName}</span><span className="text-xs text-muted">{b.categoryName} · {fmtDate(b.eventDate)}</span></span><span className="flex items-center gap-3"><span className="tnum">{formatPKR(b.totalAmount)}</span><Status value={b.status} /></span></Link></li>)}</ul>}</Card>
      <Card title="Enquiries">{!w.enquiries.length ? <p className="text-sm text-muted">No enquiries linked to this wedding yet.</p> : <ul className="divide-y divide-line">{w.enquiries.map((e: any) => <li key={e.id}><Link href={`/account/enquiries/${e.id}`} className="flex items-center justify-between gap-3 py-3 text-sm"><span><span className="block font-medium">{e.vendor.businessName}</span><span className="text-xs text-muted">{e.listing.category.name}</span></span><Status value={e.status} /></Link></li>)}</ul>}</Card>
      <div><h3 className="mb-3 text-lg">Shortlisted</h3>{!w.shortlist.length ? <Card><Empty title="No saved vendors" body="Tap the heart on any vendor to shortlist them." action={<LinkButton href="/search" variant="outline">Find vendors</LinkButton>} /></Card> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{w.shortlist.map((l: any) => <ListingCard key={l.id} l={l} />)}</div>}</div>
    </div>
  );
}

function BudgetTab({ w, id, mutate }: { w: any; id: string; mutate: () => void }) {
  const { data: cats } = useApi<any[]>('/categories');
  const [editing, setEditing] = useState<Record<string, string>>({});
  const add = useForm({ label: '', categoryId: '', planned: '' });
  const toast = useToast();
  const s = w.summary;
  const del = async (itemId: string) => { await api(`/weddings/${id}/budget/${itemId}`, { method: 'DELETE' }); mutate(); };
  const saveAmount = async (itemId: string) => { try { await api(`/weddings/${id}/budget/${itemId}`, { method: 'PATCH', body: { planned: rupeesToPaisa(Number(editing[itemId] || 0)) } }); setEditing(({ [itemId]: _, ...r }) => r); mutate(); } catch (e) { toast((e as Error).message, true); } };
  return (
    <div className="space-y-5">
      {w.suggestion && <Card title="Suggested split"><p className="mb-3 text-sm text-muted">A starting point written for your wedding. It isn't a price list, and you can change any line.</p><ul className="grid gap-2 text-sm sm:grid-cols-2">{w.suggestion.map((x: any) => <li key={x.service} className="flex justify-between rounded-lg bg-blush/40 px-3 py-2"><span>{x.label}</span><span className="tnum">{formatBps(x.bps)}{x.amount !== null ? ` · ${formatPKR(x.amount)}` : ''}</span></li>)}</ul>{s.budget !== null ? <Button variant="secondary" className="mt-3" onClick={async () => { await api(`/weddings/${id}/budget/apply-suggestion`, { method: 'POST', body: {} }); toast('Budget updated'); mutate(); }}>Use this split</Button> : <p className="mt-3 text-sm text-muted">Set your total budget in Settings to see amounts.</p>}</Card>}
      <Card>
        {!w.budgetItems.length ? <Empty title="No budget lines yet" /> : <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><thead><tr className="text-left text-xs text-muted"><th className="py-2 font-medium">Item</th><th className="text-right font-medium">Planned</th><th className="text-right font-medium">Committed</th><th className="text-right font-medium">Paid</th><th /></tr></thead>
          <tbody className="divide-y divide-line">{w.budgetItems.map((b: any) => (
            <tr key={b.id}>
              <td className="py-3">{b.label}</td>
              <td className="tnum text-right">{editing[b.id] !== undefined ? <span className="inline-flex items-center gap-1"><input aria-label={`Planned for ${b.label}`} type="number" min={0} className="w-28 rounded border border-line px-2 py-1 text-right" value={editing[b.id]} onChange={(e) => setEditing({ ...editing, [b.id]: e.target.value })} /><Button variant="secondary" className="!min-h-8 !px-2" onClick={() => saveAmount(b.id)}>Save</Button></span> : <button className="inline-flex items-center gap-1 hover:text-ruby" onClick={() => setEditing({ ...editing, [b.id]: String(paisaToRupees(b.planned)) })}>{formatPKR(b.planned)}<Pencil className="size-3" aria-label="Edit" /></button>}</td>
              <td className={`tnum text-right ${b.actual > b.planned && b.planned > 0 ? 'text-bad' : ''}`}>{formatPKR(b.actual)}</td>
              <td className="tnum text-right">{formatPKR(b.paid)}</td>
              <td className="w-10 text-right"><button aria-label={`Remove ${b.label}`} onClick={() => del(b.id)}><Trash2 className="size-4 text-muted" /></button></td>
            </tr>
          ))}</tbody>
          <tfoot><tr className="border-t border-line font-semibold"><td className="py-3">Total</td><td className="tnum text-right">{formatPKR(s.planned)}</td><td className="tnum text-right">{formatPKR(s.booked)}</td><td className="tnum text-right">{formatPKR(s.paid)}</td><td /></tr></tfoot></table></div>}
        {s.budget !== null && s.planned !== s.budget && <p className="mt-3 text-xs text-muted">{s.planned > s.budget ? `Planned lines are ${formatPKR(s.planned - s.budget)} over your total budget.` : `${formatPKR(s.budget - s.planned)} of your total budget isn't assigned to a line yet.`}</p>}
      </Card>
      <Card title="Add a budget line"><div className="grid gap-3 sm:grid-cols-3"><Input label="Item" {...add.bind('label')} /><Select label="Category (matches bookings)" {...add.bind('categoryId')}><option value="">None</option>{cats?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select><Input label="Planned (Rs.)" type="number" min={0} {...add.bind('planned')} /></div><div className="mt-3"><FormError message={add.formError} /></div><Button className="mt-3" busy={add.busy} onClick={() => add.submit(async () => { await api(`/weddings/${id}/budget`, { body: { label: add.values.label, categoryId: add.values.categoryId || null, planned: rupeesToPaisa(Number(add.values.planned || 0)) } }); add.setValues({ label: '', categoryId: '', planned: '' }); mutate(); })}>Add</Button></Card>
    </div>
  );
}

function ChecklistTab({ w, id, mutate }: { w: any; id: string; mutate: () => void }) {
  const ch = useForm({ title: '', dueDate: '' });
  return (
    <Card>
      <ul className="divide-y divide-line">{w.checklist.map((c: any) => (
        <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
          <label className="flex items-center gap-3"><input type="checkbox" className="size-4 accent-[#8F3048]" checked={c.done} onChange={async (e) => { await api(`/weddings/${id}/checklist/${c.id}`, { method: 'PATCH', body: { title: c.title, done: e.target.checked, dueDate: c.dueDate?.slice(0, 10) ?? null } }); mutate(); }} /><span className={c.done ? 'text-muted line-through' : ''}>{c.title}</span>{c.source === 'AI' && <Sparkles className="size-3.5 text-warn" aria-label="Suggested for your wedding" />}</label>
          <span className="flex items-center gap-3"><span className="text-xs text-muted">{c.dueDate ? fmtDate(c.dueDate) : ''}</span><button aria-label={`Remove ${c.title}`} onClick={async () => { await api(`/weddings/${id}/checklist/${c.id}`, { method: 'DELETE' }); mutate(); }}><Trash2 className="size-4 text-muted" /></button></span>
        </li>
      ))}</ul>
      <div className="mt-4 flex flex-wrap gap-2"><Input className="min-w-56 flex-1" placeholder="Add a task" aria-label="Task" {...ch.bind('title')} /><Input type="date" aria-label="Due date" {...ch.bind('dueDate')} /><Button busy={ch.busy} disabled={!ch.values.title.trim()} onClick={() => ch.submit(async () => { await api(`/weddings/${id}/checklist`, { body: { title: ch.values.title, dueDate: ch.values.dueDate || null } }); ch.setValues({ title: '', dueDate: '' }); mutate(); })}>Add</Button></div>
    </Card>
  );
}

function SettingsTab({ w, id, mutate }: { w: any; id: string; mutate: () => void }) {
  const { data: cities } = useApi<any[]>('/cities');
  const f = useForm({ partnerOne: w.partnerOne ?? '', partnerTwo: w.partnerTwo ?? '', title: w.title, cityId: w.cityId ?? '', guestCount: w.guestCount?.toString() ?? '', targetMonth: w.targetMonth ?? '', budgetBand: w.budgetBand ?? '', budget: w.budget !== null ? String(paisaToRupees(w.budget)) : '', planningStatus: w.planningStatus ?? '', style: w.style ?? '', venuePreference: w.venuePreference ?? '', notes: w.notes ?? '' });
  const [services, setServices] = useState<string[]>(w.services);
  const toast = useToast();
  const router = useRouter();
  const v = f.values;
  return (
    <div className="space-y-5">
      <Card title="Wedding details"><div className="grid gap-3 sm:grid-cols-2">
        <Input label="Bride's name" {...f.bind('partnerOne')} /><Input label="Groom's name" {...f.bind('partnerTwo')} />
        <Input label="Wedding name" {...f.bind('title')} /><Input label="Month" type="month" {...f.bind('targetMonth')} />
        <Select label="City" {...f.bind('cityId')}><option value="">Not decided</option>{cities?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Input label="Guests" type="number" min={1} {...f.bind('guestCount')} />
        <Select label="Budget range" {...f.bind('budgetBand')}><option value="">Not decided</option>{BUDGET_BANDS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}</Select>
        <Input label="Exact budget (Rs.)" type="number" min={0} hint="Overrides the range" {...f.bind('budget')} />
        <Select label="Planning status" {...f.bind('planningStatus')}><option value="">Choose</option>{PLANNING_STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</Select>
        <Select label="Style" {...f.bind('style')}><option value="">Choose</option>{WEDDING_STYLES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</Select>
        <Select label="Venue preference" {...f.bind('venuePreference')}><option value="">Choose</option>{VENUE_PREFERENCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</Select>
        <Textarea label="Notes" rows={2} {...f.bind('notes')} />
      </div>
        <fieldset className="mt-4"><legend className="mb-2 text-sm font-medium">Services you need</legend><div className="flex flex-wrap gap-2">{WEDDING_SERVICES.map((s) => { const on = services.includes(s.key); return <button key={s.key} type="button" aria-pressed={on} onClick={() => setServices(on ? services.filter((x) => x !== s.key) : [...services, s.key])} className={`rounded-full border px-3 py-1.5 text-sm ${on ? 'border-ruby bg-ruby text-white' : 'border-line'}`}>{s.label}</button>; })}</div></fieldset>
        <div className="mt-4"><FormError message={f.formError} /></div>
        <Button className="mt-3" busy={f.busy} onClick={() => f.submit(async () => { await api(`/weddings/${id}`, { method: 'PATCH', body: { title: v.title, partnerOne: v.partnerOne || null, partnerTwo: v.partnerTwo || null, cityId: v.cityId || null, guestCount: v.guestCount ? Number(v.guestCount) : null, targetMonth: v.targetMonth || null, budgetBand: v.budget ? 'CUSTOM' : v.budgetBand || null, budget: v.budget ? rupeesToPaisa(Number(v.budget)) : undefined, planningStatus: v.planningStatus || null, style: v.style || null, venuePreference: v.venuePreference || null, notes: v.notes || null, services } }); toast('Saved'); mutate(); })}>Save changes</Button>
      </Card>
      <Card title="Delete this wedding"><p className="mb-3 text-sm text-muted">Removes its events, budget and checklist. Bookings and payments are not affected.</p><Button variant="danger" onClick={async () => { if (!confirm('Delete this wedding plan?')) return; await api(`/weddings/${id}`, { method: 'DELETE' }); router.push('/account/weddings'); }}>Delete wedding</Button></Card>
    </div>
  );
}

const EVENT_STATE: Record<string, [string, string]> = { BOOKED: ['Booked', 'bg-good/12 text-good'], IN_PROGRESS: ['In progress', 'bg-gold/20 text-warn'], NOT_PLANNED: ['Not planned', 'bg-ink/8 text-ink'] };
const TABS = ['events', 'vendors', 'budget', 'checklist', 'settings'];

function ManageWedding() {
  const { id } = useParams<{ id: string }>();
  const asked = useSearchParams().get('tab');
  const [tab, setTab] = useState(asked && TABS.includes(asked) ? asked : 'events');
  const { data: w, error, isLoading, mutate } = useApi<any>(`/weddings/${id}`);
  // Personalisation runs in the background, so the page checks back until it lands.
  useEffect(() => {
    if (w?.aiStatus !== 'PENDING') return;
    const t = setInterval(() => mutate(), 6000);
    return () => clearInterval(t);
  }, [w?.aiStatus, mutate]);
  if (error) return <ErrorBox error={error} retry={() => mutate()} />;
  if (isLoading || !w) return <Spinner />;
  const refresh = () => { mutate(); };
  return (
    <>
      <Link href={`/account/weddings/${id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-ruby"><ArrowLeft className="size-4" aria-hidden />Back to my plan</Link>
      <div className="mb-6"><p className="text-sm text-muted">Manage your wedding</p><h1 className="text-3xl">{w.title}</h1></div>
      <Tabs value={tab} onChange={setTab} tabs={[{ label: 'Events', value: 'events' }, { label: 'My vendors', value: 'vendors' }, { label: 'Budget', value: 'budget' }, { label: 'Checklist', value: 'checklist' }, { label: 'Settings', value: 'settings' }]} />
      {tab === 'events' && <EventsTab w={w} id={id} mutate={refresh} />}
      {tab === 'vendors' && <VendorsTab w={w} />}
      {tab === 'budget' && <BudgetTab w={w} id={id} mutate={refresh} />}
      {tab === 'checklist' && <ChecklistTab w={w} id={id} mutate={refresh} />}
      {tab === 'settings' && <SettingsTab key={w.updatedAt} w={w} id={id} mutate={refresh} />}
    </>
  );
}

export default function Page() { return <Suspense><ManageWedding /></Suspense>; }
