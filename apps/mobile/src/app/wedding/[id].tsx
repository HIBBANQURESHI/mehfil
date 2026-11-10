import { EventType, formatPKR, rupeesToPaisa, statusLabel } from '@mehfil/shared';
import Checkbox from 'expo-checkbox';
import { router, useLocalSearchParams } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button, c, Card, Chips, DateField, Empty, ErrorView, Field, FormError, Loading, Row, Screen, Status, Text, useForm } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { fmtDate, SLOT_LABEL } from '@/lib/format';

const TABS = [{ label: 'Overview', value: 'overview' }, { label: 'Functions', value: 'events' }, { label: 'Vendors', value: 'vendors' }, { label: 'Budget', value: 'budget' }, { label: 'Checklist', value: 'checklist' }];

export default function Page() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: w, error, isLoading, mutate } = useApi<any>(`/weddings/${id}`);
  const { data: cats } = useApi<any[]>('/categories');
  const [tab, setTab] = useState('overview');
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
      <Text variant="h1">{w.title}</Text>
      <Chips value={tab} onChange={setTab} options={TABS} />
      {tab === 'overview' && <Card><Row label="Total budget" value={formatPKR(s.budget)} /><Row label="Booked so far" value={formatPKR(s.booked)} /><Row label="Paid" value={formatPKR(s.paid)} /><Row bold label="Still to pay" value={formatPKR(s.remainingToPay)} />{s.remainingBudget !== null && <Row label="Budget not yet allocated" value={formatPKR(s.remainingBudget)} />}</Card>}
      {tab === 'events' && <>{!w.events.length && <Empty title="No functions yet" />}{w.events.map((e: any) => <Card key={e.id}><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text variant="h3">{e.name ?? statusLabel(e.type)}</Text>{remove(`/weddings/${id}/events/${e.id}`, 'function')}</View><Text variant="muted">{[e.date && fmtDate(e.date), e.slot && SLOT_LABEL[e.slot], e.venue, e.guestCount && `${e.guestCount} guests`].filter(Boolean).join(' · ') || 'Details not set'}</Text></Card>)}<Card title="Add a function"><Chips value={ev.values.type} onChange={(v) => ev.set('type', v)} options={EventType.map((t) => ({ label: statusLabel(t), value: t }))} /><DateField label="Date" value={ev.values.date} onChange={(v) => ev.set('date', v)} /><Field label="Venue" {...ev.bind('venue')} /><Field label="Guests" keyboardType="number-pad" {...ev.bind('guestCount')} /><FormError message={ev.formError} /><Button title="Add" variant="secondary" busy={ev.busy} onPress={() => ev.submit(async () => { const v = ev.values; await api(`/weddings/${id}/events`, { body: { type: v.type, name: statusLabel(v.type), date: v.date || null, venue: v.venue || null, guestCount: v.guestCount ? Number(v.guestCount) : null } }); ev.setValues({ type: 'MEHNDI', date: '', venue: '', guestCount: '' }); mutate(); })} /></Card></>}
      {tab === 'vendors' && <>{!w.bookings.length && !w.enquiries.length && <Empty title="No vendors yet" action={<Button title="Find vendors" onPress={() => router.push('/explore')} />} />}{w.bookings.map((b: any) => <Pressable key={b.id} accessibilityRole="button" onPress={() => router.push(`/bookings/${b.id}`)}><Card><Text variant="bold">{b.vendorName}</Text><Text variant="small">{b.categoryName} · {fmtDate(b.eventDate)}</Text><Row label={formatPKR(b.totalAmount)} value={<Status value={b.status} />} /></Card></Pressable>)}{w.enquiries.filter((e: any) => e.status !== 'CLOSED').map((e: any) => <Pressable key={e.id} accessibilityRole="button" onPress={() => router.push(`/enquiries/${e.id}`)}><Card><Text variant="bold">{e.vendor.businessName}</Text><Status value={e.status} /></Card></Pressable>)}</>}
      {tab === 'budget' && <>{w.budgetItems.map((b: any) => <Card key={b.id}><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text variant="bold">{b.label}</Text>{remove(`/weddings/${id}/budget/${b.id}`, 'budget line')}</View><Row label="Planned" value={formatPKR(b.planned)} /><Row label="Booked" value={formatPKR(b.actual)} /></Card>)}<Card><Row bold label="Planned in total" value={formatPKR(s.planned)} /><Row bold label="Booked in total" value={formatPKR(s.booked)} /></Card><Card title="Add a budget line"><Field label="Item" {...bi.bind('label')} /><Chips value={bi.values.categoryId} onChange={(v) => bi.set('categoryId', v)} options={[{ label: 'No category', value: '' }, ...(cats ?? []).map((x) => ({ label: x.name, value: x.id }))]} /><Field label="Planned (Rs.)" keyboardType="number-pad" {...bi.bind('planned')} /><FormError message={bi.formError} /><Button title="Add" variant="secondary" busy={bi.busy} onPress={() => bi.submit(async () => { await api(`/weddings/${id}/budget`, { body: { label: bi.values.label, categoryId: bi.values.categoryId || null, planned: rupeesToPaisa(Number(bi.values.planned || 0)) } }); bi.setValues({ label: '', categoryId: '', planned: '' }); mutate(); })} /></Card></>}
      {tab === 'checklist' && <Card>{w.checklist.map((x: any) => <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Checkbox accessibilityLabel={x.title} value={x.done} color={x.done ? c.ruby : undefined} onValueChange={async (done) => { await api(`/weddings/${id}/checklist/${x.id}`, { method: 'PATCH', body: { title: x.title, done } }); mutate(); }} /><Text style={[{ flex: 1 }, x.done && { textDecorationLine: 'line-through', color: c.muted }]}>{x.title}</Text>{remove(`/weddings/${id}/checklist/${x.id}`, 'task')}</View>)}<Field label="Add a task" {...ch.bind('title')} /><Button title="Add" variant="secondary" busy={ch.busy} disabled={!ch.values.title.trim()} onPress={() => ch.submit(async () => { await api(`/weddings/${id}/checklist`, { body: { title: ch.values.title } }); ch.set('title', ''); mutate(); })} /></Card>}
    </Screen>
  );
}
