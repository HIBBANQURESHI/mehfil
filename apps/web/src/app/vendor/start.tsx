'use client';
import { AuthShell } from '@/components/auth-shell';
import { Button, FormError, Input, useForm } from '@/components/ui';
import { api } from '@/lib/api';
export function StartVendor({ name }: { name: string }) {
  const f = useForm({ businessName: '' });
  return <AuthShell title={`Welcome, ${name}`} sub="What is your business called?"><div className="space-y-3"><Input label="Business name" {...f.bind('businessName')} /><FormError message={f.formError} /><Button className="w-full" busy={f.busy} onClick={() => f.submit(async () => { await api('/vendor/start', { body: f.values }); window.location.href = '/vendor/onboarding'; })}>Continue</Button></div></AuthShell>;
}
