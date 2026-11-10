import { formatPKR } from '@mehfil/shared';
import { router } from 'expo-router';
import { ListScreen } from '@/components/list-screen';
import { Status, Text } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';
export default function Page() { return <ListScreen<any> path="/payments?pageSize=50" emptyTitle="No payments yet" onPress={(p) => router.push(`/bookings/${p.booking.id}`)} render={(p) => <><Text variant="bold">{formatPKR(p.amount)}</Text><Text>{p.booking.listing.title}</Text><Text variant="small">{p.code} · {p.milestone.label} · {fmtDateTime(p.succeededAt ?? p.createdAt)}</Text>{p.refundedAmount > 0 && <Text variant="small">Refunded {formatPKR(p.refundedAmount)}</Text>}<Status value={p.status} /></>} />; }
