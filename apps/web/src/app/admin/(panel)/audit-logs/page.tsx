'use client';
import { ListPage } from '@/components/list-page';
import { fmtDateTime } from '@/lib/format';
export default function Page() { return <ListPage<any> title="Audit logs" sub="Every sensitive action, who did it, and why." endpoint="/admin/audit-logs" columns={[{ h: 'When', c: (l) => fmtDateTime(l.createdAt) }, { h: 'Who', c: (l) => l.actor?.name ?? 'System' }, { h: 'Action', c: (l) => l.action }, { h: 'Record', c: (l) => l.entity }, { h: 'Reason', c: (l) => l.reason ?? '—' }]} />; }
