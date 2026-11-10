'use client';
import { formatPKR } from '@mehfil/shared';
import { ListPage } from '@/components/list-page';
import { Status } from '@/components/ui';
import { fmtDate } from '@/lib/format';
export default function Page() {
  return <ListPage<any> title="Enquiries" endpoint="/vendor/enquiries" rowHref={(e) => `/vendor/enquiries/${e.id}`} tabs={[{ label: 'All', value: '' }, { label: 'New', value: 'NEW' }, { label: 'Viewed', value: 'VIEWED' }, { label: 'Quote sent', value: 'QUOTATION_SENT' }, { label: 'Closed', value: 'CLOSED' }, { label: 'Declined', value: 'DECLINED' }, { label: 'Expired', value: 'EXPIRED' }]} emptyTitle="No enquiries here" columns={[{ h: 'Ref', c: (e) => e.code }, { h: 'Customer', c: (e) => e.customer.name }, { h: 'Listing', c: (e) => e.listing.title }, { h: 'Event', c: (e) => fmtDate(e.eventDate) }, { h: 'Guests', right: true, c: (e) => e.guestCount }, { h: 'Budget', right: true, c: (e) => formatPKR(e.budget) }, { h: 'Status', c: (e) => <Status value={e.status} /> }]} />;
}
