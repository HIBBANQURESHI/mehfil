import { formatBps, formatPKR } from '@mehfil/shared';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Star } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Button, c, Card, ErrorView, Field, FormError, Loading, Row, Screen, Status, Text, useForm } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { fmtDate, fmtDateTime, SLOT_LABEL } from '@/lib/format';
import { statusLabel } from '@mehfil/shared';

export default function Page() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: b, error, isLoading, mutate } = useApi<any>(`/bookings/${id}`);
  const [paying, setPaying] = useState(false);
  const [mode, setMode] = useState<'cancel' | 'dispute' | null>(null);
  const [rating, setRating] = useState(0);
  const reason = useForm({ text: '' });
  const review = useForm({ comment: '' });
  if (error) return <ErrorView error={error} retry={() => mutate()} />;
  if (isLoading || !b) return <Loading />;
  const payable = ['AWAITING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS', 'SERVICE_COMPLETED', 'COMPLETED'].includes(b.status);
  const next = b.milestones.find((m: any) => m.status === 'PENDING');
  // Payment happens on the gateway's own page. The booking updates from the server-verified webhook, not from this screen.
  const pay = async () => {
    setPaying(true);
    try { const r = await api(`/bookings/${id}/pay`, { body: { milestoneId: next.id } }); await WebBrowser.openBrowserAsync(r.checkoutUrl); await mutate(); }
    catch (e: any) { Alert.alert('Payment', e.message); }
    finally { setPaying(false); }
  };
  const act = (path: string) => async () => { try { await api(`/bookings/${id}/${path}`, { method: 'POST', body: {} }); mutate(); } catch (e: any) { Alert.alert('Error', e.message); } };
  const canCancel = ['PENDING_VENDOR_CONFIRMATION', 'AWAITING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS'].includes(b.status);
  const canDispute = ['CONFIRMED', 'IN_PROGRESS', 'SERVICE_COMPLETED', 'COMPLETED'].includes(b.status);
  const q = b.cancellation;
  return (
    <Screen onRefresh={() => mutate()}>
      <Text variant="h1">{b.listing.title}</Text><Text variant="muted">{b.code} · {b.vendor.businessName} · {fmtDate(b.eventDate)} ({SLOT_LABEL[b.slot]})</Text><Status value={b.status} />
      {b.status === 'AWAITING_PAYMENT' && <Card style={{ backgroundColor: '#F6ECD8', borderColor: '#F6ECD8' }}><Text>Your date is held until {fmtDateTime(b.holdExpiresAt)}. Pay the advance to confirm it.</Text></Card>}
      {b.status === 'PENDING_VENDOR_CONFIRMATION' && <Card style={{ backgroundColor: c.blush, borderColor: c.blush }}><Text>Waiting for the vendor to reconfirm your date. Nothing to pay yet.</Text></Card>}
      <Card><Row label="Agreed total" value={formatPKR(b.totalAmount)} /><Row label="Paid" value={formatPKR(b.paid)} /><Row bold label="Balance" value={formatPKR(b.balance)} /></Card>
      <Card title="Payment schedule">{b.milestones.map((m: any) => <View key={m.id} style={{ gap: 2 }}><Row label={m.label} value={formatPKR(m.amount)} /><Text variant="small">{m.status === 'PAID' ? `Paid ${fmtDate(m.paidAt)}` : m.dueDate ? `Due ${fmtDate(m.dueDate)}` : 'Due on completion'}</Text></View>)}{payable && next && <Button title={`Pay ${formatPKR(next.amount)}`} busy={paying} onPress={pay} />}</Card>
      {b.confirmedAt && b.vendor.phone && <Card title="Vendor contact"><Text>{b.vendor.phone}</Text>{b.vendor.address && <Text variant="muted">{b.vendor.address}</Text>}</Card>}
      {b.status === 'SERVICE_COMPLETED' && <Card title="Was your event completed?"><Text variant="muted">The vendor marked this as complete.</Text><Button title="Yes, all done" onPress={act('confirm-completion')} /></Card>}
      {b.status === 'COMPLETED' && !b.review && <Card title="Leave a review"><View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 6 }}>{[1, 2, 3, 4, 5].map((n) => <Pressable key={n} accessibilityRole="radio" accessibilityLabel={`${n} stars`} accessibilityState={{ checked: rating === n }} onPress={() => setRating(n)}><Star size={30} color={n <= rating ? c.gold : c.border} fill={n <= rating ? c.gold : 'transparent'} /></Pressable>)}</View><Field label="Your experience" multiline {...review.bind('comment')} /><FormError message={review.formError} /><Button title="Submit review" busy={review.busy} disabled={!rating} onPress={() => review.submit(async () => { await api(`/bookings/${id}/review`, { body: { rating, comment: review.values.comment } }); mutate(); })} /></Card>}
      {b.review && <Card title="Your review"><Text variant="bold">{b.review.rating}/5</Text><Text>{b.review.comment}</Text></Card>}
      <Card title="Cancellation policy"><Text variant="bold">{b.cancellationPolicyName}</Text><Text variant="muted">{b.cancellationPolicyBody}</Text></Card>
      {mode === 'cancel' && <Card title="Cancel this booking?"><Text>{q.paid > 0 ? `Cancelling ${q.daysBefore} days before the event refunds ${formatBps(q.refundBps)}: ${formatPKR(q.refundAmount)} of the ${formatPKR(q.paid)} you paid. Our team confirms this first.` : 'Nothing has been paid yet, so this cancels straight away.'}</Text><Field label="Reason" multiline {...reason.bind('text')} /><FormError message={reason.formError} /><Button title="Confirm cancellation" variant="danger" busy={reason.busy} disabled={!reason.values.text.trim()} onPress={() => reason.submit(async () => { await api(`/bookings/${id}/cancel`, { body: { reason: reason.values.text } }); setMode(null); reason.set('text', ''); mutate(); })} /></Card>}
      {mode === 'dispute' && <Card title="Raise a dispute"><Field label="What went wrong?" multiline {...reason.bind('text')} /><FormError message={reason.formError} /><Button title="Submit" busy={reason.busy} disabled={!reason.values.text.trim()} onPress={() => reason.submit(async () => { await api(`/bookings/${id}/dispute`, { body: { reason: reason.values.text } }); setMode(null); reason.set('text', ''); mutate(); })} /></Card>}
      {!mode && canCancel && <Button title="Cancel booking" variant="danger" onPress={() => setMode('cancel')} />}
      {!mode && canDispute && <Button title="Report a problem" variant="outline" onPress={() => setMode('dispute')} />}
      <Card title="Timeline">{b.timeline.map((e: any) => <View key={e.id}><Text variant="bold">{e.toStatus ? statusLabel(e.toStatus) : 'Update'}</Text>{e.note && <Text variant="muted">{e.note}</Text>}<Text variant="small">{fmtDateTime(e.createdAt)}</Text></View>)}</Card>
    </Screen>
  );
}
