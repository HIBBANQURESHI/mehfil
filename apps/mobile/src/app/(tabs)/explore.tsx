import { rupeesToPaisa } from '@mehfil/shared';
import { useLocalSearchParams } from 'expo-router';
import { SlidersHorizontal } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ListingCard } from '@/components/listing-card';
import { Button, c, Card, Chips, DateField, Empty, ErrorView, Field, font, Loading, Text } from '@/components/ui';
import { Paged, useApi } from '@/lib/api';

const SORTS = [{ label: 'Recommended', value: '' }, { label: 'Lowest price', value: 'price_asc' }, { label: 'Highest rated', value: 'rating' }, { label: 'Most popular', value: 'popular' }, { label: 'Newest', value: 'newest' }];

export default function Explore() {
  const params = useLocalSearchParams<{ category?: string }>();
  const cats = useApi<any[]>('/categories');
  const cities = useApi<any[]>('/cities');
  const [category, setCategory] = useState(params.category ?? '');
  useEffect(() => { if (params.category !== undefined) setCategory(params.category); }, [params.category]);
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => { const t = setTimeout(() => setTerm(q.trim()), 350); return () => clearTimeout(t); }, [q]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ city: '', area: '', date: '', guests: '', min: '', max: '', sort: '', rating: '' });
  const query = useMemo(() => {
    const p = new URLSearchParams({ pageSize: '30' });
    if (category) p.set('category', category);
    if (term) p.set('q', term);
    if (f.city) p.set('city', f.city);
    if (f.area) p.set('area', f.area);
    if (f.date) p.set('date', f.date);
    if (f.guests) p.set('guests', f.guests);
    if (f.min) p.set('minPrice', String(rupeesToPaisa(Number(f.min))));
    if (f.max) p.set('maxPrice', String(rupeesToPaisa(Number(f.max))));
    if (f.sort) p.set('sort', f.sort);
    if (f.rating) p.set('rating', f.rating);
    return p.toString();
  }, [category, term, f]);
  const { data, error, isLoading, mutate } = useApi<Paged>(`/listings?${query}`, { keepPreviousData: true });
  const city = cities.data?.find((x) => x.slug === f.city);
  const header = (
    <View style={{ gap: 12, paddingBottom: 4 }}>
      <Text variant="h1">Explore</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput accessibilityLabel="Search" value={q} onChangeText={setQ} placeholder="Search vendors" placeholderTextColor="#A8979B" style={{ flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontFamily: font.sans, color: c.text }} />
        <Pressable accessibilityRole="button" accessibilityLabel="Filters" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={{ width: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: open ? c.ruby : c.blush }}><SlidersHorizontal color={open ? '#fff' : c.ruby} size={20} /></Pressable>
      </View>
      <Chips value={category} onChange={setCategory} options={[{ label: 'All', value: '' }, ...(cats.data ?? []).map((x) => ({ label: x.name, value: x.slug }))]} />
      {open && <Card>
        <Text variant="bold">City</Text><Chips value={f.city} onChange={(v) => setF({ ...f, city: v, area: '' })} options={[{ label: 'All', value: '' }, ...(cities.data ?? []).map((x) => ({ label: x.name, value: x.slug }))]} />
        {city && <><Text variant="bold">Area</Text><Chips value={f.area} onChange={(v) => setF({ ...f, area: v })} options={[{ label: 'All', value: '' }, ...city.areas.map((a: any) => ({ label: a.name, value: a.slug }))]} /></>}
        <DateField label="Event date (free vendors only)" value={f.date} onChange={(v) => setF({ ...f, date: v })} minimumDate={new Date()} />
        <Field label="Guests" keyboardType="number-pad" value={f.guests} onChangeText={(v) => setF({ ...f, guests: v })} />
        <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Field label="Min Rs." keyboardType="number-pad" value={f.min} onChangeText={(v) => setF({ ...f, min: v })} /></View><View style={{ flex: 1 }}><Field label="Max Rs." keyboardType="number-pad" value={f.max} onChangeText={(v) => setF({ ...f, max: v })} /></View></View>
        <Text variant="bold">Rating</Text><Chips value={f.rating} onChange={(v) => setF({ ...f, rating: v })} options={[{ label: 'Any', value: '' }, { label: '4 and up', value: '4' }, { label: '3 and up', value: '3' }]} />
        <Text variant="bold">Sort</Text><Chips value={f.sort} onChange={(v) => setF({ ...f, sort: v })} options={SORTS} />
        <Button title="Clear filters" variant="outline" onPress={() => setF({ city: '', area: '', date: '', guests: '', min: '', max: '', sort: '', rating: '' })} />
      </Card>}
      {data && <Text variant="small">{data.total} {data.total === 1 ? 'result' : 'results'}</Text>}
    </View>
  );
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.warmWhite }}>
      <FlatList contentContainerStyle={{ padding: 16, gap: 14 }} data={data?.items ?? []} keyExtractor={(l) => l.id} keyboardShouldPersistTaps="handled" ListHeaderComponent={header} renderItem={({ item }) => <ListingCard l={item} />} refreshing={false} onRefresh={() => mutate()} ListEmptyComponent={error ? <ErrorView error={error} retry={() => mutate()} /> : isLoading ? <Loading /> : <Empty title="No vendors match yet" body="Try fewer filters or another date." />} />
    </SafeAreaView>
  );
}
