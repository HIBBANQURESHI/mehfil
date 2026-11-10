import { rupeesToPaisa } from '@mehfil/shared';
import Link from 'next/link';
import { publicGet } from '@/lib/server';
import { ListingCard, ListingCardData } from './listing-card';
import { Empty, LinkButton } from './ui';

interface Cat { id: string; name: string; slug: string; amenityOptions: string[] }
interface City { id: string; name: string; slug: string; areas: { name: string; slug: string }[] }
type Query = Record<string, string | undefined>;

const control = 'w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm';

export async function SearchView({ query, fixedCategory }: { query: Query; fixedCategory?: string }) {
  const [cats, cities] = await Promise.all([publicGet<Cat[]>('/categories', 300), publicGet<City[]>('/cities', 300)]);
  const category = fixedCategory ?? query.category;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v && !['minPrice', 'maxPrice', 'category'].includes(k)) params.set(k, v);
  if (category) params.set('category', category);
  if (query.minPrice) params.set('minPrice', String(rupeesToPaisa(Number(query.minPrice) || 0)));
  if (query.maxPrice) params.set('maxPrice', String(rupeesToPaisa(Number(query.maxPrice) || 0)));
  params.set('pageSize', '12');
  const data = await publicGet<{ items: ListingCardData[]; total: number; page: number; pageSize: number }>(`/listings?${params}`, 30);
  const page = data?.page ?? 1;
  const pages = data ? Math.ceil(data.total / data.pageSize) : 1;
  const link = (p: number) => `?${new URLSearchParams({ ...(Object.fromEntries(Object.entries(query).filter(([, v]) => v)) as Record<string, string>), page: String(p) })}`;
  const selectedCity = cities?.find((c) => c.slug === query.city);
  const amenities = cats?.find((c) => c.slug === category)?.amenityOptions ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <form className="h-fit space-y-3 rounded-2xl border border-line bg-white p-4" method="get">
        <p className="font-semibold">Filters</p>
        <input name="q" defaultValue={query.q} placeholder="Name or keyword" aria-label="Keyword" className={control} />
        {!fixedCategory && <select name="category" defaultValue={query.category ?? ''} aria-label="Category" className={control}><option value="">All services</option>{cats?.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select>}
        <select name="city" defaultValue={query.city ?? ''} aria-label="City" className={control}><option value="">All cities</option>{cities?.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select>
        {selectedCity && <select name="area" defaultValue={query.area ?? ''} aria-label="Area" className={control}><option value="">All areas</option>{selectedCity.areas.map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}</select>}
        <label className="block text-xs text-muted">Event date (shows only free vendors)<input type="date" name="date" defaultValue={query.date} className={`${control} mt-1`} /></label>
        <input type="number" min={1} name="guests" defaultValue={query.guests} placeholder="Guests" aria-label="Guests" className={control} />
        <div className="grid grid-cols-2 gap-2"><input type="number" min={0} name="minPrice" defaultValue={query.minPrice} placeholder="Min Rs." aria-label="Minimum price in rupees" className={control} /><input type="number" min={0} name="maxPrice" defaultValue={query.maxPrice} placeholder="Max Rs." aria-label="Maximum price in rupees" className={control} /></div>
        <select name="rating" defaultValue={query.rating ?? ''} aria-label="Minimum rating" className={control}><option value="">Any rating</option><option value="4">4 stars and up</option><option value="3">3 stars and up</option></select>
        <select name="indoorOutdoor" defaultValue={query.indoorOutdoor ?? ''} aria-label="Indoor or outdoor" className={control}><option value="">Indoor or outdoor</option><option value="INDOOR">Indoor</option><option value="OUTDOOR">Outdoor</option></select>
        {amenities.length > 0 && <select name="amenities" defaultValue={query.amenities ?? ''} aria-label="Must have" className={control}><option value="">Any amenity</option>{amenities.map((a) => <option key={a}>{a}</option>)}</select>}
        <select name="sort" defaultValue={query.sort ?? ''} aria-label="Sort" className={control}><option value="">Recommended</option><option value="price_asc">Lowest price</option><option value="rating">Highest rated</option><option value="popular">Most popular</option><option value="newest">Recently added</option></select>
        <button className="w-full rounded-lg bg-ruby py-2.5 text-sm font-semibold text-white hover:bg-ruby-hover">Apply</button>
      </form>
      <div>
        <p className="tnum mb-4 text-sm text-muted">{data?.total ?? 0} {data?.total === 1 ? 'result' : 'results'}</p>
        {!data?.items.length ? <div className="rounded-2xl border border-line bg-white"><Empty title="No vendors match yet" body="Try fewer filters or another date. New verified vendors join regularly." action={<LinkButton href="/categories" variant="outline">Browse all services</LinkButton>} /></div> : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{data.items.map((l) => <ListingCard key={l.id} l={l} />)}</div>
        )}
        {pages > 1 && <div className="mt-8 flex items-center justify-center gap-4 text-sm">{page > 1 && <Link className="text-ruby" href={link(page - 1)}>Previous</Link>}<span className="tnum text-muted">Page {page} of {pages}</span>{page < pages && <Link className="text-ruby" href={link(page + 1)}>Next</Link>}</div>}
      </div>
    </div>
  );
}
