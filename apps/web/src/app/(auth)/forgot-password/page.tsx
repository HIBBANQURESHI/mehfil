'use client';
import { useState } from 'react';
import { AuthShell } from '@/components/auth-shell';
import { Button, FormError, Input, useForm } from '@/components/ui';
import { api } from '@/lib/api';
export default function Forgot() {
  const f = useForm({ identifier: '', code: '', password: '' });
  const [step, setStep] = useState<1 | 2 | 3>(1);
  if (step === 3) return <AuthShell title="Password updated"><p className="text-sm">You can now sign in with your new password.</p><a className="mt-4 block text-sm text-ruby" href="/login">Go to sign in</a></AuthShell>;
  return (
    <AuthShell title="Reset your password" sub={step === 1 ? 'Enter your phone or email and we will send a code.' : 'If that account exists, a code has been sent.'}>
      <div className="space-y-3">
        {step === 1 ? <Input label="Phone or email" {...f.bind('identifier')} /> : <><Input label="6-digit code" inputMode="numeric" maxLength={6} {...f.bind('code')} /><Input label="New password" type="password" autoComplete="new-password" {...f.bind('password')} /></>}
        <FormError message={f.formError} />
        <Button className="w-full" busy={f.busy} onClick={() => f.submit(async () => { if (step === 1) { await api('/auth/forgot-password', { body: { identifier: f.values.identifier } }); setStep(2); } else { await api('/auth/reset-password', { body: f.values }); setStep(3); } })}>{step === 1 ? 'Send code' : 'Update password'}</Button>
      </div>
    </AuthShell>
  );
}
