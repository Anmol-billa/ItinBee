import type { MetadataRoute } from 'next';
import { SAMPLE_WORKSPACES } from '@/data/sample-trips';
import { SHOWCASE } from '@/data/showcase';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://itinbee.com';
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

  return [
    ...staticRoutes.map((r) => ({
      url: `${baseUrl}${r.path}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: r.priority,
    })),
    ...SHOWCASE.map((d) => ({
      url: `${baseUrl}/destinations/${d.slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...Object.keys(SAMPLE_WORKSPACES).map((shortId) => ({
      url: `${baseUrl}/explore/${shortId}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ];
}
