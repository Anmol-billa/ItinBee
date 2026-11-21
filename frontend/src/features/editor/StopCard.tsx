'use client';

import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Bed,
  Clock,
  ExternalLink,
  FileText,
  GripVertical,
  MapPin,
  Train,
  Trash2,
  Utensils,
} from 'lucide-react';
import type { BookingView, ItemKind, ItineraryItem, TripDay } from '@/lib/types';
import { getDayColor } from '@/features/map/day-palette';

interface StopCardProps {
  stop: ItineraryItem;
  index: number;
  totalInDay: number;
  dayNumber: number;
  allDays: TripDay[];
  booking?: BookingView;
  isHighlighted: boolean;
  isDragOver: boolean;
  onHighlight: (stopId: string) => void;
  onMoveOffset: (stopId: string, delta: -1 | 1) => void;
  onMoveToDay: (stopId: string, targetDayId: string) => void;
  onUpdateStop: (
    stopId: string,
    patch: Partial<Pick<ItineraryItem, 'startTime' | 'durationMins' | 'title' | 'notes'>>
  ) => void;
  onRemoveStop: (stopId: string) => void;
  onDragStartIndex: (index: number) => void;
  onDragOverIndex: (index: number) => void;
  onDropAtIndex: (index: number) => void;
  onDragEnd: () => void;
}

const KIND_LABELS: Record<ItemKind, { label: string; Icon: React.ElementType }> = {
  stay: { label: 'Stay', Icon: Bed },
  transit: { label: 'Transit', Icon: Train },
  activity: { label: 'Sight / Activity', Icon: MapPin },
  meal: { label: 'Food / Café', Icon: Utensils },
  note: { label: 'Note', Icon: FileText },
};

const DURATION_OPTIONS = [
  { mins: 30, label: '30m' },
  { mins: 45, label: '45m' },
  { mins: 60, label: '1h' },
  { mins: 75, label: '1h 15m' },
  { mins: 90, label: '1h 30m' },
  { mins: 120, label: '2h' },
  { mins: 180, label: '3h' },
  { mins: 240, label: '4h' },
  { mins: 300, label: '5h' },
];

export function StopCard({
  stop,
  index,
  totalInDay,
  dayNumber,
  allDays,
  booking,
  isHighlighted,
  isDragOver,
  onHighlight,
  onMoveOffset,
  onMoveToDay,
  onUpdateStop,
  onRemoveStop,
  onDragStartIndex,
  onDragOverIndex,
  onDropAtIndex,
  onDragEnd,
}: StopCardProps) {
  const [dragArmed, setDragArmed] = useState(false);
  const pinColor = getDayColor(dayNumber);
  const kindMeta = KIND_LABELS[stop.kind] ?? KIND_LABELS.activity;
  const KindIcon = kindMeta.Icon;

  const statusTone =
    booking?.status === 'confirmed'
      ? 'bg-jade-wash text-jade border-jade/30'
      : 'bg-honey-wash text-honey-darker border-honey/40';

  const statusLabel =
    booking?.status === 'confirmed'
      ? 'CNF'
      : booking?.status?.toUpperCase() ?? '';

  return (
    <article
      draggable={dragArmed}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(index));
        onDragStartIndex(index);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        onDragOverIndex(index);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragArmed(false);
        onDropAtIndex(index);
      }}
      onDragEnd={() => {
        setDragArmed(false);
        onDragEnd();
      }}
      onMouseEnter={() => onHighlight(stop.id)}
      onClick={() => onHighlight(stop.id)}
      data-testid="timeline-stop-card"
      className={`rounded-xl border p-3.5 transition-colors ${
        isDragOver
          ? 'border-2 border-dashed border-vermilion-deep bg-paper-light'
          : isHighlighted
            ? 'border-2 border-navy bg-paper-light shadow-panel'
            : 'border-navy/20 bg-[#FFFDF8] shadow-panel hover:border-navy/45'
      }`}
    >
      <div className="flex items-start justify-between gap-2.5">
        {/* Left: Drag Handle + Day-colored Numbered Pin + Title */}
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <button
            type="button"
            onPointerDown={() => setDragArmed(true)}
            onPointerUp={() => setDragArmed(false)}
            aria-label={`Drag handle to reorder ${stop.title}. Or use Move up and Move down buttons.`}
            className="mt-0.5 inline-grid h-7 w-6 shrink-0 cursor-grab touch-none select-none place-items-center rounded text-paper-ink hover:bg-paper hover:text-navy active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
          </button>

          <span
            aria-hidden="true"
            className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[12px] font-bold tabular-nums text-white"
            style={{ backgroundColor: pinColor }}
          >
            {index + 1}
          </span>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="text-[15px] font-bold leading-snug text-navy">
                {stop.title}
              </h3>

              <span className="inline-flex items-center gap-1 rounded-full bg-paper px-2 py-0.5 text-[11px] font-semibold text-navy">
                <KindIcon className="h-3 w-3" strokeWidth={1.8} aria-hidden="true" />
                {kindMeta.label}
              </span>

              {booking && (
                <span
                  className={`rounded-full border px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums ${statusTone}`}
                >
                  {statusLabel}
                  {booking.pnrMasked ? ` · ${booking.pnrMasked}` : ''}
                </span>
              )}
            </div>

            {stop.notes && (
              <p className="text-[13.5px] leading-relaxed text-paper-ink">
                {stop.notes}
              </p>
            )}

            {(stop.dietaryFlags.length > 0 || stop.accessibilityNotes) && (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {stop.dietaryFlags.map((flag) => (
                  <span
                    key={flag}
                    className="rounded bg-jade-wash px-1.5 py-0.5 text-[11px] font-semibold text-jade"
                  >
                    {flag}
                  </span>
                ))}
                {stop.accessibilityNotes && (
                  <span className="text-[12px] text-paper-ink">
                    {stop.accessibilityNotes}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Keyboard-accessible Reorder & Remove Actions */}
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            disabled={index === 0}
            onClick={(e) => {
              e.stopPropagation();
              onMoveOffset(stop.id, -1);
            }}
            aria-label={`Move ${stop.title} up`}
            className="icon-hit inline-grid h-8 w-8 place-items-center rounded-md text-navy hover:bg-paper disabled:opacity-30"
          >
            <ArrowUp className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
          </button>

          <button
            type="button"
            disabled={index === totalInDay - 1}
            onClick={(e) => {
              e.stopPropagation();
              onMoveOffset(stop.id, 1);
            }}
            aria-label={`Move ${stop.title} down`}
            className="icon-hit inline-grid h-8 w-8 place-items-center rounded-md text-navy hover:bg-paper disabled:opacity-30"
          >
            <ArrowDown className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveStop(stop.id);
            }}
            aria-label={`Remove ${stop.title}`}
            className="icon-hit inline-grid h-8 w-8 place-items-center rounded-md text-vermilion-deep hover:bg-paper"
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Bottom Controls: Inline Time, Duration, Move to Day, Google Maps */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-navy/10 pt-2.5 text-[12.5px]"
      >
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1 font-mono text-[12px] text-navy">
            <Clock className="h-3.5 w-3.5 text-paper-ink" strokeWidth={1.8} aria-hidden="true" />
            <span className="sr-only">Start time for {stop.title}</span>
            <input
              type="time"
              value={stop.startTime ?? ''}
              onChange={(e) =>
                onUpdateStop(stop.id, { startTime: e.target.value || null })
              }
              aria-label={`Start time for ${stop.title}`}
              className="min-h-[30px] rounded border border-navy/25 bg-[#FFFDF8] px-1.5 py-0.5 font-mono text-[12px] tabular-nums text-navy"
            />
          </label>

          <label className="inline-flex items-center gap-1 text-[12px] text-paper-ink">
            <span>Stay:</span>
            <select
              value={stop.durationMins ?? 60}
              onChange={(e) =>
                onUpdateStop(stop.id, { durationMins: Number(e.target.value) })
              }
              aria-label={`Duration at ${stop.title}`}
              className="min-h-[30px] rounded border border-navy/25 bg-[#FFFDF8] px-1.5 py-0.5 font-mono text-[12px] tabular-nums text-navy"
            >
              {DURATION_OPTIONS.map((opt) => (
                <option key={opt.mins} value={opt.mins}>
                  {opt.label}
                </option>
              ))}
              {stop.durationMins &&
                !DURATION_OPTIONS.some((o) => o.mins === stop.durationMins) && (
                  <option value={stop.durationMins}>
                    {stop.durationMins < 60
                      ? `${stop.durationMins}m`
                      : stop.durationMins % 60 === 0
                        ? `${Math.floor(stop.durationMins / 60)}h`
                        : `${Math.floor(stop.durationMins / 60)}h ${stop.durationMins % 60}m`}
                  </option>
                )}
            </select>
          </label>
        </div>

        <div className="flex items-center gap-2">
          {allDays.length > 1 && stop.dayId && (
            <label className="inline-flex items-center gap-1 text-[12px] text-paper-ink">
              <span className="sr-only">Move {stop.title} to day</span>
              <select
                value={stop.dayId}
                onChange={(e) => onMoveToDay(stop.id, e.target.value)}
                aria-label={`Move ${stop.title} to another day`}
                className="min-h-[30px] rounded border border-navy/25 bg-[#FFFDF8] px-2 py-0.5 text-[12px] font-semibold text-navy"
              >
                {allDays.map((d) => (
                  <option key={d.id} value={d.id}>
                    Day {d.dayNumber}
                  </option>
                ))}
              </select>
            </label>
          )}

          {stop.googleMapsUrl && (
            <a
              href={stop.googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${stop.title} in Google Maps`}
              className="inline-flex min-h-[30px] items-center gap-1 rounded border border-navy/20 bg-paper/60 px-2 py-0.5 text-[12px] font-semibold text-navy hover:bg-paper"
            >
              <span>Map</span>
              <ExternalLink className="h-3 w-3" strokeWidth={1.8} aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
