'use client';
import { formatPKR } from '@mehfil/shared';
import { ListPage } from '@/components/list-page';
import { Status } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';
export default function Payments() {
  return <ListPage<any> title="Payments" endpoint="/payments" rowHref={(p) => `/account/bookings/${p.booking.id}`} emptyTitle="No payments yet" columns={[{ h: 'Ref', c: (p) => p.code }, { h: 'For', c: (p) => <><span className="font-medium">{p.booking.listing.title}</span><br /><span className="text-xs text-muted">{p.milestone.label}</span></> }, { h: 'Date', c: (p) => fmtDateTime(p.succeededAt ?? p.createdAt) }, { h: 'Amount', right: true, c: (p) => formatPKR(p.amount) }, { h: 'Refunded', right: true, c: (p) => (p.refundedAmount ? formatPKR(p.refundedAmount) : '—') }, { h: 'Status', c: (p) => <Status value={p.status} /> }]} />;
}
