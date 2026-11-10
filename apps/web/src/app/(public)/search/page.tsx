import { SearchView } from '@/components/search-view';
export const metadata = { title: 'Search wedding vendors' };
export default async function Search({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  return <div className="mx-auto max-w-6xl px-4 py-10"><h1 className="mb-6 text-4xl">Find your vendors</h1><SearchView query={await searchParams} /></div>;
}
