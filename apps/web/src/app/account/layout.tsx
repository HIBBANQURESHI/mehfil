import { redirect } from 'next/navigation';
import { AccountChrome } from './chrome';
import { getMe } from '@/lib/server';
export const dynamic = 'force-dynamic';
export default async function Layout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect('/login?next=/account');
  return <AccountChrome name={me.name}>{children}</AccountChrome>;
}
