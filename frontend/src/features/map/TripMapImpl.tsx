'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getDayColor } from './day-palette';
import {
  isValidCoordinate,
  isWebGLSupported,
  prefersReducedMotion,
  type CandidateMapPlace,
  type DayRouteSegment,
} from './map-utils';
import { SchematicRouteMap, type PlottedStop } from './SchematicRouteMap';

const OPENFREEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const SOLID_SOURCE_ID = 'itinbee-routes-solid';
const SOLID_LAYER_ID = 'itinbee-routes-solid-line';
const DASHED_SOURCE_ID = 'itinbee-routes-dashed';
const DASHED_LAYER_ID = 'itinbee-routes-dashed-line';

export interface TripMapImplProps {
  stops: PlottedStop[];
  candidates: CandidateMapPlace[];
  routeSegments: DayRouteSegment[];
  highlightedStopId: string | null;
  selectedCandidateId: string | null;
  fitSignal: number;
  centerHint?: { lat: number; lng: number } | null;
  onSelectStop: (stopId: string) => void;
  onHoverStop?: (stopId: string | null) => void;
  onSelectCandidate: (candidate: CandidateMapPlace) => void;
  onViewportBboxChange?: (bbox: string) => void;
}

function buildRouteFeatureCollection(segments: DayRouteSegment[]) {
  return {
    type: 'FeatureCollection' as const,
    features: segments
      .filter((s) => s.coordinates.length >= 2)
      .map((s) => ({
        type: 'Feature' as const,
        properties: {
          id: s.id,
          color: s.color,
          dayNumber: s.dayNumber,
        },
        geometry: {
          type: 'LineString' as const,
          coordinates: s.coordinates,
        },
      })),
  };
}

export default function TripMapImpl({
  stops,
  candidates,
  routeSegments,
  highlightedStopId,
  selectedCandidateId,
  fitSignal,
  centerHint,
  onSelectStop,
  onHoverStop,
  onSelectCandidate,
  onViewportBboxChange,
}: TripMapImplProps) {
  const [webglFailed, setWebglFailed] = useState<boolean>(() => !isWebGLSupported());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const styleLoadedRef = useRef(false);
  const stopMarkersRef = useRef<maplibregl.Marker[]>([]);
  const candidateMarkersRef = useRef<maplibregl.Marker[]>([]);
  const lastAutoFitKeyRef = useRef<string>('');

  const fitMapToCurrentContent = useCallback(
    (forceAnimate = true) => {
      const map = mapRef.current;
      if (!map) return;
      const duration = !forceAnimate || prefersReducedMotion() ? 0 : 380;

      const pts: Array<[number, number]> = [];
      for (const s of stops) {
        if (isValidCoordinate(s.lat, s.lng)) pts.push([s.lng, s.lat]);
      }
      if (pts.length === 0) {
        for (const c of candidates.slice(0, 12)) {
          if (isValidCoordinate(c.lat, c.lng)) pts.push([c.lng, c.lat]);
        }
      }

      if (pts.length >= 2) {
        const bounds = new maplibregl.LngLatBounds(pts[0]!, pts[0]!);
        for (const p of pts) bounds.extend(p);
        map.fitBounds(bounds, { padding: 54, maxZoom: 14, duration });
      } else if (pts.length === 1) {
        map.flyTo({ center: pts[0]!, zoom: 12.5, duration });
      } else if (centerHint && isValidCoordinate(centerHint.lat, centerHint.lng)) {
        map.flyTo({ center: [centerHint.lng, centerHint.lat], zoom: 11.5, duration });
      }
    },
    [stops, candidates, centerHint]
  );

  // Initialize MapLibre GL with WebGL guard + OpenFreeMap Liberty style
  useEffect(() => {
    if (webglFailed) return;
    if (!containerRef.current || mapRef.current) return;

    if (!isWebGLSupported()) {
      setWebglFailed(true);
      return;
    }

    const initialCenter: [number, number] = stops[0]
      ? [stops[0].lng, stops[0].lat]
      : centerHint
        ? [centerHint.lng, centerHint.lat]
        : [78.2676, 30.0869];

    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: OPENFREEMAP_STYLE_URL,
        center: initialCenter,
        zoom: 10.5,
        attributionControl: false,
      });
    } catch {
      setWebglFailed(true);
      return;
    }

    map.addControl(
      new maplibregl.AttributionControl({
        compact: false,
        customAttribution: '© OpenStreetMap contributors · OpenFreeMap',
      }),
      'bottom-right'
    );
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    const ensureRouteLayers = () => {
      if (!map.getSource(SOLID_SOURCE_ID)) {
        map.addSource(SOLID_SOURCE_ID, {
          type: 'geojson',
          data: buildRouteFeatureCollection([]),
        });
      }
      if (!map.getLayer(SOLID_LAYER_ID)) {
        map.addLayer({
          id: SOLID_LAYER_ID,
          type: 'line',
          source: SOLID_SOURCE_ID,
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
          paint: {
            'line-color': ['get', 'color'],
            'line-width': 4,
            'line-opacity': 0.9,
          },
        });
      }

      if (!map.getSource(DASHED_SOURCE_ID)) {
        map.addSource(DASHED_SOURCE_ID, {
          type: 'geojson',
          data: buildRouteFeatureCollection([]),
        });
      }
      if (!map.getLayer(DASHED_LAYER_ID)) {
        map.addLayer({
          id: DASHED_LAYER_ID,
          type: 'line',
          source: DASHED_SOURCE_ID,
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
          paint: {
            'line-color': ['get', 'color'],
            'line-width': 3,
            'line-dasharray': [2, 2],
            'line-opacity': 0.82,
          },
        });
      }
    };

    map.on('load', () => {
      styleLoadedRef.current = true;
      try {
        ensureRouteLayers();
        map.resize();
        fitMapToCurrentContent(false);
      } catch {
        // Style layer insertion guarded
      }
    });

    map.on('error', (evt) => {
      const msg = String((evt as { error?: { message?: string } })?.error?.message ?? '');
      if (/webgl|context/i.test(msg)) {
        setWebglFailed(true);
      }
    });

    map.on('moveend', (evt) => {
      if (!(evt as { originalEvent?: unknown }).originalEvent) return;
      const b = map.getBounds();
      const west = Math.max(-180, b.getWest());
      const south = Math.max(-90, b.getSouth());
      const east = Math.min(180, b.getEast());
      const north = Math.min(90, b.getNorth());
      if (west < east && south < north) {
        onViewportBboxChange?.(
          `${west.toFixed(5)},${south.toFixed(5)},${east.toFixed(5)},${north.toFixed(5)}`
        );
      }
    });

    mapRef.current = map;

    return () => {
      styleLoadedRef.current = false;
      for (const m of stopMarkersRef.current) m.remove();
      for (const m of candidateMarkersRef.current) m.remove();
      stopMarkersRef.current = [];
      candidateMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webglFailed]);

  // Sync GeoJSON route polylines per day (solid road geometry vs dashed straight-line fallback)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || webglFailed) return;

    const applyPolylines = () => {
      const solidSrc = map.getSource(SOLID_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      const dashedSrc = map.getSource(DASHED_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      if (solidSrc) {
        solidSrc.setData(
          buildRouteFeatureCollection(routeSegments.filter((s) => s.solid))
        );
      }
      if (dashedSrc) {
        dashedSrc.setData(
          buildRouteFeatureCollection(routeSegments.filter((s) => !s.solid))
        );
      }
    };

    if (styleLoadedRef.current && map.isStyleLoaded()) {
      applyPolylines();
    } else {
      map.once('load', applyPolylines);
    }
  }, [routeSegments, webglFailed]);

  // Sync day-colored numbered stop markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || webglFailed) return;

    for (const m of stopMarkersRef.current) m.remove();
    stopMarkersRef.current = [];

    for (const stop of stops) {
      if (!isValidCoordinate(stop.lat, stop.lng)) continue;
      const color = getDayColor(stop.dayNumber);
      const isHighlighted = stop.id === highlightedStopId;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-testid', 'map-stop-marker');
      btn.setAttribute(
        'aria-label',
        `Day ${stop.dayNumber} Stop ${stop.stopIndexInDay}: ${stop.title}`
      );
      btn.textContent = String(stop.stopIndexInDay);
      btn.style.backgroundColor = color;
      btn.style.color = '#FFFFFF';
      btn.style.borderColor = '#FFFDF8';
      btn.style.borderWidth = isHighlighted ? '3px' : '2px';
      btn.style.borderStyle = 'solid';
      btn.style.width = isHighlighted ? '32px' : '26px';
      btn.style.height = isHighlighted ? '32px' : '26px';
      btn.style.borderRadius = '9999px';
      btn.style.display = 'inline-flex';
      btn.style.alignItems = 'center';
      btn.style.justifyContent = 'center';
      btn.style.fontFamily = 'var(--font-jetbrains-mono), monospace';
      btn.style.fontSize = isHighlighted ? '12px' : '11px';
      btn.style.fontWeight = '700';
      btn.style.boxShadow = isHighlighted
        ? `0 0 0 4px ${color}40, 0 4px 10px rgba(20,33,61,0.35)`
        : '0 2px 6px rgba(20,33,61,0.28)';
      btn.style.cursor = 'pointer';
      btn.style.zIndex = isHighlighted ? '30' : '20';

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelectStop(stop.id);
      });
      btn.addEventListener('mouseenter', () => onHoverStop?.(stop.id));
      btn.addEventListener('mouseleave', () => onHoverStop?.(null));

      const marker = new maplibregl.Marker({ element: btn })
        .setLngLat([stop.lng, stop.lat])
        .addTo(map);
      stopMarkersRef.current.push(marker);
    }
  }, [stops, highlightedStopId, onSelectStop, onHoverStop, webglFailed]);

  // Sync candidate discovery places layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || webglFailed) return;

    for (const m of candidateMarkersRef.current) m.remove();
    candidateMarkersRef.current = [];

    for (const place of candidates.slice(0, 24)) {
      if (!isValidCoordinate(place.lat, place.lng)) continue;
      const isSelected = place.id === selectedCandidateId;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-testid', 'map-candidate-marker');
      btn.setAttribute(
        'aria-label',
        `Suggested place: ${place.name} (${place.category})`
      );
      btn.textContent = '+';
      btn.style.backgroundColor = isSelected ? '#14213D' : '#FFFDF8';
      btn.style.color = isSelected ? '#FFFDF8' : '#14213D';
      btn.style.border = '2px solid #14213D';
      btn.style.width = isSelected ? '26px' : '22px';
      btn.style.height = isSelected ? '26px' : '22px';
      btn.style.borderRadius = '9999px';
      btn.style.display = 'inline-flex';
      btn.style.alignItems = 'center';
      btn.style.justifyContent = 'center';
      btn.style.fontSize = '13px';
      btn.style.fontWeight = '700';
      btn.style.lineHeight = '1';
      btn.style.boxShadow = '0 2px 6px rgba(20,33,61,0.22)';
      btn.style.cursor = 'pointer';
      btn.style.zIndex = isSelected ? '25' : '10';

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelectCandidate(place);
      });

      const marker = new maplibregl.Marker({ element: btn })
        .setLngLat([place.lng, place.lat])
        .addTo(map);
      candidateMarkersRef.current.push(marker);
    }
  }, [candidates, selectedCandidateId, onSelectCandidate, webglFailed]);

  // Auto-fit when stop set changes or when Fit route is clicked
  useEffect(() => {
    if (webglFailed || !mapRef.current) return;
    const stopSignature = stops.map((s) => `${s.id}:${s.lat.toFixed(4)},${s.lng.toFixed(4)}`).join('|');
    const centerSig = centerHint ? `${centerHint.lat.toFixed(3)},${centerHint.lng.toFixed(3)}` : '';
    const sig = `${stopSignature}::${centerSig}::${fitSignal}`;
    if (sig === lastAutoFitKeyRef.current) return;
    const isInitial = lastAutoFitKeyRef.current === '';
    lastAutoFitKeyRef.current = sig;
    fitMapToCurrentContent(!isInitial);
  }, [stops, centerHint, fitSignal, fitMapToCurrentContent, webglFailed]);

  if (webglFailed) {
    return (
      <SchematicRouteMap
        stops={stops}
        candidates={candidates}
        routeSegments={routeSegments}
        highlightedStopId={highlightedStopId}
        selectedCandidateId={selectedCandidateId}
        fitSignal={fitSignal}
        onSelectStop={onSelectStop}
        onHoverStop={onHoverStop}
        onSelectCandidate={onSelectCandidate}
        onViewportBboxChange={onViewportBboxChange}
      />
    );
  }

  return <div ref={containerRef} className="h-full w-full" />;
}
