import { brand } from '@mehfil/shared';
import { BadgeCheck, CalendarCheck, FileText, Search, ShieldCheck, Sparkles, Wallet } from 'lucide-react';
import Link from 'next/link';
import { GlowingLogo } from '@/components/brand';
import { CategoryIcon } from '@/components/category-icon';
import { ListingCard, ListingCardData } from '@/components/listing-card';
import { LinkButton } from '@/components/ui';
import { publicGet } from '@/lib/server';

interface Cat { id: string; name: string; slug: string; iconKey: string | null; imageUrl: string | null; listingCount: number }
interface City { id: string; name: string; slug: string }

export default async function Home() {
  const [cats, cities, top, featured] = await Promise.all([publicGet<Cat[]>('/categories', 300), publicGet<City[]>('/cities', 300), publicGet<ListingCardData[]>('/top-rated'), publicGet<ListingCardData[]>('/featured')]);
  const control = 'w-full rounded-lg border border-line bg-white px-3 py-3 text-sm';
  const featuredIds = new Set(featured?.map((l) => l.id));
  const popular = top?.filter((l) => !featuredIds.has(l.id)) ?? [];
  return (
    <>
      <section className="overflow-hidden bg-gradient-to-b from-blush/70 to-warm">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 pb-14 pt-12 md:grid-cols-[1.25fr_1fr] md:pt-20">
          <div>
            <p className="text-sm font-medium italic text-ruby">{brand.urduLine}</p>
            <h1 className="mt-3 text-4xl leading-[1.1] md:text-6xl">{brand.tagline}</h1>
            <p className="mt-5 max-w-lg text-lg text-muted">Find verified halls, caterers, decorators and photographers in Karachi. Compare real quotations and book with the date held in your name.</p>
            <div className="mt-6 flex flex-wrap gap-3"><Link href="/plan" className="inline-flex items-center gap-2 rounded-lg bg-ruby px-5 py-3 text-sm font-semibold text-white hover:bg-ruby-hover"><Sparkles className="size-4" aria-hidden />Plan my wedding</Link><Link href="/how-it-works" className="inline-flex items-center rounded-lg border border-line bg-white px-5 py-3 text-sm font-semibold hover:border-rose">How it works</Link></div>
            <form action="/search" method="get" className="mt-8 grid gap-2 rounded-2xl border border-line bg-white p-3 shadow-[0_8px_30px_rgba(143,48,72,.08)] sm:grid-cols-2 lg:grid-cols-4">
              <select name="category" aria-label="Service" className={control}><option value="">All services</option>{cats?.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select>
              <select name="city" aria-label="City" className={control}>{cities?.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select>
              <input type="date" name="date" aria-label="Event date" className={control} />
              <button className="flex items-center justify-center gap-2 rounded-lg bg-ruby py-3 text-sm font-semibold text-white hover:bg-ruby-hover"><Search className="size-4" aria-hidden />Search</button>
            </form>
          </div>
          <GlowingLogo className="mx-auto w-full max-w-md" />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-3xl">Everything for the big day</h2>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {cats?.map((c) => (
            <Link key={c.slug} href={`/c/${c.slug}`} className="group flex items-center gap-3 rounded-2xl border border-line bg-white p-4 hover:border-rose">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-blush text-ruby group-hover:bg-ruby group-hover:text-white"><CategoryIcon name={c.iconKey} className="size-5" /></span>
              <span className="min-w-0"><span className="block font-medium leading-tight">{c.name}</span>{c.listingCount > 0 && <span className="tnum text-xs text-muted">{c.listingCount} listed</span>}</span>
            </Link>
          ))}
        </div>
      </section>

      {!!featured?.length && <section className="mx-auto max-w-6xl px-4 py-6"><h2 className="text-3xl">Featured</h2><div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{featured.slice(0, 4).map((l) => <ListingCard key={l.id} l={l} />)}</div></section>}
      {popular.length > 0 && <section className="mx-auto max-w-6xl px-4 py-6"><div className="flex items-end justify-between"><h2 className="text-3xl">Popular in Karachi</h2><Link href="/search?sort=rating" className="text-sm text-ruby">See all</Link></div><div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{popular.slice(0, 8).map((l) => <ListingCard key={l.id} l={l} />)}</div></section>}

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-3xl">From first search to final rukhsati</h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-4">
          {[[Search, 'Find', 'Filter by date, guests, area and budget.'], [FileText, 'Compare', 'Ask several vendors at once and see their quotes side by side.'], [Wallet, 'Book', 'Pay the agreed advance and your date is secured.'], [CalendarCheck, 'Celebrate', 'Track instalments and every vendor in one plan.']].map(([I, t, b], i) => { const Icon = I as typeof Search; return (
            <li key={String(t)} className="rounded-2xl border border-line bg-white p-5"><Icon className="size-6 text-ruby" aria-hidden /><p className="mt-3 font-semibold">{i + 1}. {String(t)}</p><p className="mt-1 text-sm text-muted">{String(b)}</p></li>
          ); })}
        </ol>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-6">
        <div className="grid gap-4 md:grid-cols-3">
          {[[BadgeCheck, 'Checked before they go live', 'Every vendor is reviewed by our team before appearing here.'], [ShieldCheck, 'Terms on record', 'Your price, schedule and cancellation policy are saved with your booking.'], [FileText, 'Real reviews only', 'Reviews can only be left by customers with a completed booking.']].map(([I, t, b]) => { const Icon = I as typeof Search; return <div key={String(t)} className="flex gap-3"><Icon className="mt-0.5 size-5 shrink-0 text-gold" aria-hidden /><div><p className="font-semibold">{String(t)}</p><p className="text-sm text-muted">{String(b)}</p></div></div>; })}
        </div>
      </section>

      <section className="mx-auto mt-10 max-w-6xl px-4">
        <div className="flex flex-col items-start justify-between gap-5 rounded-3xl bg-ruby p-8 text-white md:flex-row md:items-center md:p-12">
          <div><h2 className="text-3xl">Run a wedding business?</h2><p className="mt-2 max-w-md text-white/80">Get found by couples planning now. Manage enquiries, quotations and bookings in one dashboard. Listing is free.</p></div>
          <Link href="/list-your-business" className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-ruby">List your business</Link>
        </div>
      </section>
    </>
  );
}
