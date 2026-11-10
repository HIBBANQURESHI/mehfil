import { redirect } from 'next/navigation';
import { getMe } from '@/lib/server';
export default async function AfterLogin() {
  const me = await getMe();
  redirect(!me ? '/login' : me.vendor ? '/vendor' : '/account');
}
