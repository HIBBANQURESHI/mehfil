import { redirect } from 'next/navigation';
import { AdminChrome } from './chrome';
import { getMe } from '@/lib/server';
export const dynamic = 'force-dynamic';
export default async function Layout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  // A staff member signed in through the customer login has no 2FA-backed admin session.
  if (!me?.adminSession || !me.admin) redirect('/admin/login');
  return <AdminChrome name={me.name} role={me.admin.role} isSuper={me.admin.isSuper} permissions={me.admin.permissions}>{children}</AdminChrome>;
}
