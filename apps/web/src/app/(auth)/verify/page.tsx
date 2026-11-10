'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AuthShell } from '@/components/auth-shell';
import { Button, FormError, Input, useForm } from '@/components/ui';
import { api, session } from '@/lib/api';
import { safeNext } from '@/lib/session';

function Form() {
  const params = useSearchParams();
  const phone = params.get('phone') ?? '';
  const f = useForm({ code: '' });
  const [note, setNote] = useState<string | null>(null);
  const go = (e: React.FormEvent) => { e.preventDefault(); f.submit(async () => { await session('verify', { phone, code: f.values.code }); window.location.href = safeNext(params.get('next'), '/after-login'); }); };
  return (
    <form onSubmit={go} className="space-y-3">
      <Input label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} {...f.bind('code')} />
      <FormError message={f.formError} />
      {note && <p className="text-sm text-good">{note}</p>}
      <Button className="w-full" busy={f.busy}>Verify</Button>
      <Button type="button" variant="ghost" className="w-full" onClick={() => f.submit(async () => { await api('/auth/resend-otp', { body: { phone } }); setNote('A new code is on its way.'); })}>Send a new code</Button>
    </form>
  );
}

function Shell() { const phone = useSearchParams().get('phone'); return <AuthShell title="Verify your number" sub={`We sent a code to ${phone}`}><Form /></AuthShell>; }
export default function Verify() { return <Suspense><Shell /></Suspense>; }
