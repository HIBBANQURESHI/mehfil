'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AuthShell } from '@/components/auth-shell';
import { Button, ErrorBox, FormError, Input, Spinner, useForm } from '@/components/ui';
import { api, useApi } from '@/lib/api';

function Form() {
  const token = useSearchParams().get('token') ?? '';
  const { data, error, isLoading } = useApi(token ? `/auth/invites?token=${encodeURIComponent(token)}` : null);
  const f = useForm({ name: '', password: '', phone: '' });
  const [done, setDone] = useState<string | null>(null);
  if (!token) return <ErrorBox error={new Error('This invitation link is incomplete.')} />;
  if (error) return <ErrorBox error={error} />;
  if (isLoading || !data) return <Spinner />;
  if (done) return <div><p className="text-sm">You have joined the team.</p><a className="mt-4 block text-sm text-ruby" href={done === 'ADMIN' ? '/admin/login' : '/login'}>Go to sign in</a></div>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Invitation for {data.email}</p>
      {!data.existingAccount && <Input label="Full name" {...f.bind('name')} />}
      {!data.existingAccount && data.kind === 'VENDOR' && <Input label="Mobile number" inputMode="tel" {...f.bind('phone')} />}
      <Input label={data.existingAccount ? 'Your existing Mehfil password' : 'Create a password'} type="password" {...f.bind('password')} />
      <FormError message={f.formError} />
      <Button className="w-full" busy={f.busy} onClick={() => f.submit(async () => { const r = await api('/auth/invites/accept', { body: { token, name: f.values.name || 'Team member', password: f.values.password, phone: f.values.phone || undefined } }); setDone(r.kind); })}>Accept invitation</Button>
    </div>
  );
}
export default function Invite() { return <AuthShell title="Join the team"><Suspense><Form /></Suspense></AuthShell>; }
