'use client';

import React, { useState } from 'react';
import { ExternalLink, Languages, ShieldCheck } from 'lucide-react';
import type { BookingView, ItineraryItem, TripDay, TripMeta } from '@/lib/types';

interface ElderCardViewProps {
  trip: Pick<TripMeta, 'title' | 'destinationSummary' | 'shortId'>;
  days: TripDay[];
  items: ItineraryItem[];
  bookings: BookingView[];
}

export function ElderCardView({ trip, days, items, bookings }: ElderCardViewProps) {
  const [lang, setLang] = useState<'en' | 'hi'>('en');

  const activeDays = days
    .filter((d) => !d.deletedAt)
    .sort((a, b) => a.dayNumber - b.dayNumber);

  const bookingByItem = new Map(
    bookings.filter((b) => b.itemId).map((b) => [b.itemId as string, b])
  );

  return (
    <section
      aria-label="Family and Elder readable itinerary card"
      className="mx-auto max-w-2xl space-y-6 rounded-xl border border-line-strong bg-canvas-elevated p-5 sm:p-7"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
        <div className="space-y-1.5">
          <h2 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            {trip.title}
          </h2>
          <p className="text-base text-ink-secondary">{trip.destinationSummary}</p>
        </div>

        <button
          type="button"
          onClick={() => setLang((prev) => (prev === 'en' ? 'hi' : 'en'))}
          className="inline-flex items-center gap-2 rounded-lg border border-ink bg-ink px-3.5 py-2 text-sm font-medium text-canvas-elevated transition-colors hover:bg-ink/90"
        >
          <Languages className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />
          {lang === 'en' ? 'हिन्दी में देखें (अ)' : 'Read in English (A)'}
        </button>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-line bg-canvas-subtle px-3.5 py-2.5 text-sm text-ink-secondary">
        <ShieldCheck className="h-4 w-4 shrink-0 text-jade" strokeWidth={1.7} aria-hidden="true" />
        <span>
          {lang === 'en'
            ? 'Privacy active: ticket PNRs and personal IDs are masked on shared links.'
            : 'सुरक्षा सक्रिय: साझा लिंक पर टिकट पीएनआर और पहचान संख्या गोपनीय रखी गई हैं।'}
        </span>
      </div>

      <div className="space-y-7">
        {activeDays.map((day) => {
          const dayStops = items
            .filter((i) => i.dayId === day.id && !i.deletedAt)
            .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

          return (
            <div key={day.id} className="space-y-3.5">
              <h3 className="border-b border-line pb-2 text-lg font-semibold text-ink">
                {lang === 'en' ? `Day ${day.dayNumber}` : `दिन ${day.dayNumber}`}
                {day.date ? ` · ${day.date}` : ''} — {day.themeTitle}
              </h3>

              {dayStops.length === 0 ? (
                <p className="text-base text-ink-secondary">
                  {lang === 'en' ? 'Rest and open schedule.' : 'आराम और खुला समय।'}
                </p>
              ) : (
                <ul className="space-y-4">
                  {dayStops.map((stop) => {
                    const bk = bookingByItem.get(stop.id);
                    const summaryText =
                      lang === 'hi'
                        ? stop.elderSummaryI18n?.hi || stop.notes || stop.title
                        : stop.elderSummaryI18n?.en || stop.notes || stop.title;

                    return (
                      <li
                        key={stop.id}
                        className="rounded-lg border border-line bg-canvas p-4 space-y-2.5"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="font-mono text-base font-semibold tabular-nums text-honey-deep">
                            {stop.startTime || (lang === 'en' ? 'Flexible' : 'लचीला समय')}
                          </span>
                          {bk?.pnrMasked && (
                            <span className="rounded border border-line bg-canvas-elevated px-2 py-0.5 font-mono text-xs tabular-nums text-ink-secondary">
                              PNR {bk.pnrMasked} · {bk.status.toUpperCase()}
                            </span>
                          )}
                        </div>

                        <p
                          className={`text-[18px] font-medium text-ink ${
                            lang === 'hi' ? 'font-devanagari leading-[1.7]' : 'leading-[1.55]'
                          }`}
                        >
                          {summaryText}
                        </p>

                        {(stop.dietaryFlags.length > 0 || stop.accessibilityNotes) && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {stop.dietaryFlags.map((flag) => (
                              <span
                                key={flag}
                                className="rounded-md border border-jade/30 bg-jade-wash px-2.5 py-0.5 text-sm font-medium text-jade"
                              >
                                {flag}
                              </span>
                            ))}
                            {stop.accessibilityNotes && (
                              <span className="rounded-md border border-line bg-canvas-elevated px-2.5 py-0.5 text-sm text-ink-secondary">
                                {stop.accessibilityNotes}
                              </span>
                            )}
                          </div>
                        )}

                        {stop.addressLocalScript && (
                          <div className="rounded-md border border-line bg-canvas-elevated px-3 py-2 text-sm text-ink-secondary">
                            <span className="font-medium text-ink">
                              {lang === 'en' ? 'Show auto / cab driver: ' : 'ऑटो / कैब ड्राइवर को दिखाएं: '}
                            </span>
                            <span className="font-devanagari text-base text-ink">
                              {stop.addressLocalScript}
                            </span>
                            {stop.googleMapsUrl && (
                              <a
                                href={stop.googleMapsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-3 inline-flex items-center gap-1 font-medium text-ink underline underline-offset-4"
                              >
                                Map
                                <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" />
                              </a>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
