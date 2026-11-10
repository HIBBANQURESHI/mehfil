import { Tabs } from 'expo-router';
import { CalendarHeart, Compass, Heart, House, UserRound } from 'lucide-react-native';
import { c, font } from '@/components/ui';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: c.ruby, tabBarInactiveTintColor: c.muted, tabBarLabelStyle: { fontFamily: font.medium, fontSize: 11 }, tabBarStyle: { backgroundColor: '#fff', borderTopColor: c.border } }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <House color={color} size={size} /> }} />
      <Tabs.Screen name="explore" options={{ title: 'Explore', tabBarIcon: ({ color, size }) => <Compass color={color} size={size} /> }} />
      <Tabs.Screen name="saved" options={{ title: 'Saved', tabBarIcon: ({ color, size }) => <Heart color={color} size={size} /> }} />
      <Tabs.Screen name="wedding" options={{ title: 'My Wedding', tabBarIcon: ({ color, size }) => <CalendarHeart color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <UserRound color={color} size={size} /> }} />
    </Tabs>
  );
}
