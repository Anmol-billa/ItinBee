import {
  advanceServerHlc,
  compareHlc,
} from './hlc.js';
import {
  betweenSortKeys,
  compareBySortKeyAndId,
} from './lexorank.js';
import { buildGoogleMapsPlaceUrl } from '../geo/curated-india-pois.js';
import type {
  ItineraryItem,
  ItemKind,
  PacingLevel,
  SyncClientMutation,
  SyncServerDelta,
  TripDay,
} from '../../types/domain.js';

export interface SyncStateSnapshot {
  tripId: string;
  latestSeq: number;
  lastServerHlc: string;
  days: Map<string, TripDay>;
  items: Map<string, ItineraryItem>;
  appliedOpsByClientId: Map<string, SyncServerDelta>;
  opLog: SyncServerDelta[];
}

/**
 * Pure deterministic HLC + Fractional-Index Delta-Sync Resolver:
 * 1. Enforces `client_op_id` idempotency (duplicate replays return original `SyncServerDelta`).
 * 2. Assigns strictly monotonic `server_seq`.
 * 3. Applies field-level Last-Write-Wins (LWW) via HLC comparison.
 * 4. Preserves user stops via the **Orphan-to-Shortlist Rule**:
 *    - Deleting a `trip_day` sets `deletedAt` tombstone on the day AND moves any active items
 *      currently inside that day to `dayId = null, isShortlist = true`.
 *    - Upserting/moving an `itinerary_item` into a tombstoned `trip_day` (`deletedAt !== null`)
 *      automatically redirects the item to `dayId = null, isShortlist = true` (`orphanedToShortlist = true`).
 * 5. Orders items deterministically via `(sort_key, id)` tuple tie-breaking.
 */
export function applySyncMutationsToState(
  state: SyncStateSnapshot,
  mutations: SyncClientMutation[],
  nowIso = new Date().toISOString()
): SyncServerDelta[] {
  const results: SyncServerDelta[] = [];

  for (const mut of mutations) {
    // 1. Idempotency check on (trip_id, client_op_id)
    const existingDelta = state.appliedOpsByClientId.get(mut.clientOpId);
    if (existingDelta) {
      results.push(existingDelta);
      continue;
    }

    state.latestSeq += 1;
    const serverSeq = state.latestSeq;
    const resolvedHlc = advanceServerHlc(
      state.lastServerHlc,
      mut.hlcTimestamp,
      'srv-sg1'
    );
    state.lastServerHlc = resolvedHlc;

    let orphanedToShortlist = false;
    let appliedPayload: Record<string, unknown> = { ...mut.payload };

    if (mut.entityType === 'trip_day') {
      const existingDay = state.days.get(mut.entityId);

      if (mut.action === 'delete') {
        const tombstoned: TripDay = existingDay
          ? {
              ...existingDay,
              deletedAt: existingDay.deletedAt ?? nowIso,
              serverSeq,
              hlcTimestamp: resolvedHlc,
            }
          : {
              id: mut.entityId,
              tripId: state.tripId,
              dayNumber: Number(mut.payload.dayNumber ?? 1),
              date: (mut.payload.date as string | null | undefined) ?? null,
              themeTitle: String(mut.payload.themeTitle ?? ''),
              pacingLevel: ((mut.payload.pacingLevel as PacingLevel) ?? 'moderate'),
              serverSeq,
              hlcTimestamp: resolvedHlc,
              deletedAt: nowIso,
            };
        state.days.set(mut.entityId, tombstoned);

        // Orphan any active items currently assigned to this deleted day into Shortlist!
        for (const [itemId, item] of state.items.entries()) {
          if (item.dayId === mut.entityId && !item.deletedAt) {
            state.items.set(itemId, {
              ...item,
              dayId: null,
              isShortlist: true,
              serverSeq,
              hlcTimestamp: resolvedHlc,
            });
          }
        }

        appliedPayload = { ...tombstoned };
      } else {
        // Upsert trip_day (LWW check against existing HLC if already present)
        const shouldApplyScalar =
          !existingDay ||
          compareHlc(mut.hlcTimestamp, existingDay.hlcTimestamp) >= 0;

        const nextDay: TripDay = existingDay
          ? shouldApplyScalar
            ? {
                ...existingDay,
                dayNumber:
                  typeof mut.payload.dayNumber === 'number'
                    ? mut.payload.dayNumber
                    : existingDay.dayNumber,
                date:
                  mut.payload.date !== undefined
                    ? (mut.payload.date as string | null)
                    : existingDay.date,
                themeTitle:
                  typeof mut.payload.themeTitle === 'string'
                    ? mut.payload.themeTitle
                    : existingDay.themeTitle,
                pacingLevel:
                  (mut.payload.pacingLevel as PacingLevel | undefined) ??
                  existingDay.pacingLevel,
                deletedAt: existingDay.deletedAt, // Tombstone wins unless explicitly restored
                serverSeq,
                hlcTimestamp: resolvedHlc,
              }
            : {
                ...existingDay,
                serverSeq: existingDay.serverSeq,
              }
          : {
              id: mut.entityId,
              tripId: state.tripId,
              dayNumber: Number(mut.payload.dayNumber ?? state.days.size + 1),
              date: (mut.payload.date as string | null | undefined) ?? null,
              themeTitle: String(mut.payload.themeTitle ?? ''),
              pacingLevel:
                (mut.payload.pacingLevel as PacingLevel | undefined) ?? 'moderate',
              serverSeq,
              hlcTimestamp: resolvedHlc,
              deletedAt: null,
            };

        state.days.set(mut.entityId, nextDay);
        appliedPayload = { ...nextDay };
      }
    } else if (mut.entityType === 'itinerary_item') {
      const existingItem = state.items.get(mut.entityId);

      if (mut.action === 'delete') {
        if (existingItem) {
          const tombstonedItem: ItineraryItem = {
            ...existingItem,
            deletedAt: existingItem.deletedAt ?? nowIso,
            serverSeq,
            hlcTimestamp: resolvedHlc,
          };
          state.items.set(mut.entityId, tombstonedItem);
          appliedPayload = { ...tombstonedItem };
        } else {
          const placeholderTombstone: ItineraryItem = {
            id: mut.entityId,
            tripId: state.tripId,
            dayId: null,
            kind: 'activity',
            title: String(mut.payload.title ?? 'Deleted Stop'),
            notes: '',
            lat: null,
            lng: null,
            placeRefId: null,
            addressLocalScript: null,
            sortKey: String(mut.payload.sortKey ?? 'V0'),
            startTime: null,
            durationMins: null,
            transitMeta: {},
            dietaryFlags: [],
            accessibilityNotes: '',
            elderSummaryI18n: {},
            isShortlist: false,
            serverSeq,
            hlcTimestamp: resolvedHlc,
            deletedAt: nowIso,
            googleMapsUrl: null,
          };
          state.items.set(mut.entityId, placeholderTombstone);
          appliedPayload = { ...placeholderTombstone };
        }
      } else {
        // Upsert itinerary_item
        const incomingWins =
          !existingItem ||
          compareHlc(mut.hlcTimestamp, existingItem.hlcTimestamp) >= 0;

        let requestedDayId: string | null =
          mut.payload.dayId !== undefined
            ? (mut.payload.dayId as string | null)
            : (existingItem?.dayId ?? null);

        let requestedShortlist: boolean =
          typeof mut.payload.isShortlist === 'boolean'
            ? mut.payload.isShortlist
            : (existingItem?.isShortlist ?? (requestedDayId === null));

        // ORPHAN-TO-SHORTLIST RULE:
        // If target day does not exist or was tombstoned (`deletedAt !== null`), preserve stop in Shortlist!
        if (requestedDayId !== null) {
          const targetDay = state.days.get(requestedDayId);
          if (!targetDay || targetDay.deletedAt !== null) {
            requestedDayId = null;
            requestedShortlist = true;
            orphanedToShortlist = true;
          }
        }

        const lat =
          mut.payload.lat !== undefined
            ? (mut.payload.lat as number | null)
            : (existingItem?.lat ?? null);
        const lng =
          mut.payload.lng !== undefined
            ? (mut.payload.lng as number | null)
            : (existingItem?.lng ?? null);

        const resolvedSortKey =
          typeof mut.payload.sortKey === 'string' && mut.payload.sortKey.length > 0
            ? mut.payload.sortKey
            : existingItem?.sortKey ?? betweenSortKeys(null, null);

        const mergedItem: ItineraryItem = existingItem
          ? incomingWins
            ? {
                ...existingItem,
                dayId: requestedDayId,
                isShortlist: requestedShortlist,
                kind:
                  (mut.payload.kind as ItemKind | undefined) ?? existingItem.kind,
                title:
                  typeof mut.payload.title === 'string'
                    ? mut.payload.title
                    : existingItem.title,
                notes:
                  typeof mut.payload.notes === 'string'
                    ? mut.payload.notes
                    : existingItem.notes,
                lat,
                lng,
                placeRefId:
                  mut.payload.placeRefId !== undefined
                    ? (mut.payload.placeRefId as string | null)
                    : existingItem.placeRefId,
                addressLocalScript:
                  mut.payload.addressLocalScript !== undefined
                    ? (mut.payload.addressLocalScript as string | null)
                    : existingItem.addressLocalScript,
                sortKey: resolvedSortKey,
                startTime:
                  mut.payload.startTime !== undefined
                    ? (mut.payload.startTime as string | null)
                    : existingItem.startTime,
                durationMins:
                  mut.payload.durationMins !== undefined
                    ? (mut.payload.durationMins as number | null)
                    : existingItem.durationMins,
                dietaryFlags: Array.isArray(mut.payload.dietaryFlags)
                  ? (mut.payload.dietaryFlags as string[])
                  : existingItem.dietaryFlags,
                accessibilityNotes:
                  typeof mut.payload.accessibilityNotes === 'string'
                    ? mut.payload.accessibilityNotes
                    : existingItem.accessibilityNotes,
                elderSummaryI18n:
                  mut.payload.elderSummaryI18n &&
                  typeof mut.payload.elderSummaryI18n === 'object'
                    ? (mut.payload.elderSummaryI18n as { en?: string; hi?: string })
                    : existingItem.elderSummaryI18n,
                googleMapsUrl:
                  lat !== null && lng !== null
                    ? buildGoogleMapsPlaceUrl(lat, lng)
                    : existingItem.googleMapsUrl,
                serverSeq,
                hlcTimestamp: resolvedHlc,
                deletedAt: existingItem.deletedAt,
              }
            : {
                ...existingItem,
                // Even if an older scalar mutation arrives after its target day was deleted, ensure orphan safety
                dayId: orphanedToShortlist ? null : existingItem.dayId,
                isShortlist: orphanedToShortlist ? true : existingItem.isShortlist,
              }
          : {
              id: mut.entityId,
              tripId: state.tripId,
              dayId: requestedDayId,
              kind: (mut.payload.kind as ItemKind | undefined) ?? 'activity',
              title: String(mut.payload.title ?? 'Untitled Stop'),
              notes: String(mut.payload.notes ?? ''),
              lat,
              lng,
              placeRefId:
                (mut.payload.placeRefId as string | null | undefined) ?? null,
              addressLocalScript:
                (mut.payload.addressLocalScript as string | null | undefined) ??
                null,
              sortKey: resolvedSortKey,
              startTime:
                (mut.payload.startTime as string | null | undefined) ?? null,
              durationMins:
                typeof mut.payload.durationMins === 'number'
                  ? mut.payload.durationMins
                  : null,
              transitMeta:
                mut.payload.transitMeta &&
                typeof mut.payload.transitMeta === 'object'
                  ? (mut.payload.transitMeta as Record<string, never>)
                  : {},
              dietaryFlags: Array.isArray(mut.payload.dietaryFlags)
                ? (mut.payload.dietaryFlags as string[])
                : [],
              accessibilityNotes: String(mut.payload.accessibilityNotes ?? ''),
              elderSummaryI18n:
                mut.payload.elderSummaryI18n &&
                typeof mut.payload.elderSummaryI18n === 'object'
                  ? (mut.payload.elderSummaryI18n as { en?: string; hi?: string })
                  : {},
              isShortlist: requestedShortlist,
              serverSeq,
              hlcTimestamp: resolvedHlc,
              deletedAt: null,
              googleMapsUrl:
                lat !== null && lng !== null
                  ? buildGoogleMapsPlaceUrl(lat, lng)
                  : null,
            };

        state.items.set(mut.entityId, mergedItem);
        appliedPayload = { ...mergedItem };
      }
    }

    const delta: SyncServerDelta = {
      serverSeq,
      clientOpId: mut.clientOpId,
      hlcTimestamp: resolvedHlc,
      entityType: mut.entityType,
      entityId: mut.entityId,
      action: mut.action,
      orphanedToShortlist,
      payload: appliedPayload,
    };

    state.appliedOpsByClientId.set(mut.clientOpId, delta);
    state.opLog.push(delta);
    results.push(delta);
  }

  return results;
}

export function projectOrderedItems(items: Iterable<ItineraryItem>): {
  activeItems: ItineraryItem[];
  shortlistItems: ItineraryItem[];
} {
  const activeItems: ItineraryItem[] = [];
  const shortlistItems: ItineraryItem[] = [];

  for (const item of items) {
    if (item.deletedAt) continue;
    if (item.isShortlist || item.dayId === null) {
      shortlistItems.push(item);
    } else {
      activeItems.push(item);
    }
  }

  activeItems.sort((a, b) => {
    const dayCmp = (a.dayId ?? '').localeCompare(b.dayId ?? '');
    if (dayCmp !== 0) return dayCmp;
    return compareBySortKeyAndId(a, b);
  });

  shortlistItems.sort(compareBySortKeyAndId);

  return { activeItems, shortlistItems };
}
