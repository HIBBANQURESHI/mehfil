import { formatPKR, statusLabel } from '@mehfil/shared';
import { router } from 'expo-router';
import { FileText, Inbox, Receipt, Wallet } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { SignInPrompt } from '@/components/sign-in-prompt';
import { Button, c, Card, Empty, ErrorView, Loading, Screen, Text } from '@/components/ui';
import { useApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate } from '@/lib/format';

const LINKS = [['Enquiries', '/enquiries', Inbox], ['Quotations', '/quotations', FileText], ['Bookings', '/bookings', Receipt], ['Payments', '/payments', Wallet]] as const;

export default function Wedding() {
  const { user } = useAuth();
  const { data, error, isLoading, mutate } = useApi<any[]>(user ? '/weddings' : null);
  if (!user) return <SignInPrompt title="Plan your wedding" body="Track functions, budget, vendors and payments in one place." next="/wedding" />;
  return (
    <Screen edges={['top']} onRefresh={() => mutate()}>
      <Text variant="h1">My Wedding</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {LINKS.map(([label, href, Icon]) => <Pressable key={label} accessibilityRole="button" onPress={() => router.push(href)} style={{ width: '47%', flexGrow: 1, flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: c.border, borderRadius: 14, padding: 14 }}><Icon color={c.ruby} size={20} /><Text>{label}</Text></Pressable>)}
      </View>
      {error ? <ErrorView error={error} retry={() => mutate()} /> : isLoading || !data ? <Loading /> : !data.length ? <Card><Empty title="Start your wedding plan" body="Add Mehndi, Baraat, Walima, your budget and a checklist." action={<Button title="Create wedding" onPress={() => router.push('/wedding/new')} />} /></Card> : <>
        {data.map((w) => <Pressable key={w.id} accessibilityRole="button" onPress={() => router.push(`/wedding/${w.id}`)}><Card><Text variant="h2">{w.title}</Text><Text variant="muted">{w.dateFrom ? fmtDate(w.dateFrom) : 'Date not set'}{w.budget !== null ? ` · ${formatPKR(w.budget)}` : ''}</Text><Text>{w.events.map((e: any) => e.name ?? statusLabel(e.type)).join(' · ')}</Text></Card></Pressable>)}
        <Button title="Add another wedding" variant="outline" onPress={() => router.push('/wedding/new')} />
      </>}
    </Screen>
  );
}
