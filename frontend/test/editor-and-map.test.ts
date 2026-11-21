import { describe, expect, it } from 'vitest';
import { SAMPLE_WORKSPACES } from '../src/data/sample-trips';
import {
  DAY_PALETTE,
  buildDayColorLookup,
  getDayColor,
} from '../src/features/map/day-palette';
import {
  buildDayGoogleMapsUrl,
  buildRouteCacheKey,
  buildStraightLineFallback,
  computeBoundingBoxString,
  haversineKm,
  selectRouteProfile,
} from '../src/features/map/map-utils';
import {
  computeDayPacingWarning,
  getOrderedStopsForDay,
  mapPlaceCategoryToItemKind,
  moveStopByOffset,
  moveStopToDay,
  promoteShortlistItemToDay,
  reorderStopsInDay,
} from '../src/features/editor/editor-helpers';
import { inferTripDestinations } from '../src/features/editor/places-discovery';
import type { ItineraryItem } from '../src/lib/types';

function makeStop(overrides: Partial<ItineraryItem> & { id: string; title: string }): ItineraryItem {
  return {
    tripId: 'trip-1',
    dayId: 'day-1',
    kind: 'activity',
    notes: '',
    lat: null,
    lng: null,
    placeRefId: null,
    addressLocalScript: null,
    sortKey: 's0000',
    startTime: '10:00',
    durationMins: 60,
    transitMeta: {},
    dietaryFlags: [],
    accessibilityNotes: '',
    elderSummaryI18n: { en: overrides.title },
    isShortlist: false,
    serverSeq: 1,
    hlcTimestamp: '2026-11-21T00:00:00.000Z-0001-test',
    deletedAt: null,
    googleMapsUrl: null,
    ...overrides,
  };
}

describe('Trip Editor v2 & Map v2 Helpers', () => {
  describe('Day color palette', () => {
    it('cycles deterministically across the 7 high-contrast accessible colors', () => {
      expect(DAY_PALETTE).toEqual([
        '#C7361F',
        '#0E5A47',
        '#1D4ED8',
        '#9333EA',
        '#B45309',
        '#0F766E',
        '#BE185D',
      ]);
      expect(getDayColor(1)).toBe('#C7361F');
      expect(getDayColor(2)).toBe('#0E5A47');
      expect(getDayColor(7)).toBe('#BE185D');
      expect(getDayColor(8)).toBe('#C7361F');
      expect(getDayColor(0)).toBe('#C7361F');

      const lookup = buildDayColorLookup([
        { id: 'd1', dayNumber: 1 },
        { id: 'd3', dayNumber: 3 },
      ]);
      expect(lookup.get('d1')?.color).toBe('#C7361F');
      expect(lookup.get('d3')?.color).toBe('#1D4ED8');
    });
  });

  describe('Pacing warnings', () => {
    it('flags > 4h daily transit, > 6 standard stops, and > 4 stops in elder mode', () => {
      const calmStops = [
        makeStop({ id: 's1', title: 'Morning Ghat', durationMins: 60 }),
        makeStop({
          id: 's2',
          title: 'Lunch Café',
          transitMeta: { estimatedDurationMins: 25 },
        }),
      ];
      const calm = computeDayPacingWarning({
        stops: calmStops,
        elderModeEnabled: true,
      });
      expect(calm.hasWarning).toBe(false);
      expect(calm.totalTransitMins).toBe(25);

      // > 4h (240 mins) road/rail transit
      const heavyTransit = [
        makeStop({ id: 't1', title: 'Shatabdi Train', kind: 'transit', durationMins: 210 }),
        makeStop({ id: 'a1', title: 'Hill Transfer', lat: 30.1, lng: 78.2 }),
        makeStop({ id: 'a2', title: 'Landour Check-In', lat: 30.45, lng: 78.09 }),
      ];
      const routeMinutes = new Map([['a1->a2', 95]]);
      const heavyRes = computeDayPacingWarning({
        stops: heavyTransit,
        routeMinutesByPair: routeMinutes,
        elderModeEnabled: false,
      });
      expect(heavyRes.hasWarning).toBe(true);
      expect(heavyRes.totalTransitMins).toBe(305);
      expect(heavyRes.summaryLabel).toContain('5h 5m of travel');

      // 5 stops triggers warning in elder mode, passes in standard mode
      const fiveStops = Array.from({ length: 5 }, (_, idx) =>
        makeStop({ id: `e-${idx}`, title: `Stop ${idx + 1}`, sortKey: `s000${idx}` })
      );
      expect(
        computeDayPacingWarning({ stops: fiveStops, elderModeEnabled: true }).hasWarning
      ).toBe(true);
      expect(
        computeDayPacingWarning({ stops: fiveStops, elderModeEnabled: false }).hasWarning
      ).toBe(false);

      // 7 stops triggers warning even when elder mode is disabled
      const sevenStops = Array.from({ length: 7 }, (_, idx) =>
        makeStop({ id: `m-${idx}`, title: `Stop ${idx + 1}`, sortKey: `s000${idx}` })
      );
      expect(
        computeDayPacingWarning({ stops: sevenStops, elderModeEnabled: false }).hasWarning
      ).toBe(true);
    });
  });

  describe('Route cache key & haversine straight-line fallback', () => {
    it('chooses walking under 1.5 km, driving above 1.5 km, and builds stable keys & fallbacks', () => {
      const rokeby = { lat: 30.4569, lng: 78.0997 };
      const chaarDukan = { lat: 30.4601, lng: 78.0982 };
      const rishikesh = { lat: 30.1033, lng: 78.2948 };

      const shortKm = haversineKm(rokeby, chaarDukan);
      expect(shortKm).toBeGreaterThan(0.2);
      expect(shortKm).toBeLessThan(1.5);
      expect(selectRouteProfile(rokeby, chaarDukan)).toBe('foot-walking');

      const longKm = haversineKm(rishikesh, rokeby);
      expect(longKm).toBeGreaterThan(35);
      expect(selectRouteProfile(rishikesh, rokeby)).toBe('driving-car');

      const key1 = buildRouteCacheKey('driving-car', [rishikesh, rokeby]);
      const key2 = buildRouteCacheKey('driving-car', [
        { lat: 30.103304, lng: 78.294801 },
        { lat: 30.456902, lng: 78.099703 },
      ]);
      expect(key1).toBe(key2);

      const fallback = buildStraightLineFallback(rishikesh, rokeby);
      expect(fallback.source).toBe('fallback');
      expect(fallback.profile).toBe('driving-car');
      expect(fallback.coordinates).toEqual([
        [78.2948, 30.1033],
        [78.0997, 30.4569],
      ]);
      expect(fallback.label).toMatch(/^~\d+\.\d km straight-line$/);

      const bbox = computeBoundingBoxString([rishikesh, rokeby], 0.05);
      expect(bbox).not.toBeNull();
      const parts = bbox!.split(',').map(Number);
      expect(parts).toHaveLength(4);
      expect(parts[0]!).toBeLessThan(parts[2]!); // west < east
      expect(parts[1]!).toBeLessThan(parts[3]!); // south < north
    });
  });

  describe('Stop reordering, day-move, shortlist promotion & category mapping', () => {
    it('reorders stops within a day and moves stops across days cleanly', () => {
      const initial = [
        makeStop({ id: 'a', dayId: 'd1', title: 'Alpha', sortKey: 'a0' }),
        makeStop({ id: 'b', dayId: 'd1', title: 'Bravo', sortKey: 'a1' }),
        makeStop({ id: 'c', dayId: 'd1', title: 'Charlie', sortKey: 'a2' }),
        makeStop({ id: 'x', dayId: 'd2', title: 'Xray', sortKey: 'a0' }),
      ];

      const afterDrag = reorderStopsInDay(initial, 'd1', 2, 0, () => 'hlc-drag');
      expect(getOrderedStopsForDay(afterDrag, 'd1').map((s) => s.id)).toEqual([
        'c',
        'a',
        'b',
      ]);

      const afterOffset = moveStopByOffset(afterDrag, 'd1', 'a', 1, () => 'hlc-step');
      expect(getOrderedStopsForDay(afterOffset, 'd1').map((s) => s.id)).toEqual([
        'c',
        'b',
        'a',
      ]);

      const afterDayMove = moveStopToDay(afterOffset, 'b', 'd2', () => 'hlc-move');
      expect(getOrderedStopsForDay(afterDayMove, 'd1').map((s) => s.id)).toEqual([
        'c',
        'a',
      ]);
      expect(getOrderedStopsForDay(afterDayMove, 'd2').map((s) => s.id)).toEqual([
        'x',
        'b',
      ]);

      const sample = structuredClone(SAMPLE_WORKSPACES['rishi-lnd-4d']!);
      const shortlistId = sample.shortlist[0]!.id;
      const targetDayId = sample.days[1]!.id;
      const promotedWs = promoteShortlistItemToDay(
        sample,
        shortlistId,
        targetDayId,
        () => 'hlc-promote'
      );
      expect(promotedWs.shortlist).toHaveLength(0);
      expect(
        getOrderedStopsForDay(promotedWs.items, targetDayId).some(
          (i) => i.id === shortlistId
        )
      ).toBe(true);

      expect(mapPlaceCategoryToItemKind('stay')).toBe('stay');
      expect(mapPlaceCategoryToItemKind('food')).toBe('meal');
      expect(mapPlaceCategoryToItemKind('cafe')).toBe('meal');
      expect(mapPlaceCategoryToItemKind('transport')).toBe('transit');
      expect(mapPlaceCategoryToItemKind('sights')).toBe('activity');
      expect(mapPlaceCategoryToItemKind('spiritual')).toBe('activity');

      const dests = inferTripDestinations(sample.trip, sample.items);
      expect(dests.map((d) => d.slug)).toEqual(
        expect.arrayContaining(['rishikesh', 'landour', 'mussoorie'])
      );
    });
  });

  describe('Google Maps universal multi-stop URL builder', () => {
    it('handles empty, single-pin, and multi-stop waypoint routes', () => {
      expect(buildDayGoogleMapsUrl([{ lat: null, lng: null }])).toBeNull();

      const singleUrl = buildDayGoogleMapsUrl([
        { lat: 26.9239, lng: 75.8267, title: 'Hawa Mahal' },
      ]);
      expect(singleUrl).toBe(
        'https://www.google.com/maps/search/?api=1&query=26.923900,75.826700'
      );

      const multiUrl = buildDayGoogleMapsUrl([
        { lat: 29.9457, lng: 78.1642, title: 'Haridwar Jn' },
        { lat: 30.1033, lng: 78.2948, title: 'Triveni Ghat' },
        { lat: 30.4569, lng: 78.0997, title: 'Rokeby Manor' },
      ]);
      expect(multiUrl).not.toBeNull();
      const parsed = new URL(multiUrl!);
      expect(parsed.origin + parsed.pathname).toBe('https://www.google.com/maps/dir/');
      expect(parsed.searchParams.get('api')).toBe('1');
      expect(parsed.searchParams.get('origin')).toBe('29.945700,78.164200');
      expect(parsed.searchParams.get('destination')).toBe('30.456900,78.099700');
      expect(parsed.searchParams.get('waypoints')).toBe('30.103300,78.294800');
      expect(parsed.searchParams.get('travelmode')).toBe('driving');
    });
  });
});
