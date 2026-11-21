'use client';

import React, { useMemo, useState } from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { getDayColor } from './day-palette';
import {
  isValidCoordinate,
  type CandidateMapPlace,
  type DayRouteSegment,
} from './map-utils';

export interface PlottedStop {
  id: string;
  dayId: string | null;
  dayNumber: number;
  stopIndexInDay: number;
  title: string;
  lat: number;
  lng: number;
}

interface SchematicRouteMapProps {
  stops: PlottedStop[];
  candidates: CandidateMapPlace[];
  routeSegments: DayRouteSegment[];
  highlightedStopId: string | null;
  selectedCandidateId: string | null;
  fitSignal: number;
  onSelectStop: (stopId: string) => void;
  onHoverStop?: (stopId: string | null) => void;
  onSelectCandidate: (candidate: CandidateMapPlace) => void;
  onViewportBboxChange?: (bbox: string) => void;
}

const VIEW_W = 560;
const VIEW_H = 420;
const PAD_X = 58;
const PAD_Y = 52;

export function SchematicRouteMap({
  stops,
  candidates,
  routeSegments,
  highlightedStopId,
  selectedCandidateId,
  fitSignal,
  onSelectStop,
  onHoverStop,
  onSelectCandidate,
  onViewportBboxChange,
}: SchematicRouteMapProps) {
  const [zoomFactor, setZoomFactor] = useState(1);
  const [panOffset, setPanOffset] = useState<{ dLat: number; dLng: number }>({
    dLat: 0,
    dLng: 0,
  });

  // Reset zoom/pan when caller triggers Fit route
  React.useEffect(() => {
    setZoomFactor(1);
    setPanOffset({ dLat: 0, dLng: 0 });
  }, [fitSignal]);

  const baseBounds = useMemo(() => {
    const allCoords: Array<{ lat: number; lng: number }> = [];
    for (const s of stops) {
      if (isValidCoordinate(s.lat, s.lng)) allCoords.push({ lat: s.lat, lng: s.lng });
    }
    if (allCoords.length === 0) {
      for (const c of candidates) {
        if (isValidCoordinate(c.lat, c.lng)) allCoords.push({ lat: c.lat, lng: c.lng });
      }
    }
    if (allCoords.length === 0) {
      return { minLat: 30.05, maxLat: 30.5, minLng: 78.05, maxLng: 78.35 };
    }
    const lats = allCoords.map((p) => p.lat);
    const lngs = allCoords.map((p) => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const latPad = Math.max((maxLat - minLat) * 0.2, 0.025);
    const lngPad = Math.max((maxLng - minLng) * 0.2, 0.025);
    return {
      minLat: minLat - latPad,
      maxLat: maxLat + latPad,
      minLng: minLng - lngPad,
      maxLng: maxLng + lngPad,
    };
  }, [stops, candidates]);

  const viewportBounds = useMemo(() => {
    const centerLat = (baseBounds.minLat + baseBounds.maxLat) / 2 + panOffset.dLat;
    const centerLng = (baseBounds.minLng + baseBounds.maxLng) / 2 + panOffset.dLng;
    const halfLat = (baseBounds.maxLat - baseBounds.minLat) / 2 / zoomFactor;
    const halfLng = (baseBounds.maxLng - baseBounds.minLng) / 2 / zoomFactor;
    return {
      minLat: centerLat - halfLat,
      maxLat: centerLat + halfLat,
      minLng: centerLng - halfLng,
      maxLng: centerLng + halfLng,
    };
  }, [baseBounds, zoomFactor, panOffset]);

  const projectCoord = React.useCallback(
    (lat: number, lng: number) => {
      const latSpan = Math.max(viewportBounds.maxLat - viewportBounds.minLat, 0.005);
      const lngSpan = Math.max(viewportBounds.maxLng - viewportBounds.minLng, 0.005);
      const x =
        PAD_X + ((lng - viewportBounds.minLng) / lngSpan) * (VIEW_W - PAD_X * 2);
      const y =
        VIEW_H -
        PAD_Y -
        ((lat - viewportBounds.minLat) / latSpan) * (VIEW_H - PAD_Y * 2);
      return { x, y };
    },
    [viewportBounds]
  );

  // Project stop pins with gentle collision separation so adjacent pins remain clickable
  const projectedStops = useMemo(() => {
    const pts = stops.map((s, idx) => {
      const { x, y } = projectCoord(s.lat, s.lng);
      return { stop: s, x, y, labelAbove: idx % 2 === 1 };
    });
    const minDist = 34;
    for (let pass = 0; pass < 6; pass++) {
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
            const push = ((minDist - Math.max(dist, 0.1)) / 2) * 0.8;
            const nx = dx / Math.max(dist, 0.1);
            const ny = dy / Math.max(dist, 0.1);
            a.x = Math.min(Math.max(a.x - nx * push, 26), VIEW_W - 26);
            a.y = Math.min(Math.max(a.y - ny * push, 28), VIEW_H - 32);
            b.x = Math.min(Math.max(b.x + nx * push, 26), VIEW_W - 26);
            b.y = Math.min(Math.max(b.y + ny * push, 28), VIEW_H - 32);
          }
        }
      }
    }
    return pts;
  }, [stops, projectCoord]);

  const stopPositionById = useMemo(
    () => new Map(projectedStops.map((p) => [p.stop.id, { x: p.x, y: p.y }])),
    [projectedStops]
  );

  const projectedCandidates = useMemo(
    () =>
      candidates.slice(0, 24).map((c) => {
        const { x, y } = projectCoord(c.lat, c.lng);
        return {
          candidate: c,
          x: Math.min(Math.max(x, 22), VIEW_W - 22),
          y: Math.min(Math.max(y, 24), VIEW_H - 28),
        };
      }),
    [candidates, projectCoord]
  );

  const emitAdjustedBounds = (nextZoom: number, nextPan: { dLat: number; dLng: number }) => {
    const centerLat = (baseBounds.minLat + baseBounds.maxLat) / 2 + nextPan.dLat;
    const centerLng = (baseBounds.minLng + baseBounds.maxLng) / 2 + nextPan.dLng;
    const halfLat = (baseBounds.maxLat - baseBounds.minLat) / 2 / nextZoom;
    const halfLng = (baseBounds.maxLng - baseBounds.minLng) / 2 / nextZoom;
    const west = Math.max(-180, centerLng - halfLng);
    const south = Math.max(-90, centerLat - halfLat);
    const east = Math.min(180, centerLng + halfLng);
    const north = Math.min(90, centerLat + halfLat);
    onViewportBboxChange?.(
      `${west.toFixed(5)},${south.toFixed(5)},${east.toFixed(5)},${north.toFixed(5)}`
    );
  };

  const handleZoom = (delta: number) => {
    const nextZoom = Math.min(Math.max(zoomFactor * delta, 0.55), 3.2);
    setZoomFactor(nextZoom);
    emitAdjustedBounds(nextZoom, panOffset);
  };

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#F3E9D2]">
      {stops.length === 0 && candidates.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center p-6 text-center text-sm text-paper-ink">
          <p className="font-semibold text-navy">No pinned stops on the map yet</p>
          <p className="mt-1 max-w-xs text-[13px] text-paper-ink">
            Pick a place from the Explore Places panel to plot routes and travel times.
          </p>
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="h-full w-full select-none"
          role="img"
          aria-label="Interactive schematic route map"
        >
          <defs>
            <pattern
              id="itinbee-schematic-grid"
              width="32"
              height="32"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="1.5" cy="1.5" r="1" fill="#CBB68A" fillOpacity="0.65" />
            </pattern>
          </defs>

          <rect width={VIEW_W} height={VIEW_H} fill="url(#itinbee-schematic-grid)" />

          {/* Topographic contour hints */}
          <path
            d={`M -16 92 Q 150 48 310 88 T ${VIEW_W + 16} 66`}
            fill="none"
            stroke="#DFCEA8"
            strokeWidth="1.25"
          />
          <path
            d={`M -16 296 Q 190 250 380 302 T ${VIEW_W + 16} 274`}
            fill="none"
            stroke="#DFCEA8"
            strokeWidth="1.25"
          />

          {/* Day Route Polylines */}
          {routeSegments.map((seg) => {
            let pointsAttr = '';
            if (seg.solid && seg.coordinates.length > 2) {
              pointsAttr = seg.coordinates
                .map(([lng, lat]) => {
                  const pt = projectCoord(lat, lng);
                  return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
                })
                .join(' ');
            } else {
              const fromPt = stopPositionById.get(seg.fromStopId);
              const toPt = stopPositionById.get(seg.toStopId);
              if (fromPt && toPt) {
                pointsAttr = `${fromPt.x.toFixed(1)},${fromPt.y.toFixed(1)} ${toPt.x.toFixed(1)},${toPt.y.toFixed(1)}`;
              }
            }
            if (!pointsAttr) return null;
            return (
              <polyline
                key={seg.id}
                fill="none"
                stroke={seg.color}
                strokeWidth={seg.solid ? 3.2 : 2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={seg.solid ? undefined : '6 5'}
                opacity={0.9}
                points={pointsAttr}
              />
            );
          })}

          {/* Candidate Place Markers */}
          {projectedCandidates.map(({ candidate, x, y }) => {
            const isSelected = candidate.id === selectedCandidateId;
            return (
              <g
                key={candidate.id}
                role="button"
                tabIndex={0}
                data-testid="map-candidate-marker"
                aria-label={`Suggested place: ${candidate.name} (${candidate.category})`}
                onClick={() => onSelectCandidate(candidate)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectCandidate(candidate);
                  }
                }}
                className="cursor-pointer"
              >
                {isSelected && (
                  <circle
                    cx={x}
                    cy={y}
                    r="15"
                    fill="#14213D"
                    fillOpacity="0.16"
                  />
                )}
                <circle
                  cx={x}
                  cy={y}
                  r={isSelected ? 9.5 : 8}
                  fill={isSelected ? '#14213D' : '#FFFDF8'}
                  stroke="#14213D"
                  strokeWidth="2"
                />
                <text
                  x={x}
                  y={y + 3.5}
                  textAnchor="middle"
                  fill={isSelected ? '#FFFDF8' : '#14213D'}
                  fontSize="11"
                  fontWeight="700"
                >
                  +
                </text>
              </g>
            );
          })}

          {/* Day-Colored Numbered Stop Markers */}
          {projectedStops.map((pt) => {
            const color = getDayColor(pt.stop.dayNumber);
            const active = pt.stop.id === highlightedStopId;
            const labelText =
              pt.stop.title.length > 20
                ? `${pt.stop.title.slice(0, 19)}…`
                : pt.stop.title;
            const boxW = Math.max(88, Math.min(142, labelText.length * 6.5 + 16));
            const boxX = Math.min(Math.max(pt.x - boxW / 2, 8), VIEW_W - boxW - 8);
            const boxY = pt.labelAbove
              ? Math.max(pt.y - 34, 8)
              : Math.min(pt.y + 15, VIEW_H - 28);

            return (
              <g
                key={pt.stop.id}
                role="button"
                tabIndex={0}
                data-testid="map-stop-marker"
                aria-label={`Day ${pt.stop.dayNumber} Stop ${pt.stop.stopIndexInDay}: ${pt.stop.title}`}
                onClick={() => onSelectStop(pt.stop.id)}
                onMouseEnter={() => onHoverStop?.(pt.stop.id)}
                onMouseLeave={() => onHoverStop?.(null)}
                onFocus={() => onHoverStop?.(pt.stop.id)}
                onBlur={() => onHoverStop?.(null)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectStop(pt.stop.id);
                  }
                }}
                className="cursor-pointer"
              >
                {active && (
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r="18"
                    fill={color}
                    fillOpacity="0.24"
                  />
                )}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={active ? 12.5 : 11}
                  fill={color}
                  stroke="#FFFDF8"
                  strokeWidth={active ? 2.5 : 2}
                />
                <text
                  x={pt.x}
                  y={pt.y + 4}
                  textAnchor="middle"
                  fill="#FFFFFF"
                  fontSize="11"
                  fontFamily="var(--font-jetbrains-mono), monospace"
                  fontWeight="700"
                >
                  {pt.stop.stopIndexInDay}
                </text>

                <rect
                  x={boxX}
                  y={boxY}
                  width={boxW}
                  height="20"
                  rx="5"
                  fill="#FFFDF8"
                  fillOpacity="0.96"
                  stroke={active ? color : '#14213D'}
                  strokeOpacity={active ? 1 : 0.35}
                  strokeWidth={active ? 1.6 : 1}
                />
                <text
                  x={boxX + boxW / 2}
                  y={boxY + 13.5}
                  textAnchor="middle"
                  fill="#14213D"
                  fontSize="10.5"
                  fontWeight="600"
                >
                  {labelText}
                </text>
              </g>
            );
          })}
        </svg>
      )}

      {/* Zoom controls for Schematic mode */}
      <div className="absolute bottom-8 right-3 z-10 flex flex-col gap-1">
        <button
          type="button"
          onClick={() => handleZoom(1.3)}
          aria-label="Zoom in schematic map"
          className="inline-grid h-9 w-9 place-items-center rounded-md border border-navy/30 bg-[#FFFDF8] text-navy shadow-panel hover:bg-paper"
        >
          <Plus className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => handleZoom(1 / 1.3)}
          aria-label="Zoom out schematic map"
          className="inline-grid h-9 w-9 place-items-center rounded-md border border-navy/30 bg-[#FFFDF8] text-navy shadow-panel hover:bg-paper"
        >
          <Minus className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
        </button>
        {zoomFactor !== 1 && (
          <button
            type="button"
            onClick={() => {
              setZoomFactor(1);
              setPanOffset({ dLat: 0, dLng: 0 });
            }}
            aria-label="Reset schematic zoom"
            className="inline-grid h-9 w-9 place-items-center rounded-md border border-navy/30 bg-[#FFFDF8] text-navy shadow-panel hover:bg-paper"
          >
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Attribution bar */}
      <div className="flex items-center justify-between border-t border-navy/15 bg-[#FFFDF8]/95 px-3 py-1 text-[11px] text-paper-ink">
        <span>Schematic route view · © OpenStreetMap contributors · OpenFreeMap</span>
      </div>
    </div>
  );
}
