'use client';
import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Logo } from './brand';

const LINKS = [
  ['Venues', '/c/banquet-halls'],
  ['Catering', '/c/catering'],
  ['Decor', '/c/decoration'],
  ['Photography', '/c/photography'],
  ['All services', '/categories'],
] as const;

/**
 * Solid and full width at the top of the page; once the page scrolls it lifts into a frosted-glass oval.
 * The header keeps a fixed height in the page flow, so content never jumps when it changes shape.
 */
export function SiteNav({ home, signedIn }: { home: string; signedIn: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onClick = (e: MouseEvent) => { if (panel.current && !panel.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onClick); };
  }, [open]);

  const glass = scrolled || open;
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const link = (href: string) => `whitespace-nowrap rounded-full px-3 py-1.5 transition-colors hover:bg-ruby/8 hover:text-ruby ${active(href) ? 'text-ruby font-medium' : ''}`;

  return (
    <header className="sticky top-0 z-40 h-16 md:h-[4.5rem]">
      <div ref={panel} className={`absolute inset-x-0 top-0 transition-[padding] duration-500 ease-out ${glass ? 'px-3 pt-2 sm:px-4 sm:pt-3' : 'px-0 pt-0'}`}>
        <div
          className={[
            'mx-auto border transition-all duration-500 ease-out',
            glass
              ? 'max-w-5xl rounded-[2rem] border-white/60 bg-warm/65 shadow-[0_8px_32px_rgba(94,31,49,.14)] backdrop-blur-xl backdrop-saturate-150'
              : 'max-w-full rounded-none border-transparent border-b-line bg-warm',
          ].join(' ')}
        >
          <div className={`mx-auto flex max-w-6xl items-center justify-between gap-3 transition-all duration-500 ${glass ? 'h-14 px-3 sm:px-5' : 'h-16 px-4 md:h-[4.5rem]'}`}>
            <div className={`origin-left transition-transform duration-500 ${glass ? 'scale-[.85]' : 'scale-100'}`}><Logo size="md" /></div>

            <nav aria-label="Main" className="hidden items-center gap-0.5 text-sm lg:flex">
              {LINKS.map(([label, href]) => <Link key={href} href={href} className={link(href)}>{label}</Link>)}
              <Link href="/plan" className={`${link('/plan')} font-medium text-ruby`}>Plan my wedding</Link>
            </nav>

            <div className="flex items-center gap-1.5 sm:gap-2">
              <Link href="/list-your-business" className={`hidden whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium text-ruby hover:bg-ruby/8 ${glass ? '2xl:block' : 'xl:block'}`}>List your business</Link>
              {signedIn
                ? <Link href={home} className="hidden whitespace-nowrap rounded-full bg-ruby px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-ruby/90 sm:inline-flex">My dashboard</Link>
                : <>
                  <Link href="/login" className="hidden whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium hover:bg-ruby/8 sm:inline-flex">Sign in</Link>
                  <Link href="/register" className="hidden whitespace-nowrap rounded-full bg-ruby px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-ruby/90 sm:inline-flex">Get started</Link>
                </>}
              <button
                type="button"
                className="inline-flex size-10 items-center justify-center rounded-full hover:bg-ruby/8 lg:hidden"
                aria-label={open ? 'Close menu' : 'Open menu'}
                aria-expanded={open}
                aria-controls="site-menu"
                onClick={() => setOpen((v) => !v)}
              >
                {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
              </button>
            </div>
          </div>

          <div id="site-menu" hidden={!open} className="border-t border-line/70 px-3 pb-4 pt-2 lg:hidden">
            <nav aria-label="Mobile" className="grid gap-0.5 text-[15px]">
              <Link href="/plan" className="rounded-2xl px-4 py-3 font-medium text-ruby hover:bg-ruby/8">Plan my wedding</Link>
              {LINKS.map(([label, href]) => <Link key={href} href={href} className={`rounded-2xl px-4 py-3 hover:bg-ruby/8 ${active(href) ? 'font-medium text-ruby' : ''}`}>{label}</Link>)}
              <Link href="/list-your-business" className="rounded-2xl px-4 py-3 hover:bg-ruby/8">List your business</Link>
            </nav>
            <div className="mt-3 grid gap-2 px-1 sm:hidden">
              {signedIn
                ? <Link href={home} className="rounded-full bg-ruby px-4 py-3 text-center text-sm font-medium text-white">My dashboard</Link>
                : <>
                  <Link href="/register" className="rounded-full bg-ruby px-4 py-3 text-center text-sm font-medium text-white">Get started</Link>
                  <Link href="/login" className="rounded-full border border-line bg-white/70 px-4 py-3 text-center text-sm font-medium">Sign in</Link>
                </>}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
