import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold } from '@expo-google-fonts/dm-sans';
import { PlayfairDisplay_600SemiBold } from '@expo-google-fonts/playfair-display';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AnimatedSplash } from '@/components/animated-splash';
import { c, font } from '@/components/ui';
import { linkToRoute } from '@/lib/api';
import { AuthProvider, useAuth } from '@/lib/auth';
import { AlertHost } from '@/components/alert';

SplashScreen.preventAutoHideAsync().catch(() => undefined);
if (Platform.OS !== 'web') Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });

function Nav() {
  const { ready } = useAuth();
  const [fonts] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, PlayfairDisplay_600SemiBold });
  const [splash, setSplash] = useState(true);
  const endSplash = useCallback(() => setSplash(false), []);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationResponseReceivedListener((r) => { const to = linkToRoute(r.notification.request.content.data?.link as string); if (to) router.push(to as never); });
    return () => sub.remove();
  }, []);
  // The native splash stays up until fonts load; the animated one then takes over and waits for the session check.
  if (!fonts) return null;
  const title = (t: string) => ({ title: t });
  // One splash instance across loading and the app appearing underneath, so the animation never restarts.
  return (
    <>
      {!splash && <StatusBar style="dark" />}
      {ready && <Stack screenOptions={{ headerStyle: { backgroundColor: c.warmWhite }, headerTintColor: c.ruby, headerTitleStyle: { fontFamily: font.display, color: c.text }, headerShadowVisible: false, contentStyle: { backgroundColor: c.warmWhite }, headerBackButtonDisplayMode: 'minimal' }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={title('Sign in')} />
        <Stack.Screen name="register" options={title('Create account')} />
        <Stack.Screen name="verify" options={title('Verify your number')} />
        <Stack.Screen name="forgot" options={title('Reset password')} />
        <Stack.Screen name="listing/[slug]" options={title('')} />
        <Stack.Screen name="request" options={{ ...title('Request quotation'), presentation: 'modal' }} />
        <Stack.Screen name="enquiries/index" options={title('My enquiries')} />
        <Stack.Screen name="enquiries/[id]" options={title('Enquiry')} />
        <Stack.Screen name="quotations/index" options={title('Quotations')} />
        <Stack.Screen name="quotations/[id]" options={title('Quotation')} />
        <Stack.Screen name="bookings/index" options={title('My bookings')} />
        <Stack.Screen name="bookings/[id]" options={title('Booking')} />
        <Stack.Screen name="payments" options={title('Payments')} />
        <Stack.Screen name="notifications" options={title('Notifications')} />
        <Stack.Screen name="messages/index" options={title('Messages')} />
        <Stack.Screen name="messages/[id]" options={title('Conversation')} />
        <Stack.Screen name="support/index" options={title('Help and support')} />
        <Stack.Screen name="support/[id]" options={title('Ticket')} />
        <Stack.Screen name="plan" options={title("Plan my wedding")} />
        <Stack.Screen name="wedding/[id]" options={title('My wedding')} />
        <Stack.Screen name="settings" options={title('Account settings')} />
      </Stack>}
      {/* Last, so it draws above the native navigation views. */}
      {splash && <AnimatedSplash ready={ready} onDone={endSplash} />}
    </>
  );
}

export default function Root() { return <SafeAreaProvider><AuthProvider><Nav /><AlertHost /></AuthProvider></SafeAreaProvider>; }
