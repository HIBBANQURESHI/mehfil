import { colors, statusLabel, statusTone } from '@mehfil/shared';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Inbox } from 'lucide-react-native';
import { ReactNode, useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text as RNText, TextInput, TextInputProps, TextProps, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError } from '@/lib/api';

export const font = { sans: 'DMSans_400Regular', medium: 'DMSans_500Medium', bold: 'DMSans_600SemiBold', display: 'PlayfairDisplay_600SemiBold' };
export const c = colors;

export function Text({ style, variant, ...rest }: TextProps & { variant?: 'h1' | 'h2' | 'h3' | 'muted' | 'small' | 'bold' }) {
  return <RNText {...rest} style={[t.base, variant && t[variant], style]} />;
}
const t = StyleSheet.create({
  base: { fontFamily: font.sans, fontSize: 15, color: c.text, lineHeight: 21 },
  h1: { fontFamily: font.display, fontSize: 28, lineHeight: 35 },
  h2: { fontFamily: font.display, fontSize: 21, lineHeight: 28 },
  h3: { fontFamily: font.display, fontSize: 17, lineHeight: 23 },
  muted: { color: '#7F6A70', fontSize: 14 },
  small: { color: '#7F6A70', fontSize: 12, lineHeight: 17 },
  bold: { fontFamily: font.bold },
});

export function Screen({ children, scroll = true, onRefresh, padded = true, edges = ['bottom'] }: { children: ReactNode; scroll?: boolean; onRefresh?: () => Promise<unknown>; padded?: boolean; edges?: ('top' | 'bottom')[] }) {
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => { setBusy(true); try { await onRefresh?.(); } finally { setBusy(false); } }, [onRefresh]);
  const pad: ViewStyle = padded ? { padding: 16, gap: 14 } : {};
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: c.warmWhite }}>
      {scroll ? <ScrollView contentContainerStyle={[pad, { paddingBottom: 32 }]} keyboardShouldPersistTaps="handled" refreshControl={onRefresh ? <RefreshControl refreshing={busy} onRefresh={refresh} tintColor={c.ruby} colors={[c.ruby]} /> : undefined}>{children}</ScrollView> : <View style={[{ flex: 1 }, pad]}>{children}</View>}
    </SafeAreaView>
  );
}

const BTN = {
  primary: { bg: c.ruby, fg: '#fff', border: c.ruby },
  secondary: { bg: c.blush, fg: c.ruby, border: c.blush },
  outline: { bg: '#fff', fg: c.text, border: c.border },
  danger: { bg: '#fff', fg: c.error, border: '#E5C3C6' },
};
export function Button({ title, onPress, variant = 'primary', busy, disabled, style }: { title: string; onPress: () => void; variant?: keyof typeof BTN; busy?: boolean; disabled?: boolean; style?: ViewStyle }) {
  const v = BTN[variant];
  const off = disabled || busy;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!off, busy: !!busy }} disabled={off} onPress={onPress} style={({ pressed }) => [{ minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 18, backgroundColor: v.bg, borderWidth: 1, borderColor: v.border, opacity: off ? 0.55 : pressed ? 0.85 : 1 }, style]}>
      {busy && <ActivityIndicator size="small" color={v.fg} />}
      <Text style={{ color: v.fg, fontFamily: font.bold }}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, error, hint, ...rest }: TextInputProps & { label: string; error?: string; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text variant="bold" style={{ fontSize: 14 }}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor="#A8979B" {...rest} style={[{ borderWidth: 1, borderColor: error ? c.error : c.border, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontFamily: font.sans, fontSize: 15, color: c.text }, rest.multiline && { minHeight: 96, textAlignVertical: 'top' }]} />
      {hint && !error && <Text variant="small">{hint}</Text>}
      {error && <Text variant="small" style={{ color: c.error }}>{error}</Text>}
    </View>
  );
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function DateField({ label, value, onChange, error, minimumDate }: { label: string; value: string; onChange: (v: string) => void; error?: string; minimumDate?: Date }) {
  const [open, setOpen] = useState(false);
  if (Platform.OS === 'web') return <Field label={label} value={value} onChangeText={onChange} placeholder="YYYY-MM-DD" error={error} />;
  return (
    <View style={{ gap: 6 }}>
      <Text variant="bold" style={{ fontSize: 14 }}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => setOpen(true)} style={{ borderWidth: 1, borderColor: error ? c.error : c.border, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12 }}><Text style={!value ? { color: '#A8979B' } : undefined}>{value || 'Choose a date'}</Text></Pressable>
      {error && <Text variant="small" style={{ color: c.error }}>{error}</Text>}
      {open && <DateTimePicker mode="date" minimumDate={minimumDate} value={value ? new Date(`${value}T12:00:00`) : new Date()} onChange={(e, d) => { setOpen(Platform.OS === 'ios'); if (e.type === 'set' && d) onChange(iso(d)); }} />}
    </View>
  );
}

export function Chips({ options, value, onChange, scroll = true }: { options: { label: string; value: string }[]; value: string; onChange: (v: string) => void; scroll?: boolean }) {
  const items = options.map((o) => { const on = o.value === value; return <Pressable key={o.value} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onChange(o.value)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: on ? c.ruby : c.border, backgroundColor: on ? c.ruby : '#fff' }}><Text style={{ fontSize: 13, color: on ? '#fff' : c.text }}>{o.label}</Text></Pressable>; });
  return scroll ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{items}</ScrollView> : <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{items}</View>;
}

export function Card({ title, children, style }: { title?: string; children: ReactNode; style?: ViewStyle }) {
  return <View style={[{ backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 16, gap: 10 }, style]}>{title && <Text variant="h3">{title}</Text>}{children}</View>;
}

export function Row({ label, value, bold }: { label: string; value: ReactNode; bold?: boolean }) {
  return <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}><Text variant={bold ? 'bold' : 'muted'} style={{ flexShrink: 1 }}>{label}</Text>{typeof value === 'string' || typeof value === 'number' ? <Text variant={bold ? 'bold' : undefined} style={{ flexShrink: 1, textAlign: 'right' }}>{value}</Text> : value}</View>;
}

const TONE = { good: ['#E4EEE9', c.success], warn: ['#F6ECD8', '#8F6518'], bad: ['#F6E4E5', c.error], info: [c.blush, c.ruby], neutral: ['#EEEAEB', c.text] } as const;
export function Status({ value }: { value: string }) {
  const [bg, fg] = TONE[statusTone(value)];
  return <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' }}><Text style={{ color: fg, fontSize: 12, fontFamily: font.medium }}>{statusLabel(value)}</Text></View>;
}

export function Loading() { return <View style={{ padding: 48, alignItems: 'center' }}><ActivityIndicator color={c.ruby} accessibilityLabel="Loading" /></View>; }

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return <View style={{ alignItems: 'center', padding: 32, gap: 6 }}><View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.blush, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}><Inbox size={22} color={c.ruby} /></View><Text variant="bold" style={{ textAlign: 'center' }}>{title}</Text>{body && <Text variant="muted" style={{ textAlign: 'center' }}>{body}</Text>}{action && <View style={{ marginTop: 10 }}>{action}</View>}</View>;
}

export function ErrorView({ error, retry }: { error: unknown; retry?: () => void }) {
  return <View style={{ padding: 24, gap: 12, alignItems: 'center' }}><Text style={{ color: c.error, textAlign: 'center' }}>{error instanceof Error ? error.message : 'Something went wrong.'}</Text>{retry && <Button title="Try again" variant="outline" onPress={retry} />}</View>;
}

export function FormError({ message }: { message: string | null }) { return message ? <Text accessibilityRole="alert" style={{ color: c.error, fontSize: 14 }}>{message}</Text> : null; }

export function useForm<T extends Record<string, any>>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const set = <K extends keyof T>(k: K, v: T[K]) => setValues((x) => ({ ...x, [k]: v }));
  const bind = (k: keyof T & string) => ({ value: String(values[k] ?? ''), error: errors[k], onChangeText: (v: string) => set(k, v as T[typeof k]) });
  const submit = async (fn: () => Promise<void>) => {
    setBusy(true); setFormError(null); setErrors({});
    try { await fn(); }
    catch (e) { if (e instanceof ApiError && e.fields) setErrors(e.fields); setFormError(e instanceof Error ? e.message : 'Something went wrong'); }
    finally { setBusy(false); }
  };
  return { values, set, setValues, bind, submit, busy, errors, formError };
}
