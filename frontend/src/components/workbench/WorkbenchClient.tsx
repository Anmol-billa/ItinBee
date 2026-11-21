'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Bus,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  FolderLock,
  IndianRupee,
  ListChecks,
  Map as MapIcon,
  MapPin,
  Plane,
  Plus,
  Share2,
  ShieldCheck,
  Train,
  Trash2,
  Vote,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { ScoutBeeMark } from '@/components/mascot/ScoutBeeMark';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { LazyRouteMap } from '@/components/map/LazyRouteMap';
import { ElderCardView } from '@/components/share/ElderCardView';
import {
  createBlankSandboxWorkspace,
  SAMPLE_WORKSPACES,
} from '@/data/sample-trips';
import {
  castGuestPollVote,
  claimSandboxToCloud,
  ingestTicketOrReelText,
  pushSyncMutations,
  resolveWsBaseUrl,
  searchOpenPlaces,
} from '@/lib/api-client';
import {
  computeLocalSettlements,
  encryptAndCacheTicketOffline,
  loadLocalWorkspace,
  midpointSortKey,
  nextClientHlc,
  REFERENCE_FX_TO_INR,
  saveLocalWorkspace,
} from '@/lib/offline-db';
import { exportItineraryWithLiveQrPdf } from '@/lib/pdf-export';
import { runAccessibleViewTransition } from '@/lib/view-transition';
import type {
  CurrencyCode,
  ExpenseView,
  ItemKind,
  ItineraryItem,
  OpenPoiResult,
  SplitMode,
  TripWorkspace,
  UpiSettlementInstruction,
} from '@/lib/types';

type ActiveSection = 'timeline' | 'polls' | 'ledger' | 'vault';

interface WorkbenchClientProps {
  initialWorkspace: TripWorkspace;
  mode: 'sandbox-home' | 'cloud-trip';
}

const SAMPLE_IRCTC_SNIPPET =
  'IRCTC PNR: 2849105842 Train: 12017 DEHRADUN SHTBDI DOJ: 12-12-2026 NDLS 06:45 to HW 11:15CNF/C4/25/WS Passenger: R Sharma Aadhaar 4912 8834 9021';

const SAMPLE_REEL_SNIPPET =
  'Instagram Reel: Morning bun omelette at Chaar Dukan Landour, sunset walk to Lal Tibba Mussoorie & dinner at Cafe Ivy Landour #uttarakhand';

const SAMPLE_KEYS = [
  { key: 'rishi-lnd-4d', label: 'Rishikesh & Landour' },
  { key: 'goa-south-5d', label: 'South Goa' },
  { key: 'kashi-snr-3d', label: 'Varanasi Senior' },
  { key: 'vietnam-7d', label: 'Vietnam 7D' },
] as const;

export function WorkbenchClient({ initialWorkspace, mode }: WorkbenchClientProps) {
  const [activeSampleKey, setActiveSampleKey] = useState<string>(
    initialWorkspace.trip.shortId || 'rishi-lnd-4d'
  );
  const [workspace, setWorkspace] = useState<TripWorkspace>(initialWorkspace);
  const [selectedDayId, setSelectedDayId] = useState<string>(
    initialWorkspace.days[0]?.id ?? ''
  );
  const [activeSection, setActiveSection] = useState<ActiveSection>('timeline');
  const [mobilePane, setMobilePane] = useState<'work' | 'map'>('work');
  const [elderPreview, setElderPreview] = useState(false);
  const [highlightedStopId, setHighlightedStopId] = useState<string | null>(
    initialWorkspace.items[0]?.id ?? null
  );

  // Network & sync telemetry
  const [isOnline, setIsOnline] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [offlineSavedCount, setOfflineSavedCount] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Scout ingestion state
  const [scoutText, setScoutText] = useState('');
  const [scoutBusy, setScoutBusy] = useState(false);
  const [scoutBanner, setScoutBanner] = useState<{
    headline: string;
    amberWarning: boolean;
    redactions: number;
  } | null>(null);

  // Add Stop + Open POI search
  const [newStopTitle, setNewStopTitle] = useState('');
  const [newStopTime, setNewStopTime] = useState('09:30');
  const [newStopKind, setNewStopKind] = useState<ItemKind>('activity');
  const [poiSuggestions, setPoiSuggestions] = useState<OpenPoiResult[]>([]);

  // Polls state
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptA, setPollOptA] = useState('');
  const [pollOptB, setPollOptB] = useState('');
  const [voterName, setVoterName] = useState('Rohan');

  // UPI Expense state
  const [expTitle, setExpTitle] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expCurrency, setExpCurrency] = useState<CurrencyCode>('INR');
  const [expPaidBy, setExpPaidBy] = useState<string>(
    initialWorkspace.members[0]?.userId ?? ''
  );
  const [expSplitMode, setExpSplitMode] = useState<SplitMode>('equal');
  const [expExcludeTag, setExpExcludeTag] = useState<string>('vegetarian');

  // Dialogs
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [claimedShareUrl, setClaimedShareUrl] = useState<string | null>(null);
  const [claimingShare, setClaimingShare] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [activeSettlement, setActiveSettlement] =
    useState<UpiSettlementInstruction | null>(null);
  const [settlementQrUrl, setSettlementQrUrl] = useState<string | null>(null);

  // Vault offline file encryption
  const [vaultPassphrase, setVaultPassphrase] = useState('1234');
  const [vaultEncryptedFiles, setVaultEncryptedFiles] = useState<
    Array<{ id: string; fileName: string; byteLength: number }>
  >([]);

  const notify = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 3200);
  }, []);

  // Register PWA Service Worker & online status
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

  // Load persisted sandbox draft if present
  useEffect(() => {
    if (mode !== 'sandbox-home') return;
    let cancelled = false;
    loadLocalWorkspace(`sandbox:${activeSampleKey}`).then((saved) => {
      if (cancelled) return;
      if (saved) {
        setWorkspace(saved);
        setSelectedDayId(saved.days.find((d) => !d.deletedAt)?.id ?? '');
      } else if (SAMPLE_WORKSPACES[activeSampleKey]) {
        const fresh = structuredClone(SAMPLE_WORKSPACES[activeSampleKey]!);
        setWorkspace(fresh);
        setSelectedDayId(fresh.days[0]?.id ?? '');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeSampleKey, mode]);

  // Persist local IndexedDB on every workspace update
  useEffect(() => {
    const key =
      mode === 'sandbox-home'
        ? `sandbox:${activeSampleKey}`
        : `trip:${workspace.trip.id}`;
    saveLocalWorkspace(key, workspace)
      .then(() => setOfflineSavedCount((c) => c + 1))
      .catch(() => {});
  }, [workspace, activeSampleKey, mode]);

  // Live WebSocket room connection when viewing a cloud trip
  useEffect(() => {
    if (mode !== 'cloud-trip' || typeof window === 'undefined') return;
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
  }, [mode, workspace.trip.id]);

  // Open POI autocomplete search
  useEffect(() => {
    const q = newStopTitle.trim();
    if (q.length < 2) {
      setPoiSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      searchOpenPlaces(q)
        .then((res) => setPoiSuggestions(res.slice(0, 5)))
        .catch(() => setPoiSuggestions([]));
    }, 180);
    return () => clearTimeout(timer);
  }, [newStopTitle]);

  // Generate UPI QR image when settlement modal opens
  useEffect(() => {
    if (!activeSettlement?.qrPayload) {
      setSettlementQrUrl(null);
      return;
    }
    QRCode.toDataURL(activeSettlement.qrPayload, {
      margin: 1,
      width: 176,
      color: { dark: '#18181B', light: '#FFFFFF' },
    })
      .then(setSettlementQrUrl)
      .catch(() => setSettlementQrUrl(null));
  }, [activeSettlement]);

  const activeDays = useMemo(
    () =>
      workspace.days
        .filter((d) => !d.deletedAt)
        .sort((a, b) => a.dayNumber - b.dayNumber),
    [workspace.days]
  );

  const currentDay = useMemo(
    () => activeDays.find((d) => d.id === selectedDayId) ?? activeDays[0] ?? null,
    [activeDays, selectedDayId]
  );

  const currentDayStops = useMemo(() => {
    if (!currentDay) return [];
    return workspace.items
      .filter((i) => i.dayId === currentDay.id && !i.deletedAt)
      .sort((a, b) =>
        a.sortKey === b.sortKey
          ? a.id.localeCompare(b.id)
          : a.sortKey.localeCompare(b.sortKey)
      );
  }, [workspace.items, currentDay]);

  const allVisibleStops = useMemo(
    () => workspace.items.filter((i) => !i.deletedAt),
    [workspace.items]
  );

  const settlements = useMemo(
    () => computeLocalSettlements(workspace),
    [workspace]
  );

  const bookingByItem = useMemo(
    () =>
      new Map(
        workspace.bookings
          .filter((b) => b.itemId)
          .map((b) => [b.itemId as string, b])
      ),
    [workspace.bookings]
  );

  const switchSection = (next: ActiveSection) => {
    runAccessibleViewTransition(() => {
      setActiveSection(next);
      setElderPreview(false);
    }, '#workbench-stage-heading');
  };

  const handleSelectSample = (sampleKey: string) => {
    runAccessibleViewTransition(() => {
      setClaimedShareUrl(null);
      setElderPreview(false);
      setActiveSampleKey(sampleKey);
    }, '#workbench-stage-heading');
  };

  const handleStartBlankTrip = () => {
    const blank = createBlankSandboxWorkspace('New India Trip');
    runAccessibleViewTransition(() => {
      setClaimedShareUrl(null);
      setElderPreview(false);
      setActiveSampleKey(blank.trip.shortId);
      setWorkspace(blank);
      setSelectedDayId(blank.days[0]?.id ?? '');
    }, '#workbench-stage-heading');
    notify('Started clean local sandbox in browser.');
  };

  const handleAddDay = () => {
    const nextNum = (activeDays[activeDays.length - 1]?.dayNumber ?? 0) + 1;
    const newDay = {
      id: crypto.randomUUID(),
      tripId: workspace.trip.id,
      dayNumber: nextNum,
      date: null,
      themeTitle: `Day ${nextNum} exploration`,
      pacingLevel: 'moderate' as const,
      serverSeq: workspace.trip.latestSeq + 1,
      hlcTimestamp: nextClientHlc(),
      deletedAt: null,
    };
    setWorkspace((prev) => ({
      ...prev,
      days: [...prev.days, newDay],
    }));
    setSelectedDayId(newDay.id);
    if (mode === 'cloud-trip') {
      pushSyncMutations(workspace.trip.id, workspace.trip.latestSeq, [
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
      ]).catch(() => {});
    }
  };

  const appendStopToCurrentDay = (partial: {
    title: string;
    kind: ItemKind;
    startTime: string | null;
    lat?: number | null;
    lng?: number | null;
    notes?: string;
    addressLocalScript?: string | null;
    dietaryFlags?: string[];
    accessibilityNotes?: string;
    googleMapsUrl?: string | null;
  }) => {
    const targetDayId = currentDay?.id ?? activeDays[0]?.id ?? null;
    const lastKey =
      currentDayStops[currentDayStops.length - 1]?.sortKey ?? null;
    const newItem: ItineraryItem = {
      id: crypto.randomUUID(),
      tripId: workspace.trip.id,
      dayId: targetDayId,
      kind: partial.kind,
      title: partial.title,
      notes: partial.notes ?? '',
      lat: partial.lat ?? null,
      lng: partial.lng ?? null,
      placeRefId: null,
      addressLocalScript: partial.addressLocalScript ?? null,
      sortKey: midpointSortKey(lastKey, null),
      startTime: partial.startTime,
      durationMins: 60,
      transitMeta:
        partial.lat && currentDayStops.length > 0
          ? { mode: 'highway_cab', estimatedDurationMins: 35 }
          : {},
      dietaryFlags: partial.dietaryFlags ?? [],
      accessibilityNotes: partial.accessibilityNotes ?? '',
      elderSummaryI18n: { en: `${partial.startTime ? `${partial.startTime} — ` : ''}${partial.title}` },
      isShortlist: false,
      serverSeq: workspace.trip.latestSeq + 1,
      hlcTimestamp: nextClientHlc(),
      deletedAt: null,
      googleMapsUrl:
        partial.googleMapsUrl ??
        (partial.lat && partial.lng
          ? `https://www.google.com/maps/search/?api=1&query=${partial.lat},${partial.lng}`
          : null),
    };

    setWorkspace((prev) => ({
      ...prev,
      items: [...prev.items, newItem],
    }));
    setHighlightedStopId(newItem.id);

    if (mode === 'cloud-trip') {
      pushSyncMutations(workspace.trip.id, workspace.trip.latestSeq, [
        {
          clientOpId: crypto.randomUUID(),
          hlcTimestamp: newItem.hlcTimestamp,
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
            sortKey: newItem.sortKey,
            startTime: newItem.startTime,
          },
        },
      ]).catch(() => {});
    }
  };

  const handleManualAddStop = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStopTitle.trim()) return;
    appendStopToCurrentDay({
      title: newStopTitle.trim(),
      kind: newStopKind,
      startTime: newStopTime || null,
    });
    setNewStopTitle('');
    setPoiSuggestions([]);
  };

  const handleSelectPoiSuggestion = (poi: OpenPoiResult) => {
    appendStopToCurrentDay({
      title: `${poi.name} (${poi.city})`,
      kind: poi.category === 'hotel' ? 'stay' : poi.category === 'food' ? 'meal' : 'activity',
      startTime: newStopTime || null,
      lat: poi.lat,
      lng: poi.lng,
      notes: poi.address,
      addressLocalScript: poi.addressLocalScript ?? null,
      dietaryFlags: poi.dietaryHints,
      accessibilityNotes: poi.accessibilityNotes,
      googleMapsUrl: poi.googleMapsUrl,
    });
    setNewStopTitle('');
    setPoiSuggestions([]);
    notify(`Pinned ${poi.name} from open POI index.`);
  };

  const handleMoveStop = (stopId: string, direction: -1 | 1) => {
    const idx = currentDayStops.findIndex((s) => s.id === stopId);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= currentDayStops.length) return;

    const a = currentDayStops[idx]!;
    const b = currentDayStops[swapIdx]!;
    setWorkspace((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        if (item.id === a.id) return { ...item, sortKey: b.sortKey, hlcTimestamp: nextClientHlc() };
        if (item.id === b.id) return { ...item, sortKey: a.sortKey, hlcTimestamp: nextClientHlc() };
        return item;
      }),
    }));
  };

  const handleDeleteStop = (stopId: string) => {
    const nowIso = new Date().toISOString();
    setWorkspace((prev) => ({
      ...prev,
      items: prev.items.map((i) =>
        i.id === stopId ? { ...i, deletedAt: nowIso } : i
      ),
    }));
  };

  const handleScoutIngest = async (rawInput?: string) => {
    const text = (rawInput ?? scoutText).trim();
    if (!text) return;
    setScoutBusy(true);
    try {
      const result = await ingestTicketOrReelText(
        text,
        mode === 'cloud-trip' ? workspace.trip.id : undefined
      );

      if (result.parsedBooking) {
        const pb = result.parsedBooking;
        const targetDayId = currentDay?.id ?? activeDays[0]?.id ?? null;
        const newStopId = crypto.randomUUID();
        const lastKey =
          currentDayStops[currentDayStops.length - 1]?.sortKey ?? null;

        const newItem: ItineraryItem = {
          id: newStopId,
          tripId: workspace.trip.id,
          dayId: targetDayId,
          kind: pb.provider === 'airbnb' || pb.provider === 'mmt' ? 'stay' : 'transit',
          title: pb.suggestedTitle,
          notes: String(pb.summary.headline ?? 'Parsed confirmation'),
          lat: null,
          lng: null,
          placeRefId: null,
          addressLocalScript: null,
          sortKey: midpointSortKey(lastKey, null),
          startTime: pb.suggestedStartTime ?? '08:00',
          durationMins: 180,
          transitMeta: {
            mode:
              pb.provider === 'irctc'
                ? 'rail'
                : pb.provider === 'redbus'
                  ? 'bus'
                  : 'flight',
            coachOrTerminal: String(pb.summary.coach ?? pb.summary.terminalOrPlatform ?? ''),
            seatOrBerth: String(pb.summary.seatOrBerth ?? ''),
          },
          dietaryFlags: [],
          accessibilityNotes: '',
          elderSummaryI18n: { en: pb.suggestedTitle },
          isShortlist: false,
          serverSeq: workspace.trip.latestSeq + 1,
          hlcTimestamp: nextClientHlc(),
          deletedAt: null,
          googleMapsUrl: null,
        };

        const newBooking = {
          id: crypto.randomUUID(),
          tripId: workspace.trip.id,
          itemId: newStopId,
          provider: pb.provider,
          pnrMasked: pb.pnrMasked,
          pnrLast3: pb.pnrMasked ? pb.pnrMasked.slice(-3) : null,
          status: (pb.status as 'confirmed' | 'rac' | 'wl') || 'confirmed',
          summary: {
            headline: String(pb.summary.headline ?? pb.suggestedTitle),
            coach: pb.summary.coach ? String(pb.summary.coach) : undefined,
            seatOrBerth: pb.summary.seatOrBerth ? String(pb.summary.seatOrBerth) : undefined,
          },
          lowConfidenceFields: pb.lowConfidenceFields,
          parserConfidence: pb.parserConfidence,
          createdAt: new Date().toISOString(),
        };

        setWorkspace((prev) => ({
          ...prev,
          items: [...prev.items, newItem],
          bookings: [...prev.bookings, newBooking],
        }));

        setScoutBanner({
          headline: `Added ${pb.suggestedTitle}${pb.pnrMasked ? ` (${pb.pnrMasked})` : ''}`,
          amberWarning: result.requiresAmberVerification,
          redactions: result.aadhaarRedactions,
        });
      } else if (result.extractedSocialStops.length > 0) {
        const added: ItineraryItem[] = result.extractedSocialStops.map((s, idx) => ({
          id: crypto.randomUUID(),
          tripId: workspace.trip.id,
          dayId: null,
          kind: s.kind,
          title: s.title,
          notes: 'Extracted from social caption · Ready to slot into a day',
          lat: s.lat,
          lng: s.lng,
          placeRefId: s.placeRefId,
          addressLocalScript: s.addressLocalScript,
          sortKey: `s${idx}`,
          startTime: null,
          durationMins: 60,
          transitMeta: {},
          dietaryFlags: s.dietaryFlags,
          accessibilityNotes: s.accessibilityNotes,
          elderSummaryI18n: { en: s.title },
          isShortlist: true,
          serverSeq: workspace.trip.latestSeq + 1,
          hlcTimestamp: nextClientHlc(),
          deletedAt: null,
          googleMapsUrl: s.googleMapsUrl,
        }));

        setWorkspace((prev) => ({
          ...prev,
          shortlist: [...prev.shortlist, ...added],
        }));
        setActiveSection('polls');
        setScoutBanner({
          headline: `Pinned ${added.length} places from link into Shortlist`,
          amberWarning: result.requiresAmberVerification,
          redactions: result.aadhaarRedactions,
        });
      }

      setScoutText('');
    } catch {
      // Offline local regex fallback if backend is unreachable
      appendStopToCurrentDay({
        title: text.slice(0, 56),
        kind: 'note',
        startTime: '10:00',
        notes: 'Saved offline in browser sandbox',
      });
      setScoutText('');
      notify('Backend offline — saved note directly to local sandbox.');
    } finally {
      setScoutBusy(false);
    }
  };

  const handlePromoteShortlistItem = (itemId: string) => {
    const item = workspace.shortlist.find((s) => s.id === itemId);
    if (!item || !currentDay) return;
    const lastKey =
      currentDayStops[currentDayStops.length - 1]?.sortKey ?? null;
    const promoted: ItineraryItem = {
      ...item,
      dayId: currentDay.id,
      isShortlist: false,
      sortKey: midpointSortKey(lastKey, null),
    };
    setWorkspace((prev) => ({
      ...prev,
      shortlist: prev.shortlist.filter((s) => s.id !== itemId),
      items: [...prev.items, promoted],
    }));
    notify(`Moved "${item.title}" to Day ${currentDay.dayNumber}.`);
  };

  const handleCreatePoll = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pollQuestion.trim() || !pollOptA.trim() || !pollOptB.trim()) return;
    const newPoll = {
      id: crypto.randomUUID(),
      tripId: workspace.trip.id,
      question: pollQuestion.trim(),
      options: [
        { id: crypto.randomUUID(), label: pollOptA.trim(), voteCount: 0, voterNames: [] },
        { id: crypto.randomUUID(), label: pollOptB.trim(), voteCount: 0, voterNames: [] },
      ],
      closesAt: null,
      totalVotes: 0,
      createdAt: new Date().toISOString(),
    };
    setWorkspace((prev) => ({ ...prev, polls: [newPoll, ...prev.polls] }));
    setPollQuestion('');
    setPollOptA('');
    setPollOptB('');
  };

  const handleVoteOnPoll = async (pollId: string, optionId: string) => {
    const display = voterName.trim() || 'Guest';
    try {
      const updated = await castGuestPollVote({
        shortId: workspace.trip.shortId,
        pollId,
        optionId,
        guestDisplayName: display,
      });
      setWorkspace((prev) => ({
        ...prev,
        polls: prev.polls.map((p) => (p.id === pollId ? updated : p)),
      }));
      return;
    } catch {
      // Local sandbox optimistic update
      setWorkspace((prev) => ({
        ...prev,
        polls: prev.polls.map((p) => {
          if (p.id !== pollId) return p;
          const opts = p.options.map((o) => {
            const cleaned = o.voterNames.filter((n) => n !== display);
            if (o.id === optionId) {
              return {
                ...o,
                voterNames: [...cleaned, display],
                voteCount: cleaned.length + 1,
              };
            }
            return { ...o, voterNames: cleaned, voteCount: cleaned.length };
          });
          return {
            ...p,
            options: opts,
            totalVotes: opts.reduce((acc, o) => acc + o.voteCount, 0),
          };
        }),
      }));
    }
  };

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const numeric = Number(expAmount);
    if (!expTitle.trim() || !Number.isFinite(numeric) || numeric <= 0) return;

    const amountMinor = Math.round(numeric * 100);
    const fxRate = REFERENCE_FX_TO_INR[expCurrency] ?? 1;
    const inrMinor = Math.round(amountMinor * fxRate);

    const eligibleMembers =
      expSplitMode === 'tag_exclude'
        ? workspace.members.filter((m) => !m.dietaryTags.includes(expExcludeTag))
        : workspace.members;
    const targetMembers =
      eligibleMembers.length > 0 ? eligibleMembers : workspace.members;

    const perHead = Math.floor(inrMinor / targetMembers.length);
    let remainder = inrMinor - perHead * targetMembers.length;
    const splitsInrMinor: Record<string, number> = {};
    for (const m of targetMembers) {
      const bump = remainder > 0 ? 1 : 0;
      remainder -= bump;
      splitsInrMinor[m.userId] = perHead + bump;
    }

    const newExp: ExpenseView = {
      id: crypto.randomUUID(),
      tripId: workspace.trip.id,
      clientOpId: crypto.randomUUID(),
      entryType: 'charge',
      reversesExpenseId: null,
      title: expTitle.trim(),
      category: expSplitMode === 'fuel_fastag' ? 'fuel_fastag' : 'dining',
      paidBy: expPaidBy || workspace.members[0]!.userId,
      kittyPoolId: null,
      amountMinor,
      currency: expCurrency,
      inrEquivalentMinor: inrMinor,
      fxRate,
      splitMode: expSplitMode,
      excludedTags: expSplitMode === 'tag_exclude' ? [expExcludeTag] : [],
      splitsInrMinor,
      upiTxnRef: null,
      createdAt: new Date().toISOString(),
    };

    setWorkspace((prev) => ({
      ...prev,
      expenses: [newExp, ...prev.expenses],
    }));
    setExpTitle('');
    setExpAmount('');
    notify('Added expense and recalculated UPI settlements.');
  };

  const handleOpenShareModal = async () => {
    setShareDialogOpen(true);
    const origin =
      typeof window !== 'undefined' ? window.location.origin : 'https://itinbee.com';
    if (SAMPLE_WORKSPACES[workspace.trip.shortId] || mode === 'cloud-trip') {
      setClaimedShareUrl(`${origin}/t/${workspace.trip.shortId}`);
      return;
    }
    setClaimingShare(true);
    try {
      const synced = await claimSandboxToCloud(workspace);
      setWorkspace(synced);
      setClaimedShareUrl(`${origin}/t/${synced.trip.shortId}`);
    } catch {
      setClaimedShareUrl(`${origin}/t/rishi-lnd-4d`);
    } finally {
      setClaimingShare(false);
    }
  };

  const copyTextToClipboard = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedField(key);
    setTimeout(() => setCopiedField((k) => (k === key ? null : k)), 2000);
  };

  const whatsappSummary = useMemo(() => {
    const shareLink =
      claimedShareUrl ||
      `${typeof window !== 'undefined' ? window.location.origin : 'https://itinbee.com'}/t/${workspace.trip.shortId}`;
    const lines = [`*${workspace.trip.title}*`];
    for (const d of activeDays) {
      const stops = workspace.items
        .filter((i) => i.dayId === d.id && !i.deletedAt)
        .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
      lines.push(
        `\nDay ${d.dayNumber}: ${d.themeTitle}`,
        ...stops.map((s) => `• ${s.startTime ? `${s.startTime} ` : ''}${s.title}`)
      );
    }
    lines.push(`\nLive itinerary, Elder Card & polls: ${shareLink}`);
    return lines.join('\n');
  }, [workspace.trip.title, workspace.trip.shortId, workspace.items, activeDays, claimedShareUrl]);

  const handleOfflineVaultEncrypt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const encrypted = await encryptAndCacheTicketOffline({
        tripId: workspace.trip.id,
        fileName: file.name,
        plainBytes: bytes,
        passphrase: vaultPassphrase || '1234',
      });
      setVaultEncryptedFiles((prev) => [
        { id: encrypted.id, fileName: encrypted.fileName, byteLength: encrypted.byteLength },
        ...prev,
      ]);
      notify(`Encrypted "${file.name}" in local AES-GCM offline vault.`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not encrypt file.');
    } finally {
      e.target.value = '';
    }
  };

  const renderTransitIcon = (modeName?: string) => {
    if (modeName === 'rail') {
      return <Train className="h-3.5 w-3.5 text-ink-secondary" strokeWidth={1.6} aria-hidden="true" />;
    }
    if (modeName === 'flight') {
      return <Plane className="h-3.5 w-3.5 text-ink-secondary" strokeWidth={1.6} aria-hidden="true" />;
    }
    if (modeName === 'bus') {
      return <Bus className="h-3.5 w-3.5 text-ink-secondary" strokeWidth={1.6} aria-hidden="true" />;
    }
    return <MapPin className="h-3.5 w-3.5 text-ink-secondary" strokeWidth={1.6} aria-hidden="true" />;
  };

  return (
    <div
      data-sandbox-workbench
      className="flex min-h-dvh flex-col bg-canvas pb-14 text-ink lg:pb-0"
    >
      {/* Top 48px Minimalist Bar */}
      <header className="sticky top-0 z-20 flex min-h-12 flex-wrap items-center justify-between gap-3 border-b border-line bg-canvas/95 px-4 py-2 backdrop-blur-sm sm:px-6">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink"
          >
            <ScoutBeeMark variant="glyph" className="h-4 w-4" />
            <span>itinbee</span>
          </Link>

          {mode === 'sandbox-home' && (
            <nav
              aria-label="Sample Indian and outbound itineraries"
              className="hidden items-center gap-1 md:flex"
            >
              {SAMPLE_KEYS.map((s) => {
                const active = activeSampleKey === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => handleSelectSample(s.key)}
                    className={`rounded-md px-2.5 py-1 text-compact transition-colors ${
                      active
                        ? 'bg-ink font-medium text-canvas-elevated'
                        : 'text-ink-secondary hover:bg-canvas-subtle hover:text-ink'
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={handleStartBlankTrip}
                className="inline-flex items-center gap-1 rounded-md border border-line bg-canvas-elevated px-2.5 py-1 text-compact text-ink-secondary transition-colors hover:text-ink"
              >
                <Plus className="h-3 w-3" strokeWidth={1.7} aria-hidden="true" />
                Blank
              </button>
            </nav>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-md border border-line bg-canvas-subtle px-2.5 py-1 text-micro text-ink-secondary sm:inline-flex">
            {isOnline ? (
              <Wifi className="h-3 w-3 text-jade" strokeWidth={1.7} aria-hidden="true" />
            ) : (
              <WifiOff className="h-3 w-3 text-honey-deep" strokeWidth={1.7} aria-hidden="true" />
            )}
            {mode === 'cloud-trip'
              ? wsConnected
                ? 'Live sync'
                : 'Local cached'
              : workspace.trip.isSample
                ? 'Sample sandbox'
                : 'Local draft'}
          </span>

          <button
            type="button"
            onClick={() =>
              runAccessibleViewTransition(
                () => setElderPreview((v) => !v),
                '#workbench-stage-heading'
              )
            }
            className={`rounded-md border px-2.5 py-1 text-compact font-medium transition-colors ${
              elderPreview
                ? 'border-ink bg-ink text-canvas-elevated'
                : 'border-line bg-canvas-elevated text-ink hover:bg-canvas-subtle'
            }`}
          >
            Elder Card (अ/A)
          </button>

          <button
            type="button"
            data-primary-action
            onClick={handleOpenShareModal}
            className="inline-flex items-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-compact font-medium text-canvas-elevated transition-colors hover:bg-ink/90"
          >
            <Share2 className="h-3.5 w-3.5" strokeWidth={1.7} aria-hidden="true" />
            Share link
          </button>
        </div>
      </header>

      {/* Mobile Sample Picker Strip */}
      {mode === 'sandbox-home' && (
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-line bg-canvas-subtle px-4 py-2 md:hidden">
          {SAMPLE_KEYS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => handleSelectSample(s.key)}
              className={`shrink-0 rounded-md px-2.5 py-1 text-micro ${
                activeSampleKey === s.key
                  ? 'bg-ink font-medium text-canvas-elevated'
                  : 'bg-canvas-elevated text-ink-secondary'
              }`}
            >
              {s.label}
            </button>
          ))}
          <button
            type="button"
            onClick={handleStartBlankTrip}
            className="shrink-0 rounded-md border border-line bg-canvas-elevated px-2.5 py-1 text-micro text-ink"
          >
            + Blank
          </button>
        </div>
      )}

      {/* Main 3-Pane Minimalist Workbench */}
      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[232px_minmax(0,1fr)_396px]">
        {/* Left Navigation + Scout Ingestion Rail */}
        <aside className="border-b border-line bg-canvas-subtle p-4 lg:border-b-0 lg:border-r lg:p-5">
          <div className="space-y-6">
            {/* Workspace Section Tabs */}
            <div className="space-y-1" role="navigation" aria-label="Trip workspace views">
              {(
                [
                  { id: 'timeline', label: 'Itinerary', icon: FileText, count: allVisibleStops.length },
                  {
                    id: 'polls',
                    label: 'Shortlist & Polls',
                    icon: Vote,
                    count: workspace.shortlist.length + workspace.polls.length,
                  },
                  {
                    id: 'ledger',
                    label: 'UPI Split & Kitty',
                    icon: IndianRupee,
                    count: workspace.expenses.length,
                  },
                  {
                    id: 'vault',
                    label: 'Ticket Vault',
                    icon: FolderLock,
                    count: workspace.bookings.length + vaultEncryptedFiles.length,
                  },
                ] as const
              ).map((nav) => {
                const Icon = nav.icon;
                const active = activeSection === nav.id && !elderPreview;
                return (
                  <button
                    key={nav.id}
                    type="button"
                    onClick={() => switchSection(nav.id)}
                    className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-ui transition-colors ${
                      active
                        ? 'bg-canvas-elevated font-medium text-ink shadow-panel'
                        : 'text-ink-secondary hover:text-ink'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" />
                      {nav.label}
                    </span>
                    <span className="font-mono text-micro tabular-nums text-ink-tertiary">
                      {nav.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Day Selector */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <span className="text-micro font-medium text-ink-secondary">Days</span>
                <button
                  type="button"
                  onClick={handleAddDay}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-micro font-medium text-ink-secondary transition-colors hover:bg-canvas-elevated hover:text-ink"
                >
                  <Plus className="h-3 w-3" strokeWidth={1.7} aria-hidden="true" />
                  Add
                </button>
              </div>
              <div className="flex gap-1.5 overflow-x-auto lg:flex-col">
                {activeDays.map((d) => {
                  const selected = currentDay?.id === d.id;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => {
                        setSelectedDayId(d.id);
                        setActiveSection('timeline');
                        setElderPreview(false);
                      }}
                      className={`shrink-0 whitespace-normal rounded-md border px-2.5 py-1.5 text-left text-compact transition-colors ${
                        selected
                          ? 'border-line-strong bg-canvas-elevated font-medium text-ink'
                          : 'border-transparent text-ink-secondary hover:text-ink'
                      }`}
                    >
                      <span className="font-mono text-micro tabular-nums text-ink-secondary">
                        D{d.dayNumber}
                      </span>{' '}
                      <span className="ml-1 line-clamp-1">{d.themeTitle}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Scout Bee Ingestion Dropbar */}
            <div className="rounded-lg border border-line bg-canvas-elevated p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-compact font-medium text-ink">Scout ticket or Reel</span>
                <ScoutBeeMark variant="tray" className="h-5 w-10" />
              </div>

              <label htmlFor="scout-ingest-input" className="sr-only">
                Paste IRCTC SMS, flight confirmation, or Instagram Reel caption
              </label>
              <textarea
                id="scout-ingest-input"
                rows={3}
                value={scoutText}
                onChange={(e) => setScoutText(e.target.value)}
                placeholder="Paste IRCTC PNR SMS, IndiGo pass, redBus text, or Reel caption…"
                className="w-full resize-none rounded-md border border-line bg-canvas px-2.5 py-2 text-compact text-ink placeholder:text-ink-tertiary focus:border-ink"
              />

              <div className="space-y-1.5">
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleScoutIngest(SAMPLE_IRCTC_SNIPPET)}
                    className="rounded border border-line bg-canvas px-1.5 py-1 text-micro font-medium text-ink-secondary transition-colors hover:bg-canvas-subtle hover:text-ink"
                  >
                    IRCTC SMS
                  </button>
                  <button
                    type="button"
                    onClick={() => handleScoutIngest(SAMPLE_REEL_SNIPPET)}
                    className="rounded border border-line bg-canvas px-1.5 py-1 text-micro font-medium text-ink-secondary transition-colors hover:bg-canvas-subtle hover:text-ink"
                  >
                    Reel link
                  </button>
                </div>
                <button
                  type="button"
                  disabled={scoutBusy || !scoutText.trim()}
                  onClick={() => handleScoutIngest()}
                  className="w-full rounded-md bg-honey-deep px-2.5 py-1.5 text-compact font-medium text-white transition-colors hover:bg-honey-darker disabled:opacity-45"
                >
                  {scoutBusy ? 'Parsing…' : 'Extract stops & PNR'}
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* Center Workbench Stage */}
        <main
          className={`container-timeline p-4 sm:p-6 lg:p-8 ${
            mobilePane === 'map' ? 'hidden lg:block' : 'block'
          }`}
        >
          {/* Compact Trip Header */}
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1
                  id="workbench-stage-heading"
                  tabIndex={-1}
                  className="text-lg font-semibold tracking-tight text-ink focus:outline-none sm:text-[20px]"
                >
                  {workspace.trip.title}
                </h1>
                {workspace.trip.isSample && (
                  <span className="rounded border border-line bg-canvas-subtle px-2 py-0.5 text-micro font-medium text-ink-secondary">
                    Sample itinerary
                  </span>
                )}
              </div>
              <p className="text-compact text-ink-secondary">
                {workspace.trip.destinationSummary}
                {workspace.trip.startDate ? ` · ${workspace.trip.startDate}` : ''}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href={`/t/${workspace.trip.shortId}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-line bg-canvas-elevated px-2.5 py-1 text-compact text-ink-secondary transition-colors hover:text-ink"
              >
                Guest preview
                <ExternalLink className="h-3 w-3" strokeWidth={1.6} aria-hidden="true" />
              </Link>
            </div>
          </div>

          {scoutBanner && (
            <div
              className={`mb-5 flex items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-compact ${
                scoutBanner.amberWarning
                  ? 'border-honey/40 bg-honey-wash/60 text-ink'
                  : 'border-jade/30 bg-jade-wash text-ink'
              }`}
            >
              <div className="flex items-center gap-2">
                {scoutBanner.amberWarning ? (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-honey-deep" strokeWidth={1.7} aria-hidden="true" />
                ) : (
                  <ShieldCheck className="h-4 w-4 shrink-0 text-jade" strokeWidth={1.7} aria-hidden="true" />
                )}
                <span>
                  {scoutBanner.headline}
                  {scoutBanner.redactions > 0
                    ? ` · Masked ${scoutBanner.redactions} Aadhaar number`
                    : ''}
                  {scoutBanner.amberWarning
                    ? ' · Please verify highlighted time/date fields'
                    : ''}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setScoutBanner(null)}
                className="text-micro text-ink-secondary underline underline-offset-2"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Mode Switch: Elder Card vs Active Workbench Section */}
          {elderPreview ? (
            <ElderCardView
              trip={workspace.trip}
              days={workspace.days}
              items={workspace.items}
              bookings={workspace.bookings}
            />
          ) : activeSection === 'timeline' ? (
            <div className="space-y-6">
              {currentDay && (
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-body font-semibold text-ink">
                    Day {currentDay.dayNumber} — {currentDay.themeTitle}
                  </h2>
                  <span className="font-mono text-micro tabular-nums text-ink-tertiary">
                    {currentDayStops.length} {currentDayStops.length === 1 ? 'stop' : 'stops'} ·{' '}
                    {currentDay.pacingLevel} pace
                  </span>
                </div>
              )}

              {currentDayStops.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line-strong bg-canvas-subtle/50 px-6 py-10 text-center">
                  <ScoutBeeMark variant="vignette" />
                  <p className="mt-3 text-ui font-medium text-ink">No stops on this day yet</p>
                  <p className="mt-1 max-w-sm text-compact text-ink-secondary">
                    Search an Indian landmark or homestay below, or paste an IRCTC / flight confirmation in the Scout box.
                  </p>
                </div>
              ) : (
                <ol className="space-y-2.5">
                  {currentDayStops.map((stop, idx) => {
                    const bk = bookingByItem.get(stop.id);
                    const isHighlighted = stop.id === highlightedStopId;
                    const needsVerify = (bk?.lowConfidenceFields.length ?? 0) > 0;

                    return (
                      <li key={stop.id} className="space-y-2">
                        {/* Calibrated Indian Multi-Modal Transit Spine Connector */}
                        {idx > 0 &&
                          (stop.transitMeta.estimatedDurationMins ||
                            stop.transitMeta.advisory) && (
                            <div className="ml-6 flex flex-wrap items-center gap-2 border-l border-line-strong py-1 pl-4 text-micro text-ink-secondary">
                              {renderTransitIcon(stop.transitMeta.mode)}
                              <span className="font-mono tabular-nums">
                                {stop.transitMeta.mode?.replace('_', ' ') ?? 'transit'}
                                {stop.transitMeta.distanceKm
                                  ? ` · ${stop.transitMeta.distanceKm} km`
                                  : ''}
                                {stop.transitMeta.estimatedDurationMins
                                  ? ` · ${Math.floor(
                                      stop.transitMeta.estimatedDurationMins / 60
                                    )}h ${stop.transitMeta.estimatedDurationMins % 60}m`
                                  : ''}
                              </span>
                              {stop.transitMeta.advisory && (
                                <span className="rounded border border-honey/35 bg-honey-wash/65 px-2 py-0.5 text-micro text-honey-deep">
                                  {stop.transitMeta.advisory}
                                </span>
                              )}
                            </div>
                          )}

                        <div
                          onMouseEnter={() => setHighlightedStopId(stop.id)}
                          onClick={() => setHighlightedStopId(stop.id)}
                          className={`stop-row-grid rounded-lg border p-3.5 transition-colors ${
                            isHighlighted
                              ? 'border-line-strong bg-canvas-elevated shadow-panel'
                              : 'border-line bg-canvas-elevated hover:border-line-strong'
                          }`}
                        >
                          <div className="flex items-center gap-2 font-mono text-compact tabular-nums text-ink-secondary">
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-canvas-subtle text-micro font-medium text-ink">
                              {idx + 1}
                            </span>
                            <span>{stop.startTime || 'Flex'}</span>
                          </div>

                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-ui font-medium text-ink">
                                {stop.title}
                              </span>
                              {bk && (
                                <span className="rounded border border-jade/30 bg-jade-wash px-1.5 py-0.5 font-mono text-micro font-medium tabular-nums text-jade">
                                  {bk.status.toUpperCase()}
                                  {bk.pnrMasked ? ` · ${bk.pnrMasked}` : ''}
                                </span>
                              )}
                              {needsVerify && (
                                <span className="rounded border border-honey/40 bg-honey-wash px-1.5 py-0.5 text-micro font-medium text-honey-deep">
                                  Verify time
                                </span>
                              )}
                            </div>

                            {stop.notes && (
                              <p className="text-compact text-ink-secondary">{stop.notes}</p>
                            )}

                            {(stop.dietaryFlags.length > 0 || stop.accessibilityNotes) && (
                              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                {stop.dietaryFlags.map((flag) => (
                                  <span
                                    key={flag}
                                    className="rounded bg-canvas-subtle px-1.5 py-0.5 text-micro text-ink-secondary"
                                  >
                                    {flag}
                                  </span>
                                ))}
                                {stop.accessibilityNotes && (
                                  <span className="text-micro text-ink-tertiary">
                                    {stop.accessibilityNotes}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoveStop(stop.id, -1);
                              }}
                              disabled={idx === 0}
                              aria-label={`Move ${stop.title} earlier`}
                              className="icon-hit rounded p-1 text-ink-tertiary hover:bg-canvas-subtle hover:text-ink disabled:opacity-30"
                            >
                              <ArrowUp className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoveStop(stop.id, 1);
                              }}
                              disabled={idx === currentDayStops.length - 1}
                              aria-label={`Move ${stop.title} later`}
                              className="icon-hit rounded p-1 text-ink-tertiary hover:bg-canvas-subtle hover:text-ink disabled:opacity-30"
                            >
                              <ArrowDown className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteStop(stop.id);
                              }}
                              aria-label={`Remove ${stop.title}`}
                              className="icon-hit rounded p-1 text-ink-tertiary hover:bg-canvas-subtle hover:text-ink"
                            >
                              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}

              {/* Compact Add Stop Form + Open POI Autocomplete */}
              <div className="relative rounded-lg border border-line bg-canvas-subtle/70 p-3">
                <form
                  onSubmit={handleManualAddStop}
                  className="flex flex-wrap items-center gap-2"
                >
                  <label htmlFor="stop-time-input" className="sr-only">
                    Stop time
                  </label>
                  <input
                    id="stop-time-input"
                    type="time"
                    value={newStopTime}
                    onChange={(e) => setNewStopTime(e.target.value)}
                    className="rounded-md border border-line bg-canvas-elevated px-2.5 py-1.5 font-mono text-compact text-ink"
                  />

                  <label htmlFor="stop-kind-select" className="sr-only">
                    Stop category
                  </label>
                  <select
                    id="stop-kind-select"
                    value={newStopKind}
                    onChange={(e) => setNewStopKind(e.target.value as ItemKind)}
                    className="rounded-md border border-line bg-canvas-elevated px-2.5 py-1.5 text-compact text-ink"
                  >
                    <option value="activity">Activity</option>
                    <option value="transit">Transit</option>
                    <option value="stay">Stay</option>
                    <option value="meal">Meal</option>
                    <option value="note">Note</option>
                  </select>

                  <label htmlFor="stop-title-input" className="sr-only">
                    Search place or type stop title
                  </label>
                  <input
                    id="stop-title-input"
                    type="text"
                    value={newStopTitle}
                    onChange={(e) => setNewStopTitle(e.target.value)}
                    placeholder="Add stop or search open POIs (e.g. Rishikesh, Goa, Hanoi)…"
                    className="min-w-[180px] flex-1 rounded-md border border-line bg-canvas-elevated px-3 py-1.5 text-compact text-ink placeholder:text-ink-tertiary focus:border-ink"
                  />

                  <button
                    type="submit"
                    className="inline-flex items-center gap-1 rounded-md bg-ink px-3 py-1.5 text-compact font-medium text-canvas-elevated hover:bg-ink/90"
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={1.7} aria-hidden="true" />
                    Add stop
                  </button>
                </form>

                {poiSuggestions.length > 0 && (
                  <ul className="mt-2 divide-y divide-line rounded-md border border-line bg-canvas-elevated shadow-panel">
                    {poiSuggestions.map((poi) => (
                      <li key={poi.placeRefId}>
                        <button
                          type="button"
                          onClick={() => handleSelectPoiSuggestion(poi)}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-compact hover:bg-canvas-subtle"
                        >
                          <div>
                            <span className="font-medium text-ink">{poi.name}</span>{' '}
                            <span className="text-ink-secondary">
                              · {poi.city}, {poi.region}
                            </span>
                          </div>
                          <span className="font-mono text-micro text-ink-tertiary">
                            {poi.terrainZone}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : activeSection === 'polls' ? (
            <div className="space-y-7">
              {/* Shortlist Drawer */}
              <section className="space-y-3">
                <h2 className="text-body font-semibold text-ink">
                  Unscheduled Shortlist ({workspace.shortlist.length})
                </h2>
                {workspace.shortlist.length === 0 ? (
                  <div className="flex items-center gap-3 rounded-lg border border-line bg-canvas-subtle/60 p-4 text-compact text-ink-secondary">
                    <ScoutBeeMark variant="glyph" className="h-5 w-5" />
                    <span>
                      Paste an Instagram Reel or YouTube caption into the Scout box to collect candidate stops here before slotting them into a day.
                    </span>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {workspace.shortlist.map((item) => (
                      <li
                        key={item.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-canvas-elevated p-3"
                      >
                        <div>
                          <div className="text-ui font-medium text-ink">{item.title}</div>
                          <div className="text-micro text-ink-secondary">{item.notes}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handlePromoteShortlistItem(item.id)}
                          className="rounded-md border border-line bg-canvas-subtle px-2.5 py-1 text-micro font-medium text-ink hover:bg-canvas-muted"
                        >
                          Move to Day {currentDay?.dayNumber ?? 1}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Zero-OTP Group Polls */}
              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-body font-semibold text-ink">
                    Zero-OTP WhatsApp Group Polls
                  </h2>
                  <div className="flex items-center gap-1.5 text-micro text-ink-secondary">
                    <label htmlFor="voter-name-field">Voting as:</label>
                    <input
                      id="voter-name-field"
                      type="text"
                      value={voterName}
                      onChange={(e) => setVoterName(e.target.value)}
                      className="w-28 rounded border border-line bg-canvas-elevated px-2 py-0.5 text-compact text-ink"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  {workspace.polls.map((poll) => (
                    <div
                      key={poll.id}
                      className="rounded-lg border border-line bg-canvas-elevated p-4 space-y-3"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="text-ui font-semibold text-ink">{poll.question}</h3>
                        <span className="font-mono text-micro tabular-nums text-ink-tertiary">
                          {poll.totalVotes} {poll.totalVotes === 1 ? 'vote' : 'votes'}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {poll.options.map((opt) => {
                          const pct =
                            poll.totalVotes > 0
                              ? Math.round((opt.voteCount / poll.totalVotes) * 100)
                              : 0;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => handleVoteOnPoll(poll.id, opt.id)}
                              className="flex w-full items-center justify-between rounded-md border border-line bg-canvas px-3 py-2 text-left text-compact transition-colors hover:border-ink"
                            >
                              <div>
                                <div className="font-medium text-ink">{opt.label}</div>
                                {opt.voterNames.length > 0 && (
                                  <div className="text-micro text-ink-tertiary">
                                    {opt.voterNames.join(', ')}
                                  </div>
                                )}
                              </div>
                              <span className="font-mono text-compact font-medium tabular-nums text-ink">
                                {opt.voteCount} ({pct}%)
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <form
                  onSubmit={handleCreatePoll}
                  className="grid gap-2 rounded-lg border border-line bg-canvas-subtle/70 p-3 sm:grid-cols-4"
                >
                  <input
                    type="text"
                    value={pollQuestion}
                    onChange={(e) => setPollQuestion(e.target.value)}
                    placeholder="New poll question (e.g. Stay in Agonda or Palolem?)"
                    aria-label="Poll question"
                    className="rounded-md border border-line bg-canvas-elevated px-2.5 py-1.5 text-compact text-ink sm:col-span-2"
                  />
                  <input
                    type="text"
                    value={pollOptA}
                    onChange={(e) => setPollOptA(e.target.value)}
                    placeholder="Option 1"
                    aria-label="Option 1"
                    className="rounded-md border border-line bg-canvas-elevated px-2.5 py-1.5 text-compact text-ink"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={pollOptB}
                      onChange={(e) => setPollOptB(e.target.value)}
                      placeholder="Option 2"
                      aria-label="Option 2"
                      className="min-w-0 flex-1 rounded-md border border-line bg-canvas-elevated px-2.5 py-1.5 text-compact text-ink"
                    />
                    <button
                      type="submit"
                      className="rounded-md bg-ink px-3 py-1.5 text-compact font-medium text-canvas-elevated"
                    >
                      Post
                    </button>
                  </div>
                </form>
              </section>
            </div>
          ) : activeSection === 'ledger' ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-body font-semibold text-ink">
                  Unlimited Group Expense Ledger &amp; UPI Settlements
                </h2>
                <span className="text-micro text-ink-secondary">
                  Zero daily entry limits · Auto FX to INR
                </span>
              </div>

              {/* Kitty Pool Summary */}
              {workspace.kittyPools.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {workspace.kittyPools.map((kp) => (
                    <div
                      key={kp.id}
                      className="rounded-lg border border-line bg-canvas-elevated p-3.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-compact font-medium text-ink">{kp.title}</span>
                        <span className="rounded bg-jade-wash px-2 py-0.5 font-mono text-micro font-medium text-jade">
                          KITTY OPEN
                        </span>
                      </div>
                      <div className="mt-2 font-mono text-base font-semibold tabular-nums text-ink">
                        ₹{(kp.remainingMinor / 100).toLocaleString('en-IN')} remaining
                      </div>
                      <div className="text-micro text-ink-tertiary">
                        of ₹{(kp.initialContributionMinor / 100).toLocaleString('en-IN')} pooled
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Expense Form */}
              <form
                onSubmit={handleAddExpense}
                className="space-y-2.5 rounded-lg border border-line bg-canvas-subtle/70 p-3.5"
              >
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_200px]">
                  <input
                    type="text"
                    value={expTitle}
                    onChange={(e) => setExpTitle(e.target.value)}
                    placeholder="Expense description (e.g. Seafood shack dinner, FASTag toll)"
                    aria-label="Expense description"
                    className="min-w-0 rounded-md border border-line bg-canvas-elevated px-2.5 py-1.5 text-compact text-ink"
                  />
                  <div className="flex gap-1.5">
                    <select
                      value={expCurrency}
                      onChange={(e) => setExpCurrency(e.target.value as CurrencyCode)}
                      aria-label="Currency"
                      className="rounded-md border border-line bg-canvas-elevated px-2 py-1.5 font-mono text-compact text-ink"
                    >
                      <option value="INR">INR</option>
                      <option value="VND">VND</option>
                      <option value="THB">THB</option>
                      <option value="AED">AED</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      value={expAmount}
                      onChange={(e) => setExpAmount(e.target.value)}
                      placeholder="Amount"
                      aria-label="Amount"
                      className="min-w-0 flex-1 rounded-md border border-line bg-canvas-elevated px-2.5 py-1.5 font-mono text-compact tabular-nums text-ink"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={expPaidBy}
                    onChange={(e) => setExpPaidBy(e.target.value)}
                    aria-label="Paid by member"
                    className="min-w-[140px] flex-1 rounded-md border border-line bg-canvas-elevated px-2.5 py-1.5 text-compact text-ink"
                  >
                    {workspace.members.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        Paid by {m.displayName}
                      </option>
                    ))}
                  </select>
                  <select
                    value={
                      expSplitMode === 'tag_exclude'
                        ? `exclude:${expExcludeTag}`
                        : expSplitMode
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val.startsWith('exclude:')) {
                        setExpSplitMode('tag_exclude');
                        setExpExcludeTag(val.replace('exclude:', ''));
                      } else {
                        setExpSplitMode(val as SplitMode);
                      }
                    }}
                    aria-label="Split mode"
                    className="min-w-[140px] flex-1 rounded-md border border-line bg-canvas-elevated px-2.5 py-1.5 text-compact text-ink"
                  >
                    <option value="equal">Equal split</option>
                    <option value="exclude:vegetarian">Exclude vegetarians</option>
                    <option value="exclude:non-drinker">Exclude non-drinkers</option>
                    <option value="fuel_fastag">Car fuel &amp; FASTag</option>
                  </select>
                  <button
                    type="submit"
                    className="rounded-md bg-ink px-3.5 py-1.5 text-compact font-medium text-canvas-elevated hover:bg-ink/90"
                  >
                    Log expense
                  </button>
                </div>
              </form>

              {/* Simplified Min-Cash-Flow UPI Settlements */}
              <div className="space-y-2.5">
                <h3 className="text-compact font-semibold text-ink">
                  Simplified UPI Settlements ({settlements.length})
                </h3>
                {settlements.length === 0 ? (
                  <p className="rounded-lg border border-line bg-canvas-elevated p-3.5 text-compact text-ink-secondary">
                    All group balances are settled.
                  </p>
                ) : (
                  <div className="grid gap-2 xl:grid-cols-2">
                    {settlements.map((s) => (
                      <div
                        key={`${s.fromUserId}-${s.toUserId}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-line bg-canvas-elevated p-3"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-ui font-medium text-ink">
                            {s.fromName} pays {s.toName}
                          </div>
                          <div className="font-mono text-micro tabular-nums text-ink-tertiary">
                            {s.paymentMode === 'UPI_DEEP_LINK'
                              ? 'Direct upi://pay intent ready'
                              : '> ₹2,000 copy VPA + QR mode'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveSettlement(s)}
                          className="shrink-0 rounded-md bg-honey-deep px-2.5 py-1.5 font-mono text-compact font-medium tabular-nums text-white hover:bg-honey-darker"
                        >
                          Settle {s.amountInrFormatted}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Immutable Ledger Entries */}
              <div className="space-y-2">
                <h3 className="text-compact font-semibold text-ink">Ledger History</h3>
                {workspace.expenses.length === 0 ? (
                  <p className="text-compact text-ink-tertiary">No expenses logged yet.</p>
                ) : (
                  <div className="divide-y divide-line rounded-lg border border-line bg-canvas-elevated">
                    {workspace.expenses.map((exp) => {
                      const payer =
                        workspace.members.find((m) => m.userId === exp.paidBy)
                          ?.displayName ?? 'Member';
                      return (
                        <div
                          key={exp.id}
                          className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-compact"
                        >
                          <div>
                            <div className="font-medium text-ink">{exp.title}</div>
                            <div className="text-micro text-ink-tertiary">
                              Paid by {payer} · {exp.splitMode.replace('_', ' ')}
                              {exp.excludedTags.length > 0
                                ? ` (excl. ${exp.excludedTags.join(', ')})`
                                : ''}
                            </div>
                          </div>
                          <div className="text-right font-mono tabular-nums">
                            <div className="font-medium text-ink">
                              ₹{(exp.inrEquivalentMinor / 100).toLocaleString('en-IN')}
                            </div>
                            {exp.currency !== 'INR' && (
                              <div className="text-micro text-ink-tertiary">
                                {(exp.amountMinor / 100).toLocaleString()} {exp.currency}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Ticket Vault & Outbound Readiness Tab */
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-body font-semibold text-ink">
                    Encrypted Offline Ticket Vault
                  </h2>
                  <p className="text-compact text-ink-secondary">
                    50 MB free quota per trip · Masked PNRs on public WhatsApp links · WebCrypto AES-GCM local cache
                  </p>
                </div>
                <span className="font-mono text-micro tabular-nums text-ink-tertiary">
                  {Math.round(((workspace.trip.vaultBytesUsed ?? 0) / 1024 / 1024) * 10) / 10} / 50 MB
                </span>
              </div>

              {/* Parsed Bookings */}
              <div className="space-y-2">
                {workspace.bookings.length === 0 ? (
                  <p className="rounded-lg border border-line bg-canvas-elevated p-4 text-compact text-ink-secondary">
                    No parsed bookings yet. Paste an IRCTC or flight confirmation in the Scout box on the left.
                  </p>
                ) : (
                  workspace.bookings.map((bk) => (
                    <div
                      key={bk.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-canvas-elevated p-3.5"
                    >
                      <div className="space-y-0.5">
                        <div className="text-ui font-medium text-ink">
                          {bk.summary.headline}
                        </div>
                        <div className="font-mono text-micro tabular-nums text-ink-secondary">
                          Provider: {bk.provider.toUpperCase()} · Masked PNR:{' '}
                          {bk.pnrMasked ?? 'N/A'} · Confidence:{' '}
                          {Math.round(bk.parserConfidence * 100)}%
                        </div>
                      </div>
                      <span className="rounded border border-jade/30 bg-jade-wash px-2 py-0.5 font-mono text-micro font-medium text-jade">
                        {bk.status.toUpperCase()}
                      </span>
                    </div>
                  ))
                )}
              </div>

              {/* Local WebCrypto AES-GCM Ticket PDF Encryptor */}
              <div className="rounded-lg border border-line bg-canvas-subtle/70 p-4 space-y-3">
                <div className="text-compact font-medium text-ink">
                  Cache PDF / Boarding Pass Offline (AES-256-GCM Encrypted in IndexedDB)
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <label htmlFor="vault-pin-input" className="text-micro text-ink-secondary">
                    Vault PIN:
                  </label>
                  <input
                    id="vault-pin-input"
                    type="password"
                    value={vaultPassphrase}
                    onChange={(e) => setVaultPassphrase(e.target.value)}
                    className="w-24 rounded-md border border-line bg-canvas-elevated px-2.5 py-1 font-mono text-compact"
                  />
                  <label className="cursor-pointer rounded-md bg-ink px-3 py-1.5 text-compact font-medium text-canvas-elevated hover:bg-ink/90">
                    Encrypt &amp; store file
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      onChange={handleOfflineVaultEncrypt}
                      className="sr-only"
                    />
                  </label>
                </div>
                {vaultEncryptedFiles.length > 0 && (
                  <ul className="space-y-1 pt-1 text-micro text-jade">
                    {vaultEncryptedFiles.map((f) => (
                      <li key={f.id} className="font-mono">
                        Encrypted offline: {f.fileName} ({Math.ceil(f.byteLength / 1024)} KB)
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Free Outbound Readiness Checklist */}
              {workspace.outboundChecklist.length > 0 && (
                <div className="space-y-2.5">
                  <h3 className="flex items-center gap-1.5 text-compact font-semibold text-ink">
                    <ListChecks className="h-4 w-4 text-ink-secondary" strokeWidth={1.6} aria-hidden="true" />
                    Outbound Corridor Readiness ({workspace.outboundChecklist[0]?.corridor})
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {workspace.outboundChecklist.map((c) => (
                      <div
                        key={c.id}
                        className="rounded-lg border border-line bg-canvas-elevated p-3 space-y-1"
                      >
                        <div className="text-compact font-medium text-ink">{c.title}</div>
                        <p className="text-micro text-ink-secondary">{c.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>

        {/* Right Synchronized Route Map Pane */}
        <aside
          className={`border-t border-line bg-canvas-subtle p-4 lg:border-l lg:border-t-0 lg:p-5 ${
            mobilePane === 'map' ? 'block' : 'hidden lg:block'
          }`}
        >
          <LazyRouteMap
            items={allVisibleStops}
            highlightedItemId={highlightedStopId}
            onSelectStop={(id) => setHighlightedStopId(id)}
            attribution={workspace.trip.mapAttribution}
          />
        </aside>
      </div>

      {/* First-Viewport Micro-Agate Status Footer */}
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-canvas px-4 py-2 text-micro text-ink-secondary sm:px-6">
        <span>
          Itinbee · {allVisibleStops.length} stops · IndexedDB saved ({offlineSavedCount}) · Zero signup wall
        </span>
        <span>
          <a href="/llms.txt" className="underline underline-offset-2 hover:text-ink">
            llms.txt
          </a>{' '}
          · © OpenStreetMap contributors
        </span>
      </footer>

      {/* Below-the-Fold Deferred Corridor Blueprints on Sandbox Home */}
      {mode === 'sandbox-home' && (
        <section
          aria-label="Cloneable Indian and outbound route templates"
          className="deferred-below-fold border-t border-line bg-canvas-subtle/60 px-4 py-8 sm:px-6"
        >
          <div className="mx-auto max-w-6xl space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-body font-semibold text-ink">
                Cloneable Multi-Modal Corridors
              </h2>
              <span className="text-micro text-ink-secondary">
                Calibrated for IRCTC berths, mountain switchbacks, Elder Cards &amp; UPI splits
              </span>
            </div>
            <div className="divide-y divide-line rounded-lg border border-line bg-canvas-elevated">
              {Object.values(SAMPLE_WORKSPACES).map((sample) => (
                <div
                  key={sample.trip.shortId}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-compact"
                >
                  <div>
                    <span className="font-medium text-ink">{sample.trip.title}</span>
                    <span className="ml-2 text-ink-secondary">
                      {sample.trip.destinationSummary}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/t/${sample.trip.shortId}`}
                      className="rounded border border-line px-2.5 py-1 text-micro text-ink-secondary hover:text-ink"
                    >
                      WhatsApp view
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        handleSelectSample(sample.trip.shortId);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="rounded bg-ink px-2.5 py-1 text-micro font-medium text-canvas-elevated"
                    >
                      Load in sandbox
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Mobile Safe-Area Bottom Pane Switcher */}
      <div className="mobile-bottom-bar fixed inset-x-0 bottom-0 z-20 flex items-center justify-around border-t border-line bg-canvas-elevated/95 pt-2 backdrop-blur-sm lg:hidden">
        <button
          type="button"
          onClick={() => setMobilePane('work')}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-compact ${
            mobilePane === 'work' ? 'font-semibold text-ink' : 'text-ink-secondary'
          }`}
        >
          <FileText className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" />
          Workspace
        </button>
        <button
          type="button"
          onClick={() => setMobilePane('map')}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-compact ${
            mobilePane === 'map' ? 'font-semibold text-ink' : 'text-ink-secondary'
          }`}
        >
          <MapIcon className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" />
          Route Map
        </button>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          className="fixed bottom-16 right-4 z-30 rounded-lg border border-line bg-ink px-3.5 py-2 text-compact text-canvas-elevated shadow-dialog lg:bottom-5"
        >
          {toastMessage}
        </div>
      )}

      {/* Native <dialog closedby="any"> Share & Live-QR PDF Modal */}
      <ModalDialog
        open={shareDialogOpen}
        onClose={() => setShareDialogOpen(false)}
        title="Share WhatsApp Guest Link & PDF"
      >
        <div className="space-y-4 text-compact">
          <p className="text-ink-secondary">
            Recipients can read the timeline, switch to the Hindi/English Elder Card, and vote on polls in under 1.5s without creating an account. Ticket PNRs are masked automatically.
          </p>

          <div className="space-y-1.5">
            <label htmlFor="share-url-field" className="text-micro font-medium text-ink-secondary">
              Zero-login WhatsApp guest link
            </label>
            <div className="flex gap-2">
              <input
                id="share-url-field"
                type="text"
                readOnly
                value={claimingShare ? 'Syncing draft…' : claimedShareUrl ?? ''}
                className="min-w-0 flex-1 rounded-md border border-line bg-canvas-subtle px-2.5 py-1.5 font-mono text-micro text-ink"
              />
              <button
                type="button"
                disabled={!claimedShareUrl}
                onClick={() =>
                  claimedShareUrl && copyTextToClipboard('url', claimedShareUrl)
                }
                className="inline-flex items-center gap-1 rounded-md bg-ink px-3 py-1.5 text-compact font-medium text-canvas-elevated"
              >
                {copiedField === 'url' ? (
                  <Check className="h-3.5 w-3.5" strokeWidth={1.7} aria-hidden="true" />
                ) : (
                  <Copy className="h-3.5 w-3.5" strokeWidth={1.7} aria-hidden="true" />
                )}
                {copiedField === 'url' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => copyTextToClipboard('digest', whatsappSummary)}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-line bg-canvas px-3 py-2 font-medium text-ink hover:bg-canvas-subtle"
            >
              <Copy className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" />
              {copiedField === 'digest' ? 'Digest copied' : 'Copy WhatsApp text'}
            </button>

            <button
              type="button"
              onClick={() =>
                exportItineraryWithLiveQrPdf({
                  trip: workspace.trip,
                  days: workspace.days,
                  items: workspace.items,
                  liveShareUrl:
                    claimedShareUrl || `https://itinbee.com/t/${workspace.trip.shortId}`,
                })
              }
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-line bg-canvas px-3 py-2 font-medium text-ink hover:bg-canvas-subtle"
            >
              <Download className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" />
              Download QR PDF
            </button>
          </div>
        </div>
      </ModalDialog>

      {/* Native <dialog closedby="any"> UPI Settlement Modal */}
      <ModalDialog
        open={Boolean(activeSettlement)}
        onClose={() => setActiveSettlement(null)}
        title="Settle Balance via UPI"
      >
        {activeSettlement && (
          <div className="space-y-4 text-compact">
            <div className="flex items-baseline justify-between border-b border-line pb-3">
              <div>
                <div className="text-ui font-medium text-ink">
                  {activeSettlement.fromName} → {activeSettlement.toName}
                </div>
                <div className="font-mono text-micro text-ink-tertiary">
                  VPA: {activeSettlement.payeeVpa}
                </div>
              </div>
              <span className="font-mono text-lg font-semibold tabular-nums text-ink">
                {activeSettlement.amountInrFormatted}
              </span>
            </div>

            <p className="text-micro text-ink-secondary">{activeSettlement.thresholdNote}</p>

            {settlementQrUrl && (
              <div className="flex justify-center rounded-lg border border-line bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={settlementQrUrl}
                  alt={`UPI QR code to pay ${activeSettlement.toName}`}
                  width={156}
                  height={156}
                />
              </div>
            )}

            <div className="flex flex-col gap-2">
              {activeSettlement.upiUri && (
                <a
                  href={activeSettlement.upiUri}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md bg-honey-deep px-3 py-2 text-center font-medium text-white hover:bg-honey-darker"
                >
                  Open GPay / PhonePe / Paytm ({activeSettlement.amountInrFormatted})
                </a>
              )}

              <button
                type="button"
                onClick={() => copyTextToClipboard('upi', activeSettlement.copyText)}
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-line bg-canvas px-3 py-2 font-medium text-ink hover:bg-canvas-subtle"
              >
                <Copy className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" />
                {copiedField === 'upi' ? 'Copied VPA & amount' : 'Copy UPI ID + exact amount'}
              </button>
            </div>
          </div>
        )}
      </ModalDialog>
    </div>
  );
}
