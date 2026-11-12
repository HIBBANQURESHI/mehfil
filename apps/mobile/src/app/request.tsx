import { rupeesToPaisa } from '@mehfil/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { showAlert } from '@/components/alert';
import { Button, Chips, DateField, Field, FormError, Screen, Text, useForm } from '@/components/ui';
import { api, useApi } from '@/lib/api';

export default function Request() {
  const { ids, packages, date } = useLocalSearchParams<{ ids: string; packages?: string; date?: string }>();
  const pkgs: { label: string; value: string }[] = packages ? JSON.parse(packages) : [];
  const { data: weddings } = useApi<any[]>('/weddings');
  const f = useForm({ eventDate: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '', slot: 'FULL_DAY', guestCount: '', budget: '', requirements: '', packageId: '', weddingId: '' });
  const listingIds = ids.split(',');
  // For a single listing, times already taken on the chosen date are switched off.
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
    showAlert('Request sent', 'You will be notified when quotations arrive.');
    router.back();
  });
  return (
    <Screen>
      {listingIds.length > 1 && <Text variant="muted">Sending to {listingIds.length} vendors. Each replies separately.</Text>}
      <DateField label="Event date" value={f.values.eventDate} onChange={(v) => f.set('eventDate', v)} error={f.errors.eventDate} minimumDate={new Date()} />
      <Text variant="bold">Time</Text><Chips scroll={false} value={f.values.slot} onChange={(v) => { if (!blocked[v]) f.set('slot', v); }} options={[{ label: 'Full day', value: 'FULL_DAY' }, { label: 'Lunch', value: 'LUNCH' }, { label: 'Dinner', value: 'DINNER' }].filter((o) => !blocked[o.value])} />
      {fullyBooked ? <Text style={{ color: '#B54750' }}>This date is already fully booked. Please choose another date.</Text> : (taken.LUNCH || taken.DINNER) && <Text variant="small">{taken.LUNCH ? 'Lunch' : 'Dinner'} is already booked on this date, so you can request {taken.LUNCH ? 'dinner' : 'lunch'}.</Text>}
      <Field label="Guests" keyboardType="number-pad" {...f.bind('guestCount')} />
      <Field label="Budget (Rs., optional)" keyboardType="number-pad" {...f.bind('budget')} />
      {pkgs.length > 0 && <View style={{ gap: 6 }}><Text variant="bold">Package</Text><Chips value={f.values.packageId} onChange={(v) => f.set('packageId', v)} options={[{ label: 'Not sure', value: '' }, ...pkgs]} /></View>}
      {!!weddings?.length && <View style={{ gap: 6 }}><Text variant="bold">Add to wedding</Text><Chips value={f.values.weddingId} onChange={(v) => f.set('weddingId', v)} options={[{ label: 'None', value: '' }, ...weddings.map((w) => ({ label: w.title, value: w.id }))]} /></View>}
      <Field label="What do you need?" multiline {...f.bind('requirements')} />
      <FormError message={f.formError} />
      <Button title="Send request" busy={f.busy} disabled={fullyBooked} onPress={send} />
    </Screen>
  );
}
