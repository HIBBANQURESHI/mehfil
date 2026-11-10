import { brand } from '@mehfil/shared';
export const metadata = { title: 'About' };
export default function About() {
  return <div className="mx-auto max-w-3xl px-4 py-12"><h1 className="text-4xl">About Mehfil</h1><p className="mt-6 text-lg leading-8">Planning a wedding in Pakistan usually means weeks of phone calls, unclear prices and running around the city. Mehfil puts the whole journey in one place: finding verified vendors, comparing real quotations, and booking with your terms on record.</p><p className="mt-4 leading-8 text-muted">We are starting in Karachi, with venues, catering, decor, photography, makeup and planning. Customers use Mehfil for free.</p><p className="display mt-8 text-2xl text-ruby">{brand.tagline}</p></div>;
}
