import React from 'react';
import type { Metadata } from 'next';
import { PublicNav } from '@/components/world/PublicNav';
import { PublicFooter } from '@/components/world/PublicFooter';
import './world.css';

export const metadata: Metadata = {
  title: {
    default: 'Itinbee: tell us where, we build the trip',
    template: '%s · Itinbee',
  },
  description:
    'Describe your trip, paste your notes or drop a ticket. Itinbee builds a mapped, day-by-day itinerary you can edit, share on WhatsApp and carry offline.',
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="world flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-saffron focus:px-4 focus:py-2 focus:font-bold focus:text-navy"
      >
        Skip to content
      </a>
      <PublicNav />
      <main id="main" className="flex-1">
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
