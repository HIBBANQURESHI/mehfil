'use client';
import { formatPKR } from '@mehfil/shared';
import { ListPage } from '@/components/list-page';
import { Status } from '@/components/ui';
import { fmtDate } from '@/lib/format';
export default function Page() {
  return <ListPage<any> title="Quotations" endpoint="/vendor/quotations" rowHref={(q) => `/vendor/quotations/${q.id}`} tabs={[{ label: 'All', value: '' }, { label: 'Drafts', value: 'DRAFT' }, { label: 'Sent', value: 'SENT' }, { label: 'Accepted', value: 'ACCEPTED' }, { label: 'Rejected', value: 'REJECTED' }, { label: 'Expired', value: 'EXPIRED' }]} emptyTitle="No quotations here" columns={[{ h: 'Ref', c: (q) => q.code }, { h: 'Customer', c: (q) => q.customer.name }, { h: 'Listing', c: (q) => q.enquiry.listing.title }, { h: 'Event', c: (q) => fmtDate(q.enquiry.eventDate) }, { h: 'Total', right: true, c: (q) => formatPKR(q.total) }, { h: 'Status', c: (q) => <Status value={q.status} /> }]} />;
}
