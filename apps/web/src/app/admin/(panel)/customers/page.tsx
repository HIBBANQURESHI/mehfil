'use client';
import { ListPage } from '@/components/list-page';
import { Status } from '@/components/ui';
import { fmtDate } from '@/lib/format';
export default function Page() {
  return <ListPage<any> title="Customers" endpoint="/admin/users" search rowHref={(u) => `/admin/customers/${u.id}`} tabs={[{ label: 'All', value: '' }, { label: 'Suspended', value: 'SUSPENDED' }, { label: 'Blocked', value: 'BLOCKED' }]} columns={[{ h: 'Name', c: (u) => u.name }, { h: 'Phone', c: (u) => u.phone }, { h: 'Email', c: (u) => u.email ?? '—' }, { h: 'Enquiries', right: true, c: (u) => u._count.enquiries }, { h: 'Bookings', right: true, c: (u) => u._count.bookings }, { h: 'Joined', c: (u) => fmtDate(u.createdAt) }, { h: 'Status', c: (u) => <Status value={u.status} /> }]} />;
}
