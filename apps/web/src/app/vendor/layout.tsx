import { redirect } from 'next/navigation';
import { VendorChrome } from './chrome';
import { StartVendor } from './start';
import { getMe } from '@/lib/server';
export const dynamic = 'force-dynamic';
export default async function Layout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect('/login?next=/vendor');
  if (!me.vendor) return <StartVendor name={me.name} />;
  return <VendorChrome name={me.name} business={me.vendor.businessName} status={me.vendor.status} reason={me.vendor.statusReason} role={me.vendor.role}>{children}</VendorChrome>;
}
