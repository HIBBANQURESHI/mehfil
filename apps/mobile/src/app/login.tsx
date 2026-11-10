import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Button, c, Field, FormError, Screen, Text, useForm } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function Login() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { signIn } = useAuth();
  const f = useForm({ identifier: '', password: '' });
  const go = () => f.submit(async () => {
    try {
      await signIn(await api('/auth/login', { body: f.values }));
      if (next) router.replace(next as never); else router.replace('/');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'PHONE_NOT_VERIFIED') router.push({ pathname: '/verify', params: { phone: String(e.data?.phone), next } });
      else throw e;
    }
  });
  return (
    <Screen>
      <Field label="Phone or email" autoCapitalize="none" autoComplete="username" {...f.bind('identifier')} />
      <Field label="Password" secureTextEntry autoComplete="current-password" {...f.bind('password')} />
      <FormError message={f.formError} />
      <Button title="Sign in" busy={f.busy} onPress={go} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Pressable accessibilityRole="link" onPress={() => router.push('/forgot')}><Text style={{ color: c.ruby }}>Forgot password?</Text></Pressable>
        <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/register', params: { next } })}><Text style={{ color: c.ruby }}>Create account</Text></Pressable>
      </View>
    </Screen>
  );
}
