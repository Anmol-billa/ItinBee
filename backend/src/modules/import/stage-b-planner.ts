import { z } from 'zod';
import { CURATED_OPEN_POIS } from '../geo/curated-india-pois.js';
import { getTemplatePoiCatalog } from '../explore/template-catalog.js';
import type { PlacesServices } from '../places/places-module.js';
import { estimateLegTransit } from '../places/providers/openrouteservice.js';
import { STARTER_OPEN_POIS } from '../places/seed/starter-pois.js';
import type { PlaceCategory } from '../places/types.js';
import { haversineMeters } from '../places/util/geo.js';
import {
  namesSimilar,
  normalizeName,
  sliceAtWordBoundary,
  toTitleCasePlaceName,
} from '../places/util/text.js';
import type {
  ItemKind,
  PacingLevel,
  TransitMeta,
} from '../../types/domain.js';
import { toGeminiSchema } from './gemini-schema.js';
import { groundIntent } from './grounding.js';
import type { BookingAnchor, IntentDestination, TripIntent } from './intent.js';
import type { LlmProvider } from './llm/types.js';

export interface CandidatePlace {
  placeRefId: string;
  title: string;
  kind: ItemKind;
  category: string;
  lat: number;
  lng: number;
  durationMins: number;
  notes: string;
  dietaryFlags: string[];
  accessibilityNotes: string;
  popularity: number;
  mustInclude: boolean;
}

export interface PlannedStop {
  kind: ItemKind;
  title: string;
  notes: string;
  lat: number | null;
  lng: number | null;
  placeRefId: string | null;
  startTime: string;
  durationMins: number;
  dietaryFlags: string[];
  accessibilityNotes: string;
  elderSummaryI18n?: { en?: string; hi?: string };
  transitMeta: TransitMeta;
  bookingAnchorIndex?: number;
}

export interface PlannedDay {
  dayNumber: number;
  date: string | null;
  title: string;
  pacingLevel: PacingLevel;
  stops: PlannedStop[];
}

export interface DayStreamEvent {
  dayNumber: number;
  title: string;
  items: Array<{
    title: string;
    kind: ItemKind;
    lat?: number;
    lng?: number;
    startTime?: string;
    placeRefId?: string;
  }>;
}

export interface StageBResult {
  mode: 'ai' | 'basic';
  intent: TripIntent;
  days: PlannedDay[];
  candidateRefIds: Set<string>;
  repairs: number;
}

const BaseModelStageBSchema = z.object({
  days: z
    .array(
      z.object({
        dayNumber: z.number().int().min(1).max(30),
        title: z.string().max(120),
        stops: z
          .array(
            z.object({
              placeRefId: z
                .string()
                .max(160)
                .describe('Exact placeRefId from CANDIDATE_PLACES.'),
              startTime: z
                .string()
                .max(8)
                .nullable()
                .describe('24h HH:MM such as "09:30".'),
              durationMins: z.number().int().min(15).max(480).nullable(),
              notes: z.string().max(260).nullable(),
            })
          )
          .max(8),
      })
    )
    .max(30),
});

const modelStageBGeminiSchema = toGeminiSchema(BaseModelStageBSchema);

const STAGE_B_SYSTEM_PROMPT = [
  'You are Itinbee Stage-B Grounded Day Planner.',
  'HARD RULES:',
  '1. You may ONLY select stops from the provided CANDIDATE_PLACES list using their exact `placeRefId`. NEVER invent a placeRefId.',
  '2. Group geographically close places on the same day so daily transit stays low.',
  '3. Include at least one meal/cafe stop per day when food/cafe candidates are available.',
  '4. Respect pace (`relaxed`: 3 stops/day, `moderate`: 4 stops/day, `packed`: 5 stops/day) and reduce density if seniors or young children are travelling.',
  '5. Leave arrival buffer on Day 1 morning and departure buffer on the final afternoon.',
].join('\n');

function categoryToItemKind(cat: PlaceCategory | string): ItemKind {
  if (cat === 'food' || cat === 'cafe' || cat === 'cafe_meal') return 'meal';
  if (cat === 'stay') return 'stay';
  if (cat === 'transport' || cat === 'transit_hub') return 'transit';
  return 'activity';
}

function slugKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatHHMM(totalMinutes: number): string {
  const clamped = Math.max(6 * 60, Math.min(22 * 60 + 30, Math.round(totalMinutes / 15) * 15));
  const hh = Math.floor(clamped / 60);
  const mm = clamped % 60;
  return `${pad2(hh)}:${pad2(mm)}`;
}

function parseHHMM(hhmm: string | null | undefined, fallbackMins: number): number {
  if (!hhmm) return fallbackMins;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return fallbackMins;
  return Number(m[1]) * 60 + Number(m[2]);
}

function addDaysIso(startIso: string, addDays: number): string | null {
  const d = new Date(`${startIso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + addDays);
  return d.toISOString().slice(0, 10);
}

/** Incorporates user answers to clarifyingQuestions into the TripIntent before planning. */
export function applyClarifyingAnswers(
  intent: TripIntent,
  answers?: Record<string, string>
): TripIntent {
  if (!answers || Object.keys(answers).length === 0) return intent;
  const next: TripIntent = structuredClone(intent);

  for (const [qId, rawVal] of Object.entries(answers)) {
    const val = rawVal.trim();
    if (!val) continue;
    const key = qId.toLowerCase();

    if (key.includes('when') || key.includes('date') || key.includes('length') || key.includes('day')) {
      const dm = /(\d{1,2})\s*(?:-\s*(\d{1,2}))?\s*day/i.exec(val);
      if (dm && !next.dates.lengthDays) {
        next.dates.lengthDays = Math.min(30, Number(dm[2] ?? dm[1]));
      }
      if (/winter|dec|jan/i.test(val) && !next.dates.flexibleMonth) {
        next.dates.flexibleMonth = 12;
      } else if (/summer|may|jun/i.test(val) && !next.dates.flexibleMonth) {
        next.dates.flexibleMonth = 5;
      }
    }

    if (key.includes('who') || key.includes('group') || key.includes('traveller')) {
      if (/solo|just me/i.test(val)) {
        next.travellers.group = 'solo';
        next.travellers.count ??= 1;
      } else if (/couple|partner|honeymoon/i.test(val)) {
        next.travellers.group = 'couple';
        next.travellers.count ??= 2;
      } else if (/family/i.test(val)) {
        next.travellers.group = 'family';
        next.travellers.count ??= 4;
        if (/kid|child/i.test(val)) next.travellers.hasChildren = true;
      } else if (/senior|parent|elder/i.test(val)) {
        next.travellers.group = 'seniors';
        next.travellers.hasSeniors = true;
      } else if (/friend/i.test(val)) {
        next.travellers.group = 'friends';
        next.travellers.count ??= 4;
      }
    }

    if (key.includes('pace')) {
      if (/relax|slow/i.test(val)) next.pace = 'relaxed';
      else if (/pack|fast/i.test(val)) next.pace = 'packed';
      else if (/moderate/i.test(val)) next.pace = 'moderate';
    }
  }

  return next;
}

function resolveTotalDays(intent: TripIntent): number {
  if (intent.dates.start && intent.dates.end) {
    const a = Date.parse(`${intent.dates.start}T00:00:00Z`);
    const b = Date.parse(`${intent.dates.end}T00:00:00Z`);
    if (!Number.isNaN(a) && !Number.isNaN(b) && b >= a) {
      return Math.min(30, Math.max(1, Math.round((b - a) / 86_400_000) + 1));
    }
  }
  if (intent.dates.lengthDays) {
    return Math.min(30, Math.max(1, intent.dates.lengthDays));
  }
  const nightsSum = intent.destinations.reduce((acc, d) => acc + (d.nights ?? 0), 0);
  if (nightsSum > 0) {
    return Math.min(30, Math.max(1, nightsSum + 1));
  }
  return Math.min(14, Math.max(3, intent.destinations.length * 2 + 1));
}

function allocateDaysToDestinations(
  destinations: IntentDestination[],
  totalDays: number
): IntentDestination[] {
  const sorted = [...destinations].sort((a, b) => a.order - b.order);
  const resolved = sorted.filter((d) => d.resolved);
  const pool = resolved.length > 0 ? resolved : sorted;
  if (pool.length === 0) return [];

  const weights = pool.map((d) => (d.nights && d.nights > 0 ? d.nights : 1));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const counts = weights.map((w) => Math.max(1, Math.round((w / weightSum) * totalDays)));

  // Adjust counts so sum === totalDays
  let curSum = counts.reduce((a, b) => a + b, 0);
  while (curSum > totalDays) {
    const maxIdx = counts.indexOf(Math.max(...counts));
    if (counts[maxIdx]! > 1) {
      counts[maxIdx]! -= 1;
      curSum -= 1;
    } else {
      break;
    }
  }
  let idx = 0;
  while (curSum < totalDays) {
    counts[idx % counts.length]! += 1;
    curSum += 1;
    idx += 1;
  }

  const dayAssignment: IntentDestination[] = [];
  pool.forEach((dest, i) => {
    const n = counts[i] ?? 1;
    for (let k = 0; k < n && dayAssignment.length < totalDays; k += 1) {
      dayAssignment.push(dest);
    }
  });
  while (dayAssignment.length < totalDays) {
    dayAssignment.push(pool[pool.length - 1]!);
  }
  return dayAssignment;
}

export async function buildCandidatePoolForDestination(
  dest: IntentDestination,
  intent: TripIntent,
  places: PlacesServices,
  minNeeded = 16
): Promise<CandidatePlace[]> {
  const MAX_DEST_RADIUS_M = 45_000;
  const byRef = new Map<string, CandidatePlace>();
  const seenNames: string[] = [];
  const avoidLower = intent.avoid.map((a) => a.toLowerCase());
  const wantsVeg = intent.diet.some((d) => /veg|jain|satvik/i.test(d));
  const destTitle = toTitleCasePlaceName(dest.name);

  const withinDestRadius = (lat: number, lng: number): boolean => {
    if (dest.lat === undefined || dest.lng === undefined) return true;
    return (
      haversineMeters({ lat: dest.lat, lng: dest.lng }, { lat, lng }) <=
      MAX_DEST_RADIUS_M
    );
  };

  const isAvoided = (title: string, cat: string): boolean =>
    avoidLower.some(
      (av) =>
        av.length >= 3 &&
        (title.toLowerCase().includes(av) || cat.toLowerCase().includes(av))
    );

  const addCandidate = (cand: CandidatePlace): void => {
    if (!withinDestRadius(cand.lat, cand.lng)) return;
    if (byRef.has(cand.placeRefId)) return;
    if (!cand.mustInclude && isAvoided(cand.title, cand.category)) return;
    const dupName = seenNames.some((n) => namesSimilar(n, cand.title));
    if (dupName && !cand.mustInclude) return;
    seenNames.push(cand.title);
    byRef.set(cand.placeRefId, {
      ...cand,
      title: toTitleCasePlaceName(cand.title),
    });
  };

  // 1. MustInclude resolved places within <= 45 km of this destination first
  for (const m of intent.mustInclude) {
    if (!m.resolved || !m.placeRefId || m.lat === undefined || m.lng === undefined) {
      continue;
    }
    if (!withinDestRadius(m.lat, m.lng)) {
      continue;
    }
    const cleanQuote = m.sourceQuote ? sliceAtWordBoundary(m.sourceQuote, 90) : '';
    addCandidate({
      placeRefId: m.placeRefId,
      title: m.name,
      kind: 'activity',
      category: 'sights',
      lat: m.lat,
      lng: m.lng,
      durationMins: 90,
      notes: cleanQuote
        ? `Requested in your notes ("${cleanQuote}").`
        : 'Requested in your notes.',
      dietaryFlags: wantsVeg ? ['veg_friendly'] : [],
      accessibilityNotes: '',
      popularity: 1.5,
      mustInclude: true,
    });
  }

  // 2. Stored Destination Pack & seeded places from PlacesRepository (filtered to destinationSlug & <= 45 km)
  if (dest.destinationSlug) {
    const destRec = await places.repo.getDestinationBySlug(dest.destinationSlug);
    if (destRec) {
      const targetDestIds =
        destRec.kind === 'city' || destRec.kind === 'area'
          ? [destRec.id]
          : (await places.places.subtreeIds(destRec)).ids;
      const stored = await places.repo.queryPlaces({
        destinationIds: targetDestIds,
        limit: 80,
        offset: 0,
      });
      for (const { place } of stored.rows) {
        if (place.category === 'transport' || place.category === 'stay') continue;
        if (!withinDestRadius(place.lat, place.lng)) continue;
        addCandidate({
          placeRefId: place.refId,
          title: place.name,
          kind: categoryToItemKind(place.category),
          category: place.category,
          lat: place.lat,
          lng: place.lng,
          durationMins:
            place.typicalDurationMins ??
            (place.category === 'food' || place.category === 'cafe' ? 60 : 90),
          notes:
            place.whyVisit ??
            place.description ??
            (place.openingHours ? `Hours: ${place.openingHours}` : ''),
          dietaryFlags:
            place.dietaryHints.length > 0
              ? place.dietaryHints
              : wantsVeg && (place.category === 'food' || place.category === 'cafe')
                ? ['veg_friendly']
                : [],
          accessibilityNotes: '',
          popularity: 0.6 + place.popularity * 0.4,
          mustInclude: false,
        });
      }
    }
  }

  // 2b. Starter Open POIs (strictly matching destinationSlug or <= 45 km)
  for (const sp of STARTER_OPEN_POIS) {
    if (dest.destinationSlug && dest.destinationSlug !== 'india') {
      if (sp.destinationSlug !== dest.destinationSlug && !withinDestRadius(sp.lat, sp.lng)) {
        continue;
      }
    }
    if (!withinDestRadius(sp.lat, sp.lng)) continue;
    addCandidate({
      placeRefId: sp.refId,
      title: sp.name,
      kind: categoryToItemKind(sp.category),
      category: sp.category,
      lat: sp.lat,
      lng: sp.lng,
      durationMins: sp.typicalDurationMins,
      notes: sp.whyVisit || sp.description,
      dietaryFlags:
        sp.dietaryHints.length > 0
          ? sp.dietaryHints
          : wantsVeg && (sp.category === 'food' || sp.category === 'cafe')
            ? ['veg_friendly']
            : [],
      accessibilityNotes: '',
      popularity: sp.popularity,
      mustInclude: false,
    });
  }

  // 3. Curated India & Vietnam Open POIs (strictly <= 45 km)
  for (const cp of CURATED_OPEN_POIS) {
    if (cp.category === 'transit_hub') continue;
    if (!withinDestRadius(cp.lat, cp.lng)) continue;
    if (
      dest.lat === undefined &&
      normalizeName(cp.city) !== normalizeName(dest.name)
    ) {
      continue;
    }

    addCandidate({
      placeRefId: cp.placeRefId,
      title: cp.name,
      kind: categoryToItemKind(cp.category),
      category: cp.category,
      lat: cp.lat,
      lng: cp.lng,
      durationMins: cp.category === 'cafe_meal' ? 60 : 90,
      notes: cp.accessibilityNotes || cp.address,
      dietaryFlags: cp.dietaryHints,
      accessibilityNotes: cp.accessibilityNotes,
      popularity: 0.92,
      mustInclude: false,
    });
  }

  // 4. Verified Curated Template POI Catalog (strictly <= 45 km so neighboring cities never leak!)
  for (const tp of getTemplatePoiCatalog()) {
    if (!withinDestRadius(tp.lat, tp.lng)) continue;
    if (dest.lat === undefined) {
      const matchSlug =
        dest.destinationSlug !== undefined &&
        dest.destinationSlug !== 'india' &&
        tp.destinationSlugs.includes(dest.destinationSlug);
      if (!matchSlug) continue;
    }

    addCandidate({
      placeRefId: tp.placeRefId,
      title: tp.title,
      kind: tp.kind,
      category: tp.kind === 'meal' ? 'food' : tp.kind === 'stay' ? 'stay' : 'sights',
      lat: tp.lat,
      lng: tp.lng,
      durationMins: tp.durationMins,
      notes: tp.notes,
      dietaryFlags:
        wantsVeg && tp.kind === 'meal' ? ['veg_friendly'] : [],
      accessibilityNotes: '',
      popularity: 0.85,
      mustInclude: false,
    });
  }

  // 5. Optional live Wikipedia geosearch fallback (non-test only, short timeout)
  if (
    byRef.size < minNeeded &&
    places.nodeEnv !== 'test' &&
    dest.destinationSlug
  ) {
    const destRec = await places.repo.getDestinationBySlug(dest.destinationSlug);
    if (destRec) {
      const live = await Promise.race([
        places.places.liveNearby(destRec, 25),
        new Promise<never[]>((r) => setTimeout(() => r([]), 2000)),
      ]).catch(() => []);
      for (const lp of live) {
        if (!withinDestRadius(lp.lat, lp.lng)) continue;
        addCandidate({
          placeRefId: lp.id,
          title: lp.name,
          kind: categoryToItemKind(lp.category),
          category: lp.category,
          lat: lp.lat,
          lng: lp.lng,
          durationMins: lp.category === 'food' || lp.category === 'cafe' ? 60 : 90,
          notes: lp.description ?? '',
          dietaryFlags: [],
          accessibilityNotes: '',
          popularity: 0.7,
          mustInclude: false,
        });
      }
    }
  }

  // 6. Grounded destination-centroid orientation stops when a smaller town has sparse POIs
  if (byRef.size < minNeeded && dest.lat !== undefined && dest.lng !== undefined) {
    const baseRef = dest.destinationSlug
      ? `dest:${dest.destinationSlug}`
      : `dest:${slugKey(destTitle)}`;
    const archetypes: Array<{
      suffix: string;
      kind: ItemKind;
      cat: string;
      title: string;
      dLat: number;
      dLng: number;
      dur: number;
      notes: string;
    }> = [
      {
        suffix: 'heritage-walk',
        kind: 'activity',
        cat: 'sights',
        title: `${destTitle} Old Quarter & Heritage Walk`,
        dLat: 0.002,
        dLng: 0.002,
        dur: 90,
        notes: `Morning orientation walk through historic ${destTitle}.`,
      },
      {
        suffix: 'local-kitchen',
        kind: 'meal',
        cat: 'food',
        title: `${destTitle} Regional Kitchen & Lunch`,
        dLat: -0.002,
        dLng: 0.003,
        dur: 60,
        notes: wantsVeg
          ? `Pure-vegetarian regional lunch in ${destTitle}.`
          : `Traditional local lunch in central ${destTitle}.`,
      },
      {
        suffix: 'scenic-viewpoint',
        kind: 'activity',
        cat: 'nature',
        title: `${destTitle} Promenade & Sunset Viewpoint`,
        dLat: 0.004,
        dLng: -0.003,
        dur: 75,
        notes: `Golden-hour viewpoint overlooking ${destTitle}.`,
      },
      {
        suffix: 'craft-bazaar',
        kind: 'activity',
        cat: 'culture',
        title: `${destTitle} Craft Bazaar & Evening Market`,
        dLat: -0.003,
        dLng: -0.002,
        dur: 75,
        notes: `Handloom, spice, and local craft market stroll in ${destTitle}.`,
      },
      {
        suffix: 'morning-cafe',
        kind: 'meal',
        cat: 'cafe',
        title: `${destTitle} Morning Bakery & Tea House`,
        dLat: 0.001,
        dLng: -0.004,
        dur: 50,
        notes: `Slow morning coffee, tea, and fresh breakfast.`,
      },
      {
        suffix: 'cultural-centre',
        kind: 'activity',
        cat: 'culture',
        title: `${destTitle} Cultural Museum & Gardens`,
        dLat: -0.004,
        dLng: 0.001,
        dur: 90,
        notes: `Local history galleries and shaded courtyard gardens.`,
      },
      {
        suffix: 'botanical-park',
        kind: 'activity',
        cat: 'nature',
        title: `${destTitle} Botanical Park & Lakeside Trail`,
        dLat: 0.005,
        dLng: 0.004,
        dur: 80,
        notes: `Peaceful morning nature walk around ${destTitle}.`,
      },
      {
        suffix: 'courtyard-supper',
        kind: 'meal',
        cat: 'food',
        title: `${destTitle} Courtyard Dining Room`,
        dLat: -0.001,
        dLng: 0.005,
        dur: 70,
        notes: wantsVeg
          ? `Vegetarian evening dining in ${destTitle}.`
          : `Seasonal regional dinner in ${destTitle}.`,
      },
      {
        suffix: 'artisan-quarter',
        kind: 'activity',
        cat: 'culture',
        title: `${destTitle} Artisan Weaving & Pottery Quarter`,
        dLat: 0.003,
        dLng: 0.005,
        dur: 75,
        notes: `Meet local craftspeople and browse traditional workshops.`,
      },
      {
        suffix: 'historic-shrine',
        kind: 'activity',
        cat: 'spiritual',
        title: `${destTitle} Historic Temple & Courtyard`,
        dLat: -0.005,
        dLng: -0.003,
        dur: 60,
        notes: `Quiet architectural and spiritual landmark visit.`,
      },
      {
        suffix: 'ridge-lookout',
        kind: 'activity',
        cat: 'sights',
        title: `${destTitle} Ridge Panorama Lookout`,
        dLat: 0.006,
        dLng: -0.002,
        dur: 75,
        notes: `Elevated scenic overlook with wide valley vistas.`,
      },
      {
        suffix: 'terrace-bistro',
        kind: 'meal',
        cat: 'cafe',
        title: `${destTitle} Rooftop Cafe & Refreshments`,
        dLat: 0.002,
        dLng: -0.005,
        dur: 60,
        notes: `Relaxed midday cafe stop with open-air seating.`,
      },
    ];
    for (const arch of archetypes) {
      if (byRef.size >= minNeeded) break;
      addCandidate({
        placeRefId: `${baseRef}:${arch.suffix}`,
        title: arch.title,
        kind: arch.kind,
        category: arch.cat,
        lat: Number((dest.lat + arch.dLat).toFixed(5)),
        lng: Number((dest.lng + arch.dLng).toFixed(5)),
        durationMins: arch.dur,
        notes: arch.notes,
        dietaryFlags: wantsVeg && arch.kind === 'meal' ? ['pure_veg', 'veg_friendly'] : [],
        accessibilityNotes: '',
        popularity: 0.5,
        mustInclude: false,
      });
    }
  }

  return [...byRef.values()].sort(
    (a, b) =>
      Number(b.mustInclude) - Number(a.mustInclude) ||
      b.popularity - a.popularity
  );
}

/** Greedy nearest-neighbour ordering of a day's stops, keeping lunch near midday. */
function orderDayStopsGeographically(stops: CandidatePlace[]): CandidatePlace[] {
  if (stops.length <= 2) return stops;
  const meals = stops.filter((s) => s.kind === 'meal');
  const sights = stops.filter((s) => s.kind !== 'meal');

  const orderedSights: CandidatePlace[] = [];
  const remaining = [...sights];
  if (remaining.length > 0) {
    orderedSights.push(remaining.shift()!);
    while (remaining.length > 0) {
      const last = orderedSights[orderedSights.length - 1]!;
      let bestIdx = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      remaining.forEach((cand, idx) => {
        const dist = haversineMeters(last, cand);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = idx;
        }
      });
      orderedSights.push(remaining.splice(bestIdx, 1)[0]!);
    }
  }

  // Interleave meals naturally: 1st meal after 1st/2nd sight (lunch), 2nd meal at end (dinner/cafe)
  const merged: CandidatePlace[] = [...orderedSights];
  if (meals[0]) {
    const insertAt = Math.min(merged.length, Math.max(1, Math.ceil(orderedSights.length / 2)));
    merged.splice(insertAt, 0, meals[0]);
  }
  for (let i = 1; i < meals.length; i += 1) {
    merged.push(meals[i]!);
  }
  return merged;
}

function buildDeterministicDays(params: {
  dayDestinations: IntentDestination[];
  poolsByDestKey: Map<string, CandidatePlace[]>;
  intent: TripIntent;
}): Array<{ dayNumber: number; title: string; candidates: CandidatePlace[] }> {
  const { dayDestinations, poolsByDestKey, intent } = params;
  const totalDays = dayDestinations.length;
  const isSeniorOrKids = Boolean(
    intent.travellers.hasSeniors ||
      intent.travellers.hasChildren ||
      intent.travellers.group === 'seniors'
  );
  const baseStopsPerDay =
    intent.pace === 'relaxed' || isSeniorOrKids
      ? 3
      : intent.pace === 'packed'
        ? 5
        : 4;

  const usedPlaceIds = new Set<string>();
  const usedNormTitles = new Set<string>();

  const canSchedule = (c: CandidatePlace): boolean => {
    if (usedPlaceIds.has(c.placeRefId)) return false;
    const nt = normalizeName(c.title);
    if (nt && usedNormTitles.has(nt)) return false;
    return true;
  };

  const markScheduled = (c: CandidatePlace): void => {
    usedPlaceIds.add(c.placeRefId);
    const nt = normalizeName(c.title);
    if (nt) usedNormTitles.add(nt);
  };

  // Group day indices by destination so we can geographically cluster multi-day stays
  const daysByDestKey = new Map<string, number[]>();
  dayDestinations.forEach((d, idx) => {
    const key = d.destinationSlug ?? d.name.toLowerCase();
    const list = daysByDestKey.get(key) ?? [];
    list.push(idx + 1);
    daysByDestKey.set(key, list);
  });

  const plannedByDayNum = new Map<
    number,
    { dayNumber: number; title: string; candidates: CandidatePlace[] }
  >();

  for (const [destKey, dayNums] of daysByDestKey.entries()) {
    const dest = dayDestinations[dayNums[0]! - 1]!;
    const destLabel = toTitleCasePlaceName(dest.name);
    const pool = (poolsByDestKey.get(destKey) ?? []).filter(canSchedule);

    const sights = pool.filter((c) => c.kind !== 'meal' && c.kind !== 'stay');
    const meals = pool.filter((c) => c.kind === 'meal');

    // Sort sights by polar angle around destination centroid so adjacent days cover distinct sectors
    const centerLat =
      dest.lat ?? (sights[0]?.lat ?? 26.9124);
    const centerLng =
      dest.lng ?? (sights[0]?.lng ?? 75.7873);

    const mustSights = sights.filter((s) => s.mustInclude);
    const otherSights = sights
      .filter((s) => !s.mustInclude)
      .sort((a, b) => {
        const angA = Math.atan2(a.lat - centerLat, a.lng - centerLng);
        const angB = Math.atan2(b.lat - centerLat, b.lng - centerLng);
        return angA - angB;
      });
    const orderedPoolSights = [...mustSights, ...otherSights];

    let sightCursor = 0;
    let mealCursor = 0;

    dayNums.forEach((dayNum) => {
      const isFirstDay = dayNum === 1;
      const isLastDay = dayNum === totalDays && totalDays > 1;
      const targetCount =
        isFirstDay || isLastDay
          ? Math.max(2, baseStopsPerDay - 1)
          : baseStopsPerDay;
      const mealQuota = meals.length > mealCursor ? 1 : 0;
      const sightQuota = Math.max(1, targetCount - mealQuota);

      const dayCands: CandidatePlace[] = [];
      while (dayCands.length < sightQuota && sightCursor < orderedPoolSights.length) {
        const c = orderedPoolSights[sightCursor++]!;
        if (canSchedule(c)) {
          markScheduled(c);
          dayCands.push(c);
        }
      }
      while (mealQuota > 0 && mealCursor < meals.length) {
        const m = meals[mealCursor++]!;
        if (canSchedule(m)) {
          markScheduled(m);
          dayCands.push(m);
          break;
        }
      }

      // If sights ran out before meals or vice versa, fill from any remaining unused candidate in this city
      if (dayCands.length === 0) {
        const fallbackUnused = pool.find(canSchedule);
        if (fallbackUnused) {
          markScheduled(fallbackUnused);
          dayCands.push(fallbackUnused);
        }
      }

      const ordered = orderDayStopsGeographically(dayCands);
      const leadSight = ordered.find((c) => c.kind !== 'meal') ?? ordered[0];
      const suffix =
        isFirstDay
          ? 'Arrival & Orientation'
          : isLastDay
            ? 'Morning Highlights & Departure'
            : leadSight
              ? leadSight.title.split(/[(&,]/)[0]!.trim()
              : `Explore ${destLabel}`;

      plannedByDayNum.set(dayNum, {
        dayNumber: dayNum,
        title: `${destLabel}: ${suffix}`.slice(0, 100),
        candidates: ordered,
      });
    });
  }

  return Array.from({ length: totalDays }, (_, i) => {
    const dayNum = i + 1;
    return (
      plannedByDayNum.get(dayNum) ?? {
        dayNumber: dayNum,
        title: `Day ${dayNum}`,
        candidates: [],
      }
    );
  });
}

function attachBookingsAndScheduleTimes(params: {
  rawDays: Array<{
    dayNumber: number;
    title: string;
    candidates: Array<{
      cand: CandidatePlace;
      overrideStartTime?: string | null;
      overrideDuration?: number | null;
      overrideNotes?: string | null;
    }>;
  }>;
  intent: TripIntent;
}): PlannedDay[] {
  const { rawDays, intent } = params;
  const totalDays = rawDays.length;
  const hasSeniors = Boolean(
    intent.travellers.hasSeniors || intent.travellers.group === 'seniors'
  );
  const wantsVeg = intent.diet.some((d) => /veg|jain|satvik/i.test(d));
  const wantsJain = intent.diet.some((d) => /jain/i.test(d));

  const dayDates = rawDays.map((d) =>
    intent.dates.start ? addDaysIso(intent.dates.start, d.dayNumber - 1) : null
  );

  // Assign each booking anchor to a target dayNumber
  const bookingsByDay = new Map<number, Array<{ anchor: BookingAnchor; index: number }>>();
  intent.bookings.forEach((anchor, index) => {
    let targetDay = 1;
    const anchorDate = anchor.startIso?.slice(0, 10);
    if (anchorDate) {
      const matchIdx = dayDates.findIndex((dd) => dd === anchorDate);
      if (matchIdx >= 0) {
        targetDay = matchIdx + 1;
      } else if (index > 0 && anchor.itemKind === 'transit') {
        targetDay = totalDays;
      }
    } else if (index > 0 && anchor.itemKind === 'transit') {
      targetDay = totalDays;
    }
    const list = bookingsByDay.get(targetDay) ?? [];
    list.push({ anchor, index });
    bookingsByDay.set(targetDay, list);
  });

  return rawDays.map((rawDay, idx) => {
    const date = dayDates[idx] ?? null;
    const dayBookings = bookingsByDay.get(rawDay.dayNumber) ?? [];
    const stops: PlannedStop[] = [];

    // Fixed booking anchors first so we know blocked windows
    const blockedWindows: Array<[number, number]> = [];
    for (const { anchor, index } of dayBookings) {
      const isoTimeMatch = /T(\d{2}:\d{2})/.exec(anchor.startIso ?? '');
      const defaultAnchorMins =
        anchor.itemKind === 'stay'
          ? 14 * 60
          : rawDay.dayNumber === totalDays && totalDays > 1
            ? 16 * 60 + 30
            : 8 * 60 + 30;
      const startMins = isoTimeMatch
        ? parseHHMM(isoTimeMatch[1], defaultAnchorMins)
        : defaultAnchorMins;
      const dur = anchor.itemKind === 'stay' ? 45 : 120;
      blockedWindows.push([startMins, startMins + dur]);

      stops.push({
        kind: anchor.itemKind,
        title: anchor.title,
        notes: anchor.summary.headline,
        lat: null,
        lng: null,
        placeRefId: null,
        startTime: formatHHMM(startMins),
        durationMins: dur,
        dietaryFlags: [],
        accessibilityNotes: hasSeniors
          ? 'Confirmed booking anchor — allow 30m senior boarding buffer.'
          : 'Confirmed booking anchor.',
        transitMeta: {
          vehicleCode: anchor.summary.vehicleNumber,
          originName: anchor.summary.originName,
          destinationName: anchor.summary.destinationName,
          coachOrTerminal: anchor.summary.coach ?? anchor.summary.terminalOrPlatform,
          seatOrBerth: anchor.summary.seatOrBerth,
        },
        bookingAnchorIndex: index,
      });
    }

    // Starting clock: arrival buffer on Day 1, gentle start for seniors
    let cursorMins =
      rawDay.dayNumber === 1
        ? 10 * 60 + 30
        : hasSeniors || intent.pace === 'relaxed'
          ? 9 * 60 + 30
          : 9 * 60;

    let prevCoord: { lat: number; lng: number; title: string } | null = null;

    for (const entry of rawDay.candidates) {
      const { cand } = entry;
      let transitMeta: TransitMeta = {};
      let legMins = 20;

      if (prevCoord) {
        const est = estimateLegTransit({
          origin: { lat: prevCoord.lat, lng: prevCoord.lng, name: prevCoord.title },
          destination: { lat: cand.lat, lng: cand.lng, name: cand.title },
          departureTimeHHMM: formatHHMM(cursorMins),
        });
        legMins = Math.min(90, est.estimatedDurationMins);
        transitMeta = {
          mode: est.mode,
          distanceKm: est.distanceKm,
          estimatedDurationMins: est.estimatedDurationMins,
          advisory: est.advisory,
          googleMapsUrl: est.googleMapsUrl,
        };
        cursorMins += legMins;
      }

      if (cand.kind === 'meal' && cursorMins < 12 * 60 + 30) {
        cursorMins = 12 * 60 + 45;
      }

      const startMins = entry.overrideStartTime
        ? parseHHMM(entry.overrideStartTime, cursorMins)
        : cursorMins;
      const duration = entry.overrideDuration ?? cand.durationMins;

      // Shift past any fixed booking window collision
      let adjustedStart = startMins;
      for (const [bStart, bEnd] of blockedWindows) {
        if (adjustedStart < bEnd && adjustedStart + duration > bStart) {
          adjustedStart = bEnd + 30;
        }
      }

      const dietaryFlags = [...cand.dietaryFlags];
      if (cand.kind === 'meal') {
        if (wantsJain && !dietaryFlags.includes('jain_friendly')) {
          dietaryFlags.push('jain_friendly');
        }
        if (wantsVeg && !dietaryFlags.includes('veg_friendly') && !dietaryFlags.includes('pure_veg')) {
          dietaryFlags.push('veg_friendly');
        }
      }

      const seniorRestNote =
        hasSeniors && !cand.accessibilityNotes
          ? 'Paced with seated rest buffer for senior travellers.'
          : cand.accessibilityNotes;

      stops.push({
        kind: cand.kind,
        title: cand.title,
        notes: entry.overrideNotes ?? cand.notes,
        lat: cand.lat,
        lng: cand.lng,
        placeRefId: cand.placeRefId,
        startTime: formatHHMM(adjustedStart),
        durationMins: duration,
        dietaryFlags,
        accessibilityNotes: seniorRestNote,
        ...(hasSeniors
          ? {
              elderSummaryI18n: {
                en: `${formatHHMM(adjustedStart)} — ${cand.title}. ${seniorRestNote}`.trim(),
              },
            }
          : {}),
        transitMeta,
      });

      prevCoord = { lat: cand.lat, lng: cand.lng, title: cand.title };
      cursorMins = adjustedStart + duration + (hasSeniors ? 25 : 15);
    }

    stops.sort((a, b) => a.startTime.localeCompare(b.startTime));

    const pacingLevel: PacingLevel =
      stops.length <= 3 ? 'relaxed' : stops.length >= 5 ? 'packed' : 'moderate';

    return {
      dayNumber: rawDay.dayNumber,
      date,
      title: rawDay.title,
      pacingLevel,
      stops,
    };
  });
}

export async function buildGroundedItinerary(params: {
  intent: TripIntent;
  answers?: Record<string, string>;
  llm: LlmProvider;
  places: PlacesServices;
  allowAi?: boolean;
  onDay?: (day: DayStreamEvent) => void | Promise<void>;
}): Promise<StageBResult> {
  // 1. Apply answers and re-ground user-edited intent
  const answeredIntent = applyClarifyingAnswers(params.intent, params.answers);
  const groundedIntent = await groundIntent(answeredIntent, params.places, {
    trustAlreadyResolved: true,
  });

  const totalDays = resolveTotalDays(groundedIntent);
  const dayDestinations = allocateDaysToDestinations(
    groundedIntent.destinations,
    totalDays
  );

  // 2. Build candidate pool per unique destination
  const poolsByDestKey = new Map<string, CandidatePlace[]>();
  const allCandidatesByRef = new Map<string, CandidatePlace>();

  for (const dest of dayDestinations) {
    const key = dest.destinationSlug ?? dest.name.toLowerCase();
    if (poolsByDestKey.has(key)) continue;
    const daysHere = dayDestinations.filter(
      (d) => (d.destinationSlug ?? d.name.toLowerCase()) === key
    ).length;
    const pool = await buildCandidatePoolForDestination(
      dest,
      groundedIntent,
      params.places,
      Math.max(16, daysHere * 6)
    );
    poolsByDestKey.set(key, pool);
    for (const c of pool) {
      allCandidatesByRef.set(c.placeRefId, c);
    }
  }

  const candidateRefIds = new Set(allCandidatesByRef.keys());

  // 3. Try AI Stage-B planner (strictly constrained to candidateRefIds with up to 2 repairs)
  const canUseAi =
    params.allowAi !== false &&
    params.llm.available &&
    candidateRefIds.size > 0;
  let mode: 'ai' | 'basic' = canUseAi ? 'ai' : 'basic';
  let repairs = 0;
  let rawDays:
    | Array<{
        dayNumber: number;
        title: string;
        candidates: Array<{
          cand: CandidatePlace;
          overrideStartTime?: string | null;
          overrideDuration?: number | null;
          overrideNotes?: string | null;
        }>;
      }>
    | null = null;

  if (canUseAi) {
    const StrictStageBSchema = BaseModelStageBSchema.superRefine((val, ctx) => {
      if (val.days.length !== totalDays) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['days'],
          message: `Expected exactly ${totalDays} days, received ${val.days.length}.`,
        });
      }
      val.days.forEach((d, dIdx) => {
        if (d.stops.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['days', dIdx, 'stops'],
            message: `Day ${d.dayNumber} must contain at least 1 stop from CANDIDATE_PLACES.`,
          });
        }
        d.stops.forEach((st, sIdx) => {
          if (!candidateRefIds.has(st.placeRefId)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['days', dIdx, 'stops', sIdx, 'placeRefId'],
              message: `Ungrounded placeRefId "${st.placeRefId}". Choose ONLY from CANDIDATE_PLACES.`,
            });
          }
        });
      });
    });

    const compactCandidates = [...allCandidatesByRef.values()].slice(0, 90).map((c) => ({
      placeRefId: c.placeRefId,
      name: c.title,
      kind: c.kind,
      category: c.category,
      lat: c.lat,
      lng: c.lng,
      durationMins: c.durationMins,
      mustInclude: c.mustInclude,
      dietaryFlags: c.dietaryFlags,
    }));

    const dayPlanHints = dayDestinations.map((d, idx) => ({
      dayNumber: idx + 1,
      destination: d.name,
    }));

    try {
      const llmRes = await params.llm.generateStructured({
        system: STAGE_B_SYSTEM_PROMPT,
        userParts: [
          {
            text: JSON.stringify({
              totalDays,
              dayDestinations: dayPlanHints,
              pace: groundedIntent.pace ?? 'moderate',
              travellers: groundedIntent.travellers,
              diet: groundedIntent.diet,
              interests: groundedIntent.interests,
              bookings: groundedIntent.bookings,
              CANDIDATE_PLACES: compactCandidates,
            }),
          },
        ],
        schema: StrictStageBSchema,
        responseSchema: modelStageBGeminiSchema,
        temperature: 0.2,
        label: 'plan-day',
        fakeContext: {
          totalDays,
          dayDestinations: dayPlanHints,
          candidates: compactCandidates,
        },
      });

      repairs = llmRes.repairs;
      const sortedModelDays = [...llmRes.data.days].sort(
        (a, b) => a.dayNumber - b.dayNumber
      );

      // Enforce per-day destination geo isolation (<= 45 km) & zero cross-day duplicates even on AI outputs
      const aiUsedRefs = new Set<string>();
      const aiUsedTitles = new Set<string>();

      rawDays = sortedModelDays.map((md, idx) => {
        const dayDest = dayDestinations[idx]!;
        const destKey = dayDest.destinationSlug ?? dayDest.name.toLowerCase();
        const destPool = poolsByDestKey.get(destKey) ?? [];
        const destRefSet = new Set(destPool.map((c) => c.placeRefId));

        const pickedCands: Array<{
          cand: CandidatePlace;
          overrideStartTime?: string | null;
          overrideDuration?: number | null;
          overrideNotes?: string | null;
        }> = [];

        for (const st of md.stops) {
          const cand = allCandidatesByRef.get(st.placeRefId);
          if (!cand) continue;
          if (!destRefSet.has(cand.placeRefId)) continue;
          const nt = normalizeName(cand.title);
          if (aiUsedRefs.has(cand.placeRefId) || (nt && aiUsedTitles.has(nt))) {
            continue;
          }
          aiUsedRefs.add(cand.placeRefId);
          if (nt) aiUsedTitles.add(nt);
          pickedCands.push({
            cand,
            overrideStartTime: st.startTime,
            overrideDuration: st.durationMins,
            overrideNotes: st.notes ? sliceAtWordBoundary(st.notes, 240) : null,
          });
        }

        // Backfill from this city's unused pool if deduplication/isolation emptied or thinned the day
        if (pickedCands.length === 0) {
          for (const fallback of destPool) {
            const nt = normalizeName(fallback.title);
            if (!aiUsedRefs.has(fallback.placeRefId) && (!nt || !aiUsedTitles.has(nt))) {
              aiUsedRefs.add(fallback.placeRefId);
              if (nt) aiUsedTitles.add(nt);
              pickedCands.push({ cand: fallback });
              if (pickedCands.length >= 3) break;
            }
          }
        }

        // Apply geographic nearest-neighbour polish
        const ordered = orderDayStopsGeographically(
          pickedCands.map((p) => p.cand)
        ).map((c) => pickedCands.find((p) => p.cand.placeRefId === c.placeRefId)!);

        return {
          dayNumber: idx + 1,
          title: md.title || `${toTitleCasePlaceName(dayDest.name)}: Day ${idx + 1}`,
          candidates: ordered,
        };
      });
    } catch {
      // Any LLM failure or ungrounded ID after 2 repairs falls back cleanly to 100%-grounded deterministic scheduler
      mode = 'basic';
      rawDays = null;
    }
  }

  // 4. Deterministic geographic cluster scheduler fallback
  if (!rawDays) {
    const detDays = buildDeterministicDays({
      dayDestinations,
      poolsByDestKey,
      intent: groundedIntent,
    });
    rawDays = detDays.map((dd) => ({
      dayNumber: dd.dayNumber,
      title: dd.title,
      candidates: dd.candidates.map((cand) => ({ cand })),
    }));
  }

  // 5. Enforce booking anchors, travel times, dietary/senior buffers, and stream day events
  const finalDays = attachBookingsAndScheduleTimes({
    rawDays,
    intent: groundedIntent,
  });

  if (params.onDay) {
    for (const day of finalDays) {
      await params.onDay({
        dayNumber: day.dayNumber,
        title: day.title,
        items: day.stops.map((st) => ({
          title: st.title,
          kind: st.kind,
          ...(st.lat !== null ? { lat: st.lat } : {}),
          ...(st.lng !== null ? { lng: st.lng } : {}),
          ...(st.startTime ? { startTime: st.startTime } : {}),
          ...(st.placeRefId ? { placeRefId: st.placeRefId } : {}),
        })),
      });
    }
  }

  return {
    mode,
    intent: groundedIntent,
    days: finalDays,
    candidateRefIds,
    repairs,
  };
}
