'use client';
import { ListPage } from '@/components/list-page';
import { Status } from '@/components/ui';
import { fmtDate } from '@/lib/format';
export default function Enquiries() {
  return <ListPage<any> title="My enquiries" endpoint="/enquiries" rowHref={(e) => `/account/enquiries/${e.id}`} emptyTitle="No enquiries yet" emptyBody="Request a quotation from any vendor to get started." columns={[{ h: 'Ref', c: (e) => e.code }, { h: 'Vendor', c: (e) => <><span className="font-medium">{e.vendor.businessName}</span><br /><span className="text-xs text-muted">{e.listing.title}</span></> }, { h: 'Event', c: (e) => fmtDate(e.eventDate) }, { h: 'Guests', c: (e) => e.guestCount }, { h: 'Status', c: (e) => <Status value={e.status} /> }]} />;
}
