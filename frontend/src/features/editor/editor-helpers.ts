import { midpointSortKey, nextClientHlc } from '@/lib/offline-db';
import type { ItemKind, ItineraryItem, PacingLevel, TripWorkspace } from '@/lib/types';

export interface PacingWarningResult {
  hasWarning: boolean;
  totalTransitMins: number;
  stopCount: number;
  messages: string[];
  summaryLabel: string | null;
}

export function mapPlaceCategoryToItemKind(category: string): ItemKind {
  const norm = category.trim().toLowerCase();
  if (norm === 'stay' || norm === 'hotel' || norm === 'homestay') return 'stay';
  if (norm === 'food' || norm === 'cafe' || norm === 'cafe_meal' || norm === 'restaurant') {
    return 'meal';
  }
  if (norm === 'transport' || norm === 'transit' || norm === 'transit_hub') {
    return 'transit';
  }
  return 'activity';
}

export function formatMinutesHuman(mins: number): string {
  const rounded = Math.max(0, Math.round(mins));
  if (rounded < 60) return `${rounded}m`;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function getOrderedStopsForDay(
  items: ReadonlyArray<ItineraryItem>,
  dayId: string
): ItineraryItem[] {
  return items
    .filter((i) => i.dayId === dayId && !i.deletedAt && !i.isShortlist)
    .sort((a, b) =>
      a.sortKey === b.sortKey
        ? a.id.localeCompare(b.id)
        : a.sortKey.localeCompare(b.sortKey)
    );
}

/**
 * Evaluates daily travel load & stop count against comfort thresholds:
 * - Daily transit > 4 hours (240 mins)
 * - > 4 stops when Elder comfort mode is active
 * - > 6 stops otherwise
 */
export function computeDayPacingWarning(params: {
  stops: ReadonlyArray<ItineraryItem>;
  routeMinutesByPair?: ReadonlyMap<string, number> | Record<string, number>;
  elderModeEnabled: boolean;
  pacingLevel?: PacingLevel;
}): PacingWarningResult {
  const activeStops = params.stops.filter((s) => !s.deletedAt);
  const stopCount = activeStops.length;

  const lookupPair = (key: string): number | undefined => {
    const pairs = params.routeMinutesByPair;
    if (!pairs) return undefined;
    if (typeof (pairs as ReadonlyMap<string, number>).get === 'function') {
      return (pairs as ReadonlyMap<string, number>).get(key);
    }
    return (pairs as Record<string, number>)[key];
  };

  let totalTransitMins = 0;
  for (let i = 0; i < activeStops.length; i++) {
    const curr = activeStops[i]!;
    if (curr.kind === 'transit' && typeof curr.durationMins === 'number' && curr.durationMins > 0) {
      totalTransitMins += curr.durationMins;
    }
    if (i > 0) {
      const prev = activeStops[i - 1]!;
      const pairMins = lookupPair(`${prev.id}->${curr.id}`);
      if (typeof pairMins === 'number' && Number.isFinite(pairMins)) {
        totalTransitMins += Math.round(pairMins);
      } else if (
        typeof curr.transitMeta?.estimatedDurationMins === 'number' &&
        curr.transitMeta.estimatedDurationMins > 0
      ) {
        totalTransitMins += curr.transitMeta.estimatedDurationMins;
      }
    }
  }

  const messages: string[] = [];
  if (totalTransitMins > 240) {
    messages.push(
      `${formatMinutesHuman(totalTransitMins)} of travel scheduled (recommended max 4h)`
    );
  }
  if (params.elderModeEnabled && stopCount > 4) {
    messages.push(
      `${stopCount} stops scheduled with Elder comfort mode active (recommended max 4)`
    );
  } else if (stopCount > 6) {
    messages.push(`${stopCount} stops scheduled (recommended max 6)`);
  }

  return {
    hasWarning: messages.length > 0,
    totalTransitMins,
    stopCount,
    messages,
    summaryLabel: messages.length > 0 ? messages.join(' · ') : null,
  };
}

export function reorderStopsInDay(
  items: ReadonlyArray<ItineraryItem>,
  dayId: string,
  fromIndex: number,
  toIndex: number,
  hlcGenerator: () => string = nextClientHlc
): ItineraryItem[] {
  const dayStops = getOrderedStopsForDay(items, dayId);
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= dayStops.length ||
    toIndex >= dayStops.length ||
    fromIndex === toIndex
  ) {
    return [...items];
  }

  const reordered = [...dayStops];
  const [moved] = reordered.splice(fromIndex, 1);
  if (!moved) return [...items];
  reordered.splice(toIndex, 0, moved);

  const newSortKeyById = new Map<string, string>();
  reordered.forEach((stop, idx) => {
    const sortKey = `s${String(idx).padStart(4, '0')}`;
    newSortKeyById.set(stop.id, sortKey);
  });

  return items.map((item) => {
    const assigned = newSortKeyById.get(item.id);
    if (assigned === undefined || assigned === item.sortKey) return item;
    return {
      ...item,
      sortKey: assigned,
      hlcTimestamp: hlcGenerator(),
    };
  });
}

export function moveStopByOffset(
  items: ReadonlyArray<ItineraryItem>,
  dayId: string,
  stopId: string,
  delta: -1 | 1,
  hlcGenerator: () => string = nextClientHlc
): ItineraryItem[] {
  const dayStops = getOrderedStopsForDay(items, dayId);
  const idx = dayStops.findIndex((s) => s.id === stopId);
  if (idx < 0) return [...items];
  return reorderStopsInDay(items, dayId, idx, idx + delta, hlcGenerator);
}

export function moveStopToDay(
  items: ReadonlyArray<ItineraryItem>,
  stopId: string,
  targetDayId: string,
  hlcGenerator: () => string = nextClientHlc
): ItineraryItem[] {
  const current = items.find((i) => i.id === stopId && !i.deletedAt);
  if (!current || current.dayId === targetDayId) return [...items];

  const targetDayStops = getOrderedStopsForDay(items, targetDayId);
  const lastSortKey =
    targetDayStops.length > 0
      ? targetDayStops[targetDayStops.length - 1]!.sortKey
      : null;
  const nextSortKey = midpointSortKey(lastSortKey, null);

  return items.map((item) =>
    item.id === stopId
      ? {
          ...item,
          dayId: targetDayId,
          isShortlist: false,
          sortKey: nextSortKey,
          hlcTimestamp: hlcGenerator(),
        }
      : item
  );
}

export function promoteShortlistItemToDay(
  workspace: TripWorkspace,
  shortlistItemId: string,
  targetDayId: string,
  hlcGenerator: () => string = nextClientHlc
): TripWorkspace {
  const found = workspace.shortlist.find(
    (s) => s.id === shortlistItemId && !s.deletedAt
  );
  if (!found) return workspace;

  const targetStops = getOrderedStopsForDay(workspace.items, targetDayId);
  const lastKey =
    targetStops.length > 0
      ? targetStops[targetStops.length - 1]!.sortKey
      : null;

  const promoted: ItineraryItem = {
    ...found,
    dayId: targetDayId,
    isShortlist: false,
    sortKey: midpointSortKey(lastKey, null),
    hlcTimestamp: hlcGenerator(),
  };

  return {
    ...workspace,
    shortlist: workspace.shortlist.filter((s) => s.id !== shortlistItemId),
    items: [...workspace.items, promoted],
  };
}
