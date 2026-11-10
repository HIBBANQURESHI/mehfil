'use client';
import { formatPKR } from '@mehfil/shared';
import { useState } from 'react';
import { ListPage } from '@/components/list-page';
import { Button, Status, useToast } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { fmtDate } from '@/lib/format';
export default function Page() {
  const { data: e, mutate } = useApi<any>('/vendor/earnings');
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState(0);
  const toast = useToast();
  const request = async () => { setBusy(true); try { await api('/vendor/payouts', { method: 'POST', body: {} }); toast('Payout requested'); mutate(); setV(v + 1); } catch (err) { toast((err as Error).message, true); } finally { setBusy(false); } };
  return <ListPage<any> key={v} title="Payouts" sub={e ? `Available now: ${formatPKR(e.availableForPayout)}` : undefined} action={<Button busy={busy} disabled={!e?.availableForPayout} onClick={request}>Request payout</Button>} endpoint="/vendor/payouts" emptyTitle="No payouts yet" columns={[{ h: 'Ref', c: (p) => p.code }, { h: 'Requested', c: (p) => fmtDate(p.createdAt) }, { h: 'Bank', c: (p) => `${p.bankName} ••••${p.ibanLast4}` }, { h: 'Amount', right: true, c: (p) => formatPKR(p.amount) }, { h: 'Reference', c: (p) => p.reference ?? '—' }, { h: 'Status', c: (p) => <Status value={p.status} /> }]} />;
}
