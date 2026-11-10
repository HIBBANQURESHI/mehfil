'use client';
import { useEffect } from 'react';
import { SecuritySettings } from '@/components/shared-pages';
import { Button, Card, ErrorBox, FormError, Input, PageHeader, Spinner, useForm, useToast } from '@/components/ui';
import { api, useApi } from '@/lib/api';

export default function Settings() {
  const { data, error, mutate } = useApi<any>('/auth/me');
  const f = useForm({ name: '', email: '' });
  const toast = useToast();
  const { setValues } = f;
  useEffect(() => { if (data) setValues({ name: data.name, email: data.email ?? '' }); }, [data, setValues]);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Spinner />;
  return <><PageHeader title="Profile and settings" /><div className="space-y-5"><Card title="Personal information"><div className="max-w-sm space-y-3"><Input label="Full name" {...f.bind('name')} /><Input label="Email" type="email" {...f.bind('email')} /><Input label="Phone" value={data.phone ?? ''} disabled onChange={() => undefined} /><FormError message={f.formError} /><Button busy={f.busy} onClick={() => f.submit(async () => { await api('/auth/me', { method: 'PATCH', body: { name: f.values.name, email: f.values.email || null } }); toast('Saved'); mutate(); })}>Save</Button></div></Card><SecuritySettings allowDelete /></div></>;
}
