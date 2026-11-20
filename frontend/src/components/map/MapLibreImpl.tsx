'use client';

import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { ItineraryItem } from '@/lib/types';

interface MapLibreImplProps {
  items: ItineraryItem[];
  highlightedItemId: string | null;
  onSelectStop?: (itemId: string) => void;
}

export default function MapLibreImpl({
  items,
  highlightedItemId,
  onSelectStop,
}: MapLibreImplProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  const geoItems = items.filter(
    (i): i is ItineraryItem & { lat: number; lng: number } =>
      typeof i.lat === 'number' && typeof i.lng === 'number' && !i.deletedAt
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const first = geoItems[0];
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
          },
        },
        layers: [
          {
            id: 'osm-tiles',
            type: 'raster',
            source: 'osm',
            minzoom: 0,
            maxzoom: 19,
          },
        ],
      },
      center: first ? [first.lng, first.lat] : [78.1642, 30.1033],
      zoom: 9,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const m of markersRef.current) m.remove();
    markersRef.current = [];

    geoItems.forEach((stop, index) => {
      const el = document.createElement('button');
      el.type = 'button';
      const isHighlighted = stop.id === highlightedItemId;
      el.className = isHighlighted
        ? 'flex h-6 w-6 items-center justify-center rounded-full border border-white bg-[#B45309] font-mono text-[11px] font-semibold text-white shadow-sm'
        : 'flex h-5 w-5 items-center justify-center rounded-full border border-white bg-[#18181B] font-mono text-[10px] font-medium text-white shadow-sm';
      el.textContent = String(index + 1);
      el.setAttribute('aria-label', `Stop ${index + 1}: ${stop.title}`);
      if (onSelectStop) {
        el.addEventListener('click', () => onSelectStop(stop.id));
      }

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([stop.lng, stop.lat])
        .addTo(map);
      markersRef.current.push(marker);
    });

    if (geoItems.length >= 2) {
      const bounds = new maplibregl.LngLatBounds();
      geoItems.forEach((g) => bounds.extend([g.lng, g.lat]));
      map.fitBounds(bounds, { padding: 42, maxZoom: 12, duration: 450 });
    } else if (geoItems.length === 1) {
      map.flyTo({ center: [geoItems[0]!.lng, geoItems[0]!.lat], zoom: 11, duration: 450 });
    }
  }, [geoItems, highlightedItemId, onSelectStop]);

  return <div ref={containerRef} className="h-full w-full rounded-lg" />;
}
