'use client';
import { statusLabel } from '@mehfil/shared';
import { Button, Card, ErrorBox, FormError, Input, PageHeader, Select, Spinner, Status, useForm, useToast } from '@/components/ui';
import { api, useApi } from '@/lib/api';
export default function Page() {
  const { data, error, mutate } = useApi<any>('/vendor/team');
  const f = useForm({ email: '', role: 'MANAGER' });
  const toast = useToast();
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Spinner />;
  return <><PageHeader title="Team" sub="Each person signs in with their own account." /><div className="space-y-5"><Card><ul className="divide-y divide-line">{data.members.filter((m: any) => m.active).map((m: any) => <li key={m.id} className="flex items-center justify-between gap-3 py-3 text-sm"><span><span className="block font-medium">{m.user.name}</span><span className="text-xs text-muted">{m.user.email ?? m.user.phone}</span></span><span className="flex items-center gap-3"><Status value={m.role} />{m.role !== 'OWNER' && <Button variant="danger" onClick={async () => { await api(`/vendor/team/${m.id}`, { method: 'DELETE' }); mutate(); }}>Remove</Button>}</span></li>)}{data.invites.map((i: any) => <li key={i.id} className="flex items-center justify-between py-3 text-sm"><span className="text-muted">{i.email} (invited)</span><Status value={i.vendorRole} /></li>)}</ul></Card><Card title="Invite someone"><div className="flex flex-wrap items-end gap-3"><Input className="min-w-56 flex-1" label="Email" type="email" {...f.bind('email')} /><Select label="Role" {...f.bind('role')}>{['MANAGER', 'SALES', 'FINANCE', 'COORDINATOR'].map((r) => <option key={r} value={r}>{statusLabel(r)}</option>)}</Select><Button busy={f.busy} onClick={() => f.submit(async () => { await api('/vendor/team/invite', { body: f.values }); toast('Invitation sent'); f.set('email', ''); mutate(); })}>Send invite</Button></div><div className="mt-2"><FormError message={f.formError} /></div></Card></div></>;
}
