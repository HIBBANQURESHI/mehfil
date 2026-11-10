'use client';
import { formatPKR } from '@mehfil/shared';
import { ListPage } from '@/components/list-page';
import { Status } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';
export default function Page() { return <ListPage<any> title="Payments" endpoint="/admin/payments" rowHref={(p) => `/admin/bookings/${p.booking.id}`} tabs={[{ label: 'All', value: '' }, { label: 'Succeeded', value: 'SUCCEEDED' }, { label: 'Failed', value: 'FAILED' }, { label: 'Needs reconciliation', value: 'RECONCILIATION_REQUIRED' }, { label: 'Refunded', value: 'REFUNDED' }]} columns={[{ h: 'Ref', c: (p) => p.code }, { h: 'Booking', c: (p) => p.booking.code }, { h: 'Customer', c: (p) => p.booking.customer.name }, { h: 'Vendor', c: (p) => p.booking.vendor.businessName }, { h: 'Date', c: (p) => fmtDateTime(p.createdAt) }, { h: 'Collected by', c: (p) => (p.collectedBy === 'VENDOR' ? 'Vendor' : 'Platform') }, { h: 'Amount', right: true, c: (p) => formatPKR(p.amount) }, { h: 'Commission', right: true, c: (p) => formatPKR(p.commission) }, { h: 'Status', c: (p) => <Status value={p.status} /> }]} />; }
