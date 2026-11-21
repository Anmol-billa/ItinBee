'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  ExternalLink,
  Plus,
  Trash2,
} from 'lucide-react';
import type {
  BookingView,
  ItemKind,
  ItineraryItem,
  PacingLevel,
  TripDay,
  TripWorkspace,
} from '@/lib/types';
import { getDayColor } from '@/features/map/day-palette';
import {
  buildDayGoogleMapsUrl,
  isValidCoordinate,
  type CandidateMapPlace,
  type RouteLegResult,
} from '@/features/map/map-utils';
import { AskItinbeeBar } from './AskItinbeeBar';
import {
  computeDayPacingWarning,
  getOrderedStopsForDay,
} from './editor-helpers';
import { StopCard } from './StopCard';
import { TravelConnector } from './TravelConnector';

interface TimelinePaneProps {
  workspace: TripWorkspace;
  activeDays: TripDay[];
  currentDay: TripDay | null;
  highlightedStopId: string | null;
  candidates: CandidateMapPlace[];
  routeLegsByPairKey: Record<string, RouteLegResult>;
  onSelectDay: (dayId: string) => void;
  onAddDay: () => void;
  onUpdateDay: (
    dayId: string,
    patch: Partial<Pick<TripDay, 'themeTitle' | 'pacingLevel' | 'date'>>
  ) => void;
  onHighlightStop: (stopId: string) => void;
  onReorderStops: (dayId: string, fromIndex: number, toIndex: number) => void;
  onMoveStopOffset: (dayId: string, stopId: string, delta: -1 | 1) => void;
  onMoveStopToDay: (stopId: string, targetDayId: string) => void;
  onUpdateStop: (
    stopId: string,
    patch: Partial<Pick<ItineraryItem, 'startTime' | 'durationMins' | 'title' | 'notes'>>
  ) => void;
  onRemoveStop: (stopId: string) => void;
  onAddManualStop: (input: {
    title: string;
    kind: ItemKind;
    startTime: string | null;
  }) => void;
  onPromoteShortlist: (shortlistId: string, targetDayId: string) => void;
  onRemoveShortlist: (shortlistId: string) => void;
  onLegResolved: (pairKey: string, leg: RouteLegResult) => void;
  onApplyAssistProposal: (nextWorkspace: TripWorkspace, summaryMsg: string) => void;
}

export function TimelinePane({
  workspace,
  activeDays,
  currentDay,
  highlightedStopId,
  candidates,
  routeLegsByPairKey,
  onSelectDay,
  onAddDay,
  onUpdateDay,
  onHighlightStop,
  onReorderStops,
  onMoveStopOffset,
  onMoveStopToDay,
  onUpdateStop,
  onRemoveStop,
  onAddManualStop,
  onPromoteShortlist,
  onRemoveShortlist,
  onLegResolved,
  onApplyAssistProposal,
}: TimelinePaneProps) {
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  // Quick manual stop state
  const [quickTitle, setQuickTitle] = useState('');
  const [quickKind, setQuickKind] = useState<ItemKind>('activity');
  const [quickTime, setQuickTime] = useState('10:00');

  const currentDayStops = useMemo(() => {
    if (!currentDay) return [];
    return getOrderedStopsForDay(workspace.items, currentDay.id);
  }, [workspace.items, currentDay]);

  const bookingByItem = useMemo(
    () =>
      new Map<string, BookingView>(
        workspace.bookings
          .filter((b) => b.itemId)
          .map((b) => [b.itemId as string, b])
      ),
    [workspace.bookings]
  );

  const routeMinutesByPair = useMemo(() => {
    const map = new Map<string, number>();
    for (const [k, leg] of Object.entries(routeLegsByPairKey)) {
      map.set(k, Math.round(leg.durationS / 60));
    }
    return map;
  }, [routeLegsByPairKey]);

  const pacingCheck = useMemo(
    () =>
      computeDayPacingWarning({
        stops: currentDayStops,
        routeMinutesByPair,
        elderModeEnabled: workspace.trip.elderModeEnabled,
        pacingLevel: currentDay?.pacingLevel,
      }),
    [
      currentDayStops,
      routeMinutesByPair,
      workspace.trip.elderModeEnabled,
      currentDay?.pacingLevel,
    ]
  );

  const dayGoogleMapsUrl = useMemo(
    () => buildDayGoogleMapsUrl(currentDayStops),
    [currentDayStops]
  );

  const visibleShortlist = useMemo(
    () => workspace.shortlist.filter((s) => !s.deletedAt),
    [workspace.shortlist]
  );

  const dayColor = getDayColor(currentDay?.dayNumber ?? 1);

  const handleQuickAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim()) return;
    onAddManualStop({
      title: quickTitle.trim(),
      kind: quickKind,
      startTime: quickTime || null,
    });
    setQuickTitle('');
  };

  return (
    <section
      aria-label="Day-by-day itinerary timeline"
      className="flex h-full flex-col bg-[#FAF4E6] text-navy"
    >
      {/* Polite screen-reader live region for stop reordering */}
      <div className="sr-only" aria-live="polite">
        {liveAnnouncement}
      </div>

      {/* Day Selector Bar */}
      <div className="border-b border-navy/15 bg-[#FFFDF8] px-4 py-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {activeDays.map((day) => {
            const selected = currentDay?.id === day.id;
            const color = getDayColor(day.dayNumber);
            return (
              <button
                key={day.id}
                type="button"
                onClick={() => onSelectDay(day.id)}
                aria-pressed={selected}
                className={`inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1 text-[13.5px] font-bold transition-colors ${
                  selected
                    ? 'border-2 border-navy bg-saffron text-navy'
                    : 'border-navy/25 bg-[#FFFDF8] text-navy hover:bg-paper'
                }`}
              >
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 rounded-full border border-white/80"
                  style={{ backgroundColor: color }}
                />
                <span>Day {day.dayNumber}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={onAddDay}
            className="inline-flex min-h-[38px] shrink-0 items-center gap-1 rounded-full border border-dashed border-navy/45 bg-[#FFFDF8] px-3 py-1 text-[13px] font-semibold text-navy transition-colors hover:bg-paper"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden="true" />
            <span>Add day</span>
          </button>
        </div>
      </div>

      {/* Scrollable Day Content */}
      <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
        {currentDay && (
          <div className="space-y-3 border-b border-navy/15 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="display text-[30px] leading-none text-navy">
                Day {currentDay.dayNumber}
                {currentDay.date ? (
                  <span className="ml-2 font-mono text-[13px] font-medium tabular-nums text-paper-ink">
                    {currentDay.date}
                  </span>
                ) : null}
              </h2>

              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-paper-ink">
                  <span>Pace:</span>
                  <select
                    value={currentDay.pacingLevel}
                    onChange={(e) =>
                      onUpdateDay(currentDay.id, {
                        pacingLevel: e.target.value as PacingLevel,
                      })
                    }
                    aria-label={`Pacing for Day ${currentDay.dayNumber}`}
                    className="min-h-[34px] rounded-md border border-navy/30 bg-[#FFFDF8] px-2 py-1 text-[12.5px] font-semibold text-navy"
                  >
                    <option value="relaxed">Relaxed</option>
                    <option value="moderate">Moderate</option>
                    <option value="packed">Packed</option>
                  </select>
                </label>

                {dayGoogleMapsUrl && (
                  <a
                    href={dayGoogleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="open-day-google-maps"
                    className="inline-flex min-h-[34px] items-center gap-1.5 rounded-md border border-navy/30 bg-[#FFFDF8] px-2.5 py-1 text-[12.5px] font-semibold text-navy transition-colors hover:bg-paper"
                  >
                    <span>Open Day {currentDay.dayNumber} in Google Maps</span>
                    <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
                  </a>
                )}
              </div>
            </div>

            {/* Editable Day Theme Title */}
            <div>
              <label
                htmlFor={`day-theme-${currentDay.id}`}
                className="sr-only"
              >
                Day {currentDay.dayNumber} theme title
              </label>
              <input
                id={`day-theme-${currentDay.id}`}
                type="text"
                value={currentDay.themeTitle}
                onChange={(e) =>
                  onUpdateDay(currentDay.id, { themeTitle: e.target.value })
                }
                placeholder={`Theme for Day ${currentDay.dayNumber}…`}
                className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[15px] font-semibold text-navy hover:border-navy/25 focus:border-navy focus:bg-[#FFFDF8]"
              />
            </div>

            {/* Automatic Pacing Warning Badge */}
            {pacingCheck.hasWarning && (
              <div
                role="status"
                data-testid="pacing-warning-banner"
                className="flex items-start gap-2.5 rounded-lg border border-honey/50 bg-honey-wash px-3.5 py-2.5 text-[13px] font-medium text-honey-darker"
              >
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 shrink-0 text-honey-deep"
                  strokeWidth={1.9}
                  aria-hidden="true"
                />
                <div>
                  <span className="font-bold">Pacing check: </span>
                  <span>{pacingCheck.summaryLabel}.</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Ordered Stop Cards + Travel Connectors */}
        {currentDayStops.length === 0 ? (
          <div className="rounded-xl border border-dashed border-navy/30 bg-[#FFFDF8] px-5 py-8 text-center">
            <p className="text-[15px] font-bold text-navy">
              Day {currentDay?.dayNumber ?? 1} is wide open
            </p>
            <p className="mx-auto mt-1 max-w-xs text-[13.5px] text-paper-ink">
              Click <strong className="text-navy">+ Day {currentDay?.dayNumber ?? 1}</strong> on any place in the Explore panel, or add a custom note below.
            </p>
          </div>
        ) : (
          <ol className="space-y-2">
            {currentDayStops.map((stop, idx) => {
              const prevStop = idx > 0 ? currentDayStops[idx - 1] : null;
              const bothGeo =
                prevStop &&
                typeof prevStop.lat === 'number' &&
                typeof prevStop.lng === 'number' &&
                typeof stop.lat === 'number' &&
                typeof stop.lng === 'number' &&
                isValidCoordinate(prevStop.lat, prevStop.lng) &&
                isValidCoordinate(stop.lat, stop.lng) &&
                !(
                  prevStop.kind === 'transit' &&
                  Math.hypot(prevStop.lat - stop.lat, prevStop.lng - stop.lng) > 0.6
                );

              return (
                <li key={stop.id}>
                  {bothGeo && (
                    <TravelConnector
                      fromStop={prevStop as ItineraryItem & { lat: number; lng: number }}
                      toStop={stop as ItineraryItem & { lat: number; lng: number }}
                      dayColor={dayColor}
                      onLegResolved={onLegResolved}
                    />
                  )}

                  <StopCard
                    stop={stop}
                    index={idx}
                    totalInDay={currentDayStops.length}
                    dayNumber={currentDay?.dayNumber ?? 1}
                    allDays={activeDays}
                    booking={bookingByItem.get(stop.id)}
                    isHighlighted={stop.id === highlightedStopId}
                    isDragOver={dragOverIdx === idx && dragFromIdx !== idx}
                    onHighlight={onHighlightStop}
                    onMoveOffset={(stopId, delta) => {
                      if (!currentDay) return;
                      onMoveStopOffset(currentDay.id, stopId, delta);
                      const newPos = idx + delta + 1;
                      setLiveAnnouncement(
                        `Moved ${stop.title} to stop ${newPos} of ${currentDayStops.length}.`
                      );
                    }}
                    onMoveToDay={onMoveStopToDay}
                    onUpdateStop={onUpdateStop}
                    onRemoveStop={onRemoveStop}
                    onDragStartIndex={(i) => setDragFromIdx(i)}
                    onDragOverIndex={(i) => setDragOverIdx(i)}
                    onDropAtIndex={(targetIdx) => {
                      if (
                        currentDay &&
                        dragFromIdx !== null &&
                        dragFromIdx !== targetIdx
                      ) {
                        onReorderStops(currentDay.id, dragFromIdx, targetIdx);
                        setLiveAnnouncement(
                          `Moved stop to position ${targetIdx + 1} on Day ${currentDay.dayNumber}.`
                        );
                      }
                      setDragFromIdx(null);
                      setDragOverIdx(null);
                    }}
                    onDragEnd={() => {
                      setDragFromIdx(null);
                      setDragOverIdx(null);
                    }}
                  />
                </li>
              );
            })}
          </ol>
        )}

        {/* Quick Custom Stop / Note Form */}
        <form
          onSubmit={handleQuickAddSubmit}
          className="flex flex-wrap items-center gap-2 pt-1"
        >
          <label htmlFor="quick-stop-time" className="sr-only">
            New stop time
          </label>
          <input
            id="quick-stop-time"
            type="time"
            value={quickTime}
            onChange={(e) => setQuickTime(e.target.value)}
            className="min-h-[40px] rounded-lg border border-navy/35 bg-[#FFFDF8] px-2 py-1 font-mono text-[13px] text-navy"
          />

          <label htmlFor="quick-stop-kind" className="sr-only">
            New stop type
          </label>
          <select
            id="quick-stop-kind"
            value={quickKind}
            onChange={(e) => setQuickKind(e.target.value as ItemKind)}
            className="min-h-[40px] rounded-lg border border-navy/35 bg-[#FFFDF8] px-2 py-1 text-[13px] font-semibold text-navy"
          >
            <option value="activity">Activity</option>
            <option value="meal">Meal</option>
            <option value="stay">Stay</option>
            <option value="transit">Transit</option>
            <option value="note">Note</option>
          </select>

          <label htmlFor="quick-stop-title" className="sr-only">
            Custom stop or note title
          </label>
          <input
            id="quick-stop-title"
            type="text"
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            placeholder="Add custom stop or note…"
            className="min-h-[40px] min-w-[160px] flex-1 rounded-lg border border-navy/35 bg-[#FFFDF8] px-3 py-1 text-[14px] text-navy placeholder:text-[#566079]"
          />

          <button
            type="submit"
            disabled={!quickTitle.trim()}
            className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-navy bg-paper px-3 py-1 text-[13px] font-bold text-navy transition-colors hover:bg-paper-dark disabled:opacity-45"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            <span>Add</span>
          </button>
        </form>

        {/* Ask Itinbee Natural-Language Edit Bar */}
        <AskItinbeeBar
          workspace={workspace}
          activeDay={currentDay}
          candidates={candidates}
          onApplyProposal={onApplyAssistProposal}
        />

        {/* Shortlist Section at Bottom of Timeline */}
        <section
          aria-label="Shortlisted places"
          className="space-y-2.5 border-t border-navy/15 pt-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="inline-flex items-center gap-1.5 text-[15px] font-bold text-navy">
              <Bookmark className="h-4 w-4 text-navy" strokeWidth={1.8} aria-hidden="true" />
              <span>Shortlist ({visibleShortlist.length})</span>
            </h3>
            <span className="text-[12px] text-paper-ink">
              1-click promote to Day {currentDay?.dayNumber ?? 1}
            </span>
          </div>

          {visibleShortlist.length === 0 ? (
            <p className="text-[13px] text-paper-ink">
              Bookmark places in the Explore panel or paste a social link in Bookings to hold candidate stops here.
            </p>
          ) : (
            <ul className="divide-y divide-navy/15 rounded-xl border border-navy/20 bg-[#FFFDF8]">
              {visibleShortlist.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2.5 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-bold text-navy">
                      {item.title}
                    </div>
                    {item.notes && (
                      <div className="truncate text-[12.5px] text-paper-ink">
                        {item.notes}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {currentDay && (
                      <button
                        type="button"
                        onClick={() => onPromoteShortlist(item.id, currentDay.id)}
                        className="inline-flex min-h-[34px] items-center gap-1 rounded-md border border-navy bg-saffron px-2.5 py-1 text-[12.5px] font-bold text-navy hover:bg-saffron/85"
                      >
                        <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                        <span>+ Day {currentDay.dayNumber}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onRemoveShortlist(item.id)}
                      aria-label={`Remove ${item.title} from shortlist`}
                      className="icon-hit inline-grid h-8 w-8 place-items-center rounded-md text-vermilion-deep hover:bg-paper"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}
