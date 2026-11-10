'use client';
import { formatPKR } from '@mehfil/shared';
import { ListPage } from '@/components/list-page';
import { Status } from '@/components/ui';
import { fmtDate } from '@/lib/format';
export default function Page() {
  return <ListPage<any> title="Bookings" endpoint="/admin/bookings" search rowHref={(b) => `/admin/bookings/${b.id}`} tabs={[{ label: 'All', value: '' }, { label: 'Pending', value: 'PENDING_VENDOR_CONFIRMATION' }, { label: 'Awaiting payment', value: 'AWAITING_PAYMENT' }, { label: 'Confirmed', value: 'CONFIRMED' }, { label: 'Completed', value: 'COMPLETED' }, { label: 'Cancellation requested', value: 'CANCELLATION_REQUESTED' }, { label: 'Cancelled', value: 'CANCELLED' }, { label: 'Disputed', value: 'DISPUTED' }]} columns={[{ h: 'Ref', c: (b) => b.code }, { h: 'Customer', c: (b) => b.customer.name }, { h: 'Vendor', c: (b) => b.vendor.businessName }, { h: 'Event', c: (b) => fmtDate(b.eventDate) }, { h: 'Amount', right: true, c: (b) => formatPKR(b.totalAmount) }, { h: 'Commission', right: true, c: (b) => formatPKR(b.commissionTotal) }, { h: 'Status', c: (b) => <Status value={b.status} /> }]} />;
}
