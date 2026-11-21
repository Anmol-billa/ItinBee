import type { Metadata, Viewport } from 'next';
import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#062119',
};

export const metadata: Metadata = {
  title: {
    default: 'Itinbee — Minimalist Travel Itinerary & UPI Split Workspace',
    template: '%s · Itinbee',
  },
  description:
    'OTA-agnostic, WhatsApp-native, offline-first travel itinerary builder, Elder Card viewer, and unlimited UPI expense ledger for Indian travellers.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icon.svg',
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
