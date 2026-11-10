import { brand } from '@mehfil/shared';
import type { Metadata } from 'next';
import { DM_Sans, Playfair_Display } from 'next/font/google';
import { ToastProvider } from '@/components/ui';
import './globals.css';

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans' });
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: { default: `${brand.name}: Wedding venues and vendors in Karachi`, template: `%s | ${brand.name}` },
  description: 'Find verified wedding halls, caterers, decorators and photographers. Compare quotations and book in one place.',
  openGraph: { siteName: brand.name, type: 'website' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={`${dmSans.variable} ${playfair.variable}`}><body><ToastProvider>{children}</ToastProvider></body></html>;
}
