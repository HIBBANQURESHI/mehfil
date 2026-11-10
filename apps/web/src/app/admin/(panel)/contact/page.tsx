'use client';
import { Card, Empty, ErrorBox, PageHeader, Spinner } from '@/components/ui';
import { useApi } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
export default function Page() {
  const { data, error } = useApi<any[]>('/admin/contact-messages');
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Spinner />;
  return <><PageHeader title="Contact messages" /><Card className="!p-0">{!data.length ? <Empty title="No messages" /> : <ul className="divide-y divide-line">{data.map((m) => <li key={m.id} className="p-5 text-sm"><p className="font-medium">{m.name} <span className="font-normal text-muted">{m.email} {m.phone} · {fmtDateTime(m.createdAt)}</span></p><p className="mt-1 whitespace-pre-line">{m.message}</p></li>)}</ul>}</Card></>;
}
