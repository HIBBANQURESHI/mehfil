import { statusLabel, TicketCategory } from '@mehfil/shared';
import { router } from 'expo-router';
import { Pressable } from 'react-native';
import { Button, Card, Chips, Empty, ErrorView, Field, FormError, Loading, Row, Screen, Status, Text, useForm } from '@/components/ui';
import { api, useApi } from '@/lib/api';
export default function Page() {
  const { data, error, isLoading, mutate } = useApi<any[]>('/support/tickets');
  const f = useForm({ category: 'OTHER', subject: '', body: '' });
  if (error) return <ErrorView error={error} retry={() => mutate()} />;
  if (isLoading || !data) return <Loading />;
  return <Screen onRefresh={() => mutate()}><Card title="Open a ticket"><Chips value={f.values.category} onChange={(v) => f.set('category', v)} options={TicketCategory.map((x) => ({ label: statusLabel(x), value: x }))} /><Field label="Subject" {...f.bind('subject')} /><Field label="Details" multiline {...f.bind('body')} /><FormError message={f.formError} /><Button title="Submit" busy={f.busy} onPress={() => f.submit(async () => { const t = await api('/support/tickets', { body: f.values }); f.setValues({ category: 'OTHER', subject: '', body: '' }); await mutate(); router.push(`/support/${t.id}`); })} /></Card><Text variant="h2">Your tickets</Text>{!data.length ? <Empty title="No tickets" /> : data.map((t) => <Pressable key={t.id} accessibilityRole="button" onPress={() => router.push(`/support/${t.id}`)}><Card><Row label={t.code} value={<Status value={t.status} />} /><Text variant="bold">{t.subject}</Text></Card></Pressable>)}</Screen>;
}
