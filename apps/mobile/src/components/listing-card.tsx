import { formatPKR } from '@mehfil/shared';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { BadgeCheck, MapPin, Star } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { c, font, Text } from './ui';

export function ListingCard({ l, width }: { l: any; width?: number }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={l.title} onPress={() => router.push(`/listing/${l.slug}`)} style={{ width, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: c.border, overflow: 'hidden' }}>
      <View style={{ aspectRatio: 4 / 3, backgroundColor: c.blush }}>
        {l.media[0] && <Image source={l.media[0].url} style={{ flex: 1 }} contentFit="cover" transition={150} accessibilityIgnoresInvertColors />}
        {l.featured && <View style={{ position: 'absolute', top: 10, left: 10, backgroundColor: c.gold, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}><Text style={{ fontSize: 11, fontFamily: font.bold }}>Featured</Text></View>}
      </View>
      <View style={{ padding: 12, gap: 3 }}>
        <Text variant="small">{l.category.name}</Text>
        <Text variant="h3" numberOfLines={1}>{l.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><MapPin size={13} color={c.muted} /><Text variant="small" numberOfLines={1}>{[l.area?.name, l.city.name].filter(Boolean).join(', ')}</Text></View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
          <Text style={{ fontFamily: font.bold, fontSize: 14 }}>{formatPKR(l.startingPrice)}{l.priceUnit === 'PER_PERSON' ? ' /person' : ''}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {l.vendor.identityVerifiedAt && <BadgeCheck size={16} color={c.success} accessibilityLabel="Verified" />}
            {l.reviewCount > 0 ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}><Star size={13} color={c.gold} fill={c.gold} /><Text style={{ fontSize: 12 }}>{l.avgRating.toFixed(1)}</Text></View> : <Text variant="small">New</Text>}
          </View>
        </View>
      </View>
    </Pressable>
  );
}
