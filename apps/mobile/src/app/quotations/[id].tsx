import { formatBps, formatPKR } from '@mehfil/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { Button, Card, ErrorView, Loading, Row, Screen, Status, Text } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { fmtDate, fmtDateTime, SLOT_LABEL } from '@/lib/format';

export default function Page() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: q, error, isLoading, mutate } = useApi<any>(`/quotations/${id}`);
  const [busy, setBusy] = useState(false);
  if (error) return <ErrorView error={error} retry={() => mutate()} />;
  if (isLoading || !q) return <Loading />;
  const open = ['SENT', 'VIEWED'].includes(q.status);
  const accept = async () => { setBusy(true); try { const b = await api(`/quotations/${id}/accept`, { method: 'POST', body: {} }); router.replace(`/bookings/${b.id}`); } catch (e: any) { Alert.alert('Could not accept', e.message); mutate(); } finally { setBusy(false); } };
  const reject = () => Alert.alert('Decline this quotation?', undefined, [{ text: 'Back' }, { text: 'Decline', style: 'destructive', onPress: async () => { await api(`/quotations/${id}/reject`, { body: { reason: null } }); mutate(); } }]);
  return (
    <Screen onRefresh={() => mutate()}>
      <Text variant="h1">{q.vendor.businessName}</Text><Text variant="muted">{q.code} · {fmtDate(q.enquiry.eventDate)} ({SLOT_LABEL[q.enquiry.slot]})</Text><Status value={q.status} />
      <Card title="Price">{q.lines.map((l: any) => <Row key={l.id} label={l.quantity > 1 ? `${l.description} × ${l.quantity}` : l.description} value={formatPKR(l.amount)} />)}{q.discount > 0 && <Row label="Discount" value={`−${formatPKR(q.discount)}`} />}{q.tax > 0 && <Row label={`Tax (${q.taxBps / 100}%)`} value={formatPKR(q.tax)} />}<Row bold label="Total" value={formatPKR(q.total)} />{q.notes && <Text variant="muted">{q.notes}</Text>}</Card>
      <Card title="Payment schedule">{q.milestones.map((m: any) => <Row key={m.id} label={`${m.label} (${formatBps(m.shareBps)})`} value={formatPKR(m.amount)} />)}</Card>
      <Card title="Cancellation policy"><Text variant="bold">{q.cancellationPolicy.name}</Text><Text>{q.cancellationPolicy.body}</Text>{[...q.cancellationPolicy.tiers].sort((a: any, b: any) => b.daysBefore - a.daysBefore).map((t: any) => <Text key={t.daysBefore} variant="muted">{t.daysBefore}+ days before: {formatBps(t.refundBps)} refund</Text>)}</Card>
      {q.terms && <Card title="Vendor terms"><Text>{q.terms}</Text></Card>}
      {open ? <><Text variant="muted">Valid until {fmtDateTime(q.validUntil)}. Accepting asks the vendor to reconfirm your date. Your booking is confirmed after you pay the advance.</Text><Button title="Accept quotation" busy={busy} onPress={accept} /><Button title="Decline" variant="outline" onPress={reject} /></> : q.booking && <Button title={`View booking ${q.booking.code}`} onPress={() => router.push(`/bookings/${q.booking.id}`)} />}
    </Screen>
  );
}
