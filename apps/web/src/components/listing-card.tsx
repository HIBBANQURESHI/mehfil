import { formatPKR } from '@mehfil/shared';
import { BadgeCheck, MapPin, Star } from 'lucide-react';
import Link from 'next/link';

export interface ListingCardData {
  id: string; slug: string; title: string; startingPrice: number; priceUnit: string; avgRating: number; reviewCount: number; featured?: boolean; capacityMax?: number | null;
  category: { name: string }; city: { name: string }; area: { name: string } | null;
  vendor: { businessName: string; identityVerifiedAt: string | null }; media: { url: string }[];
}

export function ListingCard({ l }: { l: ListingCardData }) {
  return (
    <Link href={`/vendors/${l.slug}`} className="group block overflow-hidden rounded-2xl border border-line bg-white transition-shadow hover:shadow-[0_8px_30px_rgba(143,48,72,.12)]">
      <div className="relative aspect-[4/3] bg-blush">
        {l.media[0] && <img src={l.media[0].url} alt={l.title} loading="lazy" className="size-full object-cover" />}
        {l.featured && <span className="absolute left-3 top-3 rounded-full bg-gold px-2.5 py-1 text-xs font-semibold text-ink">Featured</span>}
      </div>
      <div className="p-4">
        <p className="text-xs text-muted">{l.category.name}</p>
        <h3 className="mt-0.5 line-clamp-1 text-lg group-hover:text-ruby">{l.title}</h3>
        <p className="mt-1 flex items-center gap-1 text-sm text-muted"><MapPin className="size-3.5" aria-hidden />{[l.area?.name, l.city.name].filter(Boolean).join(', ')}</p>
        <div className="mt-3 flex items-end justify-between gap-2">
          <p className="text-sm"><span className="text-xs text-muted">From </span><span className="tnum font-semibold">{formatPKR(l.startingPrice)}</span>{l.priceUnit === 'PER_PERSON' && <span className="text-xs text-muted"> /person</span>}</p>
          <div className="flex items-center gap-2 text-xs">
            {l.vendor.identityVerifiedAt && <BadgeCheck className="size-4 text-good" aria-label="Verified" />}
            {l.reviewCount > 0 ? <span className="tnum flex items-center gap-0.5"><Star className="size-3.5 fill-gold text-gold" aria-hidden />{l.avgRating.toFixed(1)} ({l.reviewCount})</span> : <span className="text-muted">New</span>}
          </div>
        </div>
      </div>
    </Link>
  );
}
