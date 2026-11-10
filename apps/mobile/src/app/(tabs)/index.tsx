import { brand } from '@mehfil/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect, router } from 'expo-router';
import { Bell, Search } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { CategoryIcon } from '@/components/category-icon';
import { ListingCard } from '@/components/listing-card';
import { Button, c, Card, Screen, Text } from '@/components/ui';
import { useApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function Home() {
  const { user } = useAuth();
  const [seen, setSeen] = useState<boolean | null>(null);
  useEffect(() => { AsyncStorage.getItem('mf_welcomed').then((v) => setSeen(!!v)); }, []);
  const cats = useApi<any[]>('/categories');
  const featured = useApi<any[]>('/featured');
  const top = useApi<any[]>('/top-rated');
  const unread = useApi<any>(user ? '/notifications?pageSize=1' : null);
  if (seen === false && !user) return <Redirect href="/welcome" />;
  const featuredIds = new Set(featured.data?.map((l) => l.id));
  const popular = top.data?.filter((l) => !featuredIds.has(l.id)) ?? [];
  const strip = (title: string, items: any[]) => items.length > 0 && <View style={{ gap: 10 }}><Text variant="h2" style={{ paddingHorizontal: 16 }}>{title}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }}>{items.map((l) => <ListingCard key={l.id} l={l} width={240} />)}</ScrollView></View>;
  return (
    <Screen padded={false} edges={['top']} onRefresh={() => Promise.all([cats.mutate(), featured.mutate(), top.mutate()])}>
      <View style={{ gap: 20, paddingTop: 8 }}>
        <View style={{ paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View><Text variant="h2" style={{ color: c.ruby }}>{brand.name}</Text><Text variant="small">Karachi</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Notifications" onPress={() => router.push(user ? '/notifications' : { pathname: '/login', params: { next: '/notifications' } })} style={{ padding: 8 }}>
            <Bell color={c.text} size={24} />
            {!!unread.data?.unread && <View style={{ position: 'absolute', right: 2, top: 2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: c.ruby, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 10, lineHeight: 13 }}>{unread.data.unread > 99 ? '99+' : unread.data.unread}</Text></View>}
          </Pressable>
        </View>
        <Pressable accessibilityRole="search" onPress={() => router.push('/explore')} style={{ marginHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: c.border, borderRadius: 14, padding: 14 }}><Search color={c.muted} size={18} /><Text variant="muted">Find halls, caterers, decorators...</Text></Pressable>
        <View style={{ marginHorizontal: 16 }}><Card style={{ backgroundColor: c.ruby, borderColor: c.ruby }}><Text variant="h2" style={{ color: '#fff' }}>{brand.tagline}</Text><Text style={{ color: '#F3DCE1' }}>{brand.urduLine}</Text><Button title="Plan my wedding" variant="secondary" style={{ alignSelf: 'flex-start', marginTop: 4 }} onPress={() => router.push(user ? '/wedding/new' : { pathname: '/login', params: { next: '/wedding/new' } })} /></Card></View>
        <View style={{ paddingHorizontal: 16, flexDirection: 'row', flexWrap: 'wrap', rowGap: 16 }}>
          {cats.data?.map((cat) => <Pressable key={cat.slug} accessibilityRole="button" accessibilityLabel={cat.name} onPress={() => router.push({ pathname: '/explore', params: { category: cat.slug } })} style={{ width: '25%', alignItems: 'center', gap: 6 }}><View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: c.blush, alignItems: 'center', justifyContent: 'center' }}><CategoryIcon name={cat.iconKey} color={c.ruby} /></View><Text style={{ fontSize: 12, lineHeight: 15, textAlign: 'center' }} numberOfLines={2}>{cat.name}</Text></Pressable>)}
        </View>
        {strip('Featured', featured.data ?? [])}
        {strip('Popular in Karachi', popular)}
      </View>
    </Screen>
  );
}
