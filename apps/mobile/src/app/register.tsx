import Checkbox from 'expo-checkbox';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';
import { Button, c, Field, FormError, Screen, Text, useForm } from '@/components/ui';
import { api, SITE_URL } from '@/lib/api';

export default function Register() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const f = useForm({ name: '', phone: '', email: '', password: '' });
  const [terms, setTerms] = useState(false);
  return (
    <Screen>
      <Field label="Full name" autoComplete="name" {...f.bind('name')} />
      <Field label="Mobile number" keyboardType="phone-pad" placeholder="03XXXXXXXXX" autoComplete="tel" {...f.bind('phone')} />
      <Field label="Email (recommended for receipts)" keyboardType="email-address" autoCapitalize="none" {...f.bind('email')} />
      <Field label="Password" secureTextEntry hint="At least 10 characters with letters and a number" autoComplete="new-password" {...f.bind('password')} />
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}><Checkbox accessibilityLabel="Accept terms" value={terms} onValueChange={setTerms} color={terms ? c.ruby : undefined} /><Text style={{ flex: 1 }}>I agree to the <Text style={{ color: c.ruby }} onPress={() => Linking.openURL(`${SITE_URL}/terms`)}>terms</Text> and <Text style={{ color: c.ruby }} onPress={() => Linking.openURL(`${SITE_URL}/privacy`)}>privacy policy</Text></Text></View>
      <FormError message={f.formError} />
      <Button title="Continue" busy={f.busy} onPress={() => f.submit(async () => { const r = await api('/auth/register', { body: { ...f.values, acceptTerms: terms } }); router.push({ pathname: '/verify', params: { phone: r.phone, next } }); })} />
    </Screen>
  );
}
