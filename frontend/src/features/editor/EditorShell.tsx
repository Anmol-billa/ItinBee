'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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
import { browserApiBase } from '@/lib/api-base';
import {
  claimSandboxToCloud,
  pushSyncMutations,
  resolveWsBaseUrl,
  type SyncClientMutationInput,
} from '@/lib/api-client';
import {
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
import type { DiscoveredPlace } from './places-discovery';

interface EditorShellProps {
  initialWorkspace: TripWorkspace | null;
  requestedId: string;
}

type MobilePlanPane = 'plan' | 'places' | 'map';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function EditorShell({
  initialWorkspace,
  requestedId,
}: EditorShellProps) {
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
  } | null>(null);
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

  // Client-side IndexedDB + authenticated guest fallback when SSR had no workspace (or local edits are newer)
  useEffect(() => {
    let cancelled = false;

    const resolveWorkspace = async () => {
      if (initialWorkspace) {
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

      // 3. Try browser-side fetch with guest cookies
      try {
        const res = await fetch(
          `${browserApiBase()}/v1/trips/${encodeURIComponent(requestedId)}`,
          { credentials: 'include' }
        );
        if (res.ok && !cancelled) {
          const cloudWs = (await res.json()) as TripWorkspace;
          setWorkspace(cloudWs);
          setSelectedDayId(cloudWs.days.find((d) => !d.deletedAt)?.id ?? '');
          setResolvingLocal(false);
          return;
        }
      } catch {
        // Offline or not found
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

  // Persist every workspace update to IndexedDB automatically
  useEffect(() => {
    if (!workspace) return;
    void saveLocalWorkspace(`trip:${workspace.trip.id}`, workspace);
    if (workspace.trip.shortId) {
      void saveLocalWorkspace(`sandbox:${workspace.trip.shortId}`, workspace);
    }
  }, [workspace]);

  // Connect live WebSocket room when online on a cloud trip
  useEffect(() => {
    if (!workspace || !isCloudTrip || typeof window === 'undefined') return;
    let cancelled = false;
    let ws: WebSocket | null = null;
    resolveWsBaseUrl()
      .then((wsBase) => {
        if (cancelled) return;
        try {
          ws = new WebSocket(`${wsBase}/v1/trips/${workspace.trip.id}/live`);
          ws.onopen = () => setWsConnected(true);
          ws.onclose = () => setWsConnected(false);
          ws.onerror = () => setWsConnected(false);
        } catch {
          setWsConnected(false);
        }
      })
      .catch(() => setWsConnected(false));

    return () => {
      cancelled = true;
      ws?.close();
    };
  }, [workspace?.trip.id, isCloudTrip]);

  const queueSync = useCallback(
    (tripId: string, baseSeq: number, mutations: SyncClientMutationInput[]) => {
      if (!isCloudTrip || mutations.length === 0) return;
      pushSyncMutations(tripId, baseSeq, mutations).catch(() => {});
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
    notify(`Added Day ${nextNum}.`);
  };

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
    const existing = workspace.days.find((d) => d.id === dayId);
    if (existing) {
      queueSync(workspace.trip.id, workspace.trip.latestSeq, [
        {
          clientOpId: crypto.randomUUID(),
          hlcTimestamp: hlc,
          baseSeq: workspace.trip.latestSeq,
          entityType: 'trip_day',
          entityId: dayId,
          action: 'upsert',
          payload: {
            dayNumber: existing.dayNumber,
            themeTitle: patch.themeTitle ?? existing.themeTitle,
            pacingLevel: patch.pacingLevel ?? existing.pacingLevel,
            date: patch.date !== undefined ? patch.date : existing.date,
          },
        },
      ]);
    }
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
        payload: {
          dayId: newItem.dayId,
          kind: newItem.kind,
          title: newItem.title,
          notes: newItem.notes,
          lat: newItem.lat,
          lng: newItem.lng,
          placeRefId: newItem.placeRefId,
          sortKey: newItem.sortKey,
          durationMins: newItem.durationMins,
        },
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
      mutateWorkspace((prev) => ({
        ...prev,
        shortlist: prev.shortlist.filter((s) => s.id !== existing.id),
      }));
      notify(`Removed "${place.name}" from Shortlist.`);
      return;
    }

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
      hlcTimestamp: nextClientHlc(),
      deletedAt: null,
      googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`,
    };

    mutateWorkspace((prev) => ({
      ...prev,
      shortlist: [...prev.shortlist, item],
    }));
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
        payload: {
          dayId: newItem.dayId,
          kind: newItem.kind,
          title: newItem.title,
          sortKey: newItem.sortKey,
          startTime: newItem.startTime,
        },
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
      const synced = await claimSandboxToCloud(workspace);
      setWorkspace(synced);
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
        isLiveSynced={wsConnected || (isOnline && isCloudTrip)}
        onSelectMode={(next) => setActiveMode(next)}
        onUpdateTitle={(newTitle) => {
          mutateWorkspace((prev) => ({
            ...prev,
            trip: { ...prev.trip, title: newTitle },
          }));
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
                  onUpdateDay={handleUpdateDay}
                  onHighlightStop={(stopId) => setHighlightedStopId(stopId)}
                  onReorderStops={(dayId, fromIdx, toIdx) => {
                    mutateWorkspace((prev) => ({
                      ...prev,
                      items: reorderStopsInDay(prev.items, dayId, fromIdx, toIdx),
                    }));
                  }}
                  onMoveStopOffset={(dayId, stopId, delta) => {
                    mutateWorkspace((prev) => ({
                      ...prev,
                      items: moveStopByOffset(prev.items, dayId, stopId, delta),
                    }));
                  }}
                  onMoveStopToDay={(stopId, targetDayId) => {
                    mutateWorkspace((prev) => ({
                      ...prev,
                      items: moveStopToDay(prev.items, stopId, targetDayId),
                    }));
                    const targetNum =
                      activeDays.find((d) => d.id === targetDayId)?.dayNumber ?? 1;
                    notify(`Moved stop to Day ${targetNum}.`);
                  }}
                  onUpdateStop={(stopId, patch) => {
                    mutateWorkspace((prev) => ({
                      ...prev,
                      items: prev.items.map((i) =>
                        i.id === stopId
                          ? { ...i, ...patch, hlcTimestamp: nextClientHlc() }
                          : i
                      ),
                    }));
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
                    mutateWorkspace((prev) =>
                      promoteShortlistItemToDay(prev, shortlistId, targetDayId)
                    );
                    const targetNum =
                      activeDays.find((d) => d.id === targetDayId)?.dayNumber ?? 1;
                    notify(`Moved shortlisted place to Day ${targetNum}.`);
                  }}
                  onRemoveShortlist={(shortlistId) => {
                    mutateWorkspace((prev) => ({
                      ...prev,
                      shortlist: prev.shortlist.filter(
                        (s) => s.id !== shortlistId
                      ),
                    }));
                  }}
                  onLegResolved={(pairKey, leg) => {
                    setRouteLegsByPairKey((prev) =>
                      prev[pairKey]?.key === leg.key &&
                      prev[pairKey]?.source === leg.source
                        ? prev
                        : { ...prev, [pairKey]: leg }
                    );
                  }}
                  onApplyAssistProposal={(nextWs, summaryMsg) => {
                    mutateWorkspace(() => nextWs);
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
                  centerHint={destinationCenter}
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
            onNotify={notify}
          />
        ) : activeMode === 'budget' ? (
          <BudgetTab
            workspace={workspace}
            onUpdateWorkspace={mutateWorkspace}
            onNotify={notify}
          />
        ) : activeMode === 'group' ? (
          <GroupTab
            workspace={workspace}
            onUpdateWorkspace={mutateWorkspace}
            onNotify={notify}
          />
        ) : (
          <ShareTab
            workspace={workspace}
            isCloudSynced={isCloudTrip}
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
