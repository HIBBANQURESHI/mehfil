import { BUDGET_BANDS, EventType, formatPKR, GUEST_PRESETS, labelOf, PLANNING_STATUS, rupeesToPaisa, statusLabel, VENUE_PREFERENCES, VENUE_STATUS, WEDDING_SERVICES, WEDDING_STYLES, workingBudget } from '@mehfil/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { ComponentRef, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, c, Card, Chips, DateField, Field, FormError, font, Text } from '@/components/ui';
import { api, ApiError, useApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';

interface PlanEvent { type: string; name: string; date: string; guestCount: string; venueStatus: string }
interface Draft {
  step: number; partnerOne: string; partnerTwo: string; dateKnown: 'date' | 'month' | 'unknown'; weddingDate: string; targetMonth: string;
  cityId: string; guestCount: string; planningStatus: string; events: PlanEvent[]; budgetBand: string; budget: string;
  style: string; venuePreference: string; services: string[];
}
const KEY = 'mehfil.planDraft';
const EMPTY: Draft = { step: 0, partnerOne: '', partnerTwo: '', dateKnown: 'month', weddingDate: '', targetMonth: '', cityId: '', guestCount: '', planningStatus: '', events: [], budgetBand: '', budget: '', style: '', venuePreference: '', services: [] };
const STEPS = ['Wedding basics', 'Your events', 'Your budget', 'Your preferences', 'Review'];
const EVENTS = ['MEHNDI', 'BARAAT', 'WALIMA', 'NIKAH', ...EventType.filter((t) => !['MEHNDI', 'BARAAT', 'WALIMA', 'NIKAH', 'OTHER'].includes(t))];

/** Next 18 months as YYYY-MM, for choosing a rough wedding month without a calendar. */
function months() {
  const out: { label: string; value: string }[] = [];
  const d = new Date();
  for (let i = 0; i < 18; i++) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i, 1));
    out.push({ value: m.toISOString().slice(0, 7), label: m.toLocaleDateString('en-PK', { month: 'short', year: 'numeric', timeZone: 'UTC' }) });
  }
  return out;
}

export default function Plan() {
  const { user } = useAuth();
  const { data: cities } = useApi<any[]>('/cities');
  const [d, setD] = useState<Draft>(EMPTY);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  useEffect(() => { AsyncStorage.getItem(KEY).then((v) => { if (v) setD({ ...EMPTY, ...JSON.parse(v) }); }).catch(() => undefined).finally(() => setReady(true)); }, []);
  useEffect(() => { if (ready) AsyncStorage.setItem(KEY, JSON.stringify(d)).catch(() => undefined); }, [d, ready]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const go = (step: number) => { setError(null); setD((x) => ({ ...x, step })); scroll.current?.scrollTo({ y: 0, animated: true }); };
  const toggleEvent = (type: string) => setD((x) => ({ ...x, events: x.events.some((e) => e.type === type) ? x.events.filter((e) => e.type !== type) : [...x.events, { type, name: '', date: '', guestCount: '', venueStatus: '' }] }));
  const setEvent = (i: number, p: Partial<PlanEvent>) => setD((x) => ({ ...x, events: x.events.map((e, n) => (n === i ? { ...e, ...p } : e)) }));
  const budgetPreview = d.budgetBand === 'CUSTOM' ? (d.budget ? rupeesToPaisa(Number(d.budget)) : null) : workingBudget(d.budgetBand);
  const n = (v: string) => (v ? Number(v) : null);

  const create = async () => {
    // The draft is already saved on the phone, so signing up returns here with every answer intact.
    if (!user) { router.push({ pathname: '/login', params: { next: '/plan' } }); return; }
    setBusy(true); setError(null);
    try {
      const w = await api('/weddings/plan', { body: {
        partnerOne: d.partnerOne || null, partnerTwo: d.partnerTwo || null,
        weddingDate: d.dateKnown === 'date' && d.weddingDate ? d.weddingDate : null, targetMonth: d.dateKnown === 'month' && d.targetMonth ? d.targetMonth : null,
        cityId: d.cityId || null, guestCount: n(d.guestCount), planningStatus: d.planningStatus || null,
        events: d.events.map((e) => ({ type: e.type, name: e.name || null, date: e.date || null, guestCount: n(e.guestCount), venueStatus: e.venueStatus || null })),
        budgetBand: d.budgetBand || null, budget: d.budgetBand === 'CUSTOM' && d.budget ? rupeesToPaisa(Number(d.budget)) : null,
        style: d.style || null, venuePreference: d.venuePreference || null, services: d.services,
      } });
      await AsyncStorage.removeItem(KEY).catch(() => undefined);
      router.replace({ pathname: '/wedding/[id]', params: { id: w.id, welcome: '1' } });
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.'); }
    finally { setBusy(false); }
  };

  if (!ready) return null;

  if (d.step === 0) return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: c.warmWhite, padding: 24, justifyContent: 'space-between' }}>
      <Stack.Screen options={{ title: 'Plan my wedding' }} />
      <View style={{ alignItems: 'center', gap: 18, marginTop: 12 }}>
        <Image source={require('../../assets/logo.webp')} style={{ width: '80%', aspectRatio: 800 / 502 }} contentFit="contain" accessibilityIgnoresInvertColors />
        <Text variant="h1" style={{ textAlign: 'center' }}>Let's plan your perfect wedding</Text>
        <Text variant="muted" style={{ textAlign: 'center', fontSize: 16, lineHeight: 23 }}>Tell us a little about your wedding so we can personalise your experience. Not sure about something? Skip it and add it later.</Text>
      </View>
      <View style={{ gap: 10 }}>
        <Button title={d.events.length || d.cityId ? 'Continue planning' : 'Start planning'} onPress={() => go(1)} />
        {(d.events.length > 0 || !!d.cityId) && <Button title="Start over" variant="outline" onPress={() => setD({ ...EMPTY, step: 1 })} />}
      </View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: c.warmWhite }}>
      <Stack.Screen options={{ title: STEPS[d.step - 1] }} />
      <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingTop: 8 }} accessibilityLabel={`Step ${d.step} of 5`}>
        {STEPS.map((_, i) => <View key={i} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i < d.step ? c.ruby : c.border }} />)}
      </View>
      <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {d.step === 1 && <>
          <Field label="Bride's name (optional)" value={d.partnerOne} onChangeText={(v) => set('partnerOne', v)} />
          <Field label="Groom's name (optional)" value={d.partnerTwo} onChangeText={(v) => set('partnerTwo', v)} />
          <Text variant="bold">When is the wedding?</Text>
          <Chips scroll={false} value={d.dateKnown} onChange={(v) => set('dateKnown', v as Draft['dateKnown'])} options={[{ label: 'I know the date', value: 'date' }, { label: 'Roughly which month', value: 'month' }, { label: 'Not decided', value: 'unknown' }]} />
          {d.dateKnown === 'date' && <DateField label="Wedding date" value={d.weddingDate} onChange={(v) => set('weddingDate', v)} minimumDate={new Date()} />}
          {d.dateKnown === 'month' && <Chips value={d.targetMonth} onChange={(v) => set('targetMonth', v)} options={months()} />}
          <Text variant="bold">City</Text>
          <Chips scroll={false} value={d.cityId} onChange={(v) => set('cityId', v)} options={(cities ?? []).map((x) => ({ label: x.name, value: x.id }))} />
          <Text variant="bold">Estimated guests</Text>
          <Chips scroll={false} value={d.guestCount} onChange={(v) => set('guestCount', v)} options={GUEST_PRESETS.map((g) => ({ label: g === 1000 ? '1000+' : String(g), value: String(g) }))} />
          <Field label="Or type a number" keyboardType="number-pad" value={d.guestCount} onChangeText={(v) => set('guestCount', v.replace(/\D/g, ''))} />
          <Text variant="bold">Where are you with planning?</Text>
          <Chips scroll={false} value={d.planningStatus} onChange={(v) => set('planningStatus', v)} options={PLANNING_STATUS.map((s) => ({ label: s.label, value: s.key }))} />
        </>}

        {d.step === 2 && <>
          <Text variant="muted">Pick every function you're planning.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {EVENTS.map((t) => { const on = d.events.some((e) => e.type === t); return <Pressable key={t} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggleEvent(t)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: on ? c.ruby : c.border, backgroundColor: on ? c.ruby : '#fff' }}><Text style={{ color: on ? '#fff' : c.text, fontSize: 13 }}>{statusLabel(t)}</Text></Pressable>; })}
          </View>
          {d.events.map((e, i) => (
            <Card key={e.type + i} title={statusLabel(e.type)}>
              <DateField label="Date (if known)" value={e.date} onChange={(v) => setEvent(i, { date: v })} minimumDate={new Date()} />
              <Field label="Guests" keyboardType="number-pad" placeholder={d.guestCount} value={e.guestCount} onChangeText={(v) => setEvent(i, { guestCount: v.replace(/\D/g, '') })} />
              <Text variant="bold">Venue</Text>
              <Chips scroll={false} value={e.venueStatus} onChange={(v) => setEvent(i, { venueStatus: v })} options={VENUE_STATUS.map((v) => ({ label: v.label, value: v.key }))} />
            </Card>
          ))}
        </>}

        {d.step === 3 && <>
          <Text variant="muted">Your approximate total for all functions. We use it to suggest a starting split you can change anytime.</Text>
          {BUDGET_BANDS.map((b) => { const on = d.budgetBand === b.key; return <Pressable key={b.key} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => set('budgetBand', b.key)} style={{ borderWidth: 1, borderColor: on ? c.ruby : c.border, backgroundColor: on ? c.blush : '#fff', borderRadius: 14, padding: 14 }}><Text style={{ fontFamily: on ? font.bold : font.sans, color: on ? c.ruby : c.text }}>{b.label}</Text></Pressable>; })}
          {d.budgetBand === 'CUSTOM' && <Field label="Total budget (Rs.)" keyboardType="number-pad" value={d.budget} onChangeText={(v) => set('budget', v.replace(/\D/g, ''))} />}
          {budgetPreview !== null && d.budgetBand !== 'CUSTOM' && <Text variant="muted">We'll plan around {formatPKR(budgetPreview)}, the middle of your range. You can set an exact amount later.</Text>}
        </>}

        {d.step === 4 && <>
          <Text variant="bold">What services do you need?</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {WEDDING_SERVICES.map((s) => { const on = d.services.includes(s.key); return <Pressable key={s.key} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => set('services', on ? d.services.filter((x) => x !== s.key) : [...d.services, s.key])} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: on ? c.ruby : c.border, backgroundColor: on ? c.ruby : '#fff' }}><Text style={{ color: on ? '#fff' : c.text, fontSize: 13 }}>{s.label}</Text></Pressable>; })}
          </View>
          <Text variant="bold">Wedding style</Text>
          <Chips scroll={false} value={d.style} onChange={(v) => set('style', v)} options={WEDDING_STYLES.map((s) => ({ label: s.label, value: s.key }))} />
          <Text variant="bold">Venue preference</Text>
          <Chips scroll={false} value={d.venuePreference} onChange={(v) => set('venuePreference', v)} options={VENUE_PREFERENCES.map((s) => ({ label: s.label, value: s.key }))} />
        </>}

        {d.step === 5 && <>
          {[
            [1, 'Wedding basics', [[d.partnerOne, d.partnerTwo].filter(Boolean).join(' & ') || 'Names not added', d.dateKnown === 'date' ? d.weddingDate || 'Date not set' : d.dateKnown === 'month' ? d.targetMonth || 'Month not set' : 'Date not decided', cities?.find((x) => x.id === d.cityId)?.name ?? 'City not chosen', d.guestCount ? `${d.guestCount} guests` : 'Guests not set'].join(' · ')],
            [2, 'Your events', d.events.map((e) => statusLabel(e.type) + (e.date ? ` (${e.date})` : '')).join(' · ') || 'No functions added'],
            [3, 'Your budget', budgetPreview !== null ? (d.budgetBand === 'CUSTOM' ? formatPKR(budgetPreview) : labelOf(BUDGET_BANDS, d.budgetBand)!) : 'Not decided yet'],
            [4, 'Your preferences', [d.services.map((s) => WEDDING_SERVICES.find((x) => x.key === s)?.label).join(', ') || 'No services chosen', labelOf(WEDDING_STYLES, d.style)].filter(Boolean).join(' · ')],
          ].map(([step, title, text]) => (
            <Card key={String(step)}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}><Text variant="bold" style={{ flex: 1 }}>{String(title)}</Text><Pressable accessibilityRole="button" onPress={() => go(Number(step))}><Text style={{ color: c.ruby }}>Edit</Text></Pressable></View>
              <Text variant="muted">{String(text)}</Text>
            </Card>
          ))}
          {!user && <Text variant="muted">You'll be asked to sign in or create a free account. Your answers are kept on this phone.</Text>}
          <FormError message={error} />
        </>}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 10, padding: 12, borderTopWidth: 1, borderColor: c.border, backgroundColor: '#fff' }}>
        <Button title="Back" variant="outline" onPress={() => go(d.step - 1)} style={{ flex: 1 }} />
        {d.step < 5 ? <Button title={d.step === 4 ? 'Review' : 'Continue'} onPress={() => go(d.step + 1)} style={{ flex: 2 }} /> : <Button title="Create my wedding" busy={busy} onPress={create} style={{ flex: 2 }} />}
      </View>
    </SafeAreaView>
  );
}
