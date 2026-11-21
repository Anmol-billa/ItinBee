'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bookmark,
  Check,
  Compass,
  Globe,
  Info,
  MapPin,
  Plus,
  Search,
  Sparkles,
} from 'lucide-react';
import { formatDietaryTag, isNonEmptyImageUrl } from '@/lib/formatters';
import type { ItineraryItem, TripDay, TripMeta } from '@/lib/types';
import {
  computeCentroid,
  formatDistanceKm,
  haversineKm,
  isValidCoordinate,
  type CandidateMapPlace,
} from '@/features/map/map-utils';
import {
  DISCOVERY_CATEGORIES,
  fetchDestinationPlaces,
  fetchGeoAutocomplete,
  inferTripDestinations,
  type DestinationOption,
  type DiscoveredPlace,
  type DiscoveryCategory,
  type DiscoveryScope,
  type GeoAutocompleteSuggestion,
  type PackBuildStatus,
} from './places-discovery';

interface ExplorePlacesPanelProps {
  trip: Pick<TripMeta, 'id' | 'title' | 'destinationSummary'>;
  items: ItineraryItem[];
  shortlist: ItineraryItem[];
  activeDay: TripDay | null;
  mapSearchBbox: string | null;
  onAddPlaceToDay: (place: DiscoveredPlace, dayId: string | null) => void;
  onToggleShortlistPlace: (place: DiscoveredPlace) => void;
  onCandidatesLoaded: (
    candidates: CandidateMapPlace[],
    destinationCenter: { lat: number; lng: number } | null
  ) => void;
  onHoverCandidate?: (placeId: string | null) => void;
}

const CATEGORY_CHIP_LABELS: Record<string, string> = {
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

function slugifyDestinationName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function ExplorePlacesPanel({
  trip,
  items,
  shortlist,
  activeDay,
  mapSearchBbox,
  onAddPlaceToDay,
  onToggleShortlistPlace,
  onCandidatesLoaded,
  onHoverCandidate,
}: ExplorePlacesPanelProps) {
  const inferredDestinations = useMemo(
    () => inferTripDestinations(trip, items),
    [trip, items]
  );

  const [customDestinations, setCustomDestinations] = useState<DestinationOption[]>([]);
  const destinationOptions = useMemo(() => {
    const merged: DestinationOption[] = [];
    const seen = new Set<string>();
    for (const d of [...customDestinations, ...inferredDestinations]) {
      if (seen.has(d.slug)) continue;
      seen.add(d.slug);
      merged.push(d);
    }
    return merged;
  }, [customDestinations, inferredDestinations]);

  const [activeDestSlug, setActiveDestSlug] = useState<string>(
    () => inferredDestinations[0]?.slug ?? 'rishikesh'
  );
  const activeDestination = useMemo(
    () =>
      destinationOptions.find((d) => d.slug === activeDestSlug) ??
      destinationOptions[0] ?? { slug: 'rishikesh', name: 'Rishikesh' },
    [destinationOptions, activeDestSlug]
  );

  // Destination switcher autocomplete
  const [switcherQuery, setSwitcherQuery] = useState('');
  const [switcherResults, setSwitcherResults] = useState<GeoAutocompleteSuggestion[]>([]);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  // Discovery filters
  const [category, setCategory] = useState<DiscoveryCategory>('');
  const [scope, setScope] = useState<DiscoveryScope>('destination');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [worldwideMatches, setWorldwideMatches] = useState<GeoAutocompleteSuggestion[]>([]);

  // Loaded places state
  const [places, setPlaces] = useState<DiscoveredPlace[]>([]);
  const [packStatus, setPackStatus] = useState<PackBuildStatus>('ready');
  const [loading, setLoading] = useState<boolean>(true);
  const [attribution, setAttribution] = useState<string>(
    '© OpenStreetMap contributors · Wikivoyage · Wikidata · Wikimedia Commons'
  );
  const [openCreditId, setOpenCreditId] = useState<string | null>(null);
  const [brokenImageIds, setBrokenImageIds] = useState<Record<string, boolean>>({});
  const pollCountRef = useRef(0);

  // Switch scope to 'bbox' automatically whenever user clicks "Search this area" on TripMap
  useEffect(() => {
    if (mapSearchBbox) {
      setScope('bbox');
    }
  }, [mapSearchBbox]);

  // Keep activeDestSlug synced if trip changes completely and activeDestSlug is not in options
  useEffect(() => {
    if (!destinationOptions.some((d) => d.slug === activeDestSlug)) {
      setActiveDestSlug(destinationOptions[0]?.slug ?? 'rishikesh');
    }
  }, [destinationOptions, activeDestSlug]);

  // Centroid of active day's geo-located stops
  const activeDayCentroid = useMemo(() => {
    if (!activeDay) return null;
    const pts = items
      .filter(
        (i): i is ItineraryItem & { lat: number; lng: number } =>
          i.dayId === activeDay.id &&
          !i.deletedAt &&
          isValidCoordinate(i.lat, i.lng)
      )
      .map((i) => ({ lat: i.lat, lng: i.lng }));
    return computeCentroid(pts);
  }, [items, activeDay]);

  // Debounce place search input (>= 250ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchInput.trim());
    }, 280);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Worldwide autocomplete fallback when searching >= 2 chars
  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setWorldwideMatches([]);
      return;
    }
    const ctrl = new AbortController();
    fetchGeoAutocomplete(debouncedQuery, ctrl.signal)
      .then((res) => setWorldwideMatches(res.slice(0, 4)))
      .catch(() => setWorldwideMatches([]));
    return () => ctrl.abort();
  }, [debouncedQuery]);

  // Debounced destination switcher autocomplete (>= 250ms)
  useEffect(() => {
    const q = switcherQuery.trim();
    if (q.length < 2) {
      setSwitcherResults([]);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetchGeoAutocomplete(q, ctrl.signal)
        .then((res) => setSwitcherResults(res))
        .catch(() => setSwitcherResults([]));
    }, 280);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [switcherQuery]);

  // Fetch destination places + poll every 3s while status === 'building'
  useEffect(() => {
    const ctrl = new AbortController();
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    pollCountRef.current = 0;

    const nearParam =
      scope === 'near-day'
        ? activeDayCentroid
        : activeDestination.lat !== undefined && activeDestination.lng !== undefined && scope === 'destination'
          ? null
          : null;
    const bboxParam = scope === 'bbox' ? mapSearchBbox : null;

    const load = async (isPoll: boolean) => {
      if (!isPoll) setLoading(true);
      try {
        const result = await fetchDestinationPlaces({
          slug: activeDestination.slug,
          name: activeDestination.name,
          category,
          q: debouncedQuery,
          near: nearParam,
          bbox: bboxParam,
          limit: 24,
          signal: ctrl.signal,
        });
        if (ctrl.signal.aborted) return;

        setPlaces(result.places);
        setPackStatus(result.status);
        setAttribution(result.attribution);
        setLoading(false);

        const candidatesForMap: CandidateMapPlace[] = result.places.map((p) => ({
          id: p.id,
          refId: p.refId,
          name: p.name,
          category: p.category,
          lat: p.lat,
          lng: p.lng,
          popularity: p.popularity,
          description: p.description,
          whyVisit: p.whyVisit,
          address: p.address,
          typicalDurationMins: p.typicalDurationMins,
          dietaryHints: p.dietaryHints,
          image: p.image,
        }));
        const center =
          activeDestination.lat !== undefined && activeDestination.lng !== undefined
            ? { lat: activeDestination.lat, lng: activeDestination.lng }
            : result.places[0]
              ? { lat: result.places[0].lat, lng: result.places[0].lng }
              : null;
        onCandidatesLoaded(candidatesForMap, center);

        if (
          (result.status === 'building' || result.status === 'none' || result.status === 'stale') &&
          result.source !== 'offline' &&
          pollCountRef.current < 16
        ) {
          pollCountRef.current += 1;
          pollTimer = setTimeout(() => {
            void load(true);
          }, 3000);
        }
      } catch {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    };

    void load(false);

    return () => {
      ctrl.abort();
      if (pollTimer) clearTimeout(pollTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeDestination.slug,
    activeDestination.name,
    category,
    debouncedQuery,
    scope,
    activeDayCentroid?.lat,
    activeDayCentroid?.lng,
    mapSearchBbox,
  ]);

  const scheduledRefSet = useMemo(
    () =>
      new Set(
        items
          .filter((i) => !i.deletedAt && i.placeRefId)
          .map((i) => i.placeRefId as string)
      ),
    [items]
  );

  const shortlistedRefSet = useMemo(
    () =>
      new Set(
        shortlist
          .filter((s) => !s.deletedAt)
          .map((s) => s.placeRefId || s.title.toLowerCase())
      ),
    [shortlist]
  );

  const handleSelectSwitcherDestination = (item: GeoAutocompleteSuggestion) => {
    const slug = item.slug || slugifyDestinationName(item.name) || 'rishikesh';
    const nextOpt: DestinationOption = {
      slug,
      name: item.name,
      secondary: item.secondary,
      lat: item.lat,
      lng: item.lng,
    };
    setCustomDestinations((prev) => [
      nextOpt,
      ...prev.filter((d) => d.slug !== slug),
    ]);
    setActiveDestSlug(slug);
    setScope('destination');
    setSwitcherQuery('');
    setSwitcherResults([]);
    setSwitcherOpen(false);
  };

  const dayNumLabel = activeDay?.dayNumber ?? 1;

  return (
    <section
      aria-label="Explore open-data places"
      className="flex h-full flex-col bg-[#FAF4E6] text-navy"
    >
      {/* Top Destination Switcher + Search Header */}
      <div className="space-y-3 border-b border-navy/15 bg-[#FFFDF8] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="display text-[26px] leading-none text-navy">
            Explore {activeDestination.name}
          </h2>
          <button
            type="button"
            onClick={() => setSwitcherOpen((v) => !v)}
            aria-expanded={switcherOpen}
            className="inline-flex min-h-[34px] items-center gap-1.5 rounded-full border border-navy/30 bg-paper px-3 py-1 text-[13px] font-semibold text-navy transition-colors hover:bg-paper-dark"
          >
            <Globe className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
            <span>Switch city</span>
          </button>
        </div>

        {/* Trip Destination Quick Pills */}
        {destinationOptions.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {destinationOptions.map((dest) => {
              const selected = dest.slug === activeDestination.slug;
              return (
                <button
                  key={dest.slug}
                  type="button"
                  onClick={() => {
                    setActiveDestSlug(dest.slug);
                    if (scope === 'bbox') setScope('destination');
                  }}
                  aria-pressed={selected}
                  className={`inline-flex min-h-[32px] shrink-0 items-center rounded-full border px-3 py-0.5 text-[13px] font-semibold transition-colors ${
                    selected
                      ? 'border-navy bg-saffron text-navy'
                      : 'border-navy/25 bg-[#FFFDF8] text-navy hover:bg-paper'
                  }`}
                >
                  {dest.name}
                </button>
              );
            })}
          </div>
        )}

        {/* Worldwide Destination Typeahead Switcher */}
        {switcherOpen && (
          <div className="relative space-y-1.5">
            <label htmlFor="dest-switcher-input" className="sr-only">
              Switch destination city worldwide
            </label>
            <input
              id="dest-switcher-input"
              type="search"
              value={switcherQuery}
              onChange={(e) => setSwitcherQuery(e.target.value)}
              placeholder="Type any city (e.g. Jaipur, Mussoorie, Kyoto, Lisbon)…"
              className="field text-[14px]"
              autoFocus
            />
            {switcherResults.length > 0 && (
              <ul className="max-h-52 divide-y divide-navy/10 overflow-y-auto rounded-lg border border-navy/25 bg-[#FFFDF8] shadow-dialog">
                {switcherResults.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectSwitcherDestination(item)}
                      className="flex w-full items-center justify-between gap-2 whitespace-normal px-3 py-2.5 text-left text-[14px] text-navy hover:bg-paper"
                    >
                      <div>
                        <span className="font-semibold">{item.name}</span>
                        {item.secondary && (
                          <span className="ml-1.5 text-[12px] text-paper-ink">
                            · {item.secondary}
                          </span>
                        )}
                      </div>
                      <span className="rounded bg-paper px-2 py-0.5 text-[11px] font-semibold text-navy">
                        {item.kind}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Scope Selector: Destination | Near Day N | Map area */}
        <div
          role="group"
          aria-label="Place discovery scope"
          className="flex flex-wrap items-center gap-1.5"
        >
          <button
            type="button"
            onClick={() => setScope('destination')}
            aria-pressed={scope === 'destination'}
            className={`inline-flex min-h-[32px] items-center gap-1 rounded-md border px-2.5 py-1 text-[12.5px] font-semibold transition-colors ${
              scope === 'destination'
                ? 'border-navy bg-navy text-[#FFFDF8]'
                : 'border-navy/25 bg-[#FFFDF8] text-navy hover:bg-paper'
            }`}
          >
            Destination
          </button>

          <button
            type="button"
            disabled={!activeDayCentroid}
            onClick={() => setScope('near-day')}
            aria-pressed={scope === 'near-day'}
            title={
              activeDayCentroid
                ? `Sort and filter near Day ${dayNumLabel} stops`
                : `Add a pinned stop on Day ${dayNumLabel} first`
            }
            className={`inline-flex min-h-[32px] items-center gap-1 rounded-md border px-2.5 py-1 text-[12.5px] font-semibold transition-colors disabled:opacity-45 ${
              scope === 'near-day'
                ? 'border-navy bg-navy text-[#FFFDF8]'
                : 'border-navy/25 bg-[#FFFDF8] text-navy hover:bg-paper'
            }`}
          >
            <MapPin className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
            <span>Near Day {dayNumLabel}</span>
          </button>

          <button
            type="button"
            disabled={!mapSearchBbox}
            onClick={() => setScope('bbox')}
            aria-pressed={scope === 'bbox'}
            title={
              mapSearchBbox
                ? 'Filter places inside the panned map area'
                : 'Pan or zoom the map and click Search this area'
            }
            className={`inline-flex min-h-[32px] items-center gap-1 rounded-md border px-2.5 py-1 text-[12.5px] font-semibold transition-colors disabled:opacity-45 ${
              scope === 'bbox'
                ? 'border-navy bg-navy text-[#FFFDF8]'
                : 'border-navy/25 bg-[#FFFDF8] text-navy hover:bg-paper'
            }`}
          >
            Map area
          </button>
        </div>

        {/* Debounced Search Input */}
        <div className="relative">
          <label htmlFor="places-panel-search" className="sr-only">
            Filter places in {activeDestination.name} or search worldwide
          </label>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-ink"
            strokeWidth={1.8}
            aria-hidden="true"
          />
          <input
            id="places-panel-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={`Search sights, food, stays in ${activeDestination.name}…`}
            className="field pl-9 text-[14px]"
          />
        </div>

        {/* Category Filter Pills */}
        <div
          role="group"
          aria-label="Filter places by category"
          className="flex items-center gap-1.5 overflow-x-auto pb-0.5"
        >
          {DISCOVERY_CATEGORIES.map((cat) => {
            const selected = category === cat.id;
            return (
              <button
                key={cat.id || 'all'}
                type="button"
                onClick={() => setCategory(cat.id)}
                aria-pressed={selected}
                className={`inline-flex min-h-[34px] shrink-0 items-center rounded-full border px-3 py-1 text-[13px] font-semibold transition-colors ${
                  selected
                    ? 'border-navy bg-navy text-[#FFFDF8]'
                    : 'border-navy/25 bg-[#FFFDF8] text-navy hover:bg-paper'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Building Pack Live Status Banner */}
      {packStatus === 'building' && (
        <div
          role="status"
          className="flex items-center gap-2.5 border-b border-navy/15 bg-paper px-4 py-2.5 text-[13px] font-semibold text-navy"
        >
          <span className="spinner shrink-0 text-trunk" aria-hidden="true" />
          <span>
            Fetching open-data places for {activeDestination.name}… Showing live results meanwhile.
          </span>
        </div>
      )}

      {/* Results List */}
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {loading && places.length === 0 ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading places">
            {[0, 1, 2, 3].map((idx) => (
              <div
                key={idx}
                className="h-28 rounded-xl border border-navy/15 bg-[#FFFDF8] p-3.5 opacity-70"
              >
                <div className="h-4 w-2/3 rounded bg-paper" />
                <div className="mt-2.5 h-3 w-1/2 rounded bg-paper" />
                <div className="mt-3 h-3 w-5/6 rounded bg-paper" />
              </div>
            ))}
          </div>
        ) : places.length === 0 ? (
          <div className="space-y-3 rounded-xl border border-dashed border-navy/30 bg-[#FFFDF8] p-5 text-center">
            <p className="text-[15px] font-semibold text-navy">
              No matching places in {activeDestination.name}
            </p>
            <p className="text-[13.5px] text-paper-ink">
              Try clearing the category filter or switching to another destination above.
            </p>

            {worldwideMatches.length > 0 && (
              <div className="pt-2 text-left">
                <p className="mb-1.5 text-[12.5px] font-semibold text-navy">
                  Worldwide matches for &ldquo;{debouncedQuery}&rdquo;:
                </p>
                <ul className="divide-y divide-navy/10 border-t border-navy/15">
                  {worldwideMatches.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-[13.5px] font-semibold text-navy">
                          {m.name}
                        </div>
                        <div className="truncate text-[12px] text-paper-ink">
                          {m.secondary}
                        </div>
                      </div>
                      {m.kind === 'place' ? (
                        <button
                          type="button"
                          onClick={() =>
                            onAddPlaceToDay(
                              {
                                id: m.id,
                                refId: m.id,
                                name: m.name,
                                nameLocal: {},
                                category: 'sights',
                                subtype: null,
                                lat: m.lat,
                                lng: m.lng,
                                address: m.secondary,
                                website: null,
                                openingHours: null,
                                description: m.secondary,
                                whyVisit: null,
                                typicalDurationMins: 60,
                                bestTime: null,
                                dietaryHints: [],
                                image: null,
                                popularity: 0.7,
                                distanceM: null,
                                origin: 'live',
                                wikipediaUrl: null,
                                wikidataId: null,
                              },
                              activeDay?.id ?? null
                            )
                          }
                          className="inline-flex min-h-[34px] shrink-0 items-center gap-1 rounded-md border border-navy bg-navy px-2.5 py-1 text-[12.5px] font-semibold text-[#FFFDF8]"
                        >
                          <Plus className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden="true" />
                          Day {dayNumLabel}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSelectSwitcherDestination(m)}
                          className="inline-flex min-h-[34px] shrink-0 items-center rounded-md border border-navy/30 bg-paper px-2.5 py-1 text-[12.5px] font-semibold text-navy"
                        >
                          Explore city
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <ul className="space-y-3">
            {places.map((place) => {
              const isAdded = scheduledRefSet.has(place.refId);
              const isShortlisted =
                shortlistedRefSet.has(place.refId) ||
                shortlistedRefSet.has(place.name.toLowerCase());
              const distanceM =
                place.distanceM ??
                (activeDayCentroid && isValidCoordinate(place.lat, place.lng)
                  ? Math.round(
                      haversineKm(activeDayCentroid, {
                        lat: place.lat,
                        lng: place.lng,
                      }) * 1000
                    )
                  : null);
              const summaryText = place.whyVisit || place.description || place.address;
              const creditOpen = openCreditId === place.id;

              return (
                <li
                  key={place.id}
                  onMouseEnter={() => onHoverCandidate?.(place.id)}
                  onMouseLeave={() => onHoverCandidate?.(null)}
                  className="rounded-xl border border-navy/20 bg-[#FFFDF8] p-3.5 shadow-panel transition-colors hover:border-navy/45"
                >
                  <div className="flex items-start gap-3">
                    {/* Thumbnail with license info button & broken URL fallback */}
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-navy/15 bg-paper">
                      {isNonEmptyImageUrl(place.image?.url) && !brokenImageIds[place.id] ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={place.image!.url.trim()}
                            alt={place.name}
                            loading="lazy"
                            onError={() =>
                              setBrokenImageIds((prev) => ({ ...prev, [place.id]: true }))
                            }
                            className="h-full w-full object-cover"
                          />
                          {(place.image?.author || place.image?.license) && (
                            <button
                              type="button"
                              onClick={() =>
                                setOpenCreditId((curr) =>
                                  curr === place.id ? null : place.id
                                )
                              }
                              aria-label={`Photo credit for ${place.name}`}
                              aria-expanded={creditOpen}
                              className="icon-hit absolute bottom-1 right-1 inline-grid h-5 w-5 place-items-center rounded-full bg-navy/85 text-[#FFFDF8]"
                            >
                              <Info className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                            </button>
                          )}
                        </>
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-navy/70">
                          <Compass className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-paper px-2 py-0.5 text-[11.5px] font-semibold text-navy">
                          {CATEGORY_CHIP_LABELS[place.category] ?? place.category}
                        </span>

                        {place.popularity >= 0.65 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-saffron/35 px-2 py-0.5 text-[11.5px] font-bold text-navy">
                            <Sparkles
                              className="h-3 w-3"
                              strokeWidth={1.8}
                              aria-hidden="true"
                            />
                            Popular
                          </span>
                        )}

                        {distanceM !== null && activeDay && (
                          <span className="font-mono text-[11.5px] tabular-nums text-paper-ink">
                            {formatDistanceKm(distanceM)} from Day {dayNumLabel}
                          </span>
                        )}
                      </div>

                      <h3 className="text-[15px] font-bold leading-snug text-navy">
                        {place.name}
                      </h3>

                      {summaryText && (
                        <p className="line-clamp-2 text-[13.5px] leading-relaxed text-paper-ink">
                          {summaryText}
                        </p>
                      )}
                    </div>
                  </div>

                  {creditOpen && place.image && (
                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-navy/10 pt-2 text-[11.5px] text-paper-ink">
                      <span>
                        Photo: {place.image.author || 'Wikimedia Commons'}
                        {place.image.license ? ` · ${place.image.license}` : ''}
                      </span>
                      {place.image.sourceUrl && (
                        <a
                          href={place.image.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-navy underline"
                        >
                          Source
                        </a>
                      )}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-navy/10 pt-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {place.typicalDurationMins && (
                        <span className="font-mono text-[11.5px] tabular-nums text-paper-ink">
                          ~{place.typicalDurationMins} min
                        </span>
                      )}
                      {place.dietaryHints.slice(0, 2).map((hint) => (
                        <span
                          key={hint}
                          className="rounded bg-jade-wash px-1.5 py-0.5 text-[11px] font-semibold text-jade"
                        >
                          {formatDietaryTag(hint)}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onToggleShortlistPlace(place)}
                        aria-pressed={isShortlisted}
                        aria-label={
                          isShortlisted
                            ? `Remove ${place.name} from shortlist`
                            : `Save ${place.name} to shortlist`
                        }
                        className={`inline-flex min-h-[36px] items-center gap-1 rounded-lg border px-2.5 py-1 text-[12.5px] font-semibold transition-colors ${
                          isShortlisted
                            ? 'border-navy bg-paper text-navy'
                            : 'border-navy/25 bg-[#FFFDF8] text-navy hover:bg-paper'
                        }`}
                      >
                        <Bookmark
                          className="h-3.5 w-3.5"
                          strokeWidth={1.8}
                          fill={isShortlisted ? 'currentColor' : 'none'}
                          aria-hidden="true"
                        />
                        <span>{isShortlisted ? 'Saved' : 'Shortlist'}</span>
                      </button>

                      <button
                        type="button"
                        data-testid="add-place-to-day"
                        disabled={isAdded}
                        onClick={() => onAddPlaceToDay(place, activeDay?.id ?? null)}
                        className={`inline-flex min-h-[36px] items-center gap-1 rounded-lg border-2 px-3 py-1 text-[13px] font-bold transition-colors ${
                          isAdded
                            ? 'border-trunk/40 bg-jade-wash text-trunk'
                            : 'border-navy bg-vermilion-deep text-[#FFFDF8] hover:bg-[#A82E19]'
                        }`}
                      >
                        {isAdded ? (
                          <>
                            <Check className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                            <span>Added</span>
                          </>
                        ) : (
                          <>
                            <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                            <span>+ Day {dayNumLabel}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Open-data provenance footer */}
      <div className="border-t border-navy/15 bg-[#FFFDF8] px-4 py-2 text-[11px] leading-snug text-paper-ink">
        {attribution}
      </div>
    </section>
  );
}
