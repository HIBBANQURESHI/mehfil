'use client';
import { formatPKR, statusLabel } from '@mehfil/shared';
import Link from 'next/link';
import { Card, Empty, ErrorBox, LinkButton, PageHeader, Spinner } from '@/components/ui';
import { useApi } from '@/lib/api';
import { fmtDate } from '@/lib/format';

export default function Weddings() {
  const { data, error, isLoading, mutate } = useApi<any[]>('/weddings');
  if (error) return <ErrorBox error={error} retry={() => mutate()} />;
  if (isLoading || !data) return <Spinner />;
  return (
    <>
      <PageHeader title="My wedding" action={<LinkButton href="/plan">Plan a wedding</LinkButton>} />
      {!data.length ? <Card><Empty title="Plan your perfect wedding" body="Answer a few questions and we'll set up your events, budget, checklist and vendor picks." action={<LinkButton href="/plan">Plan my wedding</LinkButton>} /></Card> : (
        <div className="grid gap-4 md:grid-cols-2">{data.map((w) => (
          <Link key={w.id} href={`/account/weddings/${w.id}`} className="rounded-2xl border border-line bg-white p-5 hover:border-rose">
            <h2 className="text-xl">{w.title}</h2>
            <p className="mt-1 text-sm text-muted">{[w.city?.name, w.dateFrom ? fmtDate(w.dateFrom) : w.targetMonth, w.budget !== null ? `Budget ${formatPKR(w.budget)}` : null].filter(Boolean).join(' · ') || 'Details to be added'}</p>
            <p className="mt-2 text-sm">{w.events.map((e: any) => e.name ?? statusLabel(e.type)).join(' · ')}</p>
          </Link>
        ))}</div>
      )}
    </>
  );
}
