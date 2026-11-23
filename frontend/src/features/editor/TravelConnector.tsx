'use client';

import React, { useEffect, useState } from 'react';
import { Bus, Car, ExternalLink, Footprints, Plane, Train } from 'lucide-react';
import type { ItineraryItem } from '@/lib/types';
import {
  buildStraightLineFallback,
  buildTransitStopLeg,
  type RouteLegResult,
} from '@/features/map/map-utils';
import { fetchRouteLeg, getCachedRouteLeg } from './route-service';

interface TravelConnectorProps {
  fromStop: ItineraryItem & { lat: number; lng: number };
  toStop: ItineraryItem & { lat: number; lng: number };
  dayColor: string;
  onLegResolved: (pairKey: string, leg: RouteLegResult) => void;
}

export function TravelConnector({
  fromStop,
  toStop,
  dayColor,
  onLegResolved,
}: TravelConnectorProps) {
  const pairKey = `${fromStop.id}->${toStop.id}`;
  const transitMode = toStop.transitMeta?.mode;

  const [leg, setLeg] = useState<RouteLegResult>(() => {
    const special = buildTransitStopLeg(
      { lat: fromStop.lat, lng: fromStop.lng },
      { lat: toStop.lat, lng: toStop.lng },
      toStop.transitMeta
    );
    if (special) return special;

    const cached = getCachedRouteLeg(
      { lat: fromStop.lat, lng: fromStop.lng },
      { lat: toStop.lat, lng: toStop.lng }
    );
    return (
      cached ??
      buildStraightLineFallback(
        { lat: fromStop.lat, lng: fromStop.lng },
        { lat: toStop.lat, lng: toStop.lng }
      )
    );
  });

  useEffect(() => {
    let cancelled = false;
    const origin = { lat: fromStop.lat, lng: fromStop.lng };
    const dest = { lat: toStop.lat, lng: toStop.lng };

    const special = buildTransitStopLeg(origin, dest, toStop.transitMeta);
    if (special) {
      setLeg(special);
      onLegResolved(pairKey, special);
      return () => {
        cancelled = true;
      };
    }

    fetchRouteLeg(origin, dest).then((resolved) => {
      if (cancelled) return;
      setLeg(resolved);
      onLegResolved(pairKey, resolved);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    fromStop.id,
    fromStop.lat,
    fromStop.lng,
    toStop.id,
    toStop.lat,
    toStop.lng,
    transitMode,
  ]);

  const isWalking = transitMode === 'walk' || (!transitMode && leg.profile === 'foot-walking');
  const travelModeParam =
    transitMode === 'rail' || transitMode === 'bus'
      ? 'transit'
      : isWalking
        ? 'walking'
        : 'driving';
  const directionsHref =
    transitMode === 'flight'
      ? `https://www.google.com/maps/search/?api=1&query=${toStop.lat.toFixed(6)},${toStop.lng.toFixed(6)}`
      : `https://www.google.com/maps/dir/?api=1&origin=${fromStop.lat.toFixed(6)},${fromStop.lng.toFixed(6)}&destination=${toStop.lat.toFixed(6)},${toStop.lng.toFixed(6)}&travelmode=${travelModeParam}`;

  const ModeIcon =
    transitMode === 'flight'
      ? Plane
      : transitMode === 'rail'
        ? Train
        : transitMode === 'bus'
          ? Bus
          : isWalking
            ? Footprints
            : Car;

  return (
    <div
      data-testid="travel-connector"
      className="flex flex-wrap items-center gap-2.5 py-1 pl-4 text-[12.5px] text-paper-ink"
    >
      <svg
        width="12"
        height="24"
        viewBox="0 0 12 24"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <line
          x1="6"
          y1="1"
          x2="6"
          y2="23"
          stroke={dayColor}
          strokeWidth="2"
          strokeDasharray={leg.source === 'openrouteservice' ? undefined : '3 3'}
          strokeLinecap="round"
        />
      </svg>

      <span className="inline-flex items-center gap-1.5 rounded-full border border-navy/15 bg-paper/75 px-2.5 py-0.5 font-mono text-[12px] font-medium tabular-nums text-navy">
        <ModeIcon className="h-3.5 w-3.5 text-navy" strokeWidth={1.8} aria-hidden="true" />
        <span>{leg.label}</span>
      </span>

      {toStop.transitMeta?.advisory && (
        <span className="rounded-full bg-honey-wash px-2.5 py-0.5 text-[11.5px] font-semibold text-honey-darker">
          {toStop.transitMeta.advisory}
        </span>
      )}

      <a
        href={directionsHref}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Directions from ${fromStop.title} to ${toStop.title}`}
        className="inline-flex items-center gap-1 text-[12px] font-semibold text-navy underline-offset-2 hover:underline"
      >
        <span>Route</span>
        <ExternalLink className="h-3 w-3" strokeWidth={1.8} aria-hidden="true" />
      </a>
    </div>
  );
}
