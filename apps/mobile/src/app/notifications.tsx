import { router } from 'expo-router';
import { View } from 'react-native';
import { ListScreen } from '@/components/list-screen';
import { c, Text } from '@/components/ui';
import { api, linkToRoute } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
export default function Page() { return <ListScreen<any> path="/notifications?pageSize=50" emptyTitle="You're all caught up" onPress={async (n) => { if (!n.readAt) await api(`/notifications/${n.id}/read`, { method: 'POST', body: {} }); const to = linkToRoute(n.link); if (to && to !== '/notifications') router.push(to as never); }} render={(n) => <View style={{ flexDirection: 'row', gap: 8 }}>{!n.readAt && <View accessibilityLabel="Unread" style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.ruby, marginTop: 7 }} />}<View style={{ flex: 1 }}><Text variant="bold">{n.title}</Text><Text variant="muted">{n.body}</Text><Text variant="small">{fmtDateTime(n.createdAt)}</Text></View></View>} />; }
