'use client';
import { formatPKR } from '@mehfil/shared';
import { ListPage } from '@/components/list-page';
import { Status } from '@/components/ui';
import { fmtDate, SLOT_LABEL } from '@/lib/format';
export default function Page() {
  return <ListPage<any> title="Bookings" endpoint="/vendor/bookings" rowHref={(b) => `/vendor/bookings/${b.id}`} tabs={[{ label: 'All', value: '' }, { label: 'To confirm', value: 'PENDING_VENDOR_CONFIRMATION' }, { label: 'Awaiting payment', value: 'AWAITING_PAYMENT' }, { label: 'Confirmed', value: 'CONFIRMED' }, { label: 'Completed', value: 'COMPLETED' }, { label: 'Cancelled', value: 'CANCELLED' }]} emptyTitle="No bookings here" columns={[{ h: 'Ref', c: (b) => b.code }, { h: 'Customer', c: (b) => b.customer.name }, { h: 'Listing', c: (b) => b.listing.title }, { h: 'Event', c: (b) => `${fmtDate(b.eventDate)}, ${SLOT_LABEL[b.slot]}` }, { h: 'Amount', right: true, c: (b) => formatPKR(b.totalAmount) }, { h: 'Status', c: (b) => <Status value={b.status} /> }]} />;
}
