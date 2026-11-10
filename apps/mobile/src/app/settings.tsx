import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { Button, Card, Field, FormError, Row, Screen, Text, useForm } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDateTime } from '@/lib/format';

export default function Settings() {
  const { user, reload, signOut } = useAuth();
  const p = useForm({ name: user?.name ?? '', email: user?.email ?? '' });
  const pw = useForm({ currentPassword: '', newPassword: '' });
  const del = useForm({ password: '' });
  const { data: sessions, mutate } = useApi<any[]>('/auth/sessions');
  const [confirm, setConfirm] = useState(false);
  return (
    <Screen>
      <Card title="Personal information"><Field label="Full name" {...p.bind('name')} /><Field label="Email" keyboardType="email-address" autoCapitalize="none" {...p.bind('email')} /><Row label="Phone" value={user?.phone ?? '—'} /><FormError message={p.formError} /><Button title="Save" busy={p.busy} onPress={() => p.submit(async () => { await api('/auth/me', { method: 'PATCH', body: { name: p.values.name, email: p.values.email || null } }); await reload(); Alert.alert('Saved'); })} /></Card>
      <Card title="Change password"><Field label="Current password" secureTextEntry {...pw.bind('currentPassword')} /><Field label="New password" secureTextEntry {...pw.bind('newPassword')} /><FormError message={pw.formError} /><Button title="Update password" variant="secondary" busy={pw.busy} onPress={() => pw.submit(async () => { await api('/auth/change-password', { body: pw.values }); pw.setValues({ currentPassword: '', newPassword: '' }); Alert.alert('Password updated', 'Other devices were signed out.'); mutate(); })} /></Card>
      <Card title="Active devices">{sessions?.map((s) => <Row key={s.id} label={fmtDateTime(s.lastUsedAt)} value={<Text style={{ color: '#8F3048' }} onPress={async () => { await api(`/auth/sessions/${s.id}`, { method: 'DELETE' }); mutate(); }}>Sign out</Text>} />)}</Card>
      <Card title="Delete account"><Text variant="muted">Your personal details are erased. Records of paid bookings are kept as the law requires.</Text>{confirm ? <><Field label="Confirm your password" secureTextEntry {...del.bind('password')} /><FormError message={del.formError} /><Button title="Delete permanently" variant="danger" busy={del.busy} onPress={() => del.submit(async () => { await api('/auth/delete-account', { body: del.values }); await signOut(); router.replace('/'); })} /></> : <Button title="Delete my account" variant="danger" onPress={() => setConfirm(true)} />}</Card>
    </Screen>
  );
}
