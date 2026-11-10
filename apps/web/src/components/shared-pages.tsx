'use client';
import { formatPKR, statusLabel, TicketCategory } from '@mehfil/shared';
import { Send, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api, Paged, session, useApi } from '@/lib/api';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { Button, Card, Empty, ErrorBox, FormError, Input, Modal, PageHeader, Select, Spinner, Status, Textarea, useForm, useToast } from './ui';

export function NotificationsPage() {
  const { data, error, isLoading, mutate } = useApi<Paged & { unread: number }>('/notifications?pageSize=50');
  const router = useRouter();
  if (error) return <ErrorBox error={error} retry={() => mutate()} />;
  if (isLoading || !data) return <Spinner />;
  const open = async (n: any) => { if (!n.readAt) await api(`/notifications/${n.id}/read`, { method: 'POST', body: {} }); await mutate(); if (n.link) router.push(n.link); };
  return (
    <>
      <PageHeader title="Notifications" action={data.unread > 0 ? <Button variant="outline" onClick={async () => { await api('/notifications/read-all', { method: 'POST', body: {} }); mutate(); }}>Mark all read</Button> : undefined} />
      <Card className="!p-0">{!data.items.length ? <Empty title="You're all caught up" /> : <ul className="divide-y divide-line">{data.items.map((n: any) => (
        <li key={n.id}><button onClick={() => open(n)} className={`flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-blush/40 ${n.readAt ? '' : 'bg-blush/30'}`}>{!n.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-ruby" aria-label="Unread" />}<span><span className="block text-sm font-medium">{n.title}</span><span className="block text-sm text-muted">{n.body}</span><span className="mt-1 block text-xs text-muted">{fmtDateTime(n.createdAt)}</span></span></button></li>
      ))}</ul>}</Card>
    </>
  );
}

export function ConversationList({ endpoint, base, nameOf }: { endpoint: string; base: string; nameOf: (c: any) => string }) {
  const { data, error, isLoading, mutate } = useApi<any[]>(endpoint);
  if (error) return <ErrorBox error={error} retry={() => mutate()} />;
  if (isLoading || !data) return <Spinner />;
  return (
    <><PageHeader title="Messages" /><Card className="!p-0">{!data.length ? <Empty title="No conversations yet" /> : <ul className="divide-y divide-line">{data.map((c) => <li key={c.id}><Link href={`${base}/${c.id}`} className="block px-5 py-4 hover:bg-blush/40"><span className="flex justify-between gap-2"><span className="text-sm font-medium">{nameOf(c)}</span><span className="text-xs text-muted">{fmtDateTime(c.lastMessageAt)}</span></span><span className="mt-0.5 line-clamp-1 block text-sm text-muted">{c.messages[0]?.body}</span></Link></li>)}</ul>}</Card></>
  );
}

export function ConversationThread({ id }: { id: string }) {
  const { data, error, isLoading, mutate } = useApi<any>(`/conversations/${id}/messages`, { refreshInterval: 8000 });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const count = data?.messages.length;
  useEffect(() => { end.current?.scrollIntoView(); }, [count]);
  const toast = useToast();
  if (error) return <ErrorBox error={error} retry={() => mutate()} />;
  if (isLoading || !data) return <Spinner />;
  const mine = (m: any) => (data.me === 'VENDOR') === m.fromVendor;
  const send = async (e: React.FormEvent) => {
    e.preventDefault(); if (!text.trim()) return;
    setBusy(true);
    try { await api(`/conversations/${id}/messages`, { body: { body: text } }); setText(''); await mutate(); }
    catch (err) { toast((err as Error).message, true); } finally { setBusy(false); }
  };
  return (
    <Card className="flex h-[70vh] flex-col !p-0">
      <div className="flex-1 space-y-2 overflow-y-auto p-5">{data.messages.map((m: any) => <div key={m.id} className={`flex ${mine(m) ? 'justify-end' : ''}`}><div className={`max-w-[78%] rounded-2xl px-4 py-2 text-sm ${mine(m) ? 'bg-ruby text-white' : 'bg-blush'}`}><p className="whitespace-pre-line">{m.body}</p><p className={`mt-1 text-[11px] ${mine(m) ? 'text-white/70' : 'text-muted'}`}>{fmtDateTime(m.createdAt)}</p></div></div>)}<div ref={end} /></div>
      <form onSubmit={send} className="flex gap-2 border-t border-line p-3"><input aria-label="Message" value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message" className="flex-1 rounded-lg border border-line px-3 py-2 text-sm" /><Button busy={busy} aria-label="Send"><Send className="size-4" /></Button></form>
    </Card>
  );
}

export function SupportList({ base }: { base: string }) {
  const { data, error, isLoading, mutate } = useApi<any[]>('/support/tickets');
  const [open, setOpen] = useState(false);
  const f = useForm({ category: 'OTHER', subject: '', body: '' });
  const router = useRouter();
  if (error) return <ErrorBox error={error} retry={() => mutate()} />;
  if (isLoading || !data) return <Spinner />;
  return (
    <>
      <PageHeader title="Help and support" action={<Button onClick={() => setOpen(true)}>New ticket</Button>} />
      <Card className="!p-0">{!data.length ? <Empty title="No support tickets" body="If something goes wrong, open a ticket and our team will help." /> : <ul className="divide-y divide-line">{data.map((t) => <li key={t.id}><Link href={`${base}/${t.id}`} className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-blush/40"><span><span className="block text-sm font-medium">{t.subject}</span><span className="text-xs text-muted">{t.code} · {fmtDate(t.createdAt)}</span></span><Status value={t.status} /></Link></li>)}</ul>}</Card>
      {open && <Modal title="New support ticket" onClose={() => setOpen(false)}><div className="space-y-3"><Select label="What is this about?" {...f.bind('category')}>{TicketCategory.map((c) => <option key={c} value={c}>{statusLabel(c)}</option>)}</Select><Input label="Subject" {...f.bind('subject')} /><Textarea label="Details" {...f.bind('body')} /><FormError message={f.formError} /><Button className="w-full" busy={f.busy} onClick={() => f.submit(async () => { const t = await api('/support/tickets', { body: f.values }); router.push(`${base}/${t.id}`); })}>Submit</Button></div></Modal>}
    </>
  );
}

export function TicketThread({ id }: { id: string }) {
  const { data, error, isLoading, mutate } = useApi<any>(`/support/tickets/${id}`);
  const f = useForm({ body: '' });
  if (error) return <ErrorBox error={error} retry={() => mutate()} />;
  if (isLoading || !data) return <Spinner />;
  return (
    <>
      <PageHeader title={data.subject} sub={data.code} action={<Status value={data.status} />} />
      <Card><ul className="space-y-3">{data.messages.map((m: any) => <li key={m.id} className={`rounded-lg p-3 text-sm ${m.fromStaff ? 'bg-blush' : 'bg-warm'}`}><p className="text-xs font-medium">{m.fromStaff ? 'Mehfil support' : 'You'} · {fmtDateTime(m.createdAt)}</p><p className="mt-1 whitespace-pre-line">{m.body}</p></li>)}</ul>
        {data.status !== 'CLOSED' && <div className="mt-4 space-y-2"><Textarea label="Reply" {...f.bind('body')} /><FormError message={f.formError} /><Button busy={f.busy} disabled={!f.values.body.trim()} onClick={() => f.submit(async () => { await api(`/support/tickets/${id}/messages`, { body: { body: f.values.body } }); f.set('body', ''); await mutate(); })}>Send reply</Button></div>}
      </Card>
    </>
  );
}

export function SecuritySettings({ allowDelete }: { allowDelete?: boolean }) {
  const pw = useForm({ currentPassword: '', newPassword: '' });
  const toast = useToast();
  const { data: sessions, mutate } = useApi<any[]>('/auth/sessions');
  const del = useForm({ password: '' });
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="space-y-5">
      <Card title="Change password"><div className="max-w-sm space-y-3"><Input label="Current password" type="password" autoComplete="current-password" {...pw.bind('currentPassword')} /><Input label="New password" type="password" autoComplete="new-password" {...pw.bind('newPassword')} /><FormError message={pw.formError} /><Button busy={pw.busy} onClick={() => pw.submit(async () => { await api('/auth/change-password', { body: pw.values }); pw.setValues({ currentPassword: '', newPassword: '' }); toast('Password updated. Other devices were signed out.'); await mutate(); })}>Update password</Button></div></Card>
      <Card title="Active devices"><ul className="divide-y divide-line">{sessions?.map((s) => <li key={s.id} className="flex items-center justify-between gap-3 py-3 text-sm"><span className="min-w-0"><span className="block truncate">{s.userAgent ?? 'Unknown device'}</span><span className="text-xs text-muted">Last active {fmtDateTime(s.lastUsedAt)}</span></span><Button variant="outline" onClick={async () => { await api(`/auth/sessions/${s.id}`, { method: 'DELETE' }); mutate(); }}>Sign out</Button></li>)}</ul></Card>
      {allowDelete && <Card title="Delete account"><p className="mb-3 text-sm text-muted">Your personal details are erased. Records of paid bookings are kept as the law requires.</p><Button variant="danger" onClick={() => setConfirm(true)}><Trash2 className="size-4" aria-hidden />Delete my account</Button></Card>}
      {confirm && <Modal title="Delete your account?" onClose={() => setConfirm(false)}><div className="space-y-3"><p className="text-sm">This cannot be undone.</p><Input label="Confirm your password" type="password" {...del.bind('password')} /><FormError message={del.formError} /><Button className="w-full" busy={del.busy} onClick={() => del.submit(async () => { await api('/auth/delete-account', { body: del.values }); await session('logout'); window.location.href = '/'; })}>Delete permanently</Button></div></Modal>}
    </div>
  );
}

export function MilestoneTable({ milestones, onPay, payingEnabled }: { milestones: any[]; onPay?: (m: any) => void; payingEnabled?: boolean }) {
  const next = milestones.find((m) => m.status === 'PENDING');
  return (
    <ul className="divide-y divide-line">
      {milestones.map((m) => (
        <li key={m.id} className="flex items-center justify-between gap-3 py-3 text-sm">
          <span><span className="block font-medium">{m.label}</span><span className="text-xs text-muted">{m.dueDate ? `Due ${fmtDate(m.dueDate)}` : m.dueRule === 'ON_COMPLETION' ? 'Due on completion' : ''}{m.paidAt ? ` · Paid ${fmtDate(m.paidAt)}` : ''}</span></span>
          <span className="flex items-center gap-3"><span className="tnum font-medium">{formatPKR(m.amount)}</span>{m.status === 'PAID' ? <Status value="PAID" /> : onPay && payingEnabled && next?.id === m.id ? <Button onClick={() => onPay(m)}>Pay</Button> : <Status value="PENDING" />}</span>
        </li>
      ))}
    </ul>
  );
}

export function Timeline({ events }: { events: any[] }) {
  return <ol className="space-y-3 border-l-2 border-blush pl-4 text-sm">{events.map((e) => <li key={e.id}><p className="font-medium">{e.toStatus ? statusLabel(e.toStatus) : 'Update'}</p>{e.note && <p className="text-muted">{e.note}</p>}<p className="text-xs text-muted">{fmtDateTime(e.createdAt)} · {statusLabel(e.actorType)}</p></li>)}</ol>;
}

export function QuoteBreakdown({ q }: { q: any }) {
  return (
    <div className="text-sm">
      <ul className="divide-y divide-line">{q.lines.map((l: any) => <li key={l.id} className="flex justify-between gap-3 py-2"><span>{l.description}{l.quantity > 1 && <span className="text-muted"> × {l.quantity}</span>}</span><span className="tnum">{formatPKR(l.amount)}</span></li>)}</ul>
      <dl className="mt-2 space-y-1 border-t border-line pt-2">
        {q.discount > 0 && <div className="flex justify-between"><dt className="text-muted">Discount</dt><dd className="tnum">−{formatPKR(q.discount)}</dd></div>}
        {q.tax > 0 && <div className="flex justify-between"><dt className="text-muted">Tax ({q.taxBps / 100}%)</dt><dd className="tnum">{formatPKR(q.tax)}</dd></div>}
        <div className="flex justify-between text-base font-semibold"><dt>Total</dt><dd className="tnum">{formatPKR(q.total)}</dd></div>
      </dl>
    </div>
  );
}
