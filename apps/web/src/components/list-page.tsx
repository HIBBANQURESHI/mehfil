'use client';
import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { Paged, useApi } from '@/lib/api';
import { Card, Empty, ErrorBox, Input, PageHeader, Pager, Spinner, Tabs } from './ui';

export interface Column<T> { h: string; c: (row: T) => ReactNode; right?: boolean }

/** The table screen used across the dashboards: tabs by status, search, paging, loading, empty and error states. */
export function ListPage<T extends { id?: string }>({ title, sub, endpoint, columns, tabs, search, rowHref, action, emptyTitle, emptyBody }: {
  title: string; sub?: string; endpoint: string; columns: Column<T>[]; tabs?: { label: string; value: string }[]; search?: boolean; rowHref?: (row: T) => string; action?: ReactNode; emptyTitle?: string; emptyBody?: string;
}) {
  const [status, setStatus] = useState(tabs?.[0].value ?? '');
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => { const t = setTimeout(() => { setTerm(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (status) params.set('status', status);
  if (term) params.set('q', term);
  const { data, error, isLoading, mutate } = useApi<Paged<T>>(`${endpoint}${endpoint.includes('?') ? '&' : '?'}${params}`, { keepPreviousData: true });
  const router = useRouter();

  return (
    <>
      <PageHeader title={title} sub={sub} action={action} />
      {tabs && <Tabs tabs={tabs} value={status} onChange={(v) => { setStatus(v); setPage(1); }} />}
      {search && <div className="relative mb-4 max-w-sm"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted" aria-hidden /><input aria-label="Search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} className="w-full rounded-lg border border-line bg-white py-2.5 pl-9 pr-3 text-sm focus:border-rose focus:outline-none" /></div>}
      {error ? <ErrorBox error={error} retry={() => mutate()} /> : isLoading && !data ? <Spinner /> : !data?.items.length ? (
        <Card><Empty title={emptyTitle ?? 'Nothing here yet'} body={emptyBody} /></Card>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-line bg-white">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead><tr className="border-b border-line text-xs text-muted">{columns.map((c) => <th key={c.h} className={`px-4 py-3 font-medium ${c.right ? 'text-right' : ''}`}>{c.h}</th>)}</tr></thead>
              <tbody>
                {data.items.map((row, i) => (
                  <tr key={row.id ?? i} tabIndex={rowHref ? 0 : undefined} onClick={rowHref ? () => router.push(rowHref(row)) : undefined} onKeyDown={rowHref ? (e) => { if (e.key === 'Enter') router.push(rowHref(row)); } : undefined} className={`border-b border-line last:border-0 ${rowHref ? 'cursor-pointer hover:bg-blush/40' : ''}`}>
                    {columns.map((c) => <td key={c.h} className={`px-4 py-3 ${c.right ? 'tnum text-right' : ''}`}>{c.c(row)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}
export { Input };
