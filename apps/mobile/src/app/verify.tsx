import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Button, Field, FormError, Screen, Text, useForm } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function Verify() {
  const { phone, next } = useLocalSearchParams<{ phone: string; next?: string }>();
  const { signIn } = useAuth();
  const f = useForm({ code: '' });
  const [note, setNote] = useState<string | null>(null);
  return (
    <Screen>
      <Text variant="muted">We sent a 6-digit code to {phone}.</Text>
      <Field label="Code" keyboardType="number-pad" autoComplete="sms-otp" maxLength={6} {...f.bind('code')} />
      <FormError message={f.formError} />
      {note && <Text variant="muted">{note}</Text>}
      <Button title="Verify" busy={f.busy} onPress={() => f.submit(async () => { await signIn(await api('/auth/verify-phone', { body: { phone, code: f.values.code } })); router.dismissAll(); if (next) router.replace(next as never); else router.replace('/'); })} />
      <Button title="Send a new code" variant="outline" onPress={() => f.submit(async () => { await api('/auth/resend-otp', { body: { phone } }); setNote('A new code is on its way.'); })} />
    </Screen>
  );
}
