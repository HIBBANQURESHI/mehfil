'use client';
import { formatPKR, rupeesToPaisa } from '@mehfil/shared';
import { Trash2 } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { ListingForm } from '@/components/listing-form';
import { ImageUpload } from '@/components/uploads';
import { Button, Card, ErrorBox, FormError, Input, PageHeader, Select, Spinner, Status, Textarea, useForm, useToast } from '@/components/ui';
import { api, useApi } from '@/lib/api';

export default function EditListing() {
  const { id } = useParams<{ id: string }>();
  const { data: l, error, isLoading, mutate } = useApi<any>(`/vendor/listings/${id}`);
  const p = useForm({ name: '', description: '', price: '', priceUnit: 'FLAT', inclusions: '', exclusions: '' });
  const a = useForm({ name: '', price: '' });
  const v = useForm({ url: '' });
  const toast = useToast();
  const router = useRouter();
  if (error) return <ErrorBox error={error} retry={() => mutate()} />;
  if (isLoading || !l) return <Spinner />;
  const act = async (action: string) => { try { await api(`/vendor/listings/${id}/state/${action}`, { method: 'POST', body: {} }); if (action === 'archive') router.push('/vendor/listings'); else mutate(); } catch (e) { toast((e as Error).message, true); } };
  const del = async (path: string) => { await api(path, { method: 'DELETE' }); mutate(); };
  const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
  return (
    <>
      <PageHeader title={l.title} action={<div className="flex items-center gap-2"><Status value={l.status} />{['DRAFT', 'REJECTED'].includes(l.status) && <Button onClick={() => act('submit')}>Submit for review</Button>}{l.status === 'PUBLISHED' && <Button variant="outline" onClick={() => act('pause')}>Pause</Button>}{l.status === 'PAUSED' && <Button onClick={() => act('resume')}>Resume</Button>}<Button variant="danger" onClick={() => act('archive')}>Archive</Button></div>} />
      {l.statusReason && <p className="mb-4 rounded-lg bg-bad/8 p-3 text-sm text-bad">{l.statusReason}</p>}
      <div className="space-y-5">
        <Card title="Photos and videos"><div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{l.media.filter((m: any) => m.type === 'IMAGE').map((m: any) => <div key={m.id} className="group relative aspect-square overflow-hidden rounded-lg bg-blush"><img src={m.url} alt="" className="size-full object-cover" /><button aria-label="Remove photo" onClick={() => del(`/vendor/listings/${id}/media/${m.id}`)} className="absolute right-1 top-1 rounded-full bg-white/90 p-1"><Trash2 className="size-3.5 text-bad" /></button></div>)}</div><div className="mt-3"><ImageUpload multiple label="Add photos" onUploaded={async (url) => { await api(`/vendor/listings/${id}/media`, { body: { url } }); mutate(); }} /></div><p className="mt-2 text-xs text-muted">Use photos of your own work, and only with permission from the people shown.</p><div className="mt-4 flex items-end gap-2"><Input className="flex-1" label="Video link" placeholder="https://" {...v.bind('url')} /><Button variant="secondary" busy={v.busy} onClick={() => v.submit(async () => { await api(`/vendor/listings/${id}/media`, { body: { url: v.values.url, type: 'VIDEO' } }); v.set('url', ''); mutate(); })}>Add</Button></div><ul className="mt-2 text-sm">{l.media.filter((m: any) => m.type === 'VIDEO').map((m: any) => <li key={m.id} className="flex justify-between py-1"><span className="truncate">{m.url}</span><button aria-label="Remove video" onClick={() => del(`/vendor/listings/${id}/media/${m.id}`)}><Trash2 className="size-4 text-muted" /></button></li>)}</ul></Card>
        <Card title="Packages"><ul className="divide-y divide-line">{l.packages.map((x: any) => <li key={x.id} className="flex justify-between gap-3 py-3 text-sm"><span><span className="block font-medium">{x.name}</span><span className="text-xs text-muted">{x.inclusions.join(', ')}</span></span><span className="flex items-center gap-3"><span className="tnum">{formatPKR(x.price)}{x.priceUnit === 'PER_PERSON' ? ' /person' : ''}</span><button aria-label="Remove package" onClick={() => del(`/vendor/listings/${id}/packages/${x.id}`)}><Trash2 className="size-4 text-muted" /></button></span></li>)}</ul><div className="mt-3 grid gap-3 sm:grid-cols-3"><Input label="Package name" {...p.bind('name')} /><Input label="Price (Rs.)" type="number" min={0} {...p.bind('price')} /><Select label="Price is" {...p.bind('priceUnit')}><option value="FLAT">Per event</option><option value="PER_PERSON">Per person</option></Select><Textarea label="Description" rows={3} {...p.bind('description')} /><Textarea label="Included (one per line)" rows={3} {...p.bind('inclusions')} /><Textarea label="Not included (one per line)" rows={3} {...p.bind('exclusions')} /></div><div className="mt-2"><FormError message={p.formError} /></div><Button variant="secondary" className="mt-2" busy={p.busy} onClick={() => p.submit(async () => { const x = p.values; await api(`/vendor/listings/${id}/packages`, { body: { name: x.name, description: x.description || null, price: rupeesToPaisa(Number(x.price || 0)), priceUnit: x.priceUnit, inclusions: lines(x.inclusions), exclusions: lines(x.exclusions) } }); p.setValues({ name: '', description: '', price: '', priceUnit: 'FLAT', inclusions: '', exclusions: '' }); mutate(); })}>Add package</Button></Card>
        <Card title="Add-ons"><ul className="divide-y divide-line">{l.addOns.map((x: any) => <li key={x.id} className="flex justify-between py-2 text-sm"><span>{x.name}</span><span className="flex items-center gap-3"><span className="tnum">{formatPKR(x.price)}</span><button aria-label="Remove add-on" onClick={() => del(`/vendor/listings/${id}/add-ons/${x.id}`)}><Trash2 className="size-4 text-muted" /></button></span></li>)}</ul><div className="mt-2 flex items-end gap-2"><Input className="flex-1" label="Name" {...a.bind('name')} /><Input label="Price (Rs.)" type="number" min={0} {...a.bind('price')} /><Button variant="secondary" busy={a.busy} onClick={() => a.submit(async () => { await api(`/vendor/listings/${id}/add-ons`, { body: { name: a.values.name, price: rupeesToPaisa(Number(a.values.price || 0)) } }); a.setValues({ name: '', price: '' }); mutate(); })}>Add</Button></div></Card>
        <ListingForm key={l.updatedAt} listing={l} onSaved={() => mutate()} />
      </div>
    </>
  );
}
