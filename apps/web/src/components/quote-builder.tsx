'use client';
import { computeQuotationTotals, formatBps, formatPKR, paisaToRupees, rupeesToPaisa } from '@mehfil/shared';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, FormError, Input, Select, Textarea, useForm } from './ui';
import { api, useApi } from '@/lib/api';

interface Line { description: string; quantity: string; unitPrice: string }
interface Milestone { label: string; percent: string; dueRule: string; dueDays: string }

/** Figures shown here are a preview using the same shared maths; the server recalculates everything on save. */
export function QuoteBuilder({ enquiry, reviseId, initial, onDone }: { enquiry: any; reviseId?: string; initial?: any; onDone: (id: string) => void }) {
  const { data: policies } = useApi<any[]>('/vendor/cancellation-policies');
  const [lines, setLines] = useState<Line[]>(initial ? initial.lines.map((l: any) => ({ description: l.description, quantity: String(l.quantity), unitPrice: String(paisaToRupees(l.unitPrice)) })) : [{ description: enquiry.listing.title, quantity: '1', unitPrice: '' }]);
  const [ms, setMs] = useState<Milestone[]>(initial ? initial.milestones.map((m: any) => ({ label: m.label, percent: String(m.shareBps / 100), dueRule: m.dueRule, dueDays: m.dueDays?.toString() ?? '' })) : [{ label: 'Advance', percent: '100', dueRule: 'ON_BOOKING', dueDays: '' }]);
  const f = useForm({ discount: initial ? String(paisaToRupees(initial.discount)) : '', taxPercent: initial ? String(initial.taxBps / 100) : '', notes: initial?.notes ?? '', terms: initial?.terms ?? '', cancellationPolicyId: initial?.cancellationPolicyId ?? '', validForHours: initial?.validForHours?.toString() ?? '' });
  const parsed = lines.map((l) => ({ quantity: Math.max(parseInt(l.quantity) || 0, 0), unitPrice: rupeesToPaisa(Number(l.unitPrice) || 0) }));
  const discount = rupeesToPaisa(Number(f.values.discount) || 0);
  const taxBps = Math.round((Number(f.values.taxPercent) || 0) * 100);
  let totals: ReturnType<typeof computeQuotationTotals> | null = null;
  try { totals = computeQuotationTotals(parsed, discount, taxBps); } catch { totals = null; }
  const shareSum = ms.reduce((s, m) => s + Math.round((Number(m.percent) || 0) * 100), 0);
  const setLine = (i: number, p: Partial<Line>) => setLines(lines.map((l, x) => (x === i ? { ...l, ...p } : l)));
  const setM = (i: number, p: Partial<Milestone>) => setMs(ms.map((m, x) => (x === i ? { ...m, ...p } : m)));
  const save = (send: boolean) => f.submit(async () => {
    const v = f.values;
    const body = { enquiryId: enquiry.id, lines: lines.map((l, i) => ({ description: l.description, ...parsed[i] })), discount, taxBps, notes: v.notes || null, terms: v.terms || null, cancellationPolicyId: v.cancellationPolicyId, validForHours: v.validForHours ? Number(v.validForHours) : undefined, send, milestones: ms.map((m) => ({ label: m.label, shareBps: Math.round((Number(m.percent) || 0) * 100), dueRule: m.dueRule, dueDays: m.dueRule === 'DAYS_BEFORE_EVENT' ? Number(m.dueDays || 0) : null })) };
    const q = await api(reviseId ? `/vendor/quotations/${reviseId}/revise` : '/vendor/quotations', { body });
    onDone(q.id);
  });
  return (
    <div className="space-y-5">
      <Card title="Items">
        <div className="space-y-2">{lines.map((l, i) => <div key={i} className="grid grid-cols-[1fr_70px_120px_32px] items-end gap-2"><Input aria-label="Description" placeholder="Item" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} /><Input aria-label="Quantity" type="number" min={1} value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} /><Input aria-label="Unit price in rupees" type="number" min={0} placeholder="Rs." value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} /><button aria-label="Remove item" className="pb-2.5" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, x) => x !== i))}><Trash2 className="size-4 text-muted" /></button></div>)}</div>
        <Button variant="ghost" className="mt-2" onClick={() => setLines([...lines, { description: '', quantity: '1', unitPrice: '' }])}><Plus className="size-4" aria-hidden />Add item</Button>
        <div className="mt-3 grid grid-cols-2 gap-3"><Input label="Discount (Rs.)" type="number" min={0} {...f.bind('discount')} /><Input label="Tax (%)" type="number" min={0} step="0.01" {...f.bind('taxPercent')} /></div>
        {totals ? <dl className="mt-4 space-y-1 border-t border-line pt-3 text-sm"><div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tnum">{formatPKR(totals.subtotal)}</dd></div>{totals.tax > 0 && <div className="flex justify-between"><dt className="text-muted">Tax</dt><dd className="tnum">{formatPKR(totals.tax)}</dd></div>}<div className="flex justify-between text-base font-semibold"><dt>Total</dt><dd className="tnum">{formatPKR(totals.total)}</dd></div>{enquiry.listing.category.commissionBps !== null && <div className="flex justify-between text-xs text-muted"><dt>Mehfil commission ({formatBps(enquiry.listing.category.commissionBps)})</dt><dd className="tnum">shown on the saved quotation</dd></div>}</dl> : <p className="mt-3 text-sm text-bad">The discount cannot be more than the subtotal.</p>}
      </Card>
      <Card title="Payment schedule">
        <div className="space-y-2">{ms.map((m, i) => <div key={i} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_80px_180px_80px_32px]"><Input aria-label="Instalment name" placeholder="Name" value={m.label} onChange={(e) => setM(i, { label: e.target.value })} /><Input aria-label="Percent" type="number" min={0} max={100} placeholder="%" value={m.percent} onChange={(e) => setM(i, { percent: e.target.value })} /><Select aria-label="Due" value={m.dueRule} disabled={i === 0} onChange={(e) => setM(i, { dueRule: e.target.value })}><option value="ON_BOOKING">On booking</option><option value="DAYS_BEFORE_EVENT">Days before event</option><option value="ON_COMPLETION">On completion</option></Select>{m.dueRule === 'DAYS_BEFORE_EVENT' ? <Input aria-label="Days before event" type="number" min={0} value={m.dueDays} onChange={(e) => setM(i, { dueDays: e.target.value })} /> : <span />}<button aria-label="Remove instalment" className="pb-2.5" disabled={ms.length === 1} onClick={() => setMs(ms.filter((_, x) => x !== i))}><Trash2 className="size-4 text-muted" /></button></div>)}</div>
        <div className="mt-2 flex items-center justify-between"><Button variant="ghost" onClick={() => setMs([...ms, { label: '', percent: '', dueRule: 'DAYS_BEFORE_EVENT', dueDays: '' }])}><Plus className="size-4" aria-hidden />Add instalment</Button><span className={`tnum text-sm ${shareSum === 10000 ? 'text-good' : 'text-bad'}`}>{shareSum / 100}% of 100%</span></div>
      </Card>
      <Card title="Terms">
        <div className="grid gap-3 sm:grid-cols-2"><Select label="Cancellation policy" {...f.bind('cancellationPolicyId')}><option value="">Choose</option>{policies?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select><Input label="Valid for (hours)" type="number" min={1} hint="Leave empty for the Mehfil default" {...f.bind('validForHours')} /><Textarea label="Notes for the customer" {...f.bind('notes')} /><Textarea label="Additional terms" {...f.bind('terms')} /></div>
        {policies?.length === 0 && <p className="mt-2 text-sm text-bad">Mehfil has not published a cancellation policy yet, so quotations can't be sent.</p>}
        <div className="mt-3"><FormError message={f.formError} /></div>
        <div className="mt-3 flex flex-wrap gap-2"><Button busy={f.busy} disabled={!totals || shareSum !== 10000} onClick={() => save(true)}>{reviseId ? 'Send revised quotation' : 'Send to customer'}</Button>{!reviseId && <Button variant="outline" busy={f.busy} disabled={!totals || shareSum !== 10000} onClick={() => save(false)}>Save as draft</Button>}</div>
      </Card>
    </div>
  );
}
