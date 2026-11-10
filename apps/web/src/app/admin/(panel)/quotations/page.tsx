'use client';
import { formatPKR } from '@mehfil/shared';
import { ListPage } from '@/components/list-page';
import { Status } from '@/components/ui';
import { fmtDate } from '@/lib/format';
export default function Page() { return <ListPage<any> title="Quotations" endpoint="/admin/quotations" tabs={[{ label: 'All', value: '' }, { label: 'Sent', value: 'SENT' }, { label: 'Accepted', value: 'ACCEPTED' }, { label: 'Expired', value: 'EXPIRED' }]} columns={[{ h: 'Ref', c: (q) => q.code }, { h: 'Customer', c: (q) => q.customer.name }, { h: 'Vendor', c: (q) => q.vendor.businessName }, { h: 'Sent', c: (q) => fmtDate(q.sentAt) }, { h: 'Total', right: true, c: (q) => formatPKR(q.total) }, { h: 'Status', c: (q) => <Status value={q.status} /> }]} />; }
