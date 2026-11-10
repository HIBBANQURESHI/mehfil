import { router } from 'expo-router';
import { Button, Empty, Screen } from './ui';
export function SignInPrompt({ title, body, next }: { title: string; body: string; next: string }) {
  return <Screen edges={['top']}><Empty title={title} body={body} action={<Button title="Sign in" onPress={() => router.push({ pathname: '/login', params: { next } })} />} /></Screen>;
}
