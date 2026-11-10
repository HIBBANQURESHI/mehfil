import { formatPKR } from '@mehfil/shared';
import { BadgeCheck, Check, Clock, MapPin, Star, Users } from 'lucide-react';
import { notFound } from 'next/navigation';
import { ListingActions, SaveButton } from '@/components/listing-actions';
import { publicGet } from '@/lib/server';
import { fmtDate } from '@/lib/format';

type Props = { params: Promise<{ slug: string }> };
const load = (slug: string) => publicGet<any>(`/listings/${encodeURIComponent(slug)}`, 30);

export async function generateMetadata({ params }: Props) {
  const l = await load((await params).slug);
  return l ? { title: `${l.title}, ${l.city.name}`, description: l.description.slice(0, 155), openGraph: { images: l.media[0] ? [l.media[0].url] : [] } } : {};
}

export default async function ListingPage({ params }: Props) {
  const l = await load((await params).slug);
  if (!l) notFound();
  const images = l.media.filter((m: any) => m.type === 'IMAGE');
  const videos = l.media.filter((m: any) => m.type === 'VIDEO');
  const jsonLd = { '@context': 'https://schema.org', '@type': 'LocalBusiness', name: l.vendor.businessName, description: l.description, image: images[0]?.url, address: { '@type': 'PostalAddress', addressLocality: l.city.name, addressCountry: 'PK' }, ...(l.reviewCount ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: l.avgRating.toFixed(1), reviewCount: l.reviewCount } } : {}) };
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 pb-28 lg:pb-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <div className="grid gap-2 overflow-hidden rounded-2xl md:grid-cols-4 md:grid-rows-2">
        {images.slice(0, 5).map((m: any, i: number) => <img key={m.id} src={m.url} alt={m.caption ?? l.title} className={`size-full object-cover ${i === 0 ? 'aspect-[4/3] md:col-span-2 md:row-span-2' : 'hidden aspect-[4/3] md:block'}`} />)}
      </div>
      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-10">
          <header>
            <p className="text-sm text-muted">{l.category.name}</p>
            <div className="flex items-start justify-between gap-3"><h1 className="text-3xl md:text-4xl">{l.title}</h1><SaveButton listingId={l.id} /></div>
            <p className="mt-1 text-muted">by {l.vendor.businessName}</p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <span className="flex items-center gap-1"><MapPin className="size-4 text-muted" aria-hidden />{[l.area?.name, l.city.name].filter(Boolean).join(', ')}</span>
              {l.capacityMax && <span className="tnum flex items-center gap-1"><Users className="size-4 text-muted" aria-hidden />{l.capacityMin ? `${l.capacityMin}–` : 'Up to '}{l.capacityMax} guests</span>}
              {l.reviewCount > 0 && <span className="tnum flex items-center gap-1"><Star className="size-4 fill-gold text-gold" aria-hidden />{l.avgRating.toFixed(1)} ({l.reviewCount} reviews)</span>}
              {l.vendor.identityVerifiedAt && <span className="flex items-center gap-1 text-good"><BadgeCheck className="size-4" aria-hidden />Identity verified</span>}
              {l.vendor.businessVerifiedAt && <span className="flex items-center gap-1 text-good"><BadgeCheck className="size-4" aria-hidden />Business verified</span>}
            </div>
          </header>
          <section><h2 className="text-2xl">About</h2><p className="mt-3 whitespace-pre-line leading-7">{l.description}</p>{l.vendor.workingHours && <p className="mt-3 flex items-center gap-2 text-sm text-muted"><Clock className="size-4" aria-hidden />{l.vendor.workingHours}</p>}</section>
          {l.packages.length > 0 && <section><h2 className="text-2xl">Packages</h2><div className="mt-4 grid gap-4 sm:grid-cols-2">{l.packages.map((p: any) => (
            <div key={p.id} className="rounded-2xl border border-line bg-white p-5">
              <h3 className="text-lg">{p.name}</h3>
              <p className="tnum mt-1 font-semibold text-ruby">{formatPKR(p.price)}{p.priceUnit === 'PER_PERSON' && <span className="text-xs font-normal text-muted"> /person</span>}</p>
              {p.description && <p className="mt-2 text-sm text-muted">{p.description}</p>}
              {p.inclusions.length > 0 && <ul className="mt-3 space-y-1 text-sm">{p.inclusions.map((x: string) => <li key={x} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-good" aria-hidden />{x}</li>)}</ul>}
              {p.exclusions.length > 0 && <p className="mt-3 text-xs text-muted">Not included: {p.exclusions.join(', ')}</p>}
            </div>
          ))}</div></section>}
          {l.addOns.length > 0 && <section><h2 className="text-2xl">Add-ons</h2><ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-white">{l.addOns.map((a: any) => <li key={a.id} className="flex justify-between px-4 py-3 text-sm"><span>{a.name}</span><span className="tnum font-medium">{formatPKR(a.price)}</span></li>)}</ul></section>}
          {l.amenities.length > 0 && <section><h2 className="text-2xl">Facilities</h2><ul className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">{l.amenities.map((a: string) => <li key={a} className="flex items-center gap-2"><Check className="size-4 text-good" aria-hidden />{a}</li>)}</ul></section>}
          {videos.length > 0 && <section><h2 className="text-2xl">Videos</h2><ul className="mt-3 space-y-2 text-sm">{videos.map((v: any) => <li key={v.id}><a className="text-ruby underline" href={v.url} rel="noopener noreferrer nofollow" target="_blank">{v.caption ?? 'Watch video'}</a></li>)}</ul></section>}
          <section>
            <h2 className="text-2xl">Reviews</h2>
            {l.reviews.length === 0 ? <p className="mt-3 text-sm text-muted">No reviews yet. Reviews come only from customers with a completed booking.</p> : <ul className="mt-4 space-y-5">{l.reviews.map((r: any) => (
              <li key={r.id} className="border-b border-line pb-5">
                <div className="flex items-center gap-2 text-sm"><span className="font-medium">{r.customer.name}</span><span className="tnum flex items-center gap-0.5"><Star className="size-3.5 fill-gold text-gold" aria-hidden />{r.rating}</span><span className="text-muted">{fmtDate(r.createdAt)}</span></div>
                <p className="mt-2 text-sm leading-6">{r.comment}</p>
                {r.reply && <p className="mt-3 rounded-lg bg-blush/60 p-3 text-sm"><span className="font-medium">Vendor reply: </span>{r.reply}</p>}
              </li>
            ))}</ul>}
          </section>
        </div>
        <aside><ListingActions listing={{ id: l.id, title: l.title, startingPrice: l.startingPrice, priceUnit: l.priceUnit, vendorId: l.vendor.id, packages: l.packages.map((p: any) => ({ id: p.id, name: p.name })) }} /></aside>
      </div>
    </div>
  );
}
