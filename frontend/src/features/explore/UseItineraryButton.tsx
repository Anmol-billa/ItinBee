'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { browserApiBase } from '@/lib/api-base';

interface UseItineraryButtonProps {
  slug: string;
  /** Sample itineraries have no clone API: open them directly. */
  openHref?: string;
}

async function post(path: string): Promise<Response> {
  return fetch(`${browserApiBase()}${path}`, { method: 'POST', credentials: 'include' });
}

/** Clones an itinerary into a draft the visitor owns (guest session created on demand). */
export function UseItineraryButton({ slug, openHref }: UseItineraryButtonProps) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');

  if (openHref) {
    return (
      <Link href={openHref} className="btn-stamp">
        Open this itinerary
      </Link>
    );
  }

  const run = async () => {
    setState('busy');
    try {
      let res = await post(`/v1/explore/${encodeURIComponent(slug)}/clone`);
      if (res.status === 401) {
        const g = await post('/v1/auth/guest');
        if (g.ok) res = await post(`/v1/explore/${encodeURIComponent(slug)}/clone`);
      }
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { tripId: string };
      router.push(`/trip/${data.tripId}`);
    } catch {
      setState('error');
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <button type="button" className="btn-stamp" onClick={run} disabled={state === 'busy'}>
        {state === 'busy' ? 'Copying to your trips…' : 'Use this itinerary'}
      </button>
      {state === 'error' ? (
        <p role="alert" className="text-[14px] font-semibold text-paper">
          Couldn&rsquo;t copy it just now. Check your connection and try again.
        </p>
      ) : null}
    </div>
  );
}
