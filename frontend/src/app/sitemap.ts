import type { MetadataRoute } from 'next';
import { SAMPLE_WORKSPACES } from '@/data/sample-trips';
import { SHOWCASE } from '@/data/showcase';
import { fetchDestinationsHub } from '@/lib/destinations-client';

function resolveBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.RENDER_EXTERNAL_URL?.trim() ||
    'https://itinbee.com';
  return (raw.startsWith('http') ? raw : `https://${raw}`).replace(/\/+$/, '');
}

function resolveApiBase(): string {
  const internal = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || '127.0.0.1:4000';
  const normalized = internal.startsWith('http') ? internal : `http://${internal}`;
  return normalized.replace(/\/+$/, '');
}

async function fetchAllExploreSlugs(): Promise<string[]> {
  const slugs = new Set<string>(Object.keys(SAMPLE_WORKSPACES));
  const api = resolveApiBase();

  try {
    // Try limit=100 first; fall back to paginated limit=60 if backend caps page size at 60
    let res = await fetch(`${api}/v1/explore?limit=100`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      res = await fetch(`${api}/v1/explore?limit=60`, {
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(8000),
      });
    }

    if (res.ok) {
      let data = (await res.json()) as {
        items?: Array<{ slug?: string }>;
        nextCursor?: string | null;
      };
      for (const item of data.items ?? []) {
        if (item.slug) slugs.add(item.slug);
      }
      // Follow up to 3 cursor pages if needed so all 48+ templates are indexed
      let pages = 0;
      while (data.nextCursor && pages < 3) {
        pages += 1;
        const nextRes = await fetch(
          `${api}/v1/explore?limit=60&cursor=${encodeURIComponent(data.nextCursor)}`,
          {
            next: { revalidate: 3600 },
            signal: AbortSignal.timeout(8000),
          }
        );
        if (!nextRes.ok) break;
        data = (await nextRes.json()) as {
          items?: Array<{ slug?: string }>;
          nextCursor?: string | null;
        };
        for (const item of data.items ?? []) {
          if (item.slug) slugs.add(item.slug);
        }
      }
    }
  } catch {
    // Keep static SAMPLE_WORKSPACES fallback
  }

  return Array.from(slugs);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = resolveBaseUrl();
  const now = new Date();

  const staticRoutes = [
    { path: '', priority: 1.0 },
    { path: '/explore', priority: 0.95 },
    { path: '/destinations', priority: 0.9 },
    { path: '/create', priority: 0.9 },
    { path: '/about', priority: 0.6 },
    { path: '/credits', priority: 0.5 },
    { path: '/legal/privacy', priority: 0.4 },
    { path: '/legal/terms', priority: 0.4 },
  ];

  const [hub, exploreSlugs] = await Promise.all([
    fetchDestinationsHub(),
    fetchAllExploreSlugs(),
  ]);

  const destSlugs = new Set<string>(SHOWCASE.map((d) => d.slug));
  for (const dest of hub.destinations) {
    if (dest.slug) destSlugs.add(dest.slug);
  }

  return [
    ...staticRoutes.map((r) => ({
      url: `${baseUrl}${r.path}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: r.priority,
    })),
    ...Array.from(destSlugs).map((slug) => ({
      url: `${baseUrl}/destinations/${slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...exploreSlugs.map((slug) => ({
      url: `${baseUrl}/explore/${slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ];
}
