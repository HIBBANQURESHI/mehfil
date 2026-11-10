import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { ListingCard } from '@/components/listing-card';
import { SignInPrompt } from '@/components/sign-in-prompt';
import { Button, c, Empty, ErrorView, Loading, Screen, Text } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function Saved() {
  const { user } = useAuth();
  const { data, error, isLoading, mutate } = useApi<any[]>(user ? '/saved' : null);
  const [picked, setPicked] = useState<string[]>([]);
  if (!user) return <SignInPrompt title="Save your favourites" body="Sign in to keep a shortlist of vendors." next="/saved" />;
  return (
    <Screen edges={['top']} onRefresh={() => mutate()}>
      <Text variant="h1">Saved</Text>
      {data && data.length > 1 && <Text variant="muted">Tap Select on several to ask them all at once.</Text>}
      {error ? <ErrorView error={error} retry={() => mutate()} /> : isLoading || !data ? <Loading /> : !data.length ? <Empty title="Nothing saved yet" action={<Button title="Explore vendors" onPress={() => router.push('/explore')} />} /> : data.map((l) => { const on = picked.includes(l.id); return (
        <View key={l.id} style={{ gap: 8 }}>
          <ListingCard l={l} />
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => setPicked(on ? picked.filter((x) => x !== l.id) : [...picked.slice(0, 9), l.id])}><Text style={{ color: c.ruby }}>{on ? 'Selected' : 'Select'}</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={async () => { await api(`/saved/${l.id}/toggle`, { method: 'POST', body: {} }); setPicked(picked.filter((x) => x !== l.id)); mutate(); }}><Text variant="muted">Remove</Text></Pressable>
          </View>
        </View>
      ); })}
      {picked.length > 0 && <Button title={`Request quotes (${picked.length})`} onPress={() => router.push({ pathname: '/request', params: { ids: picked.join(',') } })} />}
    </Screen>
  );
}
