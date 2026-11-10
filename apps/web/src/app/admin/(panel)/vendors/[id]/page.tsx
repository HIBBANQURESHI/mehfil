'use client';
import { formatBps, formatPKR, statusLabel } from '@mehfil/shared';
import { ExternalLink } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, ErrorBox, FormError, Input, PageHeader, ReasonAction, Spinner, Status, useForm, useToast } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { fmtDate } from '@/lib/format';

export default function Page() {
  const { id } = useParams<{ id: string }>();
  const { data: v, error, isLoading, mutate } = useApi<any>(`/admin/vendors/${id}`);
  const toast = useToast();
  const [featured, setFeatured] = useState('');
  const c = useForm({ percent: '', reason: '' });
  if (error) return <ErrorBox error={error} retry={() => mutate()} />;
  if (isLoading || !v) return <Spinner />;
  const decide = (decision: string) => async (reason: string) => { await api(`/admin/vendors/${id}/decision`, { body: { decision, reason: reason || null } }); mutate(); };
  const review = async (docId: string, status: string) => { try { await api(`/admin/vendor-documents/${docId}/review`, { body: { status } }); mutate(); } catch (e) { toast((e as Error).message, true); } };
  const inReview = ['SUBMITTED', 'UNDER_REVIEW'].includes(v.status);
  const facts: [string, React.ReactNode][] = [['Category', v.primaryCategory?.name], ['Phone', v.phone], ['WhatsApp', v.whatsapp], ['Email', v.email], ['City', v.city?.name], ['Area', v.area?.name], ['Address', v.address], ['Established', v.yearEstablished], ['Employees', v.employees], ['Website', v.website], ['Instagram', v.instagram], ['Service areas', v.serviceAreas.join(', ')], ['Bank', v.bankName && `${v.bankName}, ${v.accountTitle}, ${v.ibanMasked}`], ['Terms accepted', v.termsAcceptedAt && fmtDate(v.termsAcceptedAt)]];
  return (
    <>
      <PageHeader title={v.businessName} sub={`Submitted ${fmtDate(v.submittedAt)}`} action={<div className="flex flex-wrap items-center gap-2"><Status value={v.status} />{inReview && <><ReasonAction label="Approve" title="Approve this vendor?" optional variant="secondary" onSubmit={decide('APPROVE')} /><ReasonAction label="Request changes" onSubmit={decide('REQUEST_CHANGES')} placeholder="What must they fix?" /><ReasonAction label="Reject" variant="danger" onSubmit={decide('REJECT')} /></>}{v.status === 'APPROVED' && <ReasonAction label="Suspend" variant="danger" onSubmit={decide('SUSPEND')} />}{v.status === 'SUSPENDED' && <ReasonAction label="Reactivate" optional onSubmit={decide('REACTIVATE')} />}</div>} />
      {v.statusReason && <p className="mb-4 rounded-lg bg-gold/20 p-3 text-sm">{v.statusReason}</p>}
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card title="Identity and documents"><p className="mb-3 text-xs text-muted">Each time a document is opened it is recorded in the audit log.</p>{!v.documents.length ? <p className="text-sm text-muted">No documents uploaded.</p> : <ul className="divide-y divide-line">{v.documents.map((d: any) => <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><span><span className="block font-medium">{statusLabel(d.type)}</span><a className="inline-flex items-center gap-1 text-xs text-ruby" target="_blank" rel="noopener noreferrer" href={`/api/proxy/v1/admin/vendor-documents/${d.id}/file`}>Open securely <ExternalLink className="size-3" aria-hidden /></a></span><span className="flex items-center gap-2"><Status value={d.reviewStatus} />{d.reviewStatus !== 'APPROVED' && <Button variant="secondary" onClick={() => review(d.id, 'APPROVED')}>Approve</Button>}{d.reviewStatus !== 'REJECTED' && <Button variant="outline" onClick={() => review(d.id, 'REJECTED')}>Reject</Button>}</span></li>)}</ul>}</Card>
          <Card title="Listings"><ul className="divide-y divide-line">{v.listings.map((l: any) => <li key={l.id} className="flex items-center justify-between gap-3 py-3 text-sm"><span><span className="block font-medium">{l.title}</span><span className="tnum text-xs text-muted">{l.category.name} · from {formatPKR(l.startingPrice)} · {l._count.media} photos · {l._count.packages} packages</span></span><Status value={l.status} /></li>)}</ul></Card>
          <Card title="About"><p className="whitespace-pre-line text-sm">{v.description ?? '—'}</p>{v.logoUrl && <img src={v.logoUrl} alt="Logo" className="mt-3 size-20 rounded-xl object-cover" />}</Card>
        </div>
        <aside className="space-y-5">
          <Card title="Details"><dl className="space-y-2 text-sm">{facts.filter(([, x]) => x).map(([k, x]) => <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="break-words">{x}</dd></div>)}</dl></Card>
          <Card title="Team"><ul className="space-y-2 text-sm">{v.members.map((m: any) => <li key={m.id}>{m.user.name} <span className="text-xs text-muted">({statusLabel(m.role)})</span></li>)}</ul></Card>
          <Card title="Featured placement"><p className="mb-2 text-sm text-muted">{v.featuredUntil ? `Featured until ${fmtDate(v.featuredUntil)}` : 'Not featured'}</p><div className="flex items-end gap-2"><Input className="flex-1" aria-label="Featured until" type="date" value={featured} onChange={(e) => setFeatured(e.target.value)} /><Button variant="secondary" disabled={!featured} onClick={async () => { await api(`/admin/vendors/${id}/feature`, { method: 'PATCH', body: { featuredUntil: featured } }); mutate(); }}>Set</Button></div>{v.featuredUntil && <Button variant="ghost" className="mt-1" onClick={async () => { await api(`/admin/vendors/${id}/feature`, { method: 'PATCH', body: { featuredUntil: null } }); mutate(); }}>Remove</Button>}</Card>
          <Card title="Commission override"><p className="mb-2 text-sm text-muted">{v.commissionBpsOverride !== null ? `Currently ${formatBps(v.commissionBpsOverride)}` : 'Uses the category rate'}</p><div className="space-y-2"><Input label="Rate (%), empty to clear" type="number" min={0} max={100} step="0.01" {...c.bind('percent')} /><Input label="Reason" {...c.bind('reason')} /><FormError message={c.formError} /><Button variant="secondary" busy={c.busy} onClick={() => c.submit(async () => { await api(`/admin/vendors/${id}/commission`, { method: 'PATCH', body: { commissionBpsOverride: c.values.percent === '' ? null : Math.round(Number(c.values.percent) * 100), reason: c.values.reason } }); c.setValues({ percent: '', reason: '' }); toast('Saved. Applies to new bookings only.'); mutate(); })}>Save</Button></div></Card>
        </aside>
      </div>
    </>
  );
}
