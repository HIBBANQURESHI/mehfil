import { formatPKR } from '@mehfil/shared';
import { router } from 'expo-router';
import { ListScreen } from '@/components/list-screen';
import { Status, Text } from '@/components/ui';
import { fmtDate } from '@/lib/format';
export default function Page() { return <ListScreen<any> path="/bookings?pageSize=50" emptyTitle="No bookings yet" onPress={(b) => router.push(`/bookings/${b.id}`)} render={(b) => <><Text variant="bold">{b.listing.title}</Text><Text variant="small">{b.code} · {fmtDate(b.eventDate)}</Text><Text>{formatPKR(b.totalAmount)}</Text><Status value={b.status} /></>} />; }
