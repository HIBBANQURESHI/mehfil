import { brand, colors } from '@mehfil/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Text } from '@/components/ui';

const SLIDES = [
  ['Find trusted vendors', 'Verified halls, caterers, decorators and photographers in Karachi.'],
  ['Compare real quotations', 'Ask several vendors at once and see their offers side by side.'],
  ['Book with your terms on record', 'Your price, schedule and cancellation policy stay saved with your booking.'],
];

function Arch() {
  return <Svg width={190} height={215} viewBox="0 0 300 340"><Path d="M5 340V150C5 62 95 44 150 10C205 44 295 62 295 150V340Z" fill={colors.ruby} /><Path d="M43 340V170C43 100 110 80 150 54C190 80 257 100 257 170V340Z" fill={colors.rose} /><Path d="M70 340V190C70 130 122 118 150 96C178 118 230 130 230 190V340Z" fill={colors.blush} /><Path d="M150 232c10 12 22 18 22 34a22 22 0 0 1-44 0c0-16 12-22 22-34z" fill={colors.ruby} /><Circle cx={150} cy={268} r={6} fill={colors.gold} /></Svg>;
}

export default function Welcome() {
  const [i, setI] = useState(0);
  const finish = async (to: '/register' | '/' | '/login') => { await AsyncStorage.setItem('mf_welcomed', '1'); router.replace(to); };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.warmWhite, padding: 24, justifyContent: 'space-between' }}>
      <Text variant="h2" style={{ color: colors.ruby, textAlign: 'center' }}>{brand.name}</Text>
      <View style={{ alignItems: 'center', gap: 22 }}><Arch /><Text variant="h1" style={{ textAlign: 'center' }}>{SLIDES[i][0]}</Text><Text variant="muted" style={{ textAlign: 'center', fontSize: 16, lineHeight: 23 }}>{SLIDES[i][1]}</Text></View>
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 8 }}>{SLIDES.map((_, n) => <View key={n} style={{ width: n === i ? 22 : 7, height: 7, borderRadius: 4, backgroundColor: n === i ? colors.ruby : colors.border }} />)}</View>
        {i < SLIDES.length - 1 ? <Button title="Next" onPress={() => setI(i + 1)} /> : <Button title="Create account" onPress={() => finish('/register')} />}
        <Button title="Browse as guest" variant="outline" onPress={() => finish('/')} />
      </View>
    </SafeAreaView>
  );
}
