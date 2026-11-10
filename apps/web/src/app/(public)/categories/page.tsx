import Link from 'next/link';
import { CategoryIcon } from '@/components/category-icon';
import { publicGet } from '@/lib/server';
export const metadata = { title: 'All wedding services' };
export default async function Categories() {
  const cats = await publicGet<{ slug: string; name: string; description: string | null; iconKey: string | null; listingCount: number }[]>('/categories', 300);
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-4xl">All wedding services</h1>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{cats?.map((c) => <Link key={c.slug} href={`/c/${c.slug}`} className="flex items-center gap-4 rounded-2xl border border-line bg-white p-5 hover:border-rose"><span className="grid size-12 place-items-center rounded-full bg-blush text-ruby"><CategoryIcon name={c.iconKey} className="size-5" /></span><span><span className="block text-lg font-medium">{c.name}</span><span className="tnum text-sm text-muted">{c.listingCount} listed</span></span></Link>)}</div>
    </div>
  );
}
