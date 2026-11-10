import type { MetadataRoute } from 'next';
import { publicGet } from '@/lib/server';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const [cats, slugs] = await Promise.all([publicGet<{ slug: string }[]>('/categories', 3600), publicGet<{ slug: string; updatedAt: string }[]>('/listings/slugs', 3600)]);
  return [
    ...['', '/categories', '/how-it-works', '/about', '/contact', '/list-your-business'].map((p) => ({ url: `${site}${p}` })),
    ...(cats ?? []).map((c) => ({ url: `${site}/c/${c.slug}` })),
    ...(slugs ?? []).map((l) => ({ url: `${site}/vendors/${l.slug}`, lastModified: l.updatedAt })),
  ];
}
