import { brand } from '@mehfil/shared';
import Link from 'next/link';

export function Mark({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <path d="M20 3c5 6 14 9 14 18v16H6V21C6 12 15 9 20 3z" fill="#8F3048" />
      <path d="M20 12c3 4 8 6 8 12v13H12V24c0-6 5-8 8-12z" fill="#FFFDF9" />
      <circle cx="20" cy="27" r="3" fill="#D4AD63" />
    </svg>
  );
}

export function Logo({ href = '/' }: { href?: string }) {
  return <Link href={href} className="flex items-center gap-2" aria-label={`${brand.name} home`}><Mark /><span className="display text-2xl text-ruby">{brand.name}</span></Link>;
}
