import { router, Stack } from 'expo-router';
import { CheckCheck } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { showAlert } from '@/components/alert';
import { c, Empty, ErrorView, font, Loading, Text } from '@/components/ui';
import { api, linkToRoute, refreshNotifications, useApi } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

type Note = { id: string; title: string; body: string; link?: string | null; readAt: string | null; createdAt: string };
type Page = { items: Note[]; unread: number };
const PATH = '/notifications?pageSize=50';

export default function Notifications() {
  const { data, error, isLoading, mutate } = useApi<Page>(PATH);
  const [busy, setBusy] = useState(false);
  const unread = data?.unread ?? 0;

  /** Shows the change at once, then confirms with the server and refreshes the bell badge everywhere. */
  const markRead = async (ids: string[] | 'all') => {
    const now = new Date().toISOString();
    await mutate((d) => d && {
      ...d,
      items: d.items.map((n) => (ids === 'all' || ids.includes(n.id)) && !n.readAt ? { ...n, readAt: now } : n),
      unread: ids === 'all' ? 0 : Math.max(0, d.unread - d.items.filter((n) => ids.includes(n.id) && !n.readAt).length),
    }, { revalidate: false });
    try {
      if (ids === 'all') await api('/notifications/read-all', { method: 'POST', body: {} });
      else await Promise.all(ids.map((id) => api(`/notifications/${id}/read`, { method: 'POST', body: {} })));
    } finally {
      await refreshNotifications();
    }
  };

  const readAll = async () => {
    setBusy(true);
    try { await markRead('all'); } catch (e: any) { showAlert('Could not update', e.message); } finally { setBusy(false); }
  };

  const open = (n: Note) => {
    if (!n.readAt) markRead([n.id]).catch(() => undefined);
    const to = linkToRoute(n.link);
    if (to && to !== '/notifications') router.push(to as never);
  };

  return (
    <>
      <Stack.Screen options={{
        headerRight: () => unread > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Mark all as read" onPress={readAll} disabled={busy} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 }}>
            {busy ? <ActivityIndicator color={c.ruby} size="small" /> : <CheckCheck size={18} color={c.ruby} />}
            <Text style={{ color: c.ruby, fontFamily: font.bold, fontSize: 14 }}>Read all</Text>
          </Pressable>
        ) : null,
      }} />
      <FlatList
        style={{ backgroundColor: c.warmWhite }}
        contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
        data={data?.items ?? []}
        keyExtractor={(n) => n.id}
        refreshing={false}
        onRefresh={() => { mutate(); refreshNotifications(); }}
        ListHeaderComponent={unread > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, backgroundColor: c.blush, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 }}>
            <Text style={{ flex: 1 }}><Text variant="bold">{unread}</Text> unread notification{unread === 1 ? '' : 's'}</Text>
            <Pressable accessibilityRole="button" onPress={readAll} disabled={busy} style={({ pressed }) => ({ backgroundColor: c.ruby, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, opacity: pressed || busy ? 0.8 : 1 })}>
              <Text style={{ color: '#fff', fontFamily: font.bold, fontSize: 13 }}>{busy ? 'Marking…' : 'Mark all as read'}</Text>
            </Pressable>
          </View>
        ) : undefined}
        ListEmptyComponent={error ? <ErrorView error={error} retry={() => mutate()} /> : isLoading ? <Loading /> : <Empty title="You're all caught up" />}
        renderItem={({ item: n }) => (
          <Pressable accessibilityRole="button" accessibilityLabel={`${n.readAt ? '' : 'Unread. '}${n.title}. ${n.body}`} onPress={() => open(n)}
            style={({ pressed }) => ({ backgroundColor: n.readAt ? '#fff' : '#FFF7F8', borderRadius: 14, borderWidth: 1, borderColor: n.readAt ? c.border : 'rgba(143,48,72,0.25)', padding: 14, opacity: pressed ? 0.85 : 1 })}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 7, backgroundColor: n.readAt ? 'transparent' : c.ruby }} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bold" style={n.readAt ? { fontFamily: font.medium } : undefined}>{n.title}</Text>
                <Text variant="muted">{n.body}</Text>
                <Text variant="small">{fmtDateTime(n.createdAt)}</Text>
              </View>
            </View>
          </Pressable>
        )}
      />
    </>
  );
}
