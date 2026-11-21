'use client';

import React, { useState } from 'react';
import { Check, Sparkles, Wand2, X } from 'lucide-react';
import { browserApiBase } from '@/lib/api-base';
import { midpointSortKey, nextClientHlc } from '@/lib/offline-db';
import type { ItemKind, ItineraryItem, PacingLevel, TripDay, TripWorkspace } from '@/lib/types';
import type { CandidateMapPlace } from '@/features/map/map-utils';
import { getOrderedStopsForDay, mapPlaceCategoryToItemKind } from './editor-helpers';
import { fetchGeoAutocomplete } from './places-discovery';

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
  mode: 'ai' | 'local';
  operations: AssistOperation[];
}

interface AskItinbeeBarProps {
  workspace: TripWorkspace;
  activeDay: TripDay | null;
  candidates: CandidateMapPlace[];
  onApplyProposal: (nextWorkspace: TripWorkspace, summaryMsg: string) => void;
}

const EXAMPLE_PROMPTS = [
  'Make this day more relaxed',
  'Add a vegetarian dinner',
  'Add a morning café stop',
] as const;

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

  // 1. Pacing adjustments ("Make Day 2 more relaxed", "lighter pace", "packed")
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

    const foodCandidate = candidates.find(
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

export function applyAssistProposalToWorkspace(
  workspace: TripWorkspace,
  proposal: AssistProposal
): TripWorkspace {
  let nextDays = [...workspace.days];
  let nextItems = [...workspace.items];
  let nextShortlist = [...workspace.shortlist];

  for (const op of proposal.operations) {
    if (op.type === 'set_pacing') {
      nextDays = nextDays.map((d) =>
        d.id === op.dayId
          ? { ...d, pacingLevel: op.pacingLevel, hlcTimestamp: nextClientHlc() }
          : d
      );
    } else if (op.type === 'add_stop') {
      const existingInDay = getOrderedStopsForDay(nextItems, op.dayId);
      const lastKey =
        existingInDay.length > 0
          ? existingInDay[existingInDay.length - 1]!.sortKey
          : null;
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
        serverSeq: workspace.trip.latestSeq + 1,
        hlcTimestamp: nextClientHlc(),
        deletedAt: null,
        googleMapsUrl:
          op.lat !== null && op.lng !== null
            ? `https://www.google.com/maps/search/?api=1&query=${op.lat},${op.lng}`
            : null,
      };
      nextItems = [...nextItems, added];
    } else if (op.type === 'move_to_shortlist') {
      const found = nextItems.find((i) => i.id === op.stopId && !i.deletedAt);
      if (found) {
        nextItems = nextItems.filter((i) => i.id !== op.stopId);
        nextShortlist = [
          ...nextShortlist,
          {
            ...found,
            dayId: null,
            isShortlist: true,
            hlcTimestamp: nextClientHlc(),
          },
        ];
      }
    } else if (op.type === 'remove_stop') {
      const nowIso = new Date().toISOString();
      nextItems = nextItems.map((i) =>
        i.id === op.stopId ? { ...i, deletedAt: nowIso, hlcTimestamp: nextClientHlc() } : i
      );
    }
  }

  return {
    ...workspace,
    days: nextDays,
    items: nextItems,
    shortlist: nextShortlist,
  };
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
      const res = await fetch(
        `${browserApiBase()}/v1/trips/${encodeURIComponent(workspace.trip.id)}/assist`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: text,
            dayNumber: activeDay?.dayNumber ?? 1,
          }),
          signal: AbortSignal.timeout(5000),
        }
      );

      if (res.ok) {
        const data = (await res.json()) as {
          headline?: string;
          summary?: string;
          operations?: AssistOperation[];
        };
        if (Array.isArray(data.operations) && data.operations.length > 0) {
          setProposal({
            headline: data.headline || data.summary || 'Proposed itinerary changes',
            mode: 'ai',
            operations: data.operations,
          });
          setBusy(false);
          return;
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
    const updated = applyAssistProposalToWorkspace(workspace, proposal);
    onApplyProposal(updated, proposal.headline);
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
              Proposed diff
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
