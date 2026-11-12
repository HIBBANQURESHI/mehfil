import { brand, colors } from '@mehfil/shared';
import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { font, Text } from './ui';

// Deeper and lighter tones derived from the brand palette. NIGHT also matches the native splash colour in app.json.
const NIGHT = '#3E1220';
const DEEP = '#5E1F31';
const PALE_GOLD = '#F3DFB4';

// The glowing logo artwork is 900 x 617. These are its lantern and stars, as fractions of its width and height.
const LOGO_RATIO = 617 / 900;
const LANTERN = { x: 0.262, y: 0.355 };
const STARS = [{ x: 0.871, y: 0.425, size: 0.05, delay: 0 }, { x: 0.912, y: 0.469, size: 0.032, delay: 700 }, { x: 0.594, y: 0.843, size: 0.036, delay: 1300 }];

const sparklePath = (s: number) => `M0 ${-s}L${s * 0.22} ${-s * 0.22}L${s} 0L${s * 0.22} ${s * 0.22}L0 ${s}L${-s * 0.22} ${s * 0.22}L${-s} 0L${-s * 0.22} ${-s * 0.22}Z`;

/** Deterministic positions, so the scene looks the same every launch instead of jumping around. */
function seeded(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

interface Mote { x: number; y: number; size: number; kind: 'sparkle' | 'petal'; delay: number; duration: number; drift: number }

function Floating({ m, reduce }: { m: Mote; reduce: boolean }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return;
    const run = Animated.sequence([Animated.delay(m.delay), Animated.loop(Animated.timing(t, { toValue: 1, duration: m.duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }))]);
    run.start();
    return () => run.stop();
  }, [m, reduce, t]);
  const s = m.size;
  return (
    <Animated.View pointerEvents="none" style={{
      position: 'absolute', left: m.x - s, top: m.y - s,
      opacity: t.interpolate({ inputRange: [0, 0.25, 0.7, 1], outputRange: [0, m.kind === 'sparkle' ? 1 : 0.75, 0.5, 0] }),
      transform: [
        { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -90] }) },
        { translateX: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, m.drift, 0] }) },
        { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', m.kind === 'petal' ? '160deg' : '45deg'] }) },
      ],
    }}>
      <Svg width={s * 2} height={s * 2} viewBox={`${-s} ${-s} ${s * 2} ${s * 2}`}>
        {m.kind === 'sparkle'
          ? <Path d={sparklePath(s)} fill={PALE_GOLD} />
          : <Path d={`M0 ${-s}C${s * 0.9} ${-s * 0.6} ${s * 0.7} ${s * 0.6} 0 ${s}C${-s * 0.7} ${s * 0.6} ${-s * 0.9} ${-s * 0.6} 0 ${-s}Z`} fill={colors.blush} opacity={0.85} />}
      </Svg>
    </Animated.View>
  );
}

/** One of the logo's own stars, twinkling in place. */
function Twinkle({ x, y, size, delay, reduce }: { x: number; y: number; size: number; delay: number; reduce: boolean }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return;
    const run = Animated.sequence([Animated.delay(1500 + delay), Animated.loop(Animated.sequence([
      Animated.timing(t, { toValue: 1, duration: 650, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(t, { toValue: 0, duration: 900, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.delay(900),
    ]))]);
    run.start();
    return () => run.stop();
  }, [t, delay, reduce]);
  const s = size * 1.6;
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', left: x - s, top: y - s, opacity: t, transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.15] }) }, { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '25deg'] }) }] }}>
      <Svg width={s * 2} height={s * 2} viewBox={`${-s} ${-s} ${s * 2} ${s * 2}`}>
        <Defs>
          <RadialGradient id="starGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#FFF6DD" stopOpacity="0.9" />
            <Stop offset="1" stopColor={colors.gold} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle r={s} fill="url(#starGlow)" />
        <Path d={sparklePath(size)} fill="#FFF8E6" />
      </Svg>
    </Animated.View>
  );
}

/** The logo's lantern, flickering like a real flame. */
function Lantern({ x, y, radius, reduce }: { x: number; y: number; radius: number; reduce: boolean }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return;
    const steps = [0.55, 0.95, 0.7, 1, 0.6, 0.9, 0.75, 1, 0.65];
    const run = Animated.sequence([Animated.delay(1100), Animated.loop(Animated.sequence(steps.map((v, i) => Animated.timing(t, { toValue: v, duration: 140 + ((i * 97) % 260), easing: Easing.inOut(Easing.quad), useNativeDriver: true }))))]);
    run.start();
    return () => run.stop();
  }, [t, reduce]);
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', left: x - radius, top: y - radius, opacity: t }}>
      <Svg width={radius * 2} height={radius * 2}>
        <Defs>
          <RadialGradient id="flame" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#FFE7A8" stopOpacity="0.85" />
            <Stop offset="0.4" stopColor="#F5B85A" stopOpacity="0.35" />
            <Stop offset="1" stopColor={colors.gold} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx={radius} cy={radius} r={radius} fill="url(#flame)" />
      </Svg>
    </Animated.View>
  );
}

/**
 * Plays once at launch, picking up exactly where the native splash (the emblem on deep wine) leaves off, then
 * dissolves into the app. It stays until the app is ready, and keeps motion minimal when the phone asks for that.
 */
export function AnimatedSplash({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const { width: W, height: H } = useWindowDimensions();
  const [reduce, setReduce] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  const started = useRef(Date.now());

  const bg = useRef(new Animated.Value(0)).current;
  const logo = useRef(new Animated.Value(0)).current;
  const tagline = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(0)).current;

  const LW = Math.min(W * 0.92, 440);
  const LH = LW * LOGO_RATIO;
  const logoTop = H * 0.4 - LH / 2;

  const motes = useMemo<Mote[]>(() => {
    const r = seeded(7);
    return Array.from({ length: 22 }, (_, i) => ({
      x: 16 + r() * (W - 32), y: H * 0.2 + r() * H * 0.75, size: i % 3 === 0 ? 5 + r() * 4 : 3 + r() * 3,
      kind: i % 3 === 0 ? 'petal' : 'sparkle', delay: r() * 1600, duration: 3800 + r() * 2600, drift: (r() - 0.5) * 34,
    }));
  }, [W, H]);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => undefined);
  }, []);

  useEffect(() => {
    const ease = Easing.out(Easing.cubic);
    const intro = Animated.parallel([
      Animated.timing(bg, { toValue: 1, duration: 700, easing: ease, useNativeDriver: true }),
      Animated.timing(logo, { toValue: 1, delay: 250, duration: reduce ? 400 : 1300, easing: Easing.out(Easing.exp), useNativeDriver: true }),
      Animated.timing(tagline, { toValue: 1, delay: 1200, duration: 700, easing: ease, useNativeDriver: true }),
    ]);
    intro.start(() => setIntroDone(true));
    const loops = Animated.parallel([
      Animated.loop(Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])),
      Animated.loop(Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])),
    ]);
    if (!reduce) loops.start();
    return () => { intro.stop(); loops.stop(); };
  }, [bg, logo, tagline, glow, float, reduce]);

  useEffect(() => {
    if (!ready || !introDone) return;
    const minimum = reduce ? 1200 : 2900;
    const wait = Math.max(minimum - (Date.now() - started.current), 0);
    const timer = setTimeout(() => {
      Animated.timing(exit, { toValue: 1, duration: 550, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => onDone());
    }, wait);
    return () => clearTimeout(timer);
  }, [ready, introDone, reduce, exit, onDone]);

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLabel={`${brand.name}. ${brand.tagline}`}
      onLayout={() => SplashScreen.hideAsync().catch(() => undefined)}
      style={[StyleSheet.absoluteFill, { backgroundColor: NIGHT, zIndex: 100, opacity: exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ scale: exit.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }] }]}
    >
      <StatusBar style="light" />

      <Animated.View style={[StyleSheet.absoluteFill, { opacity: bg }]}>
        <Svg width={W} height={H}>
          <Defs>
            <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={NIGHT} />
              <Stop offset="0.38" stopColor={DEEP} />
              <Stop offset="0.72" stopColor={colors.ruby} />
              <Stop offset="1" stopColor={colors.rose} />
            </LinearGradient>
            <RadialGradient id="haze" cx="50%" cy="100%" r="70%">
              <Stop offset="0" stopColor={colors.blush} stopOpacity="0.55" />
              <Stop offset="1" stopColor={colors.blush} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width={W} height={H} fill="url(#sky)" />
          <Ellipse cx={W / 2} cy={H} rx={W} ry={H * 0.42} fill="url(#haze)" />
        </Svg>
      </Animated.View>

      {/* A warm halo behind the logo that slowly breathes. */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: Animated.multiply(bg, glow.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] })) }]}>
        <Svg width={W} height={H}>
          <Defs>
            <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={colors.gold} stopOpacity="0.4" />
              <Stop offset="0.45" stopColor={colors.rose} stopOpacity="0.16" />
              <Stop offset="1" stopColor={colors.rose} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx={W / 2} cy={logoTop + LH * 0.5} r={LW * 0.75} fill="url(#halo)" />
        </Svg>
      </Animated.View>

      {motes.map((m, i) => <Floating key={i} m={m} reduce={reduce} />)}

      <Animated.View style={{
        position: 'absolute', left: (W - LW) / 2, top: logoTop, width: LW, height: LH,
        opacity: logo,
        transform: [
          { translateY: Animated.add(logo.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }), float.interpolate({ inputRange: [0, 1], outputRange: [0, -5] })) },
          { scale: logo.interpolate({ inputRange: [0, 1], outputRange: [0.84, 1] }) },
        ],
      }}>
        <Image source={require('../../assets/logo-glow.webp')} style={{ width: LW, height: LH }} contentFit="contain" />
        <Lantern x={LANTERN.x * LW} y={LANTERN.y * LH} radius={LW * 0.1} reduce={reduce} />
        {STARS.map((s) => <Twinkle key={s.delay} x={s.x * LW} y={s.y * LH} size={s.size * LW} delay={s.delay} reduce={reduce} />)}
      </Animated.View>

      <Animated.View style={{ position: 'absolute', left: 24, right: 24, top: logoTop + LH + 12, alignItems: 'center', opacity: tagline, transform: [{ translateY: tagline.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <View style={{ width: 44, height: StyleSheet.hairlineWidth * 2, backgroundColor: colors.gold }} />
          <View style={{ width: 7, height: 7, backgroundColor: colors.gold, transform: [{ rotate: '45deg' }] }} />
          <View style={{ width: 44, height: StyleSheet.hairlineWidth * 2, backgroundColor: colors.gold }} />
        </View>
        <Text style={{ fontFamily: font.medium, fontSize: 16, lineHeight: 23, color: colors.warmWhite, textAlign: 'center', opacity: 0.94 }}>{brand.tagline}</Text>
        <Text style={{ fontFamily: font.sans, fontSize: 13, lineHeight: 19, color: PALE_GOLD, textAlign: 'center', marginTop: 6 }}>{brand.urduLine}</Text>
      </Animated.View>
    </Animated.View>
  );
}
