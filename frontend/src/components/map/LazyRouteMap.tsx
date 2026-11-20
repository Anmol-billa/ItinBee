'use client';

import React, { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { ExternalLink, Map as MapIcon } from 'lucide-react';
import type { ItineraryItem } from '@/lib/types';

const DynamicMapLibre = dynamic(() => import('@/components/map/MapLibreImpl'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center rounded-lg bg-canvas-muted text-compact text-ink-secondary">
      Loading interactive OpenStreetMap tiles…
    </div>
  ),
});

interface LazyRouteMapProps {
  items: ItineraryItem[];
  highlightedItemId: string | null;
  onSelectStop?: (itemId: string) => void;
  attribution?: string;
}

export function LazyRouteMap({
  items,
  highlightedItemId,
  onSelectStop,
  attribution = '© OpenStreetMap contributors · Overture Maps · Wikidata',
}: LazyRouteMapProps) {
  const [interactiveOpen, setInteractiveOpen] = useState(false);

  const geoStops = useMemo(
    () =>
      items.filter(
        (i): i is ItineraryItem & { lat: number; lng: number } =>
          typeof i.lat === 'number' && typeof i.lng === 'number' && !i.deletedAt
      ),
    [items]
  );

  // Project lat/lng into schematic SVG space and apply iterative minimum-distance repulsion
  // so 400m-adjacent stops (e.g., Rokeby Manor & Chaar Dukan) remain distinct and legible.
  const projectedPoints = useMemo(() => {
    if (geoStops.length === 0) return [];
    if (geoStops.length === 1) {
      return [{ stop: geoStops[0]!, x: 180, y: 124, labelAbove: false }];
    }
    const lats = geoStops.map((s) => s.lat);
    const lngs = geoStops.map((s) => s.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const latSpan = Math.max(maxLat - minLat, 0.02);
    const lngSpan = Math.max(maxLng - minLng, 0.02);

    const pts = geoStops.map((stop, idx) => ({
      stop,
      x: 56 + ((stop.lng - minLng) / lngSpan) * 248,
      y: 198 - ((stop.lat - minLat) / latSpan) * 144,
      labelAbove: idx % 2 === 1,
    }));

    const minDist = 52;
    for (let pass = 0; pass < 8; pass++) {
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i]!;
          const b = pts[j]!;
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          const dist = Math.hypot(dx, dy);
          if (dist < minDist) {
            if (dist < 0.1) {
              dx = 1;
              dy = (j - i) % 2 === 0 ? 1 : -1;
            }
            const push = ((minDist - Math.max(dist, 0.1)) / 2) * 0.85;
            const nx = dx / Math.max(dist, 0.1);
            const ny = dy / Math.max(dist, 0.1);
            a.x = Math.min(Math.max(a.x - nx * push, 46), 314);
            a.y = Math.min(Math.max(a.y - ny * push, 38), 210);
            b.x = Math.min(Math.max(b.x + nx * push, 46), 314);
            b.y = Math.min(Math.max(b.y + ny * push, 38), 210);
          }
        }
      }
    }
    return pts;
  }, [geoStops]);

  const multiStopGoogleUrl = useMemo(() => {
    if (geoStops.length === 0) return null;
    if (geoStops.length === 1) {
      const only = geoStops[0]!;
      return `https://www.google.com/maps/search/?api=1&query=${only.lat},${only.lng}`;
    }
    const origin = geoStops[0]!;
    const dest = geoStops[geoStops.length - 1]!;
    const waypoints = geoStops
      .slice(1, -1)
      .map((s) => `${s.lat},${s.lng}`)
      .join('|');
    const qs = new URLSearchParams({
      api: '1',
      origin: `${origin.lat},${origin.lng}`,
      destination: `${dest.lat},${dest.lng}`,
    });
    if (waypoints) qs.set('waypoints', waypoints);
    return `https://www.google.com/maps/dir/?${qs.toString()}`;
  }, [geoStops]);

  return (
    <div
      role="region"
      aria-label="Route corridor map"
      className="flex h-full flex-col justify-between gap-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-compact font-medium text-ink">
          Corridor ({geoStops.length} {geoStops.length === 1 ? 'pin' : 'pins'})
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setInteractiveOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-canvas-elevated px-2.5 py-1 text-micro font-medium text-ink transition-colors hover:bg-canvas-muted"
          >
            <MapIcon className="h-3.5 w-3.5 text-ink-secondary" strokeWidth={1.6} aria-hidden="true" />
            {interactiveOpen ? 'Schematic view' : 'Interactive map'}
          </button>
          {multiStopGoogleUrl && (
            <a
              href={multiStopGoogleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-line bg-canvas-elevated px-2.5 py-1 text-micro font-medium text-ink-secondary transition-colors hover:text-ink"
            >
              Directions
              <ExternalLink className="h-3 w-3" strokeWidth={1.6} aria-hidden="true" />
            </a>
          )}
        </div>
      </div>

      <div className="relative min-h-[248px] flex-1 overflow-hidden rounded-lg border border-line bg-[#F1EFEA]">
        {interactiveOpen ? (
          <DynamicMapLibre
            items={items}
            highlightedItemId={highlightedItemId}
            onSelectStop={onSelectStop}
          />
        ) : projectedPoints.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-compact text-ink-secondary">
            Add stops with coordinates or paste a booking to plot the route corridor.
          </div>
        ) : (
          <svg
            viewBox="0 0 360 252"
            className="h-full w-full select-none"
            aria-label="Schematic route plot"
          >
            <defs>
              <pattern id="corridor-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="0.8" fill="#D6D3CD" />
              </pattern>
            </defs>
            <rect width="360" height="252" fill="url(#corridor-grid)" />
            {/* Subtle topographic contour lines */}
            <path
              d="M -10 74 Q 110 38 220 68 T 370 46"
              fill="none"
              stroke="#E2DFD7"
              strokeWidth="1"
            />
            <path
              d="M -10 182 Q 130 148 250 186 T 370 164"
              fill="none"
              stroke="#E2DFD7"
              strokeWidth="1"
            />
            {projectedPoints.length > 1 && (
              <polyline
                fill="none"
                stroke="#18181B"
                strokeWidth="1.5"
                strokeDasharray="3.5 3.5"
                points={projectedPoints.map((p) => `${p.x},${p.y}`).join(' ')}
              />
            )}
            {projectedPoints.map((pt, idx) => {
              const active = pt.stop.id === highlightedItemId;
              const boxX = Math.min(Math.max(pt.x - 54, 8), 244);
              const boxY = pt.labelAbove
                ? Math.max(pt.y - 28, 6)
                : Math.min(pt.y + 11, 228);

              return (
                <g
                  key={pt.stop.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Pin ${idx + 1}: ${pt.stop.title}`}
                  onClick={() => onSelectStop?.(pt.stop.id)}
                  onFocus={() => onSelectStop?.(pt.stop.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectStop?.(pt.stop.id);
                    }
                  }}
                  className="cursor-pointer"
                >
                  {active && (
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r="14"
                      fill="#B45309"
                      fillOpacity="0.18"
                    />
                  )}
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={active ? 8.5 : 7.5}
                    fill={active ? '#B45309' : '#18181B'}
                    stroke="#FFFFFF"
                    strokeWidth="1.5"
                  />
                  <text
                    x={pt.x}
                    y={pt.y + 3.5}
                    textAnchor="middle"
                    fill="#FFFFFF"
                    fontSize="9.5"
                    fontFamily="var(--font-jetbrains-mono), monospace"
                    fontWeight="600"
                  >
                    {idx + 1}
                  </text>
                  <rect
                    x={boxX}
                    y={boxY}
                    width="108"
                    height="17"
                    rx="4"
                    fill="#FFFFFF"
                    fillOpacity="0.95"
                    stroke={active ? '#B45309' : '#D6D3CD'}
                    strokeWidth="0.9"
                  />
                  <text
                    x={boxX + 54}
                    y={boxY + 11.5}
                    textAnchor="middle"
                    fill="#18181B"
                    fontSize="9.5"
                    fontWeight="500"
                  >
                    {pt.stop.title.length > 17
                      ? `${pt.stop.title.slice(0, 16)}…`
                      : pt.stop.title}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-micro text-ink-secondary">
        <span>{attribution}</span>
        <span>Zero Google Places API tracking</span>
      </div>
    </div>
  );
}
