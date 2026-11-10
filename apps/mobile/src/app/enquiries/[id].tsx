import { formatPKR } from '@mehfil/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable } from 'react-native';
import { Button, Card, Empty, ErrorView, Loading, Row, Screen, Status, Text } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { fmtDate, SLOT_LABEL } from '@/lib/format';
export default function Page() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: e, error, isLoading, mutate } = useApi<any>(`/enquiries/${id}`);
  if (error) return <ErrorView error={error} retry={() => mutate()} />;
  if (isLoading || !e) return <Loading />;
  return <Screen onRefresh={() => mutate()}><Text variant="h1">{e.vendor.businessName}</Text><Text variant="muted">{e.code} · {e.listing.title}</Text><Status value={e.status} /><Card title="Your request"><Row label="Date" value={`${fmtDate(e.eventDate)} (${SLOT_LABEL[e.slot]})`} /><Row label="Guests" value={e.guestCount} />{e.budget !== null && <Row label="Budget" value={formatPKR(e.budget)} />}<Text>{e.requirements}</Text>{e.declineReason && <Text style={{ color: '#B54750' }}>Declined: {e.declineReason}</Text>}</Card><Card title="Quotations">{!e.quotations.length ? <Empty title="Waiting for the vendor" /> : e.quotations.map((q: any) => <Pressable key={q.id} accessibilityRole="button" onPress={() => router.push(`/quotations/${q.id}`)}><Row label={`${q.code} v${q.version}`} value={<Status value={q.status} />} /><Text variant="bold">{formatPKR(q.total)}</Text></Pressable>)}</Card>{['NEW', 'VIEWED', 'RESPONDED', 'QUOTATION_SENT'].includes(e.status) && <Button title="Close enquiry" variant="outline" onPress={async () => { await api(`/enquiries/${id}/close`, { method: 'POST', body: {} }); mutate(); }} />}</Screen>;
}
