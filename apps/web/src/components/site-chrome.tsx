import { brand } from '@mehfil/shared';
import Link from 'next/link';
import { Logo } from './brand';
import { LinkButton } from './ui';
import { getMe } from '@/lib/server';

export async function SiteHeader() {
  const me = await getMe();
  const home = me?.adminSession ? '/admin' : me?.vendor ? '/vendor' : '/account';
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-warm/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Logo />
        <nav className="hidden items-center gap-6 text-sm md:flex">
          <Link href="/c/banquet-halls" className="hover:text-ruby">Venues</Link>
          <Link href="/c/catering" className="hover:text-ruby">Catering</Link>
          <Link href="/c/decoration" className="hover:text-ruby">Decor</Link>
          <Link href="/c/photography" className="hover:text-ruby">Photography</Link>
          <Link href="/categories" className="hover:text-ruby">All services</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/list-your-business" className="hidden text-sm font-medium text-ruby lg:block">List your business</Link>
          {me ? <LinkButton href={home}>My dashboard</LinkButton> : <><LinkButton href="/login" variant="ghost">Sign in</LinkButton><LinkButton href="/register" className="hidden sm:inline-flex">Get started</LinkButton></>}
        </div>
      </div>
    </header>
  );
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
        <div><Logo /><p className="mt-3 text-sm text-muted">{brand.tagline}</p><p className="mt-1 text-sm italic text-muted">{brand.urduLine}</p></div>
        {columns.map((c) => <div key={c.h}><p className="mb-3 text-sm font-semibold">{c.h}</p><ul className="space-y-2 text-sm text-muted">{c.links.map(([l, h]) => <li key={h}><Link href={h} className="hover:text-ruby">{l}</Link></li>)}</ul></div>)}
      </div>
      <p className="border-t border-line py-4 text-center text-xs text-muted">© {new Date().getFullYear()} {process.env.NEXT_PUBLIC_LEGAL_NAME ?? brand.name}</p>
    </footer>
  );
}
