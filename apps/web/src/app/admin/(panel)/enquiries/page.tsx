'use client';
import { ListPage } from '@/components/list-page';
import { Status } from '@/components/ui';
import { fmtDate } from '@/lib/format';
export default function Page() { return <ListPage<any> title="Enquiries" endpoint="/admin/enquiries" tabs={[{ label: 'All', value: '' }, { label: 'New', value: 'NEW' }, { label: 'Quote sent', value: 'QUOTATION_SENT' }, { label: 'Expired', value: 'EXPIRED' }, { label: 'Declined', value: 'DECLINED' }]} columns={[{ h: 'Ref', c: (e) => e.code }, { h: 'Customer', c: (e) => e.customer.name }, { h: 'Vendor', c: (e) => e.vendor.businessName }, { h: 'Listing', c: (e) => e.listing.title }, { h: 'Event', c: (e) => fmtDate(e.eventDate) }, { h: 'Status', c: (e) => <Status value={e.status} /> }]} />; }
