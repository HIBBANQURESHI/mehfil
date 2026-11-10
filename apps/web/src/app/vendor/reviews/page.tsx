'use client';
import { Star } from 'lucide-react';
import { useState } from 'react';
import { Card, Empty, ErrorBox, PageHeader, ReasonAction, Spinner, Button, Textarea } from '@/components/ui';
import { api, Paged, useApi } from '@/lib/api';
import { fmtDate } from '@/lib/format';
function Reply({ id, onDone }: { id: string; onDone: () => void }) {
  const [text, setText] = useState('');
  return <div className="mt-3 flex items-end gap-2"><Textarea className="flex-1" rows={2} aria-label="Reply" placeholder="Reply publicly" value={text} onChange={(e) => setText(e.target.value)} /><Button disabled={!text.trim()} onClick={async () => { await api(`/vendor/reviews/${id}/reply`, { body: { reply: text } }); onDone(); }}>Reply</Button></div>;
}
export default function Page() {
  const { data, error, isLoading, mutate } = useApi<Paged>('/vendor/reviews?pageSize=50');
  if (error) return <ErrorBox error={error} retry={() => mutate()} />;
  if (isLoading || !data) return <Spinner />;
  return <><PageHeader title="Reviews" /><Card className="!p-0">{!data.items.length ? <Empty title="No reviews yet" body="Reviews come from customers with completed bookings." /> : <ul className="divide-y divide-line">{data.items.map((r) => <li key={r.id} className="p-5"><div className="flex items-start justify-between gap-3"><p className="tnum flex items-center gap-1 text-sm font-medium"><Star className="size-4 fill-gold text-gold" aria-hidden />{r.rating} · {r.customer.name} <span className="font-normal text-muted">· {r.listing.title} · {fmtDate(r.createdAt)}</span></p><ReasonAction label="Report" placeholder="Why should this be reviewed?" onSubmit={async (reason) => { await api(`/vendor/reviews/${r.id}/report`, { body: { reason } }); }} /></div><p className="mt-2 text-sm">{r.comment}</p>{r.reply ? <p className="mt-3 rounded-lg bg-blush/60 p-3 text-sm"><b>Your reply: </b>{r.reply}</p> : <Reply id={r.id} onDone={() => mutate()} />}</li>)}</ul>}</Card></>;
}
