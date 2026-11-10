import { router } from 'expo-router';
import { ListScreen } from '@/components/list-screen';
import { Status, Text } from '@/components/ui';
import { fmtDate } from '@/lib/format';
export default function Page() { return <ListScreen<any> path="/enquiries?pageSize=50" emptyTitle="No enquiries yet" emptyBody="Request a quotation from any vendor to get started." onPress={(e) => router.push(`/enquiries/${e.id}`)} render={(e) => <><Text variant="bold">{e.vendor.businessName}</Text><Text variant="small">{e.code} · {fmtDate(e.eventDate)} · {e.guestCount} guests</Text><Status value={e.status} /></>} />; }
