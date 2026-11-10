'use client';
import { formatPKR } from '@mehfil/shared';
import { ListPage } from '@/components/list-page';
import { Status } from '@/components/ui';
import { fmtDate } from '@/lib/format';
export default function Bookings() {
  return <ListPage<any> title="My bookings" endpoint="/bookings" rowHref={(b) => `/account/bookings/${b.id}`} emptyTitle="No bookings yet" columns={[{ h: 'Ref', c: (b) => b.code }, { h: 'Vendor', c: (b) => <><span className="font-medium">{b.vendor.businessName}</span><br /><span className="text-xs text-muted">{b.listing.title}</span></> }, { h: 'Event', c: (b) => fmtDate(b.eventDate) }, { h: 'Amount', right: true, c: (b) => formatPKR(b.totalAmount) }, { h: 'Status', c: (b) => <Status value={b.status} /> }]} />;
}
