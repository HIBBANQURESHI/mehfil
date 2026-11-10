import { router } from 'expo-router';
import { Bell, ChevronRight, CreditCard, FileText, LifeBuoy, MessageCircle, Receipt, Settings } from 'lucide-react-native';
import { Linking, Pressable, View } from 'react-native';
import { SignInPrompt } from '@/components/sign-in-prompt';
import { Button, c, Screen, Text } from '@/components/ui';
import { SITE_URL } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function Profile() {
  const { user, signOut } = useAuth();
  if (!user) return <SignInPrompt title="Your Mehfil account" body="Sign in to send enquiries and manage bookings." next="/profile" />;
  const items = [['My bookings', '/bookings', Receipt], ['Quotations', '/quotations', FileText], ['Payments', '/payments', CreditCard], ['Messages', '/messages', MessageCircle], ['Notifications', '/notifications', Bell], ['Help and support', '/support', LifeBuoy], ['Account settings', '/settings', Settings]] as const;
  return (
    <Screen edges={['top']}>
      <Text variant="h1">{user.name}</Text>
      <Text variant="muted">{user.phone ?? user.email}</Text>
      <View style={{ backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: c.border }}>
        {items.map(([label, href, Icon], i) => <Pressable key={label} accessibilityRole="button" onPress={() => router.push(href)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderTopWidth: i ? 1 : 0, borderColor: c.border }}><Icon color={c.ruby} size={20} /><Text style={{ flex: 1 }}>{label}</Text><ChevronRight color={c.muted} size={18} /></Pressable>)}
      </View>
      <View style={{ flexDirection: 'row', gap: 20, justifyContent: 'center' }}><Pressable accessibilityRole="link" onPress={() => Linking.openURL(`${SITE_URL}/terms`)}><Text variant="muted">Terms</Text></Pressable><Pressable accessibilityRole="link" onPress={() => Linking.openURL(`${SITE_URL}/privacy`)}><Text variant="muted">Privacy</Text></Pressable></View>
      <Button title="Sign out" variant="outline" onPress={signOut} />
    </Screen>
  );
}
