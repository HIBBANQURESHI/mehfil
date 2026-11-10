import { formatPKR } from '@mehfil/shared';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { BadgeCheck, Check, Heart, MapPin, Star, Users } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, c, Card, ErrorView, Field, font, Loading, Row, Text } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate } from '@/lib/format';

export default function Listing() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data: l, error, isLoading, mutate } = useApi<any>(`/listings/${slug}`);
  const { user, requireAuth } = useAuth();
  const { width } = useWindowDimensions();
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => { if (l) setSaved(l.saved); }, [l]);
  if (error) return <ErrorView error={error} retry={() => mutate()} />;
  if (isLoading || !l) return <Loading />;
  const save = async () => { if (requireAuth(`/listing/${slug}`)) setSaved((await api(`/saved/${l.id}/toggle`, { method: 'POST', body: {} })).saved); };
  const send = async () => { try { const c2 = await api('/conversations', { body: { vendorId: l.vendor.id, body: message } }); setMessage(''); router.push(`/messages/${c2.id}`); } catch (e: any) { Alert.alert('Could not send', e.message); } };
  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: c.warmWhite }}>
      <Stack.Screen options={{ title: '', headerRight: () => <Pressable accessibilityRole="button" accessibilityLabel={saved ? 'Remove from saved' : 'Save'} onPress={save}><Heart color={saved ? c.ruby : c.text} fill={saved ? c.ruby : 'transparent'} size={24} /></Pressable> }} />
      <ScrollView>
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>{l.media.filter((m: any) => m.type === 'IMAGE').map((m: any) => <Image key={m.id} source={m.url} style={{ width, height: width * 0.72, backgroundColor: c.blush }} contentFit="cover" accessibilityLabel={m.caption ?? l.title} />)}</ScrollView>
        <View style={{ padding: 16, gap: 16 }}>
          <View style={{ gap: 4 }}>
            <Text variant="small">{l.category.name}</Text><Text variant="h1">{l.title}</Text><Text variant="muted">by {l.vendor.businessName}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}><MapPin size={15} color={c.muted} /><Text variant="muted">{[l.area?.name, l.city.name].filter(Boolean).join(', ')}</Text></View>
            {l.capacityMax && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Users size={15} color={c.muted} /><Text variant="muted">{l.capacityMin ? `${l.capacityMin}–` : 'Up to '}{l.capacityMax} guests</Text></View>}
            {l.reviewCount > 0 && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Star size={15} color={c.gold} fill={c.gold} /><Text>{l.avgRating.toFixed(1)} ({l.reviewCount} reviews)</Text></View>}
            {l.vendor.identityVerifiedAt && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><BadgeCheck size={16} color={c.success} /><Text style={{ color: c.success }}>Identity verified</Text></View>}
            {l.vendor.businessVerifiedAt && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><BadgeCheck size={16} color={c.success} /><Text style={{ color: c.success }}>Business verified</Text></View>}
          </View>
          <View style={{ gap: 6 }}><Text variant="h2">About</Text><Text>{l.description}</Text></View>
          {l.packages.length > 0 && <View style={{ gap: 10 }}><Text variant="h2">Packages</Text>{l.packages.map((p: any) => <Card key={p.id}><Text variant="h3">{p.name}</Text><Text style={{ color: c.ruby, fontFamily: font.bold }}>{formatPKR(p.price)}{p.priceUnit === 'PER_PERSON' ? ' /person' : ''}</Text>{p.description && <Text variant="muted">{p.description}</Text>}{p.inclusions.map((x: string) => <View key={x} style={{ flexDirection: 'row', gap: 6 }}><Check size={16} color={c.success} /><Text style={{ flex: 1 }}>{x}</Text></View>)}{p.exclusions.length > 0 && <Text variant="small">Not included: {p.exclusions.join(', ')}</Text>}</Card>)}</View>}
          {l.addOns.length > 0 && <Card title="Add-ons">{l.addOns.map((a: any) => <Row key={a.id} label={a.name} value={formatPKR(a.price)} />)}</Card>}
          {l.amenities.length > 0 && <View style={{ gap: 6 }}><Text variant="h2">Facilities</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{l.amenities.map((a: string) => <View key={a} style={{ backgroundColor: c.blush, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 }}><Text style={{ fontSize: 13 }}>{a}</Text></View>)}</View></View>}
          <View style={{ gap: 10 }}><Text variant="h2">Reviews</Text>{l.reviews.length === 0 ? <Text variant="muted">No reviews yet. Reviews come only from customers with a completed booking.</Text> : l.reviews.map((r: any) => <Card key={r.id}><Text variant="bold">{r.customer.name} · {r.rating}/5</Text><Text variant="small">{fmtDate(r.createdAt)}</Text><Text>{r.comment}</Text>{r.reply && <Text variant="muted">Vendor reply: {r.reply}</Text>}</Card>)}</View>
          {user && <Card title="Ask a question"><Field label="Message the vendor" multiline value={message} onChangeText={setMessage} /><Button title="Send" variant="secondary" disabled={!message.trim()} onPress={send} /></Card>}
        </View>
      </ScrollView>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 12, borderTopWidth: 1, borderColor: c.border, backgroundColor: '#fff' }}>
        <View><Text variant="small">From</Text><Text style={{ fontFamily: font.bold, fontSize: 17 }}>{formatPKR(l.startingPrice)}</Text></View>
        <Button title="Request quote" onPress={() => { const to = { pathname: '/request', params: { ids: l.id, packages: JSON.stringify(l.packages.map((p: any) => ({ label: p.name, value: p.id }))) } } as const; if (requireAuth(`/listing/${slug}`)) router.push(to); }} />
      </View>
    </SafeAreaView>
  );
}
