import React from 'react';
import type { Metadata } from 'next';
import '../../(public)/world.css';

export const metadata: Metadata = {
  title: 'Trip Editor · Itinbee',
  description:
    'Plan day-by-day itineraries with live open-data place discovery, OpenFreeMap routes, UPI expense splits, and WhatsApp Elder Cards.',
};

export default function TripEditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="world flex min-h-dvh flex-col bg-[#FAF4E6] text-navy lg:h-dvh lg:overflow-hidden">
      <a
        href="#editor-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-saffron focus:px-4 focus:py-2 focus:font-bold focus:text-navy"
      >
        Skip to workspace
      </a>
      {children}
    </div>
  );
}
