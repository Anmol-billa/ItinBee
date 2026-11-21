'use client';

import React, { useState } from 'react';
import { Check, Sparkles, Wand2, X } from 'lucide-react';
import {
  requestTripAssist,
  type BackendAssistOperation,
  type SyncClientMutationInput,
} from '@/lib/api-client';
import { midpointSortKey, nextClientHlc } from '@/lib/offline-db';
import type { ItemKind, ItineraryItem, PacingLevel, TripDay, TripWorkspace } from '@/lib/types';
import type { CandidateMapPlace } from '@/features/map/map-utils';
import {
  getOrderedStopsForDay,
  mapPlaceCategoryToItemKind,
  moveStopToDay,
} from './editor-helpers';
import { fetchGeoAutocomplete } from './places-discovery';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AssistOperation =
  | {
      type: 'set_pacing';
      dayId: string;
      dayNumber: number;
      pacingLevel: PacingLevel;
      summary: string;
    }
  | {
      type: 'add_stop';
      dayId: string;
      dayNumber: number;
      title: string;
      kind: ItemKind;
      startTime: string | null;
      durationMins: number;
      lat: number | null;
      lng: number | null;
      placeRefId: string | null;
      notes: string;
      dietaryFlags: string[];
      summary: string;
    }
  | {
      type: 'move_stop';
      stopId: string;
      targetDayId: string;
      dayNumber: number;
      title: string;
      summary: string;
    }
  | {
      type: 'update_stop';
      stopId: string;
      dayNumber: number;
      title: string;
      startTime?: string | null;
      durationMins?: number;
      notes?: string;
      summary: string;
    }
  | {
      type: 'move_to_shortlist';
      stopId: string;
      dayNumber: number;
      title: string;
      summary: string;
    }
  | {
      type: 'remove_stop';
      stopId: string;
      dayNumber: number;
      title: string;
      summary: string;
    };

export interface AssistProposal {
  headline: string;
  mode: 'ai' | 'basic' | 'local';
  operations: AssistOperation[];
}

interface AskItinbeeBarProps {
  workspace: TripWorkspace;
  activeDay: TripDay | null;
  candidates: CandidateMapPlace[];
  onApplyProposal: (
    nextWorkspace: TripWorkspace,
    summaryMsg: string,
    mutations: SyncClientMutationInput[]
  ) => void;
}

const EXAMPLE_PROMPTS = [
  'Make this day more relaxed',
  'Add a vegetarian dinner',
  'Add a morning café stop',
] as const;

function mapBackendOpsToClientOps(
  rawOps: BackendAssistOperation[],
  workspace: TripWorkspace,
  fallbackDay: TripDay | null
): AssistOperation[] {
  const activeDays = workspace.days
    .filter((d) => !d.deletedAt)
    .sort((a, b) => a.dayNumber - b.dayNumber);
  const allItems = [...workspace.items, ...workspace.shortlist].filter((i) => !i.deletedAt);

  const resolveDay = (dayNum?: number): TripDay | undefined => {
    if (dayNum) {
      const hit = activeDays.find((d) => d.dayNumber === dayNum);
      if (hit) return hit;
    }
    return fallbackDay ?? activeDays[0];
  };

  const out: AssistOperation[] = [];
  for (const op of rawOps) {
    if (op.op === 'add') {
      const day = resolveDay(op.dayNumber);
      if (!day) continue;
      const title = op.title?.trim() || 'Suggested stop';
      out.push({
        type: 'add_stop',
        dayId: day.id,
        dayNumber: day.dayNumber,
        title,
        kind: op.kind ?? 'activity',
        startTime: op.startTime ?? null,
        durationMins: op.durationMins ?? 60,
        lat: typeof op.lat === 'number' ? op.lat : null,
        lng: typeof op.lng === 'number' ? op.lng : null,
        placeRefId: op.placeRefId ?? null,
        notes: op.notes ?? '',
        dietaryFlags: [],
        summary: `Add "${title}"${op.startTime ? ` (${op.startTime})` : ''} to Day ${day.dayNumber}`,
      });
    } else if (op.op === 'move' && op.itemId) {
      const item = allItems.find((i) => i.id === op.itemId);
      const day = resolveDay(op.dayNumber);
      if (!item || !day) continue;
      out.push({
        type: 'move_stop',
        stopId: item.id,
        targetDayId: day.id,
        dayNumber: day.dayNumber,
        title: item.title,
        summary: `Move "${item.title}" to Day ${day.dayNumber}`,
      });
    } else if (op.op === 'remove' && op.itemId) {
      const item = allItems.find((i) => i.id === op.itemId);
      const dayNum =
        op.dayNumber ??
        activeDays.find((d) => d.id === item?.dayId)?.dayNumber ??
        fallbackDay?.dayNumber ??
        1;
      const title = op.title || item?.title || 'stop';
      out.push({
        type: 'remove_stop',
        stopId: op.itemId,
        dayNumber: dayNum,
        title,
        summary: `Remove "${title}" from Day ${dayNum}`,
      });
    } else if (op.op === 'update' && op.itemId) {
      const item = allItems.find((i) => i.id === op.itemId);
      if (!item) continue;
      const dayNum =
        op.dayNumber ??
        activeDays.find((d) => d.id === item.dayId)?.dayNumber ??
        fallbackDay?.dayNumber ??
        1;
      out.push({
        type: 'update_stop',
        stopId: item.id,
        dayNumber: dayNum,
        title: op.title?.trim() || item.title,
        ...(op.startTime !== undefined ? { startTime: op.startTime } : {}),
        ...(op.durationMins !== undefined ? { durationMins: op.durationMins } : {}),
        ...(op.notes !== undefined ? { notes: op.notes } : {}),
        summary: `Update "${item.title}" on Day ${dayNum}`,
      });
    }
  }
  return out;
}

async function buildClientFallbackProposal(params: {
  prompt: string;
  workspace: TripWorkspace;
  activeDay: TripDay | null;
  candidates: CandidateMapPlace[];
}): Promise<AssistProposal> {
  const { prompt, workspace, candidates } = params;
  const activeDays = workspace.days
    .filter((d) => !d.deletedAt)
    .sort((a, b) => a.dayNumber - b.dayNumber);

  const dayMatch = /\bday\s*(\d+)\b/i.exec(prompt);
  const requestedDayNum = dayMatch ? Number(dayMatch[1]) : null;
  const targetDay =
    (requestedDayNum
      ? activeDays.find((d) => d.dayNumber === requestedDayNum)
      : null) ??
    params.activeDay ??
    activeDays[0];

  if (!targetDay) {
    return {
      headline: 'Add a day first so Itinbee can propose schedule changes.',
      mode: 'local',
      operations: [],
    };
  }

  const lower = prompt.toLowerCase();
  const operations: AssistOperation[] = [];
  const dayStops = getOrderedStopsForDay(workspace.items, targetDay.id);

  // 1. Pacing adjustments ("Make Day 2 more relaxed", "lighter pace")
  if (/\b(relax|relaxed|slower|lighter|easy|rest|calm)\b/i.test(lower)) {
    if (targetDay.pacingLevel !== 'relaxed') {
      operations.push({
        type: 'set_pacing',
        dayId: targetDay.id,
        dayNumber: targetDay.dayNumber,
        pacingLevel: 'relaxed',
        summary: `Set Day ${targetDay.dayNumber} pace to relaxed`,
      });
    }
    const nonTransit = dayStops.filter((s) => s.kind !== 'transit' && s.kind !== 'stay');
    if (dayStops.length > 3 && nonTransit.length > 0) {
      const overflow = nonTransit[nonTransit.length - 1]!;
      operations.push({
        type: 'move_to_shortlist',
        stopId: overflow.id,
        dayNumber: targetDay.dayNumber,
        title: overflow.title,
        summary: `Move "${overflow.title}" from Day ${targetDay.dayNumber} to Shortlist for breathing room`,
      });
    }
    if (operations.length === 0) {
      operations.push({
        type: 'add_stop',
        dayId: targetDay.id,
        dayNumber: targetDay.dayNumber,
        title: 'Afternoon rest & chai break',
        kind: 'note',
        startTime: '15:00',
        durationMins: 75,
        lat: null,
        lng: null,
        placeRefId: null,
        notes: 'Unscheduled rest window before evening plans',
        dietaryFlags: [],
        summary: `Add a 75-min afternoon rest window on Day ${targetDay.dayNumber}`,
      });
    }
    return {
      headline: `Proposed a calmer schedule for Day ${targetDay.dayNumber}`,
      mode: 'local',
      operations,
    };
  }

  // 2. Meal / vegetarian / café additions
  if (/\b(veg|vegetarian|jain|dinner|lunch|breakfast|cafe|café|coffee|meal|food)\b/i.test(lower)) {
    const isBreakfast = /\b(breakfast|morning|coffee|cafe|café)\b/i.test(lower);
    const isLunch = /\blunch\b/i.test(lower);
    const slotTime = isBreakfast ? '09:00' : isLunch ? '13:15' : '19:30';
    const mealWord = isBreakfast ? 'Morning café' : isLunch ? 'Lunch' : 'Dinner';
    const wantsVeg = /\b(veg|vegetarian|jain|satvik)\b/i.test(lower);

    const foodCandidate =
      candidates.find(
        (c) =>
          (c.category === 'food' || c.category === 'cafe') &&
          (!wantsVeg ||
            c.dietaryHints.some((h) => /veg|jain|vegan/i.test(h)) ||
            /veg|cafe|bakehouse|bhandar/i.test(c.name))
      ) ?? candidates.find((c) => c.category === 'food' || c.category === 'cafe');

    if (foodCandidate) {
      operations.push({
        type: 'add_stop',
        dayId: targetDay.id,
        dayNumber: targetDay.dayNumber,
        title: foodCandidate.name,
        kind: 'meal',
        startTime: slotTime,
        durationMins: foodCandidate.typicalDurationMins ?? 60,
        lat: foodCandidate.lat,
        lng: foodCandidate.lng,
        placeRefId: foodCandidate.refId,
        notes:
          foodCandidate.whyVisit ||
          foodCandidate.description ||
          `${mealWord} spot from open-data discovery`,
        dietaryFlags: wantsVeg
          ? Array.from(new Set(['vegetarian', ...foodCandidate.dietaryHints]))
          : foodCandidate.dietaryHints,
        summary: `Add "${foodCandidate.name}" (${slotTime}) to Day ${targetDay.dayNumber}`,
      });
    } else {
      const geoAnchor = dayStops.find(
        (s) => typeof s.lat === 'number' && typeof s.lng === 'number'
      );
      operations.push({
        type: 'add_stop',
        dayId: targetDay.id,
        dayNumber: targetDay.dayNumber,
        title: wantsVeg ? `Local Vegetarian ${mealWord}` : `${mealWord} Stop`,
        kind: 'meal',
        startTime: slotTime,
        durationMins: 60,
        lat: geoAnchor?.lat ?? null,
        lng: geoAnchor?.lng ?? null,
        placeRefId: null,
        notes: wantsVeg
          ? 'Pure-vegetarian / Jain-friendly dining slot near your route'
          : 'Dining slot reserved on timeline',
        dietaryFlags: wantsVeg ? ['vegetarian'] : [],
        summary: `Add ${wantsVeg ? 'vegetarian ' : ''}${mealWord.toLowerCase()} (${slotTime}) to Day ${targetDay.dayNumber}`,
      });
    }

    return {
      headline: `Proposed a ${mealWord.toLowerCase()} addition for Day ${targetDay.dayNumber}`,
      mode: 'local',
      operations,
    };
  }

  // 3. Named place addition ("Add Hawa Mahal to Day 1")
  const cleanedName = prompt
    .replace(/^\s*(please\s+)?(add|include|put|visit|schedule)\s+/i, '')
    .replace(/\s+(to|on|in|for)\s+day\s*\d+.*$/i, '')
    .trim();

  const candidateHit = candidates.find((c) =>
    c.name.toLowerCase().includes(cleanedName.toLowerCase())
  );

  if (candidateHit) {
    operations.push({
      type: 'add_stop',
      dayId: targetDay.id,
      dayNumber: targetDay.dayNumber,
      title: candidateHit.name,
      kind: mapPlaceCategoryToItemKind(candidateHit.category),
      startTime: '11:00',
      durationMins: candidateHit.typicalDurationMins ?? 75,
      lat: candidateHit.lat,
      lng: candidateHit.lng,
      placeRefId: candidateHit.refId,
      notes: candidateHit.whyVisit || candidateHit.description || '',
      dietaryFlags: candidateHit.dietaryHints,
      summary: `Add "${candidateHit.name}" (pinned on map) to Day ${targetDay.dayNumber}`,
    });
  } else if (cleanedName.length >= 2) {
    const geoResults = await fetchGeoAutocomplete(cleanedName);
    const topGeo = geoResults[0];
    operations.push({
      type: 'add_stop',
      dayId: targetDay.id,
      dayNumber: targetDay.dayNumber,
      title: topGeo ? topGeo.name : cleanedName,
      kind: 'activity',
      startTime: '11:00',
      durationMins: 75,
      lat: topGeo ? topGeo.lat : null,
      lng: topGeo ? topGeo.lng : null,
      placeRefId: topGeo ? topGeo.id : null,
      notes: topGeo?.secondary || 'Added via Ask Itinbee',
      dietaryFlags: [],
      summary: `Add "${topGeo ? topGeo.name : cleanedName}"${topGeo ? ' (grounded on OpenStreetMap)' : ''} to Day ${targetDay.dayNumber}`,
    });
  }

  return {
    headline: `Proposed update for Day ${targetDay.dayNumber}`,
    mode: 'local',
    operations,
  };
}

export function applyAssistProposalWithMutations(
  workspace: TripWorkspace,
  proposal: AssistProposal
): { nextWorkspace: TripWorkspace; mutations: SyncClientMutationInput[] } {
  let nextDays = [...workspace.days];
  let nextItems = [...workspace.items];
  let nextShortlist = [...workspace.shortlist];
  const mutations: SyncClientMutationInput[] = [];
  const baseSeq = workspace.trip.latestSeq;

  for (const op of proposal.operations) {
    if (op.type === 'set_pacing') {
      const hlc = nextClientHlc();
      nextDays = nextDays.map((d) => {
        if (d.id !== op.dayId) return d;
        const updated = { ...d, pacingLevel: op.pacingLevel, hlcTimestamp: hlc };
        mutations.push({
          clientOpId: crypto.randomUUID(),
          hlcTimestamp: hlc,
          baseSeq,
          entityType: 'trip_day',
          entityId: d.id,
          action: 'upsert',
          payload: {
            dayNumber: updated.dayNumber,
            themeTitle: updated.themeTitle,
            pacingLevel: updated.pacingLevel,
            date: updated.date,
          },
        });
        return updated;
      });
    } else if (op.type === 'add_stop') {
      const existingInDay = getOrderedStopsForDay(nextItems, op.dayId);
      const lastKey =
        existingInDay.length > 0
          ? existingInDay[existingInDay.length - 1]!.sortKey
          : null;
      const hlc = nextClientHlc();
      const added: ItineraryItem = {
        id: crypto.randomUUID(),
        tripId: workspace.trip.id,
        dayId: op.dayId,
        kind: op.kind,
        title: op.title,
        notes: op.notes,
        lat: op.lat,
        lng: op.lng,
        placeRefId: op.placeRefId,
        addressLocalScript: null,
        sortKey: midpointSortKey(lastKey, null),
        startTime: op.startTime,
        durationMins: op.durationMins,
        transitMeta: {},
        dietaryFlags: op.dietaryFlags,
        accessibilityNotes: '',
        elderSummaryI18n: {
          en: `${op.startTime ? `${op.startTime} — ` : ''}${op.title}`,
        },
        isShortlist: false,
        serverSeq: baseSeq + 1,
        hlcTimestamp: hlc,
        deletedAt: null,
        googleMapsUrl:
          op.lat !== null && op.lng !== null
            ? `https://www.google.com/maps/search/?api=1&query=${op.lat},${op.lng}`
            : null,
      };
      nextItems = [...nextItems, added];
      mutations.push({
        clientOpId: crypto.randomUUID(),
        hlcTimestamp: hlc,
        baseSeq,
        entityType: 'itinerary_item',
        entityId: added.id,
        action: 'upsert',
        payload: {
          dayId: added.dayId,
          kind: added.kind,
          title: added.title,
          notes: added.notes,
          lat: added.lat,
          lng: added.lng,
          placeRefId: added.placeRefId,
          sortKey: added.sortKey,
          startTime: added.startTime,
          durationMins: added.durationMins,
          dietaryFlags: added.dietaryFlags,
          isShortlist: false,
        },
      });
    } else if (op.type === 'move_stop') {
      nextItems = moveStopToDay(nextItems, op.stopId, op.targetDayId);
      const moved = nextItems.find((i) => i.id === op.stopId);
      if (moved) {
        mutations.push({
          clientOpId: crypto.randomUUID(),
          hlcTimestamp: moved.hlcTimestamp,
          baseSeq,
          entityType: 'itinerary_item',
          entityId: moved.id,
          action: 'upsert',
          payload: {
            dayId: moved.dayId,
            kind: moved.kind,
            title: moved.title,
            notes: moved.notes,
            lat: moved.lat,
            lng: moved.lng,
            placeRefId: moved.placeRefId,
            sortKey: moved.sortKey,
            startTime: moved.startTime,
            durationMins: moved.durationMins,
            dietaryFlags: moved.dietaryFlags,
            accessibilityNotes: moved.accessibilityNotes,
            isShortlist: false,
          },
        });
      }
    } else if (op.type === 'update_stop') {
      const hlc = nextClientHlc();
      nextItems = nextItems.map((i) => {
        if (i.id !== op.stopId) return i;
        const updated: ItineraryItem = {
          ...i,
          title: op.title || i.title,
          ...(op.startTime !== undefined ? { startTime: op.startTime } : {}),
          ...(op.durationMins !== undefined ? { durationMins: op.durationMins } : {}),
          ...(op.notes !== undefined ? { notes: op.notes } : {}),
          hlcTimestamp: hlc,
        };
        mutations.push({
          clientOpId: crypto.randomUUID(),
          hlcTimestamp: hlc,
          baseSeq,
          entityType: 'itinerary_item',
          entityId: updated.id,
          action: 'upsert',
          payload: {
            dayId: updated.dayId,
            kind: updated.kind,
            title: updated.title,
            notes: updated.notes,
            lat: updated.lat,
            lng: updated.lng,
            placeRefId: updated.placeRefId,
            sortKey: updated.sortKey,
            startTime: updated.startTime,
            durationMins: updated.durationMins,
            dietaryFlags: updated.dietaryFlags,
            accessibilityNotes: updated.accessibilityNotes,
            isShortlist: updated.isShortlist,
          },
        });
        return updated;
      });
    } else if (op.type === 'move_to_shortlist') {
      const found = nextItems.find((i) => i.id === op.stopId && !i.deletedAt);
      if (found) {
        const hlc = nextClientHlc();
        nextItems = nextItems.filter((i) => i.id !== op.stopId);
        const shortlisted: ItineraryItem = {
          ...found,
          dayId: null,
          isShortlist: true,
          hlcTimestamp: hlc,
        };
        nextShortlist = [...nextShortlist, shortlisted];
        mutations.push({
          clientOpId: crypto.randomUUID(),
          hlcTimestamp: hlc,
          baseSeq,
          entityType: 'itinerary_item',
          entityId: shortlisted.id,
          action: 'upsert',
          payload: {
            dayId: null,
            kind: shortlisted.kind,
            title: shortlisted.title,
            notes: shortlisted.notes,
            lat: shortlisted.lat,
            lng: shortlisted.lng,
            placeRefId: shortlisted.placeRefId,
            sortKey: shortlisted.sortKey,
            startTime: shortlisted.startTime,
            durationMins: shortlisted.durationMins,
            dietaryFlags: shortlisted.dietaryFlags,
            accessibilityNotes: shortlisted.accessibilityNotes,
            isShortlist: true,
          },
        });
      }
    } else if (op.type === 'remove_stop') {
      const nowIso = new Date().toISOString();
      const hlc = nextClientHlc();
      nextItems = nextItems.map((i) =>
        i.id === op.stopId ? { ...i, deletedAt: nowIso, hlcTimestamp: hlc } : i
      );
      mutations.push({
        clientOpId: crypto.randomUUID(),
        hlcTimestamp: hlc,
        baseSeq,
        entityType: 'itinerary_item',
        entityId: op.stopId,
        action: 'delete',
        payload: {},
      });
    }
  }

  return {
    nextWorkspace: {
      ...workspace,
      days: nextDays,
      items: nextItems,
      shortlist: nextShortlist,
    },
    mutations,
  };
}

export function applyAssistProposalToWorkspace(
  workspace: TripWorkspace,
  proposal: AssistProposal
): TripWorkspace {
  return applyAssistProposalWithMutations(workspace, proposal).nextWorkspace;
}

export function AskItinbeeBar({
  workspace,
  activeDay,
  candidates,
  onApplyProposal,
}: AskItinbeeBarProps) {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<AssistProposal | null>(null);

  const runPrompt = async (inputText?: string) => {
    const text = (inputText ?? prompt).trim();
    if (!text) return;
    setBusy(true);
    try {
      if (UUID_RE.test(workspace.trip.id)) {
        const res = await requestTripAssist(workspace.trip.id, {
          instruction: text,
          dayId: activeDay && UUID_RE.test(activeDay.id) ? activeDay.id : undefined,
        });
        if (res.proposal && Array.isArray(res.proposal.operations)) {
          const mappedOps = mapBackendOpsToClientOps(
            res.proposal.operations,
            workspace,
            activeDay
          );
          if (mappedOps.length > 0) {
            setProposal({
              headline: res.proposal.summary || 'Proposed itinerary changes',
              mode: res.mode,
              operations: mappedOps,
            });
            setBusy(false);
            return;
          }
        }
      }
    } catch {
      // Fall back to grounded client-side planner below
    }

    const fallback = await buildClientFallbackProposal({
      prompt: text,
      workspace,
      activeDay,
      candidates,
    });
    setProposal(fallback);
    setBusy(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runPrompt();
  };

  const handleAccept = () => {
    if (!proposal || proposal.operations.length === 0) {
      setProposal(null);
      return;
    }
    const { nextWorkspace, mutations } = applyAssistProposalWithMutations(
      workspace,
      proposal
    );
    onApplyProposal(nextWorkspace, proposal.headline, mutations);
    setProposal(null);
    setPrompt('');
  };

  return (
    <section
      aria-label="Ask Itinbee itinerary assistant"
      className="space-y-3 border-t border-navy/15 pt-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-1.5 text-[15px] font-bold text-navy">
          <Wand2 className="h-4 w-4 text-trunk" strokeWidth={1.9} aria-hidden="true" />
          <span>Ask Itinbee</span>
        </h3>
        <span className="text-[12px] text-paper-ink">
          Reviews diff before changing your plan
        </span>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
        <label htmlFor="ask-itinbee-input" className="sr-only">
          Describe an edit to your itinerary
        </label>
        <input
          id="ask-itinbee-input"
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={`e.g. "Make Day ${activeDay?.dayNumber ?? 1} more relaxed" or "Add Hawa Mahal to Day 1"`}
          className="field min-w-[200px] flex-1 text-[14px]"
        />
        <button
          type="submit"
          disabled={busy || !prompt.trim()}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border-2 border-navy bg-navy px-4 py-2 text-[14px] font-bold text-[#FFFDF8] transition-colors hover:bg-trunk disabled:opacity-45"
        >
          <Sparkles className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
          <span>{busy ? 'Drafting…' : 'Propose'}</span>
        </button>
      </form>

      {/* Quick example chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        {EXAMPLE_PROMPTS.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => {
              setPrompt(ex);
              void runPrompt(ex);
            }}
            className="chip-paper text-[12px]"
          >
            {ex}
          </button>
        ))}
      </div>

      {/* Proposed Changes Diff Banner */}
      {proposal && (
        <div
          role="region"
          aria-label="Proposed itinerary changes"
          className="space-y-2.5 rounded-xl border-2 border-navy bg-[#FFFDF8] p-4 shadow-panel"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="font-bold text-navy">{proposal.headline}</div>
            <span className="rounded-full bg-paper px-2 py-0.5 text-[11px] font-semibold text-navy">
              {proposal.mode === 'ai' ? 'AI grounded diff' : 'Proposed diff'}
            </span>
          </div>

          {proposal.operations.length === 0 ? (
            <p className="text-[13.5px] text-paper-ink">
              No changes could be matched. Try naming a place or day.
            </p>
          ) : (
            <ul className="space-y-1.5 text-[13.5px] text-navy">
              {proposal.operations.map((op, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-0.5 font-mono text-[12px] font-bold text-trunk">
                    {op.type === 'add_stop'
                      ? '+'
                      : op.type === 'remove_stop'
                        ? '−'
                        : '~'}
                  </span>
                  <span>{op.summary}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {proposal.operations.length > 0 && (
              <button
                type="button"
                onClick={handleAccept}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border-2 border-navy bg-trunk px-3.5 py-1.5 text-[13px] font-bold text-[#FFFDF8] transition-colors hover:bg-trunk-deep"
              >
                <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                <span>Accept changes</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setProposal(null)}
              className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-navy/35 bg-[#FFFDF8] px-3 py-1.5 text-[13px] font-semibold text-navy hover:bg-paper"
            >
              <X className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              <span>Dismiss</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
