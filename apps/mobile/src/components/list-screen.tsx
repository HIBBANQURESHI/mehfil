import { ReactNode } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { c, Empty, ErrorView, Loading } from './ui';
import { useApi } from '@/lib/api';

export function ListScreen<T extends { id: string }>({ path, render, onPress, emptyTitle, emptyBody, unwrap = true }: { path: string; render: (item: T) => ReactNode; onPress?: (item: T) => void; emptyTitle: string; emptyBody?: string; unwrap?: boolean }) {
  const { data, error, isLoading, mutate } = useApi<any>(path);
  const items: T[] = unwrap ? data?.items : data;
  return <FlatList style={{ backgroundColor: c.warmWhite }} contentContainerStyle={{ padding: 16, gap: 10 }} data={items ?? []} keyExtractor={(x) => x.id} refreshing={false} onRefresh={() => mutate()} ListEmptyComponent={error ? <ErrorView error={error} retry={() => mutate()} /> : isLoading ? <Loading /> : <Empty title={emptyTitle} body={emptyBody} />} renderItem={({ item }) => { const body = <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: c.border, padding: 14, gap: 4 }}>{render(item)}</View>; return onPress ? <Pressable accessibilityRole="button" onPress={() => onPress(item)}>{body}</Pressable> : body; }} />;
}
