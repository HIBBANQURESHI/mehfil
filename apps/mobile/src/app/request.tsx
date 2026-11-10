import { rupeesToPaisa } from '@mehfil/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, View } from 'react-native';
import { Button, Chips, DateField, Field, FormError, Screen, Text, useForm } from '@/components/ui';
import { api, useApi } from '@/lib/api';

export default function Request() {
  const { ids, packages } = useLocalSearchParams<{ ids: string; packages?: string }>();
  const pkgs: { label: string; value: string }[] = packages ? JSON.parse(packages) : [];
  const { data: weddings } = useApi<any[]>('/weddings');
  const f = useForm({ eventDate: '', slot: 'FULL_DAY', guestCount: '', budget: '', requirements: '', packageId: '', weddingId: '' });
  const listingIds = ids.split(',');
  const send = () => f.submit(async () => {
    const v = f.values;
    await api('/enquiries', { body: { listingIds, eventDate: v.eventDate, slot: v.slot, guestCount: Number(v.guestCount), requirements: v.requirements, budget: v.budget ? rupeesToPaisa(Number(v.budget)) : null, packageId: v.packageId || null, weddingId: v.weddingId || null } });
    Alert.alert('Request sent', 'You will be notified when quotations arrive.');
    router.back();
  });
  return (
    <Screen>
      {listingIds.length > 1 && <Text variant="muted">Sending to {listingIds.length} vendors. Each replies separately.</Text>}
      <DateField label="Event date" value={f.values.eventDate} onChange={(v) => f.set('eventDate', v)} error={f.errors.eventDate} minimumDate={new Date()} />
      <Text variant="bold">Time</Text><Chips scroll={false} value={f.values.slot} onChange={(v) => f.set('slot', v)} options={[{ label: 'Full day', value: 'FULL_DAY' }, { label: 'Lunch', value: 'LUNCH' }, { label: 'Dinner', value: 'DINNER' }]} />
      <Field label="Guests" keyboardType="number-pad" {...f.bind('guestCount')} />
      <Field label="Budget (Rs., optional)" keyboardType="number-pad" {...f.bind('budget')} />
      {pkgs.length > 0 && <View style={{ gap: 6 }}><Text variant="bold">Package</Text><Chips value={f.values.packageId} onChange={(v) => f.set('packageId', v)} options={[{ label: 'Not sure', value: '' }, ...pkgs]} /></View>}
      {!!weddings?.length && <View style={{ gap: 6 }}><Text variant="bold">Add to wedding</Text><Chips value={f.values.weddingId} onChange={(v) => f.set('weddingId', v)} options={[{ label: 'None', value: '' }, ...weddings.map((w) => ({ label: w.title, value: w.id }))]} /></View>}
      <Field label="What do you need?" multiline {...f.bind('requirements')} />
      <FormError message={f.formError} />
      <Button title="Send request" busy={f.busy} onPress={send} />
    </Screen>
  );
}
