import type { MetadataRoute } from 'next';

function resolveBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.RENDER_EXTERNAL_URL?.trim() ||
    process.env.FRONTEND_HOST?.trim() ||
    'https://itinbee.com';
  return (raw.startsWith('http') ? raw : `https://${raw}`).replace(/\/+$/, '');
}

export default function robots(): MetadataRoute.Robots {
  const baseUrl = resolveBaseUrl();
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/explore', '/destinations', '/create', '/about', '/credits'],
        disallow: ['/api/', '/t/', '/trip/', '/invite/', '/account', '/trips'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
