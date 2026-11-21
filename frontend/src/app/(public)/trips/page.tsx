import React from 'react';
import type { Metadata } from 'next';
import { MyTripsClient } from '@/features/auth/MyTripsClient';

export const metadata: Metadata = {
  title: 'My trips',
  description: 'View and open your cloud-synced Itinbee itineraries and offline browser drafts.',
};

export default function MyTripsPage() {
  return (
    <section className="trunk-ground-flat min-h-[calc(100dvh-64px)]">
      <MyTripsClient />
    </section>
  );
}
