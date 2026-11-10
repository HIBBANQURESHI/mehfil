'use client';
import { formatBps } from '@mehfil/shared';
import { useState } from 'react';
import { Button, Card, ErrorBox, FormError, Input, Modal, PageHeader, Select, Spinner, Textarea, useForm, useToast } from '@/components/ui';
import { api, useApi } from '@/lib/api';

function CategoryModal({ c, onClose, onDone }: { c: any | null; onClose: () => void; onDone: () => void }) {
  const f = useForm({ name: c?.name ?? '', description: c?.description ?? '', iconKey: c?.iconKey ?? '', imageUrl: c?.imageUrl ?? '', availabilityMode: c?.availabilityMode ?? 'CAPACITY', commission: c?.commissionBps != null ? String(c.commissionBps / 100) : '', amenities: (c?.amenityOptions ?? []).join('\n'), sortOrder: String(c?.sortOrder ?? 0), active: c?.active === false ? 'no' : 'yes' });
  const save = () => f.submit(async () => { const v = f.values; const body = { name: v.name, description: v.description || null, iconKey: v.iconKey || null, imageUrl: v.imageUrl || null, availabilityMode: v.availabilityMode, commissionBps: v.commission === '' ? null : Math.round(Number(v.commission) * 100), amenityOptions: v.amenities.split('\n').map((s: string) => s.trim()).filter(Boolean), sortOrder: Number(v.sortOrder) || 0, active: v.active === 'yes' }; await api(c ? `/admin/categories/${c.id}` : '/admin/categories', { method: c ? 'PATCH' : 'POST', body }); onDone(); });
  return <Modal title={c ? `Edit ${c.name}` : 'New category'} onClose={onClose}><div className="space-y-3"><Input label="Name" {...f.bind('name')} /><Input label="Commission (%)" type="number" min={0} max={100} step="0.01" hint="Applies to new bookings. Existing bookings keep their agreed rate. Empty blocks quotations in this category." {...f.bind('commission')} /><Select label="Availability" hint="" {...f.bind('availabilityMode')}><option value="EXCLUSIVE">One booking per slot (halls)</option><option value="CAPACITY">Several bookings per slot (caterers, decorators)</option></Select><Textarea label="Facilities (one per line)" {...f.bind('amenities')} /><Input label="Icon key" {...f.bind('iconKey')} /><Input label="Sort order" type="number" {...f.bind('sortOrder')} /><Select label="Visible" {...f.bind('active')}><option value="yes">Yes</option><option value="no">No</option></Select><FormError message={f.formError} /><Button className="w-full" busy={f.busy} onClick={save}>Save</Button></div></Modal>;
}

export default function Page() {
  const cats = useApi<any[]>('/admin/categories');
  const cities = useApi<any[]>('/admin/cities');
  const [edit, setEdit] = useState<any | null | undefined>(undefined);
  const city = useForm({ name: '' });
  const [area, setArea] = useState<Record<string, string>>({});
  const toast = useToast();
  if (cats.error || cities.error) return <ErrorBox error={cats.error ?? cities.error} />;
  if (!cats.data || !cities.data) return <Spinner />;
  return (
    <>
      <PageHeader title="Categories and cities" action={<Button onClick={() => setEdit(null)}>New category</Button>} />
      <div className="overflow-x-auto rounded-xl border border-line bg-white"><table className="w-full min-w-[560px] text-left text-sm"><thead><tr className="border-b border-line text-xs text-muted"><th className="p-4 font-medium">Category</th><th className="font-medium">Availability</th><th className="text-right font-medium">Commission</th><th className="font-medium" /><th /></tr></thead><tbody>{cats.data.map((c) => <tr key={c.id} className="border-b border-line last:border-0"><td className="p-4 font-medium">{c.name}{!c.active && <span className="ml-2 text-xs text-muted">hidden</span>}</td><td>{c.availabilityMode === 'EXCLUSIVE' ? 'One per slot' : 'Several per slot'}</td><td className="tnum text-right">{c.commissionBps === null ? <span className="text-bad">Not set</span> : formatBps(c.commissionBps)}</td><td /><td className="p-3 text-right"><Button variant="outline" onClick={() => setEdit(c)}>Edit</Button></td></tr>)}</tbody></table></div>
      <Card title="Cities and areas" className="mt-5"><div className="space-y-4">{cities.data.map((c) => <div key={c.id}><p className="font-medium">{c.name}</p><p className="mt-1 text-sm text-muted">{c.areas.map((a: any) => a.name).join(', ') || 'No areas'}</p><div className="mt-2 flex max-w-sm gap-2"><Input className="flex-1" aria-label={`New area in ${c.name}`} placeholder="Add area" value={area[c.id] ?? ''} onChange={(e) => setArea({ ...area, [c.id]: e.target.value })} /><Button variant="secondary" disabled={!area[c.id]?.trim()} onClick={async () => { try { await api(`/admin/cities/${c.id}/areas`, { body: { name: area[c.id] } }); setArea({ ...area, [c.id]: '' }); cities.mutate(); } catch (e) { toast((e as Error).message, true); } }}>Add</Button></div></div>)}</div><div className="mt-5 flex max-w-sm items-end gap-2 border-t border-line pt-4"><Input className="flex-1" label="New city" {...city.bind('name')} /><Button busy={city.busy} disabled={!city.values.name.trim()} onClick={() => city.submit(async () => { await api('/admin/cities', { body: { name: city.values.name } }); city.set('name', ''); cities.mutate(); })}>Add city</Button></div></Card>
      {edit !== undefined && <CategoryModal c={edit} onClose={() => setEdit(undefined)} onDone={() => { setEdit(undefined); cats.mutate(); }} />}
    </>
  );
}
