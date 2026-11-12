import { brand } from '@mehfil/shared';
import Link from 'next/link';

const SIZES = { sm: 'h-10', md: 'h-12', lg: 'h-20' } as const;

/** The Mehfil logo. The file is a transparent cut-out, so it sits cleanly on the light backgrounds used across the site. */
/** `onDark` swaps in the glowing version of the logo, which stays readable on the burgundy dashboard sidebar. */
export function Logo({ href = '/', size = 'md', onDark = false }: { href?: string; size?: keyof typeof SIZES; onDark?: boolean }) {
  return (
    <Link href={href} className="inline-flex shrink-0 items-center" aria-label={`${brand.name} home`}>
      {onDark
        ? <img src="/brand/logo-glow.webp" alt={brand.name} width={900} height={617} className={`${SIZES[size]} w-auto drop-shadow-[0_2px_10px_rgba(212,173,99,.35)]`} />
        : <img src="/brand/logo.webp" alt={brand.name} width={1100} height={691} className={`${SIZES[size]} w-auto`} />}
    </Link>
  );
}

/** The logo with its golden glow, for dark panels. The glow is only visible against dark colours. */
export function GlowingLogo({ className = '' }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-[2rem] bg-[radial-gradient(ellipse_at_50%_45%,#8F3048_0%,#5E1F31_38%,#2A0B14_72%,#14050A_100%)] shadow-[0_24px_80px_rgba(94,31,49,.35)] ${className}`}>
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(212,173,99,.35),transparent_55%)] motion-safe:animate-[mehfil-breathe_4.5s_ease-in-out_infinite]" />
      <img src="/brand/logo-glow.webp" alt={`${brand.name}: ${brand.tagline}`} width={900} height={617} className="relative w-full" />
      {[['72%', '40%', '0s'], ['78%', '46%', '1.1s'], ['56%', '80%', '2.2s'], ['16%', '22%', '0.6s'], ['88%', '18%', '1.7s']].map(([left, top, delay]) => (
        <span key={left + top} aria-hidden className="absolute size-1.5 rounded-full bg-[#F3DFB4] shadow-[0_0_10px_3px_rgba(243,223,180,.7)] motion-safe:animate-[mehfil-twinkle_3s_ease-in-out_infinite]" style={{ left, top, animationDelay: delay }} />
      ))}
    </div>
  );
}
