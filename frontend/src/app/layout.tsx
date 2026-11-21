import type { Metadata, Viewport } from 'next';
import './globals.css';

function resolveSiteUrl(): URL {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.RENDER_EXTERNAL_URL?.trim() ||
    'http://localhost:3000';
  try {
    return new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  } catch {
    return new URL('http://localhost:3000');
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#062119',
};

export const metadata: Metadata = {
  metadataBase: resolveSiteUrl(),
  title: {
    default: 'Itinbee — Collaborative Travel Itinerary & UPI Split Workspace',
    template: '%s · Itinbee',
  },
  description:
    'OTA-agnostic, WhatsApp-native, offline-first travel itinerary builder, bilingual Elder Card viewer, and UPI expense ledger.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
  },
  openGraph: {
    type: 'website',
    siteName: 'Itinbee',
    title: 'Itinbee — Collaborative Travel Itinerary & UPI Split Workspace',
    description:
      'Turn tickets, WhatsApp chats, and rough notes into a mapped day-by-day itinerary, bilingual Elder Card, and clean UPI expense split.',
    locale: 'en_IN',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Itinbee — Collaborative Travel Itinerary & UPI Split Workspace',
    description:
      'OTA-agnostic, WhatsApp-native, offline-first travel itinerary builder, Elder Card viewer, and UPI expense ledger.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans text-ui text-ink antialiased">{children}</body>
    </html>
  );
}
