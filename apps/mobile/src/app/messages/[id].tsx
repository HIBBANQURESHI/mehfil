import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { showAlert } from '@/components/alert';
import { Button, c, ErrorView, font, Loading, Text } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
export default function Page() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, isLoading, mutate } = useApi<any>(`/conversations/${id}/messages`, { refreshInterval: 8000 });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useRef<FlatList>(null);
  if (error) return <ErrorView error={error} retry={() => mutate()} />;
  if (isLoading || !data) return <Loading />;
  const send = async () => { setBusy(true); try { await api(`/conversations/${id}/messages`, { body: { body: text } }); setText(''); await mutate(); } catch (e: any) { showAlert('Could not send', e.message); } finally { setBusy(false); } };
  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: c.warmWhite }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <FlatList ref={list} contentContainerStyle={{ padding: 16, gap: 8 }} data={data.messages} keyExtractor={(m: any) => m.id} onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })} renderItem={({ item: m }: any) => { const mine = !m.fromVendor; return <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%', backgroundColor: mine ? c.ruby : c.blush, borderRadius: 16, padding: 11 }}><Text style={{ color: mine ? '#fff' : c.text }}>{m.body}</Text><Text style={{ fontSize: 11, color: mine ? '#F3DCE1' : c.muted }}>{fmtDateTime(m.createdAt)}</Text></View>; }} />
        <View style={{ flexDirection: 'row', gap: 8, padding: 10, borderTopWidth: 1, borderColor: c.border, backgroundColor: '#fff' }}><TextInput accessibilityLabel="Message" value={text} onChangeText={setText} placeholder="Write a message" placeholderTextColor="#A8979B" style={{ flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 12, fontFamily: font.sans, color: c.text }} /><Button title="Send" busy={busy} disabled={!text.trim()} onPress={send} /></View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
