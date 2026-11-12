import { brand } from '@mehfil/shared';
import Link from 'next/link';
import { Logo } from './brand';
import { SiteNav } from './site-nav';
import { getMe } from '@/lib/server';

export async function SiteHeader() {
  const me = await getMe();
  const home = me?.adminSession ? '/admin' : me?.vendor ? '/vendor' : '/account';
  return <SiteNav home={home} signedIn={!!me} />;
}

export function SiteFooter() {
  const columns = [
    { h: 'Plan', links: [['All services', '/categories'], ['Search', '/search'], ['How it works', '/how-it-works']] },
    { h: 'Mehfil', links: [['About', '/about'], ['Contact', '/contact'], ['List your business', '/list-your-business']] },
    { h: 'Legal', links: [['Terms', '/terms'], ['Privacy', '/privacy'], ['Refunds and cancellations', '/refund-policy']] },
  ];
  return (
    <footer className="mt-20 border-t border-line bg-blush/50">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-4">
        <div><Logo size="lg" /><p className="mt-3 text-sm text-muted">{brand.tagline}</p><p className="mt-1 text-sm italic text-muted">{brand.urduLine}</p></div>
        {columns.map((c) => <div key={c.h}><p className="mb-3 text-sm font-semibold">{c.h}</p><ul className="space-y-2 text-sm text-muted">{c.links.map(([l, h]) => <li key={h}><Link href={h} className="hover:text-ruby">{l}</Link></li>)}</ul></div>)}
      </div>
      <p className="border-t border-line py-4 text-center text-xs text-muted">© {new Date().getFullYear()} {process.env.NEXT_PUBLIC_LEGAL_NAME ?? brand.name}</p>
    </footer>
  );
}
