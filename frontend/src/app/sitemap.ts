import type { MetadataRoute } from 'next';
import { SAMPLE_WORKSPACES } from '@/data/sample-trips';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://itinbee.com';
  const now = new Date();

  return [
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    ...Object.keys(SAMPLE_WORKSPACES).map((shortId) => ({
      url: `${baseUrl}/t/${shortId}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ];
}
