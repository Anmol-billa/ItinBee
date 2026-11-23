'use client';

import React, { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Compass,
  LocateFixed,
  Maximize2,
  Minimize2,
  Plus,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import type { ItineraryItem, TripDay } from '@/lib/types';
import { buildDayColorLookup, getDayColor } from './day-palette';
import {
  buildStraightLineFallback,
  buildTransitStopLeg,
  computeBoundingBoxString,
  isValidCoordinate,
  type CandidateMapPlace,
  type DayRouteSegment,
  type RouteLegResult,
} from './map-utils';
import type { PlottedStop } from './SchematicRouteMap';

const DynamicTripMapImpl = dynamic(() => import('./TripMapImpl'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#F3E9D2] p-6 text-sm text-paper-ink">
      Loading OpenFreeMap vector tiles…
    </div>
  ),
});

export interface TripMapProps {
  days: TripDay[];
  items: ItineraryItem[];
  activeDayId: string | null;
  highlightedStopId: string | null;
  candidates: CandidateMapPlace[];
  hoveredCandidateId?: string | null;
  routeLegsByPairKey: Record<string, RouteLegResult>;
  centerHint?: { lat: number; lng: number } | null;
  onSelectStop: (stopId: string, dayId: string | null) => void;
  onHoverStop?: (stopId: string | null) => void;
  onAddCandidateToDay: (place: CandidateMapPlace, targetDayId: string | null) => void;
  onSearchArea: (bbox: string) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  sights: 'Top sight',
  food: 'Food',
  cafe: 'Café',
  culture: 'Culture',
  nature: 'Nature',
  spiritual: 'Spiritual',
  stay: 'Stay',
  activity: 'Activity',
  nightlife: 'Nightlife',
  transport: 'Transit',
};

export function TripMap({
  days,
  items,
  activeDayId,
  highlightedStopId,
  candidates,
  hoveredCandidateId,
  routeLegsByPairKey,
  centerHint,
  onSelectStop,
  onHoverStop,
  onAddCandidateToDay,
  onSearchArea,
}: TripMapProps) {
  const [dayFilter, setDayFilter] = useState<'all' | string>('all');
  const [fitSignal, setFitSignal] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pendingBbox, setPendingBbox] = useState<string | null>(null);
  const [selectedCandidate, setSelectedCandidate] =
    useState<CandidateMapPlace | null>(null);

  const activeDays = useMemo(
    () =>
      days
        .filter((d) => !d.deletedAt)
        .sort((a, b) => a.dayNumber - b.dayNumber),
    [days]
  );

  // Keep dayFilter valid if days change
  useEffect(() => {
    if (dayFilter !== 'all' && !activeDays.some((d) => d.id === dayFilter)) {
      setDayFilter('all');
    }
  }, [activeDays, dayFilter]);

  // Allow Escape to exit map fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFullscreen]);

  const dayLookup = useMemo(() => buildDayColorLookup(activeDays), [activeDays]);

  const targetDayForAdd = useMemo(() => {
    if (dayFilter !== 'all') {
      const match = activeDays.find((d) => d.id === dayFilter);
      if (match) return match;
    }
    if (activeDayId) {
      const match = activeDays.find((d) => d.id === activeDayId);
      if (match) return match;
    }
    return activeDays[0] ?? null;
  }, [activeDays, dayFilter, activeDayId]);

  const { plottedStops, routeSegments } = useMemo(() => {
    const visibleDays =
      dayFilter === 'all'
        ? activeDays
        : activeDays.filter((d) => d.id === dayFilter);

    const stopsOut: PlottedStop[] = [];
    const segmentsOut: DayRouteSegment[] = [];

    for (const day of visibleDays) {
      const ordered = items
        .filter((i) => i.dayId === day.id && !i.deletedAt)
        .sort((a, b) =>
          a.sortKey === b.sortKey
            ? a.id < b.id
              ? -1
              : a.id > b.id
                ? 1
                : 0
            : a.sortKey < b.sortKey
              ? -1
              : 1
        );

      const geoInDay: PlottedStop[] = [];
      ordered.forEach((item, idx) => {
        if (isValidCoordinate(item.lat, item.lng)) {
          const plotted: PlottedStop = {
            id: item.id,
            dayId: day.id,
            dayNumber: day.dayNumber,
            stopIndexInDay: idx + 1,
            title: item.title,
            lat: item.lat as number,
            lng: item.lng as number,
          };
          stopsOut.push(plotted);
          geoInDay.push(plotted);
        }
      });

      const itemById = new Map(ordered.map((it) => [it.id, it]));
      const dayColor = dayLookup.get(day.id)?.color ?? getDayColor(day.dayNumber);
      for (let i = 1; i < geoInDay.length; i++) {
        const prev = geoInDay[i - 1]!;
        const curr = geoInDay[i]!;
        const currItem = itemById.get(curr.id);
        const specialTransitLeg = buildTransitStopLeg(prev, curr, currItem?.transitMeta);
        const pairKey = `${prev.id}->${curr.id}`;
        const loaded = specialTransitLeg ?? routeLegsByPairKey[pairKey];
        if (loaded && loaded.coordinates.length >= 2) {
          segmentsOut.push({
            id: `seg-${day.id}-${prev.id}-${curr.id}`,
            dayId: day.id,
            dayNumber: day.dayNumber,
            fromStopId: prev.id,
            toStopId: curr.id,
            color: dayColor,
            coordinates: loaded.coordinates,
            solid: !specialTransitLeg && loaded.source === 'openrouteservice',
            distanceM: loaded.distanceM,
            durationS: loaded.durationS,
            label: loaded.label,
          });
        } else {
          const fb = buildStraightLineFallback(prev, curr);
          segmentsOut.push({
            id: `seg-${day.id}-${prev.id}-${curr.id}`,
            dayId: day.id,
            dayNumber: day.dayNumber,
            fromStopId: prev.id,
            toStopId: curr.id,
            color: dayColor,
            coordinates: fb.coordinates,
            solid: false,
            distanceM: fb.distanceM,
            durationS: fb.durationS,
            label: fb.label,
          });
        }
      }
    }

    return { plottedStops: stopsOut, routeSegments: segmentsOut };
  }, [activeDays, dayFilter, items, dayLookup, routeLegsByPairKey]);

  // Exclude candidates that are already scheduled on the trip
  const unscheduledCandidates = useMemo(() => {
    const existingRefs = new Set(
      items
        .filter((i) => !i.deletedAt && i.placeRefId)
        .map((i) => i.placeRefId as string)
    );
    const existingTitles = new Set(
      items
        .filter((i) => !i.deletedAt)
        .map((i) => i.title.trim().toLowerCase())
    );
    return candidates.filter(
      (c) =>
        !existingRefs.has(c.refId) &&
        !existingTitles.has(c.name.trim().toLowerCase())
    );
  }, [candidates, items]);

  const handleTriggerSearchArea = () => {
    const bboxToUse =
      pendingBbox ??
      computeBoundingBoxString(
        plottedStops.length > 0 ? plottedStops : unscheduledCandidates,
        0.09
      );
    if (!bboxToUse) return;
    onSearchArea(bboxToUse);
    setPendingBbox(null);
  };

  return (
    <section
      aria-label="Interactive trip route map"
      className={
        isFullscreen
          ? 'fixed inset-0 z-50 flex flex-col bg-[#FAF4E6] text-navy'
          : 'relative flex h-full min-h-[420px] w-full flex-col bg-[#FAF4E6] text-navy'
      }
    >
      {/* Top Map Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-navy/15 bg-[#FFFDF8] px-3 py-2">
        <div
          role="group"
          aria-label="Filter map pins by day"
          className="flex max-w-full items-center gap-1.5 overflow-x-auto py-0.5"
        >
          <button
            type="button"
            onClick={() => {
              setDayFilter('all');
              setFitSignal((n) => n + 1);
            }}
            aria-pressed={dayFilter === 'all'}
            className={`inline-flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-semibold transition-colors ${
              dayFilter === 'all'
                ? 'border-navy bg-navy text-[#FFFDF8]'
                : 'border-navy/25 bg-[#FFFDF8] text-navy hover:bg-paper'
            }`}
          >
            All days
          </button>

          {activeDays.map((day) => {
            const color = getDayColor(day.dayNumber);
            const active = dayFilter === day.id;
            return (
              <button
                key={day.id}
                type="button"
                onClick={() => {
                  setDayFilter(day.id);
                  setFitSignal((n) => n + 1);
                }}
                aria-pressed={active}
                className={`inline-flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] font-semibold transition-colors ${
                  active
                    ? 'border-navy bg-saffron text-navy'
                    : 'border-navy/25 bg-[#FFFDF8] text-navy hover:bg-paper'
                }`}
              >
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 rounded-full border border-white/80"
                  style={{ backgroundColor: color }}
                />
                <span>Day {day.dayNumber}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFitSignal((n) => n + 1)}
            className="inline-flex min-h-[34px] items-center gap-1.5 rounded-md border border-navy/25 bg-[#FFFDF8] px-2.5 py-1 text-[13px] font-semibold text-navy transition-colors hover:bg-paper"
          >
            <LocateFixed className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
            <span>Fit route</span>
          </button>

          <button
            type="button"
            onClick={() => setIsFullscreen((v) => !v)}
            aria-label={isFullscreen ? 'Exit fullscreen map' : 'Fullscreen map'}
            className="inline-flex min-h-[34px] items-center gap-1.5 rounded-md border border-navy/25 bg-[#FFFDF8] px-2.5 py-1 text-[13px] font-semibold text-navy transition-colors hover:bg-paper"
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
                <span>Exit</span>
              </>
            ) : (
              <>
                <Maximize2 className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
                <span className="hidden xl:inline">Fullscreen</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Map Stage */}
      <div className="relative flex-1 overflow-hidden">
        {/* Floating "Search this area" pill when user pans/zooms */}
        {pendingBbox && (
          <div className="pointer-events-none absolute inset-x-0 top-3 z-30 flex justify-center px-3">
            <button
              type="button"
              onClick={handleTriggerSearchArea}
              className="pointer-events-auto inline-flex min-h-[38px] items-center gap-1.5 rounded-full border-2 border-navy bg-[#FFFDF8] px-3.5 py-1.5 text-[13px] font-bold text-navy shadow-dialog transition-colors hover:bg-saffron"
            >
              <Search className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              <span>Search this area</span>
            </button>
          </div>
        )}

        <DynamicTripMapImpl
          stops={plottedStops}
          candidates={unscheduledCandidates}
          routeSegments={routeSegments}
          highlightedStopId={highlightedStopId}
          selectedCandidateId={selectedCandidate?.id ?? hoveredCandidateId ?? null}
          fitSignal={fitSignal}
          centerHint={centerHint}
          onSelectStop={(stopId) => {
            const match = items.find((i) => i.id === stopId);
            onSelectStop(stopId, match?.dayId ?? null);
          }}
          onHoverStop={onHoverStop}
          onSelectCandidate={(place) => setSelectedCandidate(place)}
          onViewportBboxChange={(bbox) => setPendingBbox(bbox)}
        />

        {/* Candidate Place Preview Card Overlay */}
        {selectedCandidate && (
          <div
            role="region"
            aria-label={`Selected place preview: ${selectedCandidate.name}`}
            className="absolute inset-x-3 bottom-8 z-30 mx-auto max-w-sm rounded-xl border-2 border-navy bg-[#FFFDF8] p-3.5 text-navy shadow-dialog"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                {selectedCandidate.image?.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedCandidate.image.url}
                    alt={selectedCandidate.name}
                    className="h-14 w-14 shrink-0 rounded-lg border border-navy/15 object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-navy/15 bg-paper text-navy">
                    <Compass className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
                  </div>
                )}

                <div className="min-w-0 space-y-1">
                  <h3 className="truncate text-[15px] font-bold leading-snug text-navy">
                    {selectedCandidate.name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-paper px-2 py-0.5 text-[11px] font-semibold text-navy">
                      {CATEGORY_LABELS[selectedCandidate.category] ?? selectedCandidate.category}
                    </span>
                    {selectedCandidate.popularity >= 0.65 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-saffron/35 px-2 py-0.5 text-[11px] font-bold text-navy">
                        <Sparkles className="h-3 w-3" strokeWidth={1.8} aria-hidden="true" />
                        Popular
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedCandidate(null)}
                aria-label="Close place preview"
                className="icon-hit inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-navy hover:bg-paper"
              >
                <X className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>

            {(selectedCandidate.whyVisit ||
              selectedCandidate.description ||
              selectedCandidate.address) && (
              <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-paper-ink">
                {selectedCandidate.whyVisit ||
                  selectedCandidate.description ||
                  selectedCandidate.address}
              </p>
            )}

            <div className="mt-3 flex items-center justify-between gap-2">
              {selectedCandidate.image?.license ? (
                <span className="truncate text-[11px] text-paper-ink">
                  Photo: {selectedCandidate.image.author || 'Wikimedia'} ({selectedCandidate.image.license})
                </span>
              ) : (
                <span className="text-[11px] text-paper-ink">OpenStreetMap · Wikidata</span>
              )}

              <button
                type="button"
                onClick={() => {
                  onAddCandidateToDay(selectedCandidate, targetDayForAdd?.id ?? null);
                  setSelectedCandidate(null);
                }}
                className="inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-lg border-2 border-navy bg-vermilion-deep px-3 py-1 text-[13px] font-bold text-[#FFFDF8] transition-colors hover:bg-[#A82E19]"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                <span>Add to Day {targetDayForAdd?.dayNumber ?? 1}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
