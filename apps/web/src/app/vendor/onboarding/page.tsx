'use client';
import { DocumentType, statusLabel } from '@mehfil/shared';
import { Check, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ImageUpload } from '@/components/uploads';
import { Button, Card, ErrorBox, FormError, Input, LinkButton, PageHeader, Select, Spinner, Status, Tabs, Textarea, useForm, useToast } from '@/components/ui';
import { api, useApi } from '@/lib/api';

const blank = { businessName: '', primaryCategoryId: '', description: '', yearEstablished: '', employees: '', website: '', instagram: '', facebook: '', phone: '', whatsapp: '', email: '', cityId: '', areaId: '', address: '', workingHours: '', serviceAreas: '' };

export default function Onboarding() {
  const { data: v, error, isLoading, mutate } = useApi<any>('/vendor/me');
  const { data: cats } = useApi<any[]>('/categories');
  const { data: cities } = useApi<any[]>('/cities');
  const f = useForm(blank);
  const pay = useForm({ bankName: '', accountTitle: '', iban: '' });
  const [tab, setTab] = useState('business');
  const [docType, setDocType] = useState<string>('CNIC_FRONT');
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const { setValues } = f;
  const loadedId = v?.id;
  useEffect(() => {
    if (!v) return;
    setValues({ businessName: v.businessName ?? '', primaryCategoryId: v.primaryCategoryId ?? '', description: v.description ?? '', yearEstablished: v.yearEstablished?.toString() ?? '', employees: v.employees?.toString() ?? '', website: v.website ?? '', instagram: v.instagram ?? '', facebook: v.facebook ?? '', phone: v.phone ?? '', whatsapp: v.whatsapp ?? '', email: v.email ?? '', cityId: v.cityId ?? '', areaId: v.areaId ?? '', address: v.address ?? '', workingHours: v.workingHours ?? '', serviceAreas: (v.serviceAreas ?? []).join(', ') });
    // Loaded once per vendor, so a background refresh never overwrites what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedId, setValues]);
  if (error) return <ErrorBox error={error} retry={() => mutate()} />;
  if (isLoading || !v) return <Spinner />;
  const locked = ['SUBMITTED', 'UNDER_REVIEW'].includes(v.status);
  const n = (s: string) => (s ? Number(s) : null);
  const save = () => f.submit(async () => {
    const x = f.values;
    await api('/vendor/me', { method: 'PATCH', body: { businessName: x.businessName, primaryCategoryId: x.primaryCategoryId || null, description: x.description || null, yearEstablished: n(x.yearEstablished), employees: n(x.employees), website: x.website || null, instagram: x.instagram || null, facebook: x.facebook || null, phone: x.phone || null, whatsapp: x.whatsapp || null, email: x.email || null, cityId: x.cityId || null, areaId: x.areaId || null, address: x.address || null, workingHours: x.workingHours || null, serviceAreas: x.serviceAreas.split(',').map((s) => s.trim()).filter(Boolean) } });
    toast('Saved'); mutate();
  });
  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try { const form = new FormData(); form.append('type', docType); form.append('file', file); await api('/vendor/documents', { form }); toast('Uploaded'); mutate(); }
    catch (e) { toast((e as Error).message, true); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const setImage = async (key: 'logoUrl' | 'coverUrl', url: string) => { await api('/vendor/me', { method: 'PATCH', body: { businessName: v.businessName, [key]: url } }); mutate(); };
  const c = v.checklist;
  const steps: [string, boolean, string][] = [['Business information', c.businessInfo, 'business'], ['Location', c.location, 'location'], ['CNIC front and back', c.documents, 'documents'], ['A listing with a photo', c.listing, 'listing'], ['Logo', c.portfolio, 'portfolio'], ['Payout details', c.payout, 'payout']];
  const city = cities?.find((x) => x.id === f.values.cityId);
  const saveBar = !locked && <div className="mt-4"><FormError message={f.formError} /><Button className="mt-2" busy={f.busy} onClick={save}>Save</Button></div>;
  return (
    <>
      <PageHeader title="Business profile" sub={`Status: ${statusLabel(v.status)}`} />
      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div>
          <Tabs value={tab} onChange={setTab} tabs={[{ label: 'Business', value: 'business' }, { label: 'Location', value: 'location' }, { label: 'Documents', value: 'documents' }, { label: 'Listing', value: 'listing' }, { label: 'Portfolio', value: 'portfolio' }, { label: 'Payout', value: 'payout' }]} />
          {tab === 'business' && <Card><fieldset disabled={locked} className="grid gap-3 sm:grid-cols-2"><Input label="Business name" className="sm:col-span-2" {...f.bind('businessName')} /><Select label="Main category" {...f.bind('primaryCategoryId')}><option value="">Choose</option>{cats?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select><Input label="Year established (optional)" type="number" {...f.bind('yearEstablished')} /><Textarea label="Describe your business" className="sm:col-span-2" {...f.bind('description')} /><Input label="Business phone" placeholder="03XXXXXXXXX" {...f.bind('phone')} /><Input label="WhatsApp (optional)" {...f.bind('whatsapp')} /><Input label="Business email (optional)" type="email" {...f.bind('email')} /><Input label="Employees (optional)" type="number" {...f.bind('employees')} /><Input label="Website (optional)" placeholder="https://" {...f.bind('website')} /><Input label="Instagram (optional)" {...f.bind('instagram')} /><Input label="Facebook (optional)" {...f.bind('facebook')} /><Input label="Working hours (optional)" {...f.bind('workingHours')} /></fieldset>{saveBar}</Card>}
          {tab === 'location' && <Card><fieldset disabled={locked} className="grid gap-3 sm:grid-cols-2"><Select label="City" {...f.bind('cityId')}><option value="">Choose</option>{cities?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select><Select label="Area" {...f.bind('areaId')}><option value="">Choose</option>{city?.areas.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select><Input label="Full address" className="sm:col-span-2" {...f.bind('address')} /><Input label="Service areas, separated by commas" className="sm:col-span-2" {...f.bind('serviceAreas')} /></fieldset>{saveBar}</Card>}
          {tab === 'documents' && <Card><p className="mb-4 text-sm text-muted">Only authorised Mehfil staff can open these, and each view is logged. PDF, JPG or PNG up to 10 MB.</p>{!locked && <div className="flex flex-wrap items-end gap-3"><Select label="Document type" value={docType} onChange={(e) => setDocType(e.target.value)}>{DocumentType.map((t) => <option key={t} value={t}>{statusLabel(t)}</option>)}</Select><input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" aria-label="Choose document" onChange={(e) => upload(e.target.files?.[0])} /><Button variant="secondary" busy={busy} onClick={() => fileRef.current?.click()}>Choose file</Button></div>}<ul className="mt-4 divide-y divide-line">{v.documents.map((d: any) => <li key={d.id} className="flex items-center justify-between gap-3 py-3 text-sm"><span className="min-w-0"><span className="block font-medium">{statusLabel(d.type)}</span><span className="block truncate text-xs text-muted">{d.filename}</span>{d.reviewNote && <span className="text-xs text-bad">{d.reviewNote}</span>}</span><span className="flex items-center gap-3"><Status value={d.reviewStatus} />{d.reviewStatus !== 'APPROVED' && !locked && <button aria-label="Remove document" onClick={async () => { await api(`/vendor/documents/${d.id}`, { method: 'DELETE' }); mutate(); }}><Trash2 className="size-4 text-muted" /></button>}</span></li>)}</ul></Card>}
          {tab === 'listing' && <Card><p className="text-sm">{v.listings.length ? `You have ${v.listings.length} listing(s).` : 'Add the hall, menu or service customers will book.'}</p><ul className="mt-3 divide-y divide-line">{v.listings.map((l: any) => <li key={l.id}><Link href={`/vendor/listings/${l.id}`} className="flex items-center justify-between py-3 text-sm"><span>{l.title} <span className="text-xs text-muted">({l._count.media} photos, {l._count.packages} packages)</span></span><Status value={l.status} /></Link></li>)}</ul><LinkButton href="/vendor/listings/new" className="mt-3">Add listing</LinkButton></Card>}
          {tab === 'portfolio' && <Card><div className="grid gap-5 sm:grid-cols-2"><div><p className="mb-2 text-sm font-medium">Logo</p>{v.logoUrl && <img src={v.logoUrl} alt="Logo" className="mb-2 size-24 rounded-xl object-cover" />}<ImageUpload label="Upload logo" onUploaded={(u) => setImage('logoUrl', u)} /></div><div><p className="mb-2 text-sm font-medium">Cover photo</p>{v.coverUrl && <img src={v.coverUrl} alt="Cover" className="mb-2 h-24 w-full rounded-xl object-cover" />}<ImageUpload label="Upload cover" onUploaded={(u) => setImage('coverUrl', u)} /></div></div></Card>}
          {tab === 'payout' && <Card>{v.ibanMasked && <p className="mb-3 rounded-lg bg-blush p-3 text-sm">On file: {v.bankName}, {v.accountTitle}, <span className="tnum">{v.ibanMasked}</span></p>}<div className="grid max-w-md gap-3"><Input label="Bank name" {...pay.bind('bankName')} /><Input label="Account title" {...pay.bind('accountTitle')} /><Input label="IBAN" placeholder="PK00XXXX0000000000000000" {...pay.bind('iban')} /><FormError message={pay.formError} /><Button busy={pay.busy} onClick={() => pay.submit(async () => { await api('/vendor/payout-details', { method: 'PATCH', body: pay.values }); toast('Payout details saved'); pay.setValues({ bankName: '', accountTitle: '', iban: '' }); mutate(); })}>Save payout details</Button></div></Card>}
        </div>
        <aside className="space-y-4">
          <Card title="Your application"><ul className="space-y-2 text-sm">{steps.map(([label, done, target]) => <li key={label}><button onClick={() => setTab(target)} className="flex items-center gap-2 text-left"><span className={`grid size-5 place-items-center rounded-full ${done ? 'bg-good text-white' : 'border border-line'}`}>{done && <Check className="size-3" aria-label="Done" />}</span>{label}</button></li>)}</ul>
            {['DRAFT', 'CHANGES_REQUIRED', 'REJECTED'].includes(v.status) && <div className="mt-4 space-y-3"><label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 accent-[#8F3048]" checked={terms} onChange={(e) => setTerms(e.target.checked)} /><span>I confirm these details are true and accept the <Link className="text-ruby underline" href="/terms">vendor terms</Link>.</span></label><Button className="w-full" disabled={!terms} busy={busy} onClick={async () => { setBusy(true); try { await api('/vendor/submit', { body: { acceptTerms: true } }); toast('Application submitted'); window.location.href = '/vendor'; } catch (e) { toast((e as Error).message, true); } finally { setBusy(false); } }}>Submit application</Button></div>}
          </Card>
        </aside>
      </div>
    </>
  );
}
