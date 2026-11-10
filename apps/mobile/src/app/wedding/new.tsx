import { EventType, rupeesToPaisa, statusLabel } from '@mehfil/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button, c, DateField, Field, FormError, Screen, Text, useForm } from '@/components/ui';
import { api } from '@/lib/api';
export default function Page() {
  const f = useForm({ title: '', budget: '', guestCount: '', dateFrom: '' });
  const [types, setTypes] = useState<string[]>([]);
  return (
    <Screen>
      <Field label="Wedding name" placeholder="e.g. your names" {...f.bind('title')} />
      <DateField label="Main date" value={f.values.dateFrom} onChange={(v) => f.set('dateFrom', v)} />
      <Field label="Total budget (Rs.)" keyboardType="number-pad" {...f.bind('budget')} />
      <Field label="Guests" keyboardType="number-pad" {...f.bind('guestCount')} />
      <Text variant="bold">Functions</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{EventType.filter((t) => t !== 'OTHER').map((t) => { const on = types.includes(t); return <Pressable key={t} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => setTypes(on ? types.filter((x) => x !== t) : [...types, t])} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: on ? c.ruby : c.border, backgroundColor: on ? c.ruby : '#fff' }}><Text style={{ color: on ? '#fff' : c.text, fontSize: 13 }}>{statusLabel(t)}</Text></Pressable>; })}</View>
      <FormError message={f.formError} />
      <Button title="Create" busy={f.busy} onPress={() => f.submit(async () => { const v = f.values; const w = await api('/weddings', { body: { title: v.title, budget: v.budget ? rupeesToPaisa(Number(v.budget)) : null, guestCount: v.guestCount ? Number(v.guestCount) : null, dateFrom: v.dateFrom || null, eventTypes: types } }); router.replace(`/wedding/${w.id}`); })} />
    </Screen>
  );
}
