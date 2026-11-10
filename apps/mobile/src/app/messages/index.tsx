import { router } from 'expo-router';
import { ListScreen } from '@/components/list-screen';
import { Text } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';
export default function Page() { return <ListScreen<any> unwrap={false} path="/conversations" emptyTitle="No conversations yet" onPress={(x) => router.push(`/messages/${x.id}`)} render={(x) => <><Text variant="bold">{x.vendor.businessName}</Text><Text variant="muted" numberOfLines={1}>{x.messages[0]?.body}</Text><Text variant="small">{fmtDateTime(x.lastMessageAt)}</Text></>} />; }
