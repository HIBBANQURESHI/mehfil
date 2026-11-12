import { brand } from '@mehfil/shared';
import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { ToastProvider } from '@/components/ui';
import './globals.css';

// Self-hosted (SIL Open Font License, see ./fonts), so builds and dev never depend on reaching Google Fonts.
const dmSans = localFont({
  src: [
    { path: './fonts/dm-sans-latin-wght-normal.woff2', weight: '100 1000', style: 'normal' },
    { path: './fonts/dm-sans-latin-wght-italic.woff2', weight: '100 1000', style: 'italic' },
  ],
  variable: '--font-dm-sans',
  display: 'swap',
});
const playfair = localFont({
  src: [
    { path: './fonts/playfair-display-latin-wght-normal.woff2', weight: '400 900', style: 'normal' },
    { path: './fonts/playfair-display-latin-wght-italic.woff2', weight: '400 900', style: 'italic' },
  ],
  variable: '--font-playfair',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: { default: `${brand.name}: Wedding venues and vendors in Karachi`, template: `%s | ${brand.name}` },
  description: 'Find verified wedding halls, caterers, decorators and photographers. Compare quotations and book in one place.',
  openGraph: { siteName: brand.name, type: 'website' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Browser extensions (here a tooltip add-on) write attributes onto <html> and <body> before React loads.
  // This only silences attribute differences on these two tags; mismatches inside the page are still reported.
  return (
    <html lang="en" className={`${dmSans.variable} ${playfair.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning><ToastProvider>{children}</ToastProvider></body>
    </html>
  );
}
