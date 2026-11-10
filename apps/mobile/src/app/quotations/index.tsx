import { formatPKR } from '@mehfil/shared';
import { router } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { Button, c, Card, Empty, ErrorView, font, Loading, Row, Screen, Status, Text } from '@/components/ui';
import { Paged, useApi } from '@/lib/api';
import { fmtDate, fmtDateTime } from '@/lib/format';

/** Live offers side by side in swipeable columns; anything no longer open is listed below. */
export default function Page() {
  const { data, error, isLoading, mutate } = useApi<Paged>('/quotations?pageSize=50');
  if (error) return <ErrorView error={error} retry={() => mutate()} />;
  if (isLoading || !data) return <Loading />;
  const live = data.items.filter((q) => ['SENT', 'VIEWED'].includes(q.status));
  const rest = data.items.filter((q) => !['SENT', 'VIEWED'].includes(q.status));
  const amounts = live.map((q) => q.total);
  const lowest = new Set(amounts).size > 1 ? Math.min(...amounts) : null;
  return (
    <Screen onRefresh={() => mutate()} padded={false}>
      <View style={{ gap: 14, paddingTop: 16 }}>
        {!data.items.length && <Empty title="No quotations yet" body="Quotations from vendors will appear here." action={<Button title="Find vendors" onPress={() => router.push('/explore')} />} />}
        {live.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }}>
          {live.map((q) => <Card key={q.id} style={{ width: 280 }}>
            <Text variant="h3" numberOfLines={1}>{q.vendor.businessName}</Text><Text variant="small" numberOfLines={1}>{q.enquiry.listing.title}</Text>
            <Text style={{ fontFamily: font.bold, fontSize: 20 }}>{formatPKR(q.total)}</Text>
            {q.total === lowest && <Text style={{ color: c.success, fontSize: 13 }}>Lowest offer</Text>}
            <Row label="Pay now" value={formatPKR(q.milestones[0].amount)} /><Row label="Event" value={fmtDate(q.enquiry.eventDate)} /><Row label="Rating" value={q.vendor.reviewCount ? `${q.vendor.avgRating.toFixed(1)} (${q.vendor.reviewCount})` : 'New'} /><Row label="Capacity" value={q.enquiry.listing.capacityMax ?? '—'} /><Row label="Cancellation" value={q.cancellationPolicy.name} /><Row label="Valid until" value={fmtDateTime(q.validUntil)} />
            <Button title="Review" onPress={() => router.push(`/quotations/${q.id}`)} />
          </Card>)}
        </ScrollView>}
        {rest.length > 0 && <View style={{ paddingHorizontal: 16 }}><Card title="Earlier">{rest.map((q) => <Pressable key={q.id} accessibilityRole="button" onPress={() => router.push(`/quotations/${q.id}`)}><Row label={q.vendor.businessName} value={formatPKR(q.total)} /><Status value={q.status} /></Pressable>)}</Card></View>}
      </View>
    </Screen>
  );
}
