import { BlurView } from 'expo-blur';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { c, font, Text } from './ui';

export type AlertButton = { text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void | Promise<void> };
type Item = { id: number; title: string; message?: string; buttons: AlertButton[] };

let queue: Item[] = [];
let seq = 0;
const listeners = new Set<(q: Item[]) => void>();
const emit = () => listeners.forEach((l) => l(queue));

/**
 * Mehfil's own alert, in place of the phone's system dialog: same arguments as React Native's Alert.alert,
 * drawn as a frosted-glass card in the brand colours. Alerts that arrive together are shown one after another.
 */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]) {
  queue = [...queue, { id: ++seq, title, message, buttons: buttons?.length ? buttons : [{ text: 'OK' }] }];
  emit();
}

/** Mount once near the root of the app. */
export function AlertHost() {
  const [items, setItems] = useState<Item[]>(queue);
  const fade = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;
  useEffect(() => { listeners.add(setItems); return () => { listeners.delete(setItems); }; }, []);
  const current = items[0];

  useEffect(() => {
    if (!current) return;
    fade.setValue(0); lift.setValue(0);
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(lift, { toValue: 1, friction: 8, tension: 90, useNativeDriver: true }),
    ]).start();
    AccessibilityInfo.announceForAccessibility([current.title, current.message].filter(Boolean).join('. '));
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = (b?: AlertButton) => {
    Animated.timing(fade, { toValue: 0, duration: 140, useNativeDriver: true }).start(() => {
      queue = queue.slice(1);
      emit();
      void b?.onPress?.();
    });
  };
  if (!current) return null;

  const cancel = current.buttons.find((b) => b.style === 'cancel') ?? (current.buttons.length > 1 ? current.buttons[0] : current.buttons[0]);
  const stacked = current.buttons.length > 2;
  const blur = Platform.OS === 'android' ? { experimentalBlurMethod: 'dimezisBlurView' as const } : {};

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={() => close(cancel)}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
        <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} {...blur} />
        <Pressable accessibilityLabel="Close" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(42,11,20,0.45)' }]} onPress={() => current.buttons.length === 1 && close(current.buttons[0])} />
      </Animated.View>
      <View pointerEvents="box-none" style={s.center}>
        <Animated.View accessibilityViewIsModal accessibilityRole="alert" style={[s.shadow, { opacity: fade, transform: [{ translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }, { scale: lift.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }] }]}>
          <BlurView intensity={60} tint="light" style={s.card} {...blur}>
            <View style={s.glassTint} />
            <View style={s.glow} />
            <View style={s.body}>
              <View style={s.ornament} />
              <Text style={s.title}>{current.title}</Text>
              {!!current.message && <Text style={s.message}>{current.message}</Text>}
            </View>
            <View style={[s.actions, stacked && { flexDirection: 'column' }]}>
              {current.buttons.map((b, i) => {
                const primary = b.style !== 'cancel' && (current.buttons.length === 1 || i === current.buttons.length - 1);
                const danger = b.style === 'destructive';
                return (
                  <Pressable key={`${b.text}${i}`} accessibilityRole="button" onPress={() => close(b)}
                    style={({ pressed }) => [s.btn, !stacked && { flex: 1 }, danger ? s.btnDanger : primary ? s.btnPrimary : s.btnGhost, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}>
                    <Text style={[s.btnText, (danger || primary) && { color: '#fff' }]}>{b.text}</Text>
                  </Pressable>
                );
              })}
            </View>
          </BlurView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  shadow: { width: '100%', maxWidth: 360, borderRadius: 26, shadowColor: '#5E1F31', shadowOpacity: 0.35, shadowRadius: 30, shadowOffset: { width: 0, height: 14 }, elevation: 18 },
  card: { borderRadius: 26, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.65)' },
  glassTint: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,253,249,0.72)' },
  glow: { position: 'absolute', top: -80, right: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(217,140,157,0.28)' },
  body: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 8, alignItems: 'center', gap: 8 },
  ornament: { width: 34, height: 4, borderRadius: 2, backgroundColor: c.gold, marginBottom: 4 },
  title: { fontFamily: font.display, fontSize: 20, lineHeight: 26, color: c.ruby, textAlign: 'center' },
  message: { fontSize: 15, lineHeight: 21, color: c.text, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10, padding: 16, paddingTop: 14 },
  btn: { minHeight: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnPrimary: { backgroundColor: c.ruby },
  btnDanger: { backgroundColor: c.error },
  btnGhost: { backgroundColor: 'rgba(255,255,255,0.55)', borderWidth: 1, borderColor: 'rgba(143,48,72,0.25)' },
  btnText: { fontFamily: font.bold, fontSize: 15, color: c.ruby },
});
