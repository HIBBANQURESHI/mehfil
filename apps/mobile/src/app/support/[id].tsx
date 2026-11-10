import { useLocalSearchParams } from 'expo-router';
import { Button, c, Card, ErrorView, Field, FormError, Loading, Screen, Status, Text, useForm } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
export default function Page() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: t, error, isLoading, mutate } = useApi<any>(`/support/tickets/${id}`);
  const f = useForm({ body: '' });
  if (error) return <ErrorView error={error} retry={() => mutate()} />;
  if (isLoading || !t) return <Loading />;
  return <Screen onRefresh={() => mutate()}><Text variant="h2">{t.subject}</Text><Text variant="small">{t.code}</Text><Status value={t.status} />{t.messages.map((m: any) => <Card key={m.id} style={m.fromStaff ? { backgroundColor: c.blush, borderColor: c.blush } : undefined}><Text variant="small">{m.fromStaff ? 'Mehfil support' : 'You'} · {fmtDateTime(m.createdAt)}</Text><Text>{m.body}</Text></Card>)}{t.status !== 'CLOSED' && <><Field label="Reply" multiline {...f.bind('body')} /><FormError message={f.formError} /><Button title="Send reply" busy={f.busy} disabled={!f.values.body.trim()} onPress={() => f.submit(async () => { await api(`/support/tickets/${id}/messages`, { body: { body: f.values.body } }); f.set('body', ''); mutate(); })} /></>}</Screen>;
}
