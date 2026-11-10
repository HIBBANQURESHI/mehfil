'use client';
import { ListPage } from '@/components/list-page';
import { Status } from '@/components/ui';
import { fmtDate } from '@/lib/format';
export default function Page() {
  return <ListPage<any> title="Vendors" endpoint="/admin/vendors" search rowHref={(v) => `/admin/vendors/${v.id}`} tabs={[{ label: 'Pending approval', value: 'PENDING' }, { label: 'All', value: '' }, { label: 'Approved', value: 'APPROVED' }, { label: 'Changes required', value: 'CHANGES_REQUIRED' }, { label: 'Rejected', value: 'REJECTED' }, { label: 'Suspended', value: 'SUSPENDED' }, { label: 'Drafts', value: 'DRAFT' }]} columns={[{ h: 'Business', c: (v) => v.businessName }, { h: 'Category', c: (v) => v.primaryCategory?.name ?? '—' }, { h: 'City', c: (v) => v.city?.name ?? '—' }, { h: 'Listings', right: true, c: (v) => v._count.listings }, { h: 'Bookings', right: true, c: (v) => v._count.bookings }, { h: 'Submitted', c: (v) => fmtDate(v.submittedAt) }, { h: 'Status', c: (v) => <Status value={v.status} /> }]} />;
}
