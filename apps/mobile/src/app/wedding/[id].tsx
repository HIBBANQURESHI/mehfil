import { EventType, formatBps, formatPKR, labelOf, PLANNING_STATUS, rupeesToPaisa, statusLabel, VENUE_STATUS } from '@mehfil/shared';
import Checkbox from 'expo-checkbox';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Check, Settings2, Sparkles, Star, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Button, c, Card, Chips, DateField, Empty, ErrorView, Field, font, FormError, Loading, Row, Screen, Status, Text, useForm } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { fmtDate, SLOT_LABEL } from '@/lib/format';

const TABS = [{ label: 'Functions', value: 'events' }, { label: 'Vendors', value: 'vendors' }, { label: 'Budget', value: 'budget' }, { label: 'Checklist', value: 'checklist' }];

const EVENT_STATE: Record<string, [string, string, string]> = { BOOKED: ['Booked', '#E4EEE9', c.success], IN_PROGRESS: ['In progress', '#F6ECD8', '#8F6518'], NOT_PLANNED: ['Not planned', '#EEEAEB', c.text] };

const PROGRESS: Record<string, [string, string, string]> = { BOOKED: ['Booked', '#E4EEE9', c.success], BOOKING: ['Quote accepted', '#F6ECD8', '#8F6518'], QUOTES_REQUESTED: ['Quotes requested', '#F6ECD8', '#8F6518'] };
const SLOTS = [{ label: 'Full day', value: 'FULL_DAY' }, { label: 'Lunch', value: 'LUNCH' }, { label: 'Dinner', value: 'DINNER' }];

function Pick({ l }: { l: any }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={l.title} onPress={() => router.push(`/listing/${l.slug}`)} style={{ width: 250, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 14, gap: 6 }}>
      <Text variant="bold" numberOfLines={1}>{l.title}</Text>
      <Text variant="small" numberOfLines={1}>{l.vendor.businessName}</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontFamily: font.bold }}>{formatPKR(l.estimate)}<Text variant="small">{l.priceUnit === 'PER_PERSON' ? ' est. total' : ' from'}</Text></Text>
        {l.reviewCount > 0 && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}><Star size={14} color={c.gold} fill={c.gold} /><Text variant="small">{l.avgRating.toFixed(1)}</Text></View>}
      </View>
      {l.reasons.map((r: string) => <View key={r} style={{ flexDirection: 'row', gap: 6 }}><Check size={14} color={c.success} style={{ marginTop: 2 }} /><Text variant="small" style={{ flex: 1 }}>{r}</Text></View>)}
    </Pressable>
  );
}

function AskQuotes({ r, g, onDone, onCancel }: { r: any; g: any; onDone: () => void; onCancel: () => void }) {
  const first = r.events.find((e: any) => e.date) ?? r.events[0];
  const f = useForm({ eventId: first?.id ?? '', eventDate: first?.date ?? '', slot: 'FULL_DAY', guestCount: String(first?.guestCount ?? r.guests ?? ''), requirements: `We are looking for ${g.label.toLowerCase()} for our ${first?.name ?? 'wedding'}${r.city ? ` in ${r.city}` : ''}. Please send us your best quotation.` });
  const pickEvent = (eventId: string) => { const e = r.events.find((x: any) => x.id === eventId); f.setValues({ ...f.values, eventId, eventDate: e?.date ?? f.values.eventDate, guestCount: String(e?.guestCount ?? f.values.guestCount) }); };
  return (
    <Card title={`Request quotes for ${g.label.toLowerCase()}`}>
      <Text variant="small">Sent to {g.picks.map((p: any) => p.vendor.businessName).join(', ')}. Each vendor confirms the date and sends their price. Nothing is booked or paid yet.</Text>
      {r.events.length > 1 && <Chips value={f.values.eventId} onChange={pickEvent} options={r.events.map((e: any) => ({ label: e.name, value: e.id }))} />}
      <DateField label="Date" value={f.values.eventDate} onChange={(v) => f.set('eventDate', v)} minimumDate={new Date()} />
      <Field label="Guests" keyboardType="number-pad" {...f.bind('guestCount')} />
      <Chips value={f.values.slot} onChange={(v) => f.set('slot', v)} options={SLOTS} scroll={false} />
      <Field label="Message to vendors" multiline {...f.bind('requirements')} />
      <FormError message={f.formError} />
      <Button title={g.picks.length === 1 ? 'Send request' : `Send ${g.picks.length} requests`} busy={f.busy} disabled={!f.values.eventDate || !Number(f.values.guestCount)} onPress={() => f.submit(async () => {
        await api('/enquiries', { body: { listingIds: g.picks.map((p: any) => p.id), weddingId: r.id, eventId: f.values.eventId || undefined, eventDate: f.values.eventDate, slot: f.values.slot, guestCount: Number(f.values.guestCount), requirements: f.values.requirements } });
        onDone();
      })} />
      <Button title="Cancel" variant="outline" onPress={onCancel} />
    </Card>
  );
}

/** The simple view: best picks per service, the budget split and the next few steps. */
function MyPlan({ id, welcome, onManage }: { id: string; welcome?: string; onManage: (tab: string) => void }) {
  const { data: r, error, mutate } = useApi<any>(`/weddings/${id}/results`, { refreshInterval: (d) => (d?.ai.status === 'PENDING' ? 6000 : 0) });
  const [asking, setAsking] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  if (error) return <ErrorView error={error} retry={() => mutate()} />;
  if (!r) return <Loading />;
  const firstDate = r.events.find((e: any) => e.date)?.date;
  const summary = [r.events.map((e: any) => e.name).join(', ') || null, r.guests ? `${r.guests} guests` : null, r.city, firstDate ? fmtDate(firstDate) : r.targetMonth].filter(Boolean).join(' · ');
  const total = r.budgetSplit.reduce((s: number, b: any) => s + b.planned, 0);
  return (
    <>
      <View style={{ backgroundColor: c.ruby, borderRadius: 20, padding: 18, gap: 4 }}>
        <Text style={{ color: '#F3DCE1', fontSize: 13 }}>{welcome ? 'Your plan is ready' : 'Your wedding plan'}</Text>
        <Text variant="h2" style={{ color: '#fff' }}>{r.title}</Text>
        {!!summary && <Text style={{ color: '#F8E9E9' }}>{summary}</Text>}
        {r.budget !== null && <Text style={{ color: '#F8E9E9' }}>Budget {formatPKR(r.budget)}</Text>}
      </View>
      {r.ai.status === 'READY' && r.ai.note && <Card style={{ backgroundColor: '#FBF4E6', borderColor: '#EBD7AD' }}><View style={{ flexDirection: 'row', gap: 8 }}><Sparkles size={18} color={c.gold} /><Text style={{ flex: 1 }}>{r.ai.note}</Text></View></Card>}
      {r.ai.status === 'PENDING' && <Card style={{ backgroundColor: c.blush, borderColor: c.blush }}><Text>Personalising your budget and checklist. This can take a minute.</Text></Card>}
      {sent && <Card style={{ backgroundColor: '#E4EEE9', borderColor: '#E4EEE9' }}><Text style={{ color: c.success }}>Requests sent. Vendors will reply with their quotations.</Text></Card>}

      <Text variant="h2">Our best picks for you</Text>
      <Text variant="small">Real Mehfil vendors for your city, guests and budget.{r.dateChecked ? ` Vendors fully booked on ${fmtDate(r.dateChecked)} are left out; each confirms your date when you ask.` : ''}</Text>
      {!r.services.length && <Card><Text variant="muted">Choose the services you need and we will pick vendors for you.</Text></Card>}
      {r.services.map((g: any) => {
        const p = PROGRESS[g.progress];
        return (
          <View key={g.service} style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text variant="h3">{g.label}</Text>
                <Text variant="small">{g.allocation ? `${formatPKR(g.allocation)} in your budget` : 'No budget set'}{g.matches ? ` · ${g.matches} match${g.matches === 1 ? '' : 'es'}` : ''}</Text>
              </View>
              {p ? <View style={{ backgroundColor: p[1], borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}><Text style={{ color: p[2], fontSize: 12 }}>{p[0]}</Text></View>
                : <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/explore', params: { category: g.explore.category } })}><Text style={{ color: c.ruby }}>See all</Text></Pressable>}
            </View>
            {g.overBudget && <Text variant="small" style={{ color: '#8F6518' }}>Nothing fits this budget yet, so these are the closest options.</Text>}
            {!g.picks.length ? <Text variant="muted">No vendors match yet.</Text> : <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>{g.picks.map((l: any) => <Pick key={l.id} l={l} />)}</ScrollView>}
            {g.picks.length > 0 && g.progress === 'OPEN' && asking !== g.service && <Button title={g.picks.length === 1 ? 'Request a quote' : `Request quotes from all ${g.picks.length}`} onPress={() => { setSent(false); setAsking(g.service); }} />}
            {asking === g.service && <AskQuotes r={r} g={g} onCancel={() => setAsking(null)} onDone={() => { setAsking(null); setSent(true); mutate(); }} />}
          </View>
        );
      })}

      <Card title="Your budget split">
        {!r.budgetSplit.length ? <Text variant="muted">Set a budget to see how it splits across your services.</Text> : r.budgetSplit.map((b: any) => (
          <View key={b.id} style={{ gap: 4 }}>
            <Row label={b.label} value={formatPKR(b.planned)} />
            <View style={{ height: 6, borderRadius: 3, backgroundColor: c.blush, overflow: 'hidden' }}><View style={{ height: 6, width: `${total ? Math.round((b.planned / total) * 100) : 0}%`, backgroundColor: c.ruby }} /></View>
            {b.suggested !== null && b.suggested !== b.planned && <Text variant="small">Suggested for you: {formatPKR(b.suggested)}</Text>}
          </View>
        ))}
        {r.suggestionAvailable && r.budgetSplit.some((b: any) => b.suggested !== null && b.suggested !== b.planned) && <Button title="Use the suggested split" variant="secondary" onPress={async () => { await api(`/weddings/${id}/budget/apply-suggestion`, { method: 'POST', body: {} }); mutate(); }} />}
        <Button title="Adjust budget" variant="outline" onPress={() => onManage('budget')} />
      </Card>

      <Card title="Next steps">
        {!r.nextSteps.length ? <Text variant="muted">You are all caught up.</Text> : r.nextSteps.map((x: any) => (
          <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Checkbox accessibilityLabel={x.title} value={false} onValueChange={async () => { await api(`/weddings/${id}/checklist/${x.id}`, { method: 'PATCH', body: { title: x.title, done: true, dueDate: x.dueDate?.slice(0, 10) ?? null } }); mutate(); }} />
            <Text style={{ flex: 1 }}>{x.title}</Text>
            {x.dueDate && <Text variant="small">{fmtDate(x.dueDate)}</Text>}
          </View>
        ))}
        <Text variant="small">{r.tasks.done} of {r.tasks.total} tasks done</Text>
        <Button title="Full checklist" variant="outline" onPress={() => onManage('checklist')} />
      </Card>
    </>
  );
}

export default function Page() {
  const { id, welcome } = useLocalSearchParams<{ id: string; welcome?: string }>();
  const { data: w, error, isLoading, mutate } = useApi<any>(`/weddings/${id}`, { refreshInterval: (data) => (data?.aiStatus === 'PENDING' ? 6000 : 0) });
  const { data: cats } = useApi<any[]>('/categories');
  const [tab, setTab] = useState('plan');
  const ev = useForm({ type: 'MEHNDI', date: '', venue: '', guestCount: '' });
  const bi = useForm({ label: '', categoryId: '', planned: '' });
  const ch = useForm({ title: '' });
  if (error) return <ErrorView error={error} retry={() => mutate()} />;
  if (isLoading || !w) return <Loading />;
  const s = w.summary;
  const del = async (path: string) => { await api(path, { method: 'DELETE' }); mutate(); };
  const remove = (path: string, label: string) => <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${label}`} onPress={() => del(path)} hitSlop={10}><Trash2 size={17} color={c.muted} /></Pressable>;
  return (
    <Screen onRefresh={() => mutate()}>
      {tab === 'plan' ? <>
        <MyPlan id={id} welcome={welcome} onManage={setTab} />
        <Pressable accessibilityRole="button" onPress={() => setTab('events')} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12 }}><Settings2 size={16} color={c.ruby} /><Text style={{ color: c.ruby }}>Manage events, vendors, budget and checklist</Text></Pressable>
      </> : <>
        <Pressable accessibilityRole="button" onPress={() => { setTab('plan'); mutate(); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><ArrowLeft size={16} color={c.ruby} /><Text style={{ color: c.ruby }}>Back to my plan</Text></Pressable>
        <Text variant="h1">{w.title}</Text>
        <Chips value={tab} onChange={setTab} options={TABS} />
      </>}
      {tab === 'events' && <>{!w.events.length && <Empty title="No functions yet" />}{w.events.map((e: any) => <Card key={e.id}><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text variant="h3">{e.name ?? statusLabel(e.type)}</Text>{remove(`/weddings/${id}/events/${e.id}`, 'function')}</View><Text variant="muted">{[e.date && fmtDate(e.date), e.slot && SLOT_LABEL[e.slot], e.venue, e.guestCount && `${e.guestCount} guests`].filter(Boolean).join(' · ') || 'Details not set'}</Text></Card>)}<Card title="Add a function"><Chips value={ev.values.type} onChange={(v) => ev.set('type', v)} options={EventType.map((t) => ({ label: statusLabel(t), value: t }))} /><DateField label="Date" value={ev.values.date} onChange={(v) => ev.set('date', v)} /><Field label="Venue" {...ev.bind('venue')} /><Field label="Guests" keyboardType="number-pad" {...ev.bind('guestCount')} /><FormError message={ev.formError} /><Button title="Add" variant="secondary" busy={ev.busy} onPress={() => ev.submit(async () => { const v = ev.values; await api(`/weddings/${id}/events`, { body: { type: v.type, name: statusLabel(v.type), date: v.date || null, venue: v.venue || null, guestCount: v.guestCount ? Number(v.guestCount) : null } }); ev.setValues({ type: 'MEHNDI', date: '', venue: '', guestCount: '' }); mutate(); })} /></Card></>}
      {tab === 'vendors' && <>{!w.bookings.length && !w.enquiries.length && <Empty title="No vendors yet" action={<Button title="Find vendors" onPress={() => router.push('/explore')} />} />}{w.bookings.map((b: any) => <Pressable key={b.id} accessibilityRole="button" onPress={() => router.push(`/bookings/${b.id}`)}><Card><Text variant="bold">{b.vendorName}</Text><Text variant="small">{b.categoryName} · {fmtDate(b.eventDate)}</Text><Row label={formatPKR(b.totalAmount)} value={<Status value={b.status} />} /></Card></Pressable>)}{w.enquiries.filter((e: any) => e.status !== 'CLOSED').map((e: any) => <Pressable key={e.id} accessibilityRole="button" onPress={() => router.push(`/enquiries/${e.id}`)}><Card><Text variant="bold">{e.vendor.businessName}</Text><Status value={e.status} /></Card></Pressable>)}</>}
      {tab === 'budget' && <>{w.suggestion && <Card title="Suggested split"><Text variant="muted">A starting point written for your wedding, not a price list.</Text>{w.suggestion.map((x: any) => <Row key={x.service} label={x.label} value={`${formatBps(x.bps)}${x.amount !== null ? ` · ${formatPKR(x.amount)}` : ''}`} />)}{s.budget !== null && <Button title="Use this split" variant="secondary" onPress={async () => { await api(`/weddings/${id}/budget/apply-suggestion`, { method: 'POST', body: {} }); mutate(); }} />}</Card>}{w.budgetItems.map((b: any) => <Card key={b.id}><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text variant="bold">{b.label}</Text>{remove(`/weddings/${id}/budget/${b.id}`, 'budget line')}</View><Row label="Planned" value={formatPKR(b.planned)} /><Row label="Committed" value={formatPKR(b.actual)} /><Row label="Paid" value={formatPKR(b.paid)} /></Card>)}<Card><Row bold label="Planned in total" value={formatPKR(s.planned)} /><Row bold label="Committed in total" value={formatPKR(s.booked)} /><Row bold label="Paid in total" value={formatPKR(s.paid)} /></Card><Card title="Add a budget line"><Field label="Item" {...bi.bind('label')} /><Chips value={bi.values.categoryId} onChange={(v) => bi.set('categoryId', v)} options={[{ label: 'No category', value: '' }, ...(cats ?? []).map((x) => ({ label: x.name, value: x.id }))]} /><Field label="Planned (Rs.)" keyboardType="number-pad" {...bi.bind('planned')} /><FormError message={bi.formError} /><Button title="Add" variant="secondary" busy={bi.busy} onPress={() => bi.submit(async () => { await api(`/weddings/${id}/budget`, { body: { label: bi.values.label, categoryId: bi.values.categoryId || null, planned: rupeesToPaisa(Number(bi.values.planned || 0)) } }); bi.setValues({ label: '', categoryId: '', planned: '' }); mutate(); })} /></Card></>}
      {tab === 'checklist' && <Card>{w.checklist.map((x: any) => <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Checkbox accessibilityLabel={x.title} value={x.done} color={x.done ? c.ruby : undefined} onValueChange={async (done) => { await api(`/weddings/${id}/checklist/${x.id}`, { method: 'PATCH', body: { title: x.title, done } }); mutate(); }} /><Text style={[{ flex: 1 }, x.done && { textDecorationLine: 'line-through', color: c.muted }]}>{x.title}</Text>{remove(`/weddings/${id}/checklist/${x.id}`, 'task')}</View>)}<Field label="Add a task" {...ch.bind('title')} /><Button title="Add" variant="secondary" busy={ch.busy} disabled={!ch.values.title.trim()} onPress={() => ch.submit(async () => { await api(`/weddings/${id}/checklist`, { body: { title: ch.values.title } }); ch.set('title', ''); mutate(); })} /></Card>}
    </Screen>
  );
}
