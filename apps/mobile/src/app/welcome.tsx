import { brand, colors } from '@mehfil/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Text } from '@/components/ui';

const SLIDES = [
  ['Find trusted vendors', 'Verified halls, caterers, decorators and photographers in Karachi.'],
  ['Compare real quotations', 'Ask several vendors at once and see their offers side by side.'],
  ['Book with your terms on record', 'Your price, schedule and cancellation policy stay saved with your booking.'],
];

export default function Welcome() {
  const [i, setI] = useState(0);
  const finish = async (to: '/register' | '/' | '/login') => { await AsyncStorage.setItem('mf_welcomed', '1'); router.replace(to); };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.warmWhite, padding: 24, justifyContent: 'space-between' }}>
      <View />
      <View style={{ alignItems: 'center', gap: 22 }}>
        <Image source={require('../../assets/logo.webp')} style={{ width: '88%', aspectRatio: 800 / 502 }} contentFit="contain" accessibilityLabel={brand.name} />
        <Text variant="h1" style={{ textAlign: 'center' }}>{SLIDES[i][0]}</Text>
        <Text variant="muted" style={{ textAlign: 'center', fontSize: 16, lineHeight: 23 }}>{SLIDES[i][1]}</Text>
      </View>
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 8 }}>{SLIDES.map((_, n) => <View key={n} style={{ width: n === i ? 22 : 7, height: 7, borderRadius: 4, backgroundColor: n === i ? colors.ruby : colors.border }} />)}</View>
        {i < SLIDES.length - 1 ? <Button title="Next" onPress={() => setI(i + 1)} /> : <Button title="Create account" onPress={() => finish('/register')} />}
        <Button title="Browse as guest" variant="outline" onPress={() => finish('/')} />
      </View>
    </SafeAreaView>
  );
}
