import { notFound } from 'next/navigation';
import { SearchView } from '@/components/search-view';
import { publicGet } from '@/lib/server';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string>> };
const find = async (slug: string) => (await publicGet<{ slug: string; name: string }[]>('/categories', 300))?.find((c) => c.slug === slug);

export async function generateMetadata({ params }: Props) {
  const c = await find((await params).slug);
  return c ? { title: `${c.name} in Karachi`, description: `Compare verified ${c.name.toLowerCase()} in Karachi by price, capacity, date and reviews on Mehfil.` } : {};
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const category = await find(slug);
  if (!category) notFound();
  return <div className="mx-auto max-w-6xl px-4 py-10"><h1 className="mb-6 text-4xl">{category.name}</h1><SearchView query={await searchParams} fixedCategory={slug} /></div>;
}
