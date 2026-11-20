import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { GuestShareClient } from '@/components/share/GuestShareClient';
import { fetchGuestShareSSR } from '@/lib/api-client';

interface GuestSharePageProps {
  params: Promise<{ shortId: string }>;
}

export async function generateMetadata({
  params,
}: GuestSharePageProps): Promise<Metadata> {
  const { shortId } = await params;
  const share = await fetchGuestShareSSR(shortId);
  if (!share) {
    return { title: 'Itinerary Not Found' };
  }
  const stopCount = share.items.filter((i) => !i.deletedAt).length;
  return {
    title: `${share.trip.title} (${stopCount} stops)`,
    description: `${share.plannerName} shared "${share.trip.title}" — ${share.trip.destinationSummary}. View schedule, Hindi/English Elder Card, and polls without signing in.`,
    openGraph: {
      title: `${share.plannerName} shared: ${share.trip.title}`,
      description: `${share.trip.destinationSummary} · ${stopCount} stops · Zero-login WhatsApp view`,
      type: 'article',
    },
  };
}

export default async function GuestSharePage({ params }: GuestSharePageProps) {
  const { shortId } = await params;
  const projection = await fetchGuestShareSSR(shortId);
  if (!projection) {
    notFound();
  }

  return <GuestShareClient projection={projection} />;
}
