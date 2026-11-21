'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Check,
  Compass,
  Copy,
  Download,
  FileText,
  Map as MapIcon,
} from 'lucide-react';
import { ModalDialog } from '@/components/ui/ModalDialog';
import {
  createBlankSandboxWorkspace,
  SAMPLE_WORKSPACES,
} from '@/data/sample-trips';
import {
  claimSandboxToCloud,
  fetchTripWorkspace,
  pushSyncMutations,
  resolveLiveTripWsUrl,
  updateTripMeta,
  type SyncClientMutationInput,
} from '@/lib/api-client';
import { syncDestinationSummaryDays } from '@/lib/formatters';
import {
  deleteLocalSandboxDraft,
  enqueueSyncOutbox,
  flushSyncOutbox,
  hasPendingSyncOutbox,
  localDb,
  loadLocalWorkspace,
  midpointSortKey,
  nextClientHlc,
  saveLocalWorkspace,
} from '@/lib/offline-db';
import { exportItineraryWithLiveQrPdf } from '@/lib/pdf-export';
import type {
  ItemKind,
  ItineraryItem,
  TripDay,
  TripWorkspace,
} from '@/lib/types';
import { BookingsTab } from '@/features/bookings/BookingsTab';
import { BudgetTab } from '@/features/budget/BudgetTab';
import { GroupTab } from '@/features/group/GroupTab';
import { TripMap } from '@/features/map/TripMap';
import type { CandidateMapPlace, RouteLegResult } from '@/features/map/map-utils';
import { ShareTab } from '@/features/share/ShareTab';
import { EditorHeader, type EditorMode } from './EditorHeader';
import { ExplorePlacesPanel } from './ExplorePlacesPanel';
import { TimelinePane } from './TimelinePane';
import {
  getOrderedStopsForDay,
  mapPlaceCategoryToItemKind,
  moveStopByOffset,
  moveStopToDay,
  promoteShortlistItemToDay,
  reorderStopsInDay,
} from './editor-helpers';
import {
  resolveInitialTripCenter,
  type DiscoveredPlace,
} from './places-discovery';

interface EditorShellProps {
  initialWorkspace: TripWorkspace | null;
  requestedId: string;
}

type MobilePlanPane = 'plan' | 'places' | 'map';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const LIVE_WS_EVENT_TYPES = new Set([
  'sync_delta',
  'poll_updated',
  'expense_added',
  'expense_deleted',
  'booking_ingested',
  'trip_updated',
  'member_added',
  'member_updated',
]);

function buildItemUpsertPayload(item: ItineraryItem): Record<string, unknown> {
  return {
    dayId: item.dayId,
    kind: item.kind,
    title: item.title,
    notes: item.notes,
    lat: item.lat,
    lng: item.lng,
    placeRefId: item.placeRefId,
    addressLocalScript: item.addressLocalScript,
    sortKey: item.sortKey,
    startTime: item.startTime,
    durationMins: item.durationMins,
    transitMeta: item.transitMeta,
    dietaryFlags: item.dietaryFlags,
    accessibilityNotes: item.accessibilityNotes,
    elderSummaryI18n: item.elderSummaryI18n,
    isShortlist: item.isShortlist,
  };
}

/**
 * Merges incoming server workspace without clobbering any field the user is
 * actively typing into (`document.activeElement`).
 */
function mergeLiveWorkspacePreservingFocus(
  prev: TripWorkspace | null,
  incoming: TripWorkspace
): TripWorkspace {
  if (!prev || typeof document === 'undefined') return incoming;
  const active = document.activeElement as HTMLElement | null;
  if (
    !active ||
    (active.tagName !== 'INPUT' && active.tagName !== 'TEXTAREA')
  ) {
    return incoming;
  }

  let mergedTrip = incoming.trip;
  if (active.id === 'trip-title-edit-input') {
    mergedTrip = { ...mergedTrip, title: prev.trip.title };
  }

  let mergedDays = incoming.days;
  const focusedDayId = active.getAttribute('data-day-id');
  if (focusedDayId) {
    const localDay = prev.days.find((d) => d.id === focusedDayId);
    if (localDay) {
      mergedDays = mergedDays.map((d) =>
        d.id === focusedDayId ? { ...d, themeTitle: localDay.themeTitle } : d
      );
    }
  }

  let mergedItems = incoming.items;
  const focusedStopId = active.getAttribute('data-stop-id');
  if (focusedStopId) {
    const localStop = prev.items.find((i) => i.id === focusedStopId);
    if (localStop) {
      mergedItems = mergedItems.map((i) =>
        i.id === focusedStopId
          ? { ...i, title: localStop.title, notes: localStop.notes }
          : i
      );
    }
  }

  return {
    ...incoming,
    trip: mergedTrip,
    days: mergedDays,
    items: mergedItems,
  };
}

export function EditorShell({
  initialWorkspace,
  requestedId,
}: EditorShellProps) {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<TripWorkspace | null>(
    initialWorkspace
  );
  const [resolvingLocal, setResolvingLocal] = useState<boolean>(
    initialWorkspace === null
  );

  const [activeMode, setActiveMode] = useState<EditorMode>('plan');
  const [mobilePane, setMobilePane] = useState<MobilePlanPane>('plan');
  const [selectedDayId, setSelectedDayId] = useState<string>(
    initialWorkspace?.days.find((d) => !d.deletedAt)?.id ?? ''
  );
  const [highlightedStopId, setHighlightedStopId] = useState<string | null>(
    initialWorkspace?.items.find((i) => !i.deletedAt)?.id ?? null
  );

  // Shared discovery + routing state across the 3 panes
  const [candidates, setCandidates] = useState<CandidateMapPlace[]>([]);
  const [destinationCenter, setDestinationCenter] = useState<{
    lat: number;
    lng: number;
  } | null>(() =>
    resolveInitialTripCenter(initialWorkspace?.trip, initialWorkspace?.items ?? [])
  );
  const [hoveredCandidateId, setHoveredCandidateId] = useState<string | null>(
    null
  );
  const [mapSearchBbox, setMapSearchBbox] = useState<string | null>(null);
  const [routeLegsByPairKey, setRouteLegsByPairKey] = useState<
    Record<string, RouteLegResult>
  >({});

  // Connectivity & sync state
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Quick Share dialog
  const [quickShareOpen, setQuickShareOpen] = useState(false);
  const [claimedShareUrl, setClaimedShareUrl] = useState<string | null>(null);
  const [claimingShare, setClaimingShare] = useState(false);
  const [copiedQuickField, setCopiedQuickField] = useState<string | null>(null);

  const latestSeqRef = useRef<number>(initialWorkspace?.trip.latestSeq ?? 0);
  const daySyncTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );
  const workspaceRef = useRef<TripWorkspace | null>(initialWorkspace);

  useEffect(() => {
    workspaceRef.current = workspace;
    if (workspace) {
      latestSeqRef.current = workspace.trip.latestSeq;
    }
  }, [workspace]);

  // Clean up debounced timers on unmount
  useEffect(() => {
    const timers = daySyncTimersRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  const notify = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 3200);
  }, []);

  // Online/offline listeners & PWA service worker
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsOnline(navigator.onLine);
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Client-side IndexedDB + authenticated guest fallback when SSR had no workspace
  useEffect(() => {
    let cancelled = false;

    const resolveWorkspace = async () => {
      if (initialWorkspace) {
        // NEVER overwrite newer server `latestSeq` state with stale IndexedDB data
        // UNLESS there are pending outbox mutations for this tripId!
        const hasOutbox = await hasPendingSyncOutbox(initialWorkspace.trip.id);
        if (hasOutbox) {
          const localSaved =
            (await loadLocalWorkspace(`trip:${initialWorkspace.trip.id}`)) ??
            (await loadLocalWorkspace(`sandbox:${initialWorkspace.trip.shortId}`));
          if (
            !cancelled &&
            localSaved &&
            localSaved.trip.updatedAt > initialWorkspace.trip.updatedAt
          ) {
            setWorkspace(localSaved);
            setSelectedDayId(
              localSaved.days.find((d) => !d.deletedAt)?.id ?? ''
            );
          }
        }
        if (!cancelled) setResolvingLocal(false);
        return;
      }

      // 1. Check direct keys in IndexedDB
      const candidateKeys = [
        `trip:${requestedId}`,
        `sandbox:${requestedId}`,
        requestedId,
      ];
      for (const k of candidateKeys) {
        const hit = await loadLocalWorkspace(k);
        if (hit && !cancelled) {
          setWorkspace(hit);
          setSelectedDayId(hit.days.find((d) => !d.deletedAt)?.id ?? '');
          setResolvingLocal(false);
          return;
        }
      }

      // 2. Scan IndexedDB sandboxes for matching trip.id or trip.shortId
      if (localDb) {
        try {
          const all = await localDb.sandboxes.toArray();
          const matched = all.find(
            (r) =>
              r.workspace.trip.id === requestedId ||
              r.workspace.trip.shortId === requestedId
          );
          if (matched && !cancelled) {
            setWorkspace(matched.workspace);
            setSelectedDayId(
              matched.workspace.days.find((d) => !d.deletedAt)?.id ?? ''
            );
            setResolvingLocal(false);
            return;
          }
        } catch {
          // Ignore Dexie read errors in restricted storage
        }
      }

      // 3. Try browser-side fetch with cookies + user bearer token
      const cloudWs = await fetchTripWorkspace(requestedId);
      if (cloudWs && !cancelled) {
        setWorkspace(cloudWs);
        setSelectedDayId(cloudWs.days.find((d) => !d.deletedAt)?.id ?? '');
        setResolvingLocal(false);
        return;
      }

      // 4. Support fresh local drafts (/trip/new, /trip/blank, /trip/draft-*)
      if (
        requestedId === 'new' ||
        requestedId === 'blank' ||
        requestedId.startsWith('draft-')
      ) {
        const blank = createBlankSandboxWorkspace('New Trip Plan');
        if (requestedId.startsWith('draft-')) {
          blank.trip.shortId = requestedId;
        }
        await saveLocalWorkspace(`trip:${blank.trip.id}`, blank);
        await saveLocalWorkspace(`sandbox:${blank.trip.shortId}`, blank);
        if (!cancelled) {
          setWorkspace(blank);
          setSelectedDayId(blank.days[0]?.id ?? '');
          setResolvingLocal(false);
        }
        return;
      }

      if (!cancelled) {
        setResolvingLocal(false);
      }
    };

    void resolveWorkspace();
    return () => {
      cancelled = true;
    };
  }, [initialWorkspace, requestedId]);

  const isCloudTrip = useMemo(() => {
    if (!workspace) return false;
    return (
      UUID_RE.test(workspace.trip.id) &&
      !workspace.trip.shortId.startsWith('draft-')
    );
  }, [workspace]);

  // Keep initial map center synchronized when workspace resolves or destinationSummary changes
  const effectiveMapCenter = useMemo(() => {
    return (
      destinationCenter ??
      resolveInitialTripCenter(workspace?.trip, workspace?.items ?? [])
    );
  }, [destinationCenter, workspace?.trip, workspace?.items]);

  // Persist every workspace update to IndexedDB automatically
  useEffect(() => {
    if (!workspace) return;
    void saveLocalWorkspace(`trip:${workspace.trip.id}`, workspace);
    if (workspace.trip.shortId) {
      void saveLocalWorkspace(`sandbox:${workspace.trip.shortId}`, workspace);
    }
  }, [workspace]);

  // Flush durable offline outbox on mount and whenever browser comes back online
  const flushOutboxForCurrentTrip = useCallback(async () => {
    const curr = workspaceRef.current;
    if (!curr || !isCloudTrip) return;
    try {
      const { flushedCount, latestSeq } = await flushSyncOutbox(
        curr.trip.id,
        pushSyncMutations
      );
      if (flushedCount > 0) {
        if (latestSeq !== null) {
          latestSeqRef.current = latestSeq;
          setWorkspace((prev) =>
            prev
              ? {
                  ...prev,
                  trip: { ...prev.trip, latestSeq },
                }
              : prev
          );
        }
        notify(`Synced ${flushedCount} offline change${flushedCount === 1 ? '' : 's'} to cloud.`);
      }
    } catch {
      // Still offline; will retry on next 'online' event
    }
  }, [isCloudTrip, notify]);

  useEffect(() => {
    if (!isCloudTrip || !workspace?.trip.id) return;
    void flushOutboxForCurrentTrip();

    const handleOnlineFlush = () => {
      void flushOutboxForCurrentTrip();
    };
    window.addEventListener('online', handleOnlineFlush);
    return () => {
      window.removeEventListener('online', handleOnlineFlush);
    };
  }, [isCloudTrip, workspace?.trip.id, flushOutboxForCurrentTrip]);

  // Connect live WebSocket room with ws-ticket + onmessage workspace sync + 25s ping heartbeat
  useEffect(() => {
    if (!workspace?.trip.id || !isCloudTrip || !isOnline || typeof window === 'undefined') {
      setWsConnected(false);
      return;
    }
    const tripId = workspace.trip.id;
    let cancelled = false;
    let ws: WebSocket | null = null;
    let pingInterval: ReturnType<typeof setInterval> | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    resolveLiveTripWsUrl(tripId)
      .then((wsUrl) => {
        if (cancelled) return;
        try {
          ws = new WebSocket(wsUrl);
          ws.onopen = () => {
            if (cancelled) return;
            setWsConnected(true);
            pingInterval = setInterval(() => {
              if (ws && ws.readyState === WebSocket.OPEN) {
                try {
                  ws.send(JSON.stringify({ type: 'ping' }));
                } catch {
                  /* ignore */
                }
              }
            }, 25_000);
          };
          ws.onmessage = (evt) => {
            if (cancelled || typeof evt.data !== 'string') return;
            try {
              const msg = JSON.parse(evt.data) as { type?: string };
              if (msg.type && LIVE_WS_EVENT_TYPES.has(msg.type)) {
                if (refreshTimer) clearTimeout(refreshTimer);
                refreshTimer = setTimeout(() => {
                  void fetchTripWorkspace(tripId).then((fresh) => {
                    if (!cancelled && fresh) {
                      latestSeqRef.current = fresh.trip.latestSeq;
                      setWorkspace((prev) =>
                        mergeLiveWorkspacePreservingFocus(prev, fresh)
                      );
                    }
                  });
                }, 120);
              }
            } catch {
              /* ignore malformed frame */
            }
          };
          ws.onclose = () => {
            if (!cancelled) setWsConnected(false);
            if (pingInterval) clearInterval(pingInterval);
          };
          ws.onerror = () => {
            if (!cancelled) setWsConnected(false);
          };
        } catch {
          setWsConnected(false);
        }
      })
      .catch(() => setWsConnected(false));

    return () => {
      cancelled = true;
      if (pingInterval) clearInterval(pingInterval);
      if (refreshTimer) clearTimeout(refreshTimer);
      ws?.close();
    };
  }, [workspace?.trip.id, isCloudTrip, isOnline]);

  const queueSync = useCallback(
    (tripId: string, baseSeq: number, mutations: SyncClientMutationInput[]) => {
      if (!isCloudTrip || mutations.length === 0) return;
      const effectiveSeq = Math.max(baseSeq, latestSeqRef.current);
      const stamped = mutations.map((m) => ({
        ...m,
        baseSeq: effectiveSeq,
      }));
      pushSyncMutations(tripId, effectiveSeq, stamped)
        .then((res) => {
          if (typeof res?.latestSeq === 'number') {
            latestSeqRef.current = res.latestSeq;
            setWorkspace((prev) =>
              prev && prev.trip.id === tripId
                ? {
                    ...prev,
                    trip: {
                      ...prev.trip,
                      latestSeq: Math.max(prev.trip.latestSeq, res.latestSeq),
                    },
                  }
                : prev
            );
          }
        })
        .catch(() => {
          void enqueueSyncOutbox(tripId, effectiveSeq, stamped);
        });
    },
    [isCloudTrip]
  );

  const mutateWorkspace = useCallback(
    (updater: (prev: TripWorkspace) => TripWorkspace) => {
      setWorkspace((prev) => {
        if (!prev) return prev;
        const next = updater(prev);
        return {
          ...next,
          trip: {
            ...next.trip,
            updatedAt: new Date().toISOString(),
          },
        };
      });
    },
    []
  );

  /**
   * Claims a local sandbox draft into the cloud, deletes old `trip:<oldId>` and
   * `sandbox:<oldShortId>` records so `/trips` never shows duplicates, and updates URL.
   */
  const upgradeDraftToCloud = useCallback(
    async (draft: TripWorkspace): Promise<TripWorkspace> => {
      const oldId = draft.trip.id;
      const oldShortId = draft.trip.shortId;
      const claimed = await claimSandboxToCloud(draft);
      if (claimed.trip.id !== oldId || claimed.trip.shortId !== oldShortId) {
        await deleteLocalSandboxDraft(oldId, oldShortId);
      }
      latestSeqRef.current = claimed.trip.latestSeq;
      setWorkspace(claimed);
      if (claimed.trip.id !== requestedId) {
        router.replace(`/trip/${claimed.trip.id}`);
      }
      return claimed;
    },
    [requestedId, router]
  );

  const activeDays = useMemo(() => {
    if (!workspace) return [];
    return workspace.days
      .filter((d) => !d.deletedAt)
      .sort((a, b) => a.dayNumber - b.dayNumber);
  }, [workspace]);

  const currentDay = useMemo(() => {
    if (activeDays.length === 0) return null;
    return activeDays.find((d) => d.id === selectedDayId) ?? activeDays[0] ?? null;
  }, [activeDays, selectedDayId]);

  const handleAddDay = () => {
    if (!workspace) return;
    const nextNum = (activeDays[activeDays.length - 1]?.dayNumber ?? 0) + 1;
    const nextTotalDays = activeDays.length + 1;
    const nextDestSummary = syncDestinationSummaryDays(
      workspace.trip.destinationSummary,
      nextTotalDays
    );
    const newDay: TripDay = {
      id: crypto.randomUUID(),
      tripId: workspace.trip.id,
      dayNumber: nextNum,
      date: null,
      themeTitle: `Day ${nextNum} exploration`,
      pacingLevel: 'moderate',
      serverSeq: workspace.trip.latestSeq + 1,
      hlcTimestamp: nextClientHlc(),
      deletedAt: null,
    };
    mutateWorkspace((prev) => ({
      ...prev,
      trip: {
        ...prev.trip,
        destinationSummary: nextDestSummary,
      },
      days: [...prev.days, newDay],
    }));
    setSelectedDayId(newDay.id);
    queueSync(workspace.trip.id, workspace.trip.latestSeq, [
      {
        clientOpId: crypto.randomUUID(),
        hlcTimestamp: newDay.hlcTimestamp,
        baseSeq: workspace.trip.latestSeq,
        entityType: 'trip_day',
        entityId: newDay.id,
        action: 'upsert',
        payload: {
          dayNumber: newDay.dayNumber,
          themeTitle: newDay.themeTitle,
          pacingLevel: newDay.pacingLevel,
        },
      },
    ]);
    if (isCloudTrip && nextDestSummary !== workspace.trip.destinationSummary) {
      void updateTripMeta(workspace.trip.id, {
        destinationSummary: nextDestSummary,
      });
    }
    notify(`Added Day ${nextNum}.`);
  };

  const handleDeleteDay = (dayId: string) => {
    if (!workspace || activeDays.length <= 1) return;
    const targetDay = activeDays.find((d) => d.id === dayId);
    if (!targetDay) return;

    const nowIso = new Date().toISOString();
    const hlc = nextClientHlc();
    const remainingDays = activeDays
      .filter((d) => d.id !== dayId)
      .map((d, idx) => ({
        ...d,
        dayNumber: idx + 1,
        hlcTimestamp: d.dayNumber !== idx + 1 ? nextClientHlc() : d.hlcTimestamp,
      }));
    const renumberedById = new Map(remainingDays.map((d) => [d.id, d]));
    const nextDestSummary = syncDestinationSummaryDays(
      workspace.trip.destinationSummary,
      remainingDays.length
    );

    const orphanedItems = workspace.items.filter(
      (i) => i.dayId === dayId && !i.deletedAt
    );

    mutateWorkspace((prev) => ({
      ...prev,
      trip: {
        ...prev.trip,
        destinationSummary: nextDestSummary,
      },
      days: prev.days.map((d) => {
        if (d.id === dayId) {
          return { ...d, deletedAt: nowIso, hlcTimestamp: hlc };
        }
        return renumberedById.get(d.id) ?? d;
      }),
      items: prev.items.filter((i) => i.dayId !== dayId),
      shortlist: [
        ...prev.shortlist,
        ...orphanedItems.map((item) => ({
          ...item,
          dayId: null,
          isShortlist: true,
          hlcTimestamp: hlc,
        })),
      ],
    }));

    setSelectedDayId(remainingDays[0]?.id ?? '');

    const mutations: SyncClientMutationInput[] = [
      {
        clientOpId: crypto.randomUUID(),
        hlcTimestamp: hlc,
        baseSeq: workspace.trip.latestSeq,
        entityType: 'trip_day',
        entityId: dayId,
        action: 'delete',
        payload: {},
      },
    ];
    for (const d of remainingDays) {
      const orig = activeDays.find((origDay) => origDay.id === d.id);
      if (orig && orig.dayNumber !== d.dayNumber) {
        mutations.push({
          clientOpId: crypto.randomUUID(),
          hlcTimestamp: d.hlcTimestamp,
          baseSeq: workspace.trip.latestSeq,
          entityType: 'trip_day',
          entityId: d.id,
          action: 'upsert',
          payload: {
            dayNumber: d.dayNumber,
            themeTitle: d.themeTitle,
            pacingLevel: d.pacingLevel,
            date: d.date,
          },
        });
      }
    }

    queueSync(workspace.trip.id, workspace.trip.latestSeq, mutations);
    if (isCloudTrip && nextDestSummary !== workspace.trip.destinationSummary) {
      void updateTripMeta(workspace.trip.id, {
        destinationSummary: nextDestSummary,
      });
    }
    notify(`Deleted Day ${targetDay.dayNumber}.`);
  };

  // Debounced by 400ms so typing a day theme title never spams POST /sync on every keystroke
  const handleUpdateDay = (
    dayId: string,
    patch: Partial<Pick<TripDay, 'themeTitle' | 'pacingLevel' | 'date'>>
  ) => {
    if (!workspace) return;
    const hlc = nextClientHlc();
    mutateWorkspace((prev) => ({
      ...prev,
      days: prev.days.map((d) =>
        d.id === dayId ? { ...d, ...patch, hlcTimestamp: hlc } : d
      ),
    }));

    const tripId = workspace.trip.id;
    const prevTimer = daySyncTimersRef.current.get(dayId);
    if (prevTimer) clearTimeout(prevTimer);

    const timer = setTimeout(() => {
      daySyncTimersRef.current.delete(dayId);
      const latestWs = workspaceRef.current;
      const latestDay = latestWs?.days.find((d) => d.id === dayId);
      if (!latestWs || !latestDay) return;
      queueSync(tripId, latestWs.trip.latestSeq, [
        {
          clientOpId: crypto.randomUUID(),
          hlcTimestamp: latestDay.hlcTimestamp,
          baseSeq: latestWs.trip.latestSeq,
          entityType: 'trip_day',
          entityId: dayId,
          action: 'upsert',
          payload: {
            dayNumber: latestDay.dayNumber,
            themeTitle: latestDay.themeTitle,
            pacingLevel: latestDay.pacingLevel,
            date: latestDay.date,
          },
        },
      ]);
    }, 400);

    daySyncTimersRef.current.set(dayId, timer);
  };

  const handleAddDiscoveredPlaceToDay = (
    place: DiscoveredPlace | CandidateMapPlace,
    explicitDayId: string | null
  ) => {
    if (!workspace) return;
    const targetDay =
      (explicitDayId
        ? activeDays.find((d) => d.id === explicitDayId)
        : null) ??
      currentDay ??
      activeDays[0] ??
      null;
    const targetDayId = targetDay?.id ?? null;

    const existingStops = targetDayId
      ? getOrderedStopsForDay(workspace.items, targetDayId)
      : [];
    const lastKey =
      existingStops.length > 0
        ? existingStops[existingStops.length - 1]!.sortKey
        : null;

    const kind = mapPlaceCategoryToItemKind(place.category);
    const hlc = nextClientHlc();
    const newItem: ItineraryItem = {
      id: crypto.randomUUID(),
      tripId: workspace.trip.id,
      dayId: targetDayId,
      kind,
      title: place.name,
      notes: place.whyVisit || place.description || place.address || '',
      lat: place.lat,
      lng: place.lng,
      placeRefId: place.refId,
      addressLocalScript: null,
      sortKey: midpointSortKey(lastKey, null),
      startTime: null,
      durationMins: place.typicalDurationMins ?? 60,
      transitMeta: {},
      dietaryFlags: place.dietaryHints ?? [],
      accessibilityNotes: '',
      elderSummaryI18n: { en: place.name },
      isShortlist: false,
      serverSeq: workspace.trip.latestSeq + 1,
      hlcTimestamp: hlc,
      deletedAt: null,
      googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`,
    };

    mutateWorkspace((prev) => ({
      ...prev,
      items: [...prev.items, newItem],
    }));
    if (targetDayId) setSelectedDayId(targetDayId);
    setHighlightedStopId(newItem.id);

    queueSync(workspace.trip.id, workspace.trip.latestSeq, [
      {
        clientOpId: crypto.randomUUID(),
        hlcTimestamp: hlc,
        baseSeq: workspace.trip.latestSeq,
        entityType: 'itinerary_item',
        entityId: newItem.id,
        action: 'upsert',
        payload: buildItemUpsertPayload(newItem),
      },
    ]);

    notify(`Added "${place.name}" to Day ${targetDay?.dayNumber ?? 1}.`);
  };

  const handleToggleShortlistPlace = (place: DiscoveredPlace) => {
    if (!workspace) return;
    const existing = workspace.shortlist.find(
      (s) =>
        !s.deletedAt &&
        (s.placeRefId === place.refId ||
          s.title.toLowerCase() === place.name.toLowerCase())
    );
    if (existing) {
      const hlc = nextClientHlc();
      mutateWorkspace((prev) => ({
        ...prev,
        shortlist: prev.shortlist.filter((s) => s.id !== existing.id),
      }));
      queueSync(workspace.trip.id, workspace.trip.latestSeq, [
        {
          clientOpId: crypto.randomUUID(),
          hlcTimestamp: hlc,
          baseSeq: workspace.trip.latestSeq,
          entityType: 'itinerary_item',
          entityId: existing.id,
          action: 'delete',
          payload: {},
        },
      ]);
      notify(`Removed "${place.name}" from Shortlist.`);
      return;
    }

    const hlc = nextClientHlc();
    const item: ItineraryItem = {
      id: crypto.randomUUID(),
      tripId: workspace.trip.id,
      dayId: null,
      kind: mapPlaceCategoryToItemKind(place.category),
      title: place.name,
      notes: place.whyVisit || place.description || place.address || '',
      lat: place.lat,
      lng: place.lng,
      placeRefId: place.refId,
      addressLocalScript: null,
      sortKey: `z${workspace.shortlist.length}`,
      startTime: null,
      durationMins: place.typicalDurationMins ?? 60,
      transitMeta: {},
      dietaryFlags: place.dietaryHints ?? [],
      accessibilityNotes: '',
      elderSummaryI18n: { en: place.name },
      isShortlist: true,
      serverSeq: workspace.trip.latestSeq + 1,
      hlcTimestamp: hlc,
      deletedAt: null,
      googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`,
    };

    mutateWorkspace((prev) => ({
      ...prev,
      shortlist: [...prev.shortlist, item],
    }));
    queueSync(workspace.trip.id, workspace.trip.latestSeq, [
      {
        clientOpId: crypto.randomUUID(),
        hlcTimestamp: hlc,
        baseSeq: workspace.trip.latestSeq,
        entityType: 'itinerary_item',
        entityId: item.id,
        action: 'upsert',
        payload: buildItemUpsertPayload(item),
      },
    ]);
    notify(`Saved "${place.name}" to Shortlist.`);
  };

  const handleAddManualStop = (input: {
    title: string;
    kind: ItemKind;
    startTime: string | null;
  }) => {
    if (!workspace) return;
    const targetDayId = currentDay?.id ?? activeDays[0]?.id ?? null;
    const existingStops = targetDayId
      ? getOrderedStopsForDay(workspace.items, targetDayId)
      : [];
    const lastKey =
      existingStops.length > 0
        ? existingStops[existingStops.length - 1]!.sortKey
        : null;
    const hlc = nextClientHlc();

    const newItem: ItineraryItem = {
      id: crypto.randomUUID(),
      tripId: workspace.trip.id,
      dayId: targetDayId,
      kind: input.kind,
      title: input.title,
      notes: '',
      lat: null,
      lng: null,
      placeRefId: null,
      addressLocalScript: null,
      sortKey: midpointSortKey(lastKey, null),
      startTime: input.startTime,
      durationMins: 60,
      transitMeta: {},
      dietaryFlags: [],
      accessibilityNotes: '',
      elderSummaryI18n: {
        en: `${input.startTime ? `${input.startTime} — ` : ''}${input.title}`,
      },
      isShortlist: false,
      serverSeq: workspace.trip.latestSeq + 1,
      hlcTimestamp: hlc,
      deletedAt: null,
      googleMapsUrl: null,
    };

    mutateWorkspace((prev) => ({
      ...prev,
      items: [...prev.items, newItem],
    }));
    setHighlightedStopId(newItem.id);
    queueSync(workspace.trip.id, workspace.trip.latestSeq, [
      {
        clientOpId: crypto.randomUUID(),
        hlcTimestamp: hlc,
        baseSeq: workspace.trip.latestSeq,
        entityType: 'itinerary_item',
        entityId: newItem.id,
        action: 'upsert',
        payload: buildItemUpsertPayload(newItem),
      },
    ]);
  };

  const handleOpenQuickShare = async () => {
    if (!workspace) return;
    setQuickShareOpen(true);
    const origin =
      typeof window !== 'undefined'
        ? window.location.origin
        : 'https://itinbee.com';
    if (SAMPLE_WORKSPACES[workspace.trip.shortId] || isCloudTrip) {
      setClaimedShareUrl(`${origin}/t/${workspace.trip.shortId}`);
      return;
    }
    setClaimingShare(true);
    try {
      const synced = await upgradeDraftToCloud(workspace);
      setClaimedShareUrl(`${origin}/t/${synced.trip.shortId}`);
    } catch {
      setClaimedShareUrl(`${origin}/t/${workspace.trip.shortId}`);
    } finally {
      setClaimingShare(false);
    }
  };

  const copyQuick = async (field: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedQuickField(field);
    setTimeout(
      () => setCopiedQuickField((curr) => (curr === field ? null : curr)),
      2000
    );
  };

  if (resolvingLocal) {
    return (
      <div className="on-paper flex flex-1 items-center justify-center bg-[#FAF4E6] p-8 text-navy">
        <div className="flex items-center gap-3 text-[15px] font-semibold">
          <span className="spinner text-trunk" aria-hidden="true" />
          <span>Opening your itinerary workspace…</span>
        </div>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="on-paper flex flex-1 flex-col items-center justify-center bg-[#FAF4E6] px-6 py-16 text-center text-navy">
        <h1 className="display text-[38px] leading-none text-navy">
          Trip not found
        </h1>
        <p className="mt-3 max-w-md text-[15px] text-paper-ink">
          We couldn&rsquo;t find an itinerary with ID{' '}
          <code className="rounded bg-paper px-1.5 py-0.5 font-mono text-[13px] text-navy">
            {requestedId}
          </code>{' '}
          on the server or in this browser&rsquo;s offline drafts.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link href="/create" className="btn-stamp">
            Create a new trip
          </Link>
          <Link
            href="/explore"
            className="btn-line border-navy text-navy"
          >
            Browse templates
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[#FAF4E6] text-navy lg:h-dvh lg:overflow-hidden">
      <EditorHeader
        trip={workspace.trip}
        dayCount={activeDays.length}
        bookingCount={workspace.bookings.length}
        expenseCount={workspace.expenses.length}
        pollCount={workspace.polls.length}
        activeMode={activeMode}
        isOnline={isOnline}
        wsConnected={wsConnected}
        isCloudTrip={isCloudTrip}
        onSelectMode={(next) => setActiveMode(next)}
        onUpdateTitle={(newTitle) => {
          mutateWorkspace((prev) => ({
            ...prev,
            trip: { ...prev.trip, title: newTitle },
          }));
          if (isCloudTrip) {
            void updateTripMeta(workspace.trip.id, { title: newTitle });
          }
          notify('Updated trip title.');
        }}
        onOpenQuickShare={() => void handleOpenQuickShare()}
      />

      {/* Warm Paper Working Surface (.on-paper enables high-contrast #14213D focus rings) */}
      <main
        id="editor-main"
        className={`on-paper flex min-h-0 flex-1 flex-col bg-[#FAF4E6] text-navy ${
          activeMode === 'plan' ? 'lg:overflow-hidden' : 'lg:overflow-y-auto'
        }`}
      >
        {activeMode === 'plan' ? (
          <>
            {/* Mobile Segmented Switcher: Plan | Places | Map */}
            <div
              role="group"
              aria-label="Mobile workspace pane switcher"
              className="sticky top-0 z-20 grid grid-cols-3 gap-1 border-b border-navy/15 bg-[#FFFDF8] p-2 lg:hidden"
            >
              {(
                [
                  { id: 'plan', label: 'Plan', Icon: FileText },
                  { id: 'places', label: 'Places', Icon: Compass },
                  { id: 'map', label: 'Map', Icon: MapIcon },
                ] as const
              ).map((tab) => {
                const Icon = tab.Icon;
                const active = mobilePane === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setMobilePane(tab.id)}
                    aria-pressed={active}
                    className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border text-[14px] font-bold transition-colors ${
                      active
                        ? 'border-2 border-navy bg-saffron text-navy'
                        : 'border-transparent bg-transparent text-navy hover:bg-paper'
                    }`}
                  >
                    <Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* 3-Pane Desktop Grid */}
            <div className="grid min-h-0 flex-1 grid-cols-1 lg:h-full lg:grid-cols-[minmax(340px,1.08fr)_minmax(330px,0.96fr)_minmax(340px,1.08fr)] lg:overflow-hidden">
              {/* Pane 1: Day Timeline */}
              <div
                className={`min-h-0 border-navy/15 lg:h-full lg:overflow-y-auto lg:border-r ${
                  mobilePane === 'plan' ? 'block' : 'hidden lg:block'
                }`}
              >
                <TimelinePane
                  workspace={workspace}
                  activeDays={activeDays}
                  currentDay={currentDay}
                  highlightedStopId={highlightedStopId}
                  candidates={candidates}
                  routeLegsByPairKey={routeLegsByPairKey}
                  onSelectDay={(dayId) => setSelectedDayId(dayId)}
                  onAddDay={handleAddDay}
                  onDeleteDay={handleDeleteDay}
                  onUpdateDay={handleUpdateDay}
                  onHighlightStop={(stopId) => setHighlightedStopId(stopId)}
                  onReorderStops={(dayId, fromIdx, toIdx) => {
                    const nextItems = reorderStopsInDay(
                      workspace.items,
                      dayId,
                      fromIdx,
                      toIdx
                    );
                    mutateWorkspace((prev) => ({
                      ...prev,
                      items: nextItems,
                    }));
                    const prevById = new Map(workspace.items.map((i) => [i.id, i]));
                    const changed = nextItems.filter((item) => {
                      const before = prevById.get(item.id);
                      return before && before.sortKey !== item.sortKey;
                    });
                    if (changed.length > 0) {
                      queueSync(
                        workspace.trip.id,
                        workspace.trip.latestSeq,
                        changed.map((item) => ({
                          clientOpId: crypto.randomUUID(),
                          hlcTimestamp: item.hlcTimestamp,
                          baseSeq: workspace.trip.latestSeq,
                          entityType: 'itinerary_item',
                          entityId: item.id,
                          action: 'upsert',
                          payload: buildItemUpsertPayload(item),
                        }))
                      );
                    }
                  }}
                  onMoveStopOffset={(dayId, stopId, delta) => {
                    const nextItems = moveStopByOffset(
                      workspace.items,
                      dayId,
                      stopId,
                      delta
                    );
                    mutateWorkspace((prev) => ({
                      ...prev,
                      items: nextItems,
                    }));
                    const moved = nextItems.find((i) => i.id === stopId);
                    if (moved) {
                      queueSync(workspace.trip.id, workspace.trip.latestSeq, [
                        {
                          clientOpId: crypto.randomUUID(),
                          hlcTimestamp: moved.hlcTimestamp,
                          baseSeq: workspace.trip.latestSeq,
                          entityType: 'itinerary_item',
                          entityId: moved.id,
                          action: 'upsert',
                          payload: buildItemUpsertPayload(moved),
                        },
                      ]);
                    }
                  }}
                  onMoveStopToDay={(stopId, targetDayId) => {
                    const nextItems = moveStopToDay(
                      workspace.items,
                      stopId,
                      targetDayId
                    );
                    mutateWorkspace((prev) => ({
                      ...prev,
                      items: nextItems,
                    }));
                    const moved = nextItems.find((i) => i.id === stopId);
                    if (moved) {
                      queueSync(workspace.trip.id, workspace.trip.latestSeq, [
                        {
                          clientOpId: crypto.randomUUID(),
                          hlcTimestamp: moved.hlcTimestamp,
                          baseSeq: workspace.trip.latestSeq,
                          entityType: 'itinerary_item',
                          entityId: moved.id,
                          action: 'upsert',
                          payload: buildItemUpsertPayload(moved),
                        },
                      ]);
                    }
                    const targetNum =
                      activeDays.find((d) => d.id === targetDayId)?.dayNumber ?? 1;
                    notify(`Moved stop to Day ${targetNum}.`);
                  }}
                  onUpdateStop={(stopId, patch) => {
                    const hlc = nextClientHlc();
                    const existing = workspace.items.find((i) => i.id === stopId);
                    mutateWorkspace((prev) => ({
                      ...prev,
                      items: prev.items.map((i) =>
                        i.id === stopId ? { ...i, ...patch, hlcTimestamp: hlc } : i
                      ),
                    }));
                    if (existing) {
                      const updated: ItineraryItem = {
                        ...existing,
                        ...patch,
                        hlcTimestamp: hlc,
                      };
                      queueSync(workspace.trip.id, workspace.trip.latestSeq, [
                        {
                          clientOpId: crypto.randomUUID(),
                          hlcTimestamp: hlc,
                          baseSeq: workspace.trip.latestSeq,
                          entityType: 'itinerary_item',
                          entityId: stopId,
                          action: 'upsert',
                          payload: buildItemUpsertPayload(updated),
                        },
                      ]);
                    }
                  }}
                  onRemoveStop={(stopId) => {
                    const nowIso = new Date().toISOString();
                    const hlc = nextClientHlc();
                    mutateWorkspace((prev) => ({
                      ...prev,
                      items: prev.items.map((i) =>
                        i.id === stopId
                          ? { ...i, deletedAt: nowIso, hlcTimestamp: hlc }
                          : i
                      ),
                    }));
                    queueSync(workspace.trip.id, workspace.trip.latestSeq, [
                      {
                        clientOpId: crypto.randomUUID(),
                        hlcTimestamp: hlc,
                        baseSeq: workspace.trip.latestSeq,
                        entityType: 'itinerary_item',
                        entityId: stopId,
                        action: 'delete',
                        payload: {},
                      },
                    ]);
                  }}
                  onAddManualStop={handleAddManualStop}
                  onPromoteShortlist={(shortlistId, targetDayId) => {
                    const promotedWs = promoteShortlistItemToDay(
                      workspace,
                      shortlistId,
                      targetDayId
                    );
                    mutateWorkspace(() => promotedWs);
                    const promotedItem = promotedWs.items.find(
                      (i) => i.id === shortlistId
                    );
                    if (promotedItem) {
                      queueSync(workspace.trip.id, workspace.trip.latestSeq, [
                        {
                          clientOpId: crypto.randomUUID(),
                          hlcTimestamp: promotedItem.hlcTimestamp,
                          baseSeq: workspace.trip.latestSeq,
                          entityType: 'itinerary_item',
                          entityId: promotedItem.id,
                          action: 'upsert',
                          payload: buildItemUpsertPayload(promotedItem),
                        },
                      ]);
                    }
                    const targetNum =
                      activeDays.find((d) => d.id === targetDayId)?.dayNumber ?? 1;
                    notify(`Moved shortlisted place to Day ${targetNum}.`);
                  }}
                  onRemoveShortlist={(shortlistId) => {
                    const hlc = nextClientHlc();
                    mutateWorkspace((prev) => ({
                      ...prev,
                      shortlist: prev.shortlist.filter(
                        (s) => s.id !== shortlistId
                      ),
                    }));
                    queueSync(workspace.trip.id, workspace.trip.latestSeq, [
                      {
                        clientOpId: crypto.randomUUID(),
                        hlcTimestamp: hlc,
                        baseSeq: workspace.trip.latestSeq,
                        entityType: 'itinerary_item',
                        entityId: shortlistId,
                        action: 'delete',
                        payload: {},
                      },
                    ]);
                  }}
                  onLegResolved={(pairKey, leg) => {
                    setRouteLegsByPairKey((prev) =>
                      prev[pairKey]?.key === leg.key &&
                      prev[pairKey]?.source === leg.source
                        ? prev
                        : { ...prev, [pairKey]: leg }
                    );
                  }}
                  onApplyAssistProposal={(nextWs, summaryMsg, mutations) => {
                    mutateWorkspace(() => nextWs);
                    if (mutations.length > 0) {
                      queueSync(
                        workspace.trip.id,
                        workspace.trip.latestSeq,
                        mutations
                      );
                    }
                    notify(summaryMsg);
                  }}
                />
              </div>

              {/* Pane 2: Explore Places Discovery */}
              <div
                className={`min-h-0 border-navy/15 lg:h-full lg:overflow-y-auto lg:border-r ${
                  mobilePane === 'places' ? 'block' : 'hidden lg:block'
                }`}
              >
                <ExplorePlacesPanel
                  trip={workspace.trip}
                  items={workspace.items}
                  shortlist={workspace.shortlist}
                  activeDay={currentDay}
                  mapSearchBbox={mapSearchBbox}
                  onAddPlaceToDay={(place, dayId) =>
                    handleAddDiscoveredPlaceToDay(place, dayId)
                  }
                  onToggleShortlistPlace={handleToggleShortlistPlace}
                  onCandidatesLoaded={(loaded, center) => {
                    setCandidates(loaded);
                    if (center) setDestinationCenter(center);
                  }}
                  onHoverCandidate={setHoveredCandidateId}
                />
              </div>

              {/* Pane 3: Interactive OpenFreeMap / Schematic Route Map */}
              <div
                className={`min-h-0 h-[calc(100dvh-11rem)] lg:h-full lg:overflow-hidden ${
                  mobilePane === 'map' ? 'block' : 'hidden lg:block'
                }`}
              >
                <TripMap
                  days={workspace.days}
                  items={workspace.items}
                  activeDayId={currentDay?.id ?? null}
                  highlightedStopId={highlightedStopId}
                  candidates={candidates}
                  hoveredCandidateId={hoveredCandidateId}
                  routeLegsByPairKey={routeLegsByPairKey}
                  centerHint={effectiveMapCenter}
                  onSelectStop={(stopId, dayId) => {
                    setHighlightedStopId(stopId);
                    if (dayId) setSelectedDayId(dayId);
                  }}
                  onHoverStop={(stopId) => {
                    if (stopId) setHighlightedStopId(stopId);
                  }}
                  onAddCandidateToDay={(place, dayId) =>
                    handleAddDiscoveredPlaceToDay(place, dayId)
                  }
                  onSearchArea={(bbox) => {
                    setMapSearchBbox(bbox);
                    if (mobilePane === 'map') {
                      notify('Updated Places panel to this map area.');
                    }
                  }}
                />
              </div>
            </div>
          </>
        ) : activeMode === 'bookings' ? (
          <BookingsTab
            workspace={workspace}
            currentDay={currentDay}
            isCloudSynced={isCloudTrip}
            onUpdateWorkspace={mutateWorkspace}
            onQueueSync={queueSync}
            onNotify={notify}
          />
        ) : activeMode === 'budget' ? (
          <BudgetTab
            workspace={workspace}
            isCloudSynced={isCloudTrip}
            onUpdateWorkspace={mutateWorkspace}
            onNotify={notify}
          />
        ) : activeMode === 'group' ? (
          <GroupTab
            workspace={workspace}
            isCloudSynced={isCloudTrip}
            onUpdateWorkspace={mutateWorkspace}
            onNotify={notify}
          />
        ) : (
          <ShareTab
            workspace={workspace}
            isCloudSynced={isCloudTrip}
            onUpgradeToCloud={upgradeDraftToCloud}
            onUpdateWorkspace={mutateWorkspace}
            onNotify={notify}
          />
        )}
      </main>

      {/* Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          className="fixed bottom-5 right-4 z-40 rounded-lg border border-saffron/40 bg-trunk-dark px-4 py-2.5 text-[13.5px] font-semibold text-paper shadow-dialog"
        >
          {toastMessage}
        </div>
      )}

      {/* Quick Share & QR PDF Modal */}
      <ModalDialog
        open={quickShareOpen}
        onClose={() => setQuickShareOpen(false)}
        title="Share Itinerary on WhatsApp"
      >
        <div className="on-paper space-y-4 text-[13.5px] text-navy">
          <p className="text-paper-ink">
            Co-travellers and family members can view the schedule, toggle the Hindi/English Elder Card, and vote on polls with zero login.
          </p>

          <div className="flex gap-2">
            <label htmlFor="quick-share-url" className="sr-only">
              Shareable guest URL
            </label>
            <input
              id="quick-share-url"
              type="text"
              readOnly
              value={claimingShare ? 'Syncing draft…' : claimedShareUrl ?? ''}
              className="field min-w-0 flex-1 font-mono text-[12.5px]"
            />
            <button
              type="button"
              disabled={!claimedShareUrl}
              onClick={() =>
                claimedShareUrl && void copyQuick('url', claimedShareUrl)
              }
              className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border-2 border-navy bg-navy px-3.5 py-1.5 font-bold text-[#FFFDF8]"
            >
              {copiedQuickField === 'url' ? (
                <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              )}
              <span>{copiedQuickField === 'url' ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          {copiedQuickField === 'url' && (
            <p role="status" className="text-[12px] font-semibold text-jade">
              Copied share link to clipboard.
            </p>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() =>
                void exportItineraryWithLiveQrPdf({
                  trip: workspace.trip,
                  days: workspace.days,
                  items: workspace.items,
                  liveShareUrl:
                    claimedShareUrl ||
                    `https://itinbee.com/t/${workspace.trip.shortId}`,
                })
              }
              className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg border border-navy/35 bg-[#FFFDF8] px-3 py-2 font-semibold text-navy hover:bg-paper"
            >
              <Download className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              <span>Download QR PDF</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setQuickShareOpen(false);
                setActiveMode('share');
              }}
              className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg border border-navy/35 bg-paper px-3 py-2 font-semibold text-navy hover:bg-paper-dark"
            >
              <span>Elder Card &amp; Publish</span>
            </button>
          </div>
        </div>
      </ModalDialog>
    </div>
  );
}
