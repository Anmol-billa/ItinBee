'use client';

import React, { useId, useState } from 'react';
import Link from 'next/link';
import { Bed, Clock, ExternalLink, MapPin, Navigation, Train, Utensils } from 'lucide-react';

interface PreviewStop {
  id: string;
  time: string;
  title: string;
  note: string;
  kind: 'transit' | 'stay' | 'activity' | 'meal';
  travelNext?: string;
  x: number;
  y: number;
}

interface PreviewDay {
  dayNumber: number;
  title: string;
  summary: string;
  stops: PreviewStop[];
}

const PREVIEW_DAYS: PreviewDay[] = [
  {
    dayNumber: 1,
    title: 'Haridwar arrival & evening Ganga aarti',
    summary: '4 stops · ~52 min road transit · Relaxed pace',
    stops: [
      {
        id: 'd1-1',
        time: '06:50',
        title: '12017 Dehradun Shatabdi · NDLS to Haridwar Jn',
        note: 'Confirmed rail anchor · Coach C4 · Pure-veg breakfast',
        kind: 'transit',
        travelNext: '38 min · 24 km cab along river road',
        x: 68,
        y: 196,
      },
      {
        id: 'd1-2',
        time: '12:30',
        title: 'Tapovan Riverside Homestay Check-In',
        note: 'Rest window before evening ghat walk',
        kind: 'stay',
        travelNext: '14 min · 4.2 km auto to Triveni Ghat',
        x: 132,
        y: 150,
      },
      {
        id: 'd1-3',
        time: '17:15',
        title: 'Triveni Ghat Evening Ganga Aarti',
        note: 'Flat paved ghat steps; arrive 30 min early for seated rows',
        kind: 'activity',
        travelNext: '8 min · 650 m walk',
        x: 158,
        y: 128,
      },
      {
        id: 'd1-4',
        time: '19:30',
        title: 'Chotiwala Pure-Veg Thali Dinner',
        note: 'Satvik & Jain options available',
        kind: 'meal',
        x: 176,
        y: 118,
      },
    ],
  },
  {
    dayNumber: 2,
    title: 'Ghat switchbacks up to Landour Chaar Dukan',
    summary: '3 stops · ~2h 15m hill cab · Moderate pace',
    stops: [
      {
        id: 'd2-1',
        time: '09:30',
        title: 'Rishikesh to Landour Ridge Drive',
        note: 'Dehradun–Mussoorie hill switchbacks · scenic chai halt at Maggi Point',
        kind: 'transit',
        travelNext: '6 min · 1.1 km cantt road',
        x: 204,
        y: 94,
      },
      {
        id: 'd2-2',
        time: '13:30',
        title: 'Rokeby Manor · Landour Cantt Check-In',
        note: 'Quiet cedar ridge stay at 2,270 m',
        kind: 'stay',
        travelNext: '9 min · 450 m pine walk',
        x: 238,
        y: 66,
      },
      {
        id: 'd2-3',
        time: '16:30',
        title: 'Chaar Dukan Pancakes & St. Paul’s Walk',
        note: 'Level ridge loop · sunset over Doon valley',
        kind: 'meal',
        x: 266,
        y: 52,
      },
    ],
  },
  {
    dayNumber: 3,
    title: 'Lal Tibba morning & Sister’s Bazaar trail',
    summary: '3 stops · ~25 min walking loop · Relaxed pace',
    stops: [
      {
        id: 'd3-1',
        time: '07:30',
        title: 'Lal Tibba Scenic Telescope Point',
        note: 'Clear Himalayan snow-peak panorama before morning mist',
        kind: 'activity',
        travelNext: '12 min · 850 m downhill walk',
        x: 284,
        y: 42,
      },
      {
        id: 'd3-2',
        time: '10:30',
        title: 'Landour Bakehouse & Sister’s Bazaar',
        note: 'Fresh sourdough, ginger lemon honey tea & artisanal jams',
        kind: 'meal',
        travelNext: '15 min · 1.2 km deodar forest loop',
        x: 256,
        y: 58,
      },
      {
        id: 'd3-3',
        time: '16:00',
        title: 'Jabarkhet Nature Reserve Guided Walk',
        note: 'Gentle ridge trail · cushioned rest benches',
        kind: 'activity',
        x: 306,
        y: 64,
      },
    ],
  },
];

const KIND_ICON = {
  transit: Train,
  stay: Bed,
  activity: MapPin,
  meal: Utensils,
} as const;

/**
 * Interactive read-only preview of the Itinbee Trip Editor right on the landing page.
 * Visitors switch days and highlight stops to see synchronized route pins and travel legs.
 */
export function PlannerPreview() {
  const [selectedDay, setSelectedDay] = useState(1);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const baseId = useId();

  const activeDay = PREVIEW_DAYS.find((d) => d.dayNumber === selectedDay) ?? PREVIEW_DAYS[0]!;

  return (
    <section className="on-paper bg-[#F1E4C6] text-navy">
      <div className="mx-auto max-w-[1280px] px-5 py-20 md:px-8 md:py-24">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h2 className="display text-[48px] text-navy md:text-[72px]">
              See the planner at work
            </h2>
            <p className="mt-4 max-w-[60ch] text-[19px] text-paper-ink">
              Every stop sits on a real map with travel time to the next one, pacing checks, and one-tap links for the
              whole family. Click a day or stop below, or open the full workspace.
            </p>
          </div>
          <Link href="/trip/rishi-lnd-4d" className="btn-stamp">
            Open full trip editor
          </Link>
        </div>

        <div className="mt-12 overflow-hidden rounded-[14px] border-2 border-navy bg-paper-light shadow-label">
          {/* Top workspace bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-navy bg-trunk-dark px-5 py-3.5 text-paper">
            <div className="flex flex-wrap items-center gap-3">
              <span className="display text-[28px] leading-none text-saffron">
                Rishikesh &amp; Landour Ridge
              </span>
              <span className="rounded border border-saffron/60 bg-trunk px-2 py-0.5 text-[12px] font-bold uppercase tracking-[0.06em] text-paper">
                Sample workspace
              </span>
            </div>

            <div
              role="tablist"
              aria-label="Preview itinerary days"
              className="flex overflow-x-auto gap-1"
            >
              {PREVIEW_DAYS.map((day, idx) => {
                const selected = day.dayNumber === selectedDay;
                return (
                  <button
                    key={day.dayNumber}
                    id={`${baseId}-tab-${day.dayNumber}`}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => {
                      setSelectedDay(day.dayNumber);
                      setHighlightedId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowRight') {
                        const next = PREVIEW_DAYS[(idx + 1) % PREVIEW_DAYS.length]!;
                        setSelectedDay(next.dayNumber);
                        document.getElementById(`${baseId}-tab-${next.dayNumber}`)?.focus();
                      } else if (e.key === 'ArrowLeft') {
                        const prev = PREVIEW_DAYS[(idx - 1 + PREVIEW_DAYS.length) % PREVIEW_DAYS.length]!;
                        setSelectedDay(prev.dayNumber);
                        document.getElementById(`${baseId}-tab-${prev.dayNumber}`)?.focus();
                      }
                    }}
                    className={`relative flex-none px-4 py-2 text-[15px] font-bold transition-colors ${
                      selected
                        ? 'text-saffron after:absolute after:inset-x-1 after:bottom-0 after:border-b-[3px] after:border-saffron after:content-[""]'
                        : 'text-paper/80 hover:text-paper'
                    }`}
                  >
                    Day {day.dayNumber}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Split timeline + synchronized route map */}
          <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
            <div>
              {PREVIEW_DAYS.map((day) => {
                const isSelected = day.dayNumber === selectedDay;
                return (
                  <div
                    key={day.dayNumber}
                    role="tabpanel"
                    aria-labelledby={`${baseId}-tab-${day.dayNumber}`}
                    hidden={!isSelected ? true : undefined}
                  >
                    <div className="p-5 md:p-7">
                      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-dashed border-navy/25 pb-3">
                        <h3 className="display text-[32px] text-navy">
                          Day {day.dayNumber}: {day.title}
                        </h3>
                        <span className="text-[14px] font-semibold text-paper-ink">{day.summary}</span>
                      </div>

                      <ol className="mt-5 space-y-3">
                        {day.stops.map((stop, idx) => {
                          const Icon = KIND_ICON[stop.kind];
                          const active = highlightedId === stop.id;
                          return (
                            <li key={stop.id}>
                              <button
                                type="button"
                                onClick={() => setHighlightedId(active ? null : stop.id)}
                                onMouseEnter={() => setHighlightedId(stop.id)}
                                onMouseLeave={() => setHighlightedId(null)}
                                className={`flex w-full items-start gap-3.5 rounded-[10px] border-2 p-3.5 text-left transition-colors ${
                                  active
                                    ? 'border-navy bg-saffron/30'
                                    : 'border-navy/25 bg-[#fffdf8] hover:border-navy'
                                }`}
                              >
                                <span className="display grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-navy bg-vermilion-deep text-[18px] leading-none text-[#fffdf8]">
                                  {idx + 1}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="inline-flex items-center gap-1 font-mono text-[13px] font-semibold tabular-nums text-paper-ink">
                                      <Clock size={13} strokeWidth={2.25} aria-hidden="true" />
                                      {stop.time}
                                    </span>
                                    <Icon size={15} strokeWidth={2.25} className="text-navy" aria-hidden="true" />
                                    <span className="text-[17px] font-bold text-navy">{stop.title}</span>
                                  </div>
                                  <p className="mt-0.5 text-[15px] text-paper-ink">{stop.note}</p>
                                </div>
                              </button>
                              {stop.travelNext ? (
                                <div className="ml-7 flex items-center gap-2 border-l-2 border-dashed border-navy/35 py-2 pl-5 text-[13px] font-semibold text-paper-ink">
                                  <Navigation size={13} strokeWidth={2.25} aria-hidden="true" />
                                  {stop.travelNext}
                                </div>
                              ) : null}
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Synchronized route map card */}
            <div className="flex flex-col justify-between border-t-2 border-navy bg-[#EFE2C4] p-5 lg:border-l-2 lg:border-t-0 md:p-6">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14px] font-bold uppercase tracking-[0.08em] text-navy">
                    Day {activeDay.dayNumber} route preview
                  </span>
                  <span className="rounded border border-navy/30 bg-paper px-2 py-0.5 text-[12px] font-semibold text-paper-ink">
                    Haridwar → Landour (2,270 m)
                  </span>
                </div>

                <svg
                  role="img"
                  aria-label={`Route diagram for Day ${activeDay.dayNumber} with ${activeDay.stops.length} numbered stops`}
                  viewBox="0 0 360 240"
                  className="mt-4 w-full rounded-[10px] border-2 border-navy bg-[#F7EED7]"
                >
                  <path
                    d="M0 60H360M0 120H360M0 180H360M90 0V240M180 0V240M270 0V240"
                    stroke="#14213D"
                    strokeOpacity="0.08"
                  />
                  {/* Ganga river & Garhwal ridge contour */}
                  <path
                    d="M18 226 C72 198 118 168 164 128 C202 95 245 78 338 30"
                    fill="none"
                    stroke="#0E5A47"
                    strokeOpacity="0.22"
                    strokeWidth="16"
                    strokeLinecap="round"
                  />
                  {/* Active day polyline */}
                  <polyline
                    fill="none"
                    stroke="#14213D"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={activeDay.stops.map((s) => `${s.x},${s.y}`).join(' ')}
                  />
                  <polyline
                    fill="none"
                    stroke="#F2A71B"
                    strokeWidth="1.8"
                    strokeDasharray="5 4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={activeDay.stops.map((s) => `${s.x},${s.y}`).join(' ')}
                  />
                  {activeDay.stops.map((stop, idx) => {
                    const active = highlightedId === stop.id;
                    return (
                      <g
                        key={stop.id}
                        className="cursor-pointer"
                        onClick={() => setHighlightedId(active ? null : stop.id)}
                      >
                        <circle
                          cx={stop.x}
                          cy={stop.y}
                          r={active ? 16 : 12}
                          fill={active ? '#F2A71B' : '#C7361F'}
                          stroke="#14213D"
                          strokeWidth="2.2"
                        />
                        <text
                          x={stop.x}
                          y={stop.y + 4}
                          textAnchor="middle"
                          fill={active ? '#14213D' : '#FFFDF8'}
                          fontSize="12"
                          fontWeight="800"
                          fontFamily="Source Sans 3, sans-serif"
                        >
                          {idx + 1}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-navy/20 pt-4 text-[14px]">
                <span className="text-paper-ink">
                  In the full editor: live OpenStreetMap vector map, automatic place suggestions &amp; UPI split.
                </span>
                <Link
                  href="/t/rishi-lnd-4d"
                  className="inline-flex items-center gap-1.5 font-bold text-navy underline underline-offset-2"
                >
                  Preview WhatsApp Elder Card
                  <ExternalLink size={14} strokeWidth={2.25} aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
