'use client';
import { statusLabel } from '@mehfil/shared';
import { ListPage } from '@/components/list-page';
import { Status } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';
export default function Page() { return <ListPage<any> title="Support tickets" endpoint="/admin/tickets" rowHref={(t) => `/admin/support/${t.id}`} tabs={[{ label: 'Open', value: 'OPEN' }, { label: 'In progress', value: 'IN_PROGRESS' }, { label: 'Resolved', value: 'RESOLVED' }, { label: 'All', value: '' }]} columns={[{ h: 'Ref', c: (t) => t.code }, { h: 'Subject', c: (t) => t.subject }, { h: 'From', c: (t) => t.user.name }, { h: 'Type', c: (t) => statusLabel(t.category) }, { h: 'Priority', c: (t) => statusLabel(t.priority) }, { h: 'Updated', c: (t) => fmtDateTime(t.updatedAt) }, { h: 'Status', c: (t) => <Status value={t.status} /> }]} />; }
