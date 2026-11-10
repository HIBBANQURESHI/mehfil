import { router } from 'expo-router';
import { useState } from 'react';
import { Button, Field, FormError, Screen, Text, useForm } from '@/components/ui';
import { api } from '@/lib/api';

export default function Forgot() {
  const f = useForm({ identifier: '', code: '', password: '' });
  const [step, setStep] = useState(1);
  return (
    <Screen>
      {step === 1 ? <><Text variant="muted">Enter your phone or email and we will send a code.</Text><Field label="Phone or email" autoCapitalize="none" {...f.bind('identifier')} /></> : <><Text variant="muted">If that account exists, a code has been sent.</Text><Field label="Code" keyboardType="number-pad" maxLength={6} {...f.bind('code')} /><Field label="New password" secureTextEntry {...f.bind('password')} /></>}
      <FormError message={f.formError} />
      <Button title={step === 1 ? 'Send code' : 'Update password'} busy={f.busy} onPress={() => f.submit(async () => { if (step === 1) { await api('/auth/forgot-password', { body: { identifier: f.values.identifier } }); setStep(2); } else { await api('/auth/reset-password', { body: f.values }); router.replace('/login'); } })} />
    </Screen>
  );
}
