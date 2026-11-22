'use client';

import React, { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  BedDouble,
  CheckCircle2,
  Compass,
  Square,
  Train,
  Utensils,
} from 'lucide-react';
import type { FlowDay, FlowError } from '@/features/create/flow-reducer';
import type { ConnectionState, JobMode, TripIntent } from '@/lib/import-types';

interface BuildingStepProps {
  days: FlowDay[];
  intent: TripIntent | null;
  tripId: string | null;
  mode: JobMode;
  connection: ConnectionState;
  error: FlowError | null;
  onStop: () => void;
}

interface PinPoint {
  pin: number;
  label: string;
  dayNumber: number;
  lat: number;
  lng: number;
}

function StopKindIcon({ kind }: { kind: string }) {
  const k = kind.toLowerCase();
  if (k.includes('food') || k.includes('meal') || k.includes('cafe')) {
    return <Utensils size={15} strokeWidth={2.25} aria-hidden="true" className="shrink-0 text-vermilion-ink" />;
  }
  if (k.includes('stay') || k.includes('hotel')) {
    return <BedDouble size={15} strokeWidth={2.25} aria-hidden="true" className="shrink-0 text-navy" />;
  }
  if (k.includes('transit') || k.includes('transport')) {
    return <Train size={15} strokeWidth={2.25} aria-hidden="true" className="shrink-0 text-[#0F766E]" />;
  }
  return <Compass size={15} strokeWidth={2.25} aria-hidden="true" className="shrink-0 text-[#0F766E]" />;
}

export function BuildingStep({
  days,
  intent,
  tripId,
  connection,
  error,
  onStop,
}: BuildingStepProps) {
  const router = useRouter();

  useEffect(() => {
    if (!tripId) return;
    const t = setTimeout(() => {
      router.push(`/trip/${encodeURIComponent(tripId)}`);
    }, 450);
    return () => clearTimeout(t);
  }, [tripId, router]);

  // Build ordered pin coordinates across streamed days (falling back to destination anchors while waiting for Day 1)
  const { stopPinsByKey, svgPins } = useMemo(() => {
    const map = new Map<string, number>();
    const pts: PinPoint[] = [];
    for (const day of days) {
      day.items.forEach((item, idx) => {
        if (typeof item.lat === 'number' && typeof item.lng === 'number') {
          const pin = pts.length + 1;
          map.set(`${day.dayNumber}:${idx}`, pin);
          pts.push({
            pin,
            label: item.title,
            dayNumber: day.dayNumber,
            lat: item.lat,
            lng: item.lng,
          });
        }
      });
    }
    if (pts.length === 0 && intent) {
      intent.destinations.forEach((d) => {
        if (typeof d.lat === 'number' && typeof d.lng === 'number') {
          pts.push({
            pin: pts.length + 1,
            label: d.name,
            dayNumber: 1,
            lat: d.lat,
            lng: d.lng,
          });
        }
      });
    }

    const W = 420;
    const H = 360;
    const PAD = 48;
    if (pts.length === 0) {
      return { stopPinsByKey: map, svgPins: [] as Array<PinPoint & { x: number; y: number }> };
    }
    if (pts.length === 1) {
      return {
        stopPinsByKey: map,
        svgPins: [{ ...pts[0]!, x: W / 2, y: H / 2 }],
      };
    }

    const lats = pts.map((p) => p.lat);
    const lngs = pts.map((p) => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const spanLat = Math.max(maxLat - minLat, 0.015);
    const spanLng = Math.max(maxLng - minLng, 0.015);

    const projected = pts.map((p) => ({
      ...p,
      x: Math.round(PAD + ((p.lng - minLng) / spanLng) * (W - PAD * 2)),
      y: Math.round(H - PAD - ((p.lat - minLat) / spanLat) * (H - PAD * 2)),
    }));
    return { stopPinsByKey: map, svgPins: projected };
  }, [days, intent]);

  const polylinePath = useMemo(() => {
    if (svgPins.length < 2) return '';
    return svgPins.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  }, [svgPins]);

  return (
    <div className="mx-auto max-w-[1220px] px-5 pb-16 pt-6 md:px-8">
      <div className="grid items-start gap-7 lg:grid-cols-[1.15fr_0.85fr]">
        {/* Left: Live day-by-day stream */}
        <div className="paper-surface on-paper rounded-[14px] border-2 border-navy p-6 text-navy shadow-tag sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="display text-[42px] text-navy sm:text-[52px]">
              {tripId ? 'Your itinerary is ready' : 'Building your days'}
            </h1>
            {!tripId && !error ? (
              <button type="button" onClick={onStop} className="btn-line min-h-[44px] px-4 py-2 text-[14px] text-navy">
                <Square size={14} strokeWidth={2.5} aria-hidden="true" />
                Stop &amp; edit
              </button>
            ) : null}
          </div>

          <p className="mt-2 text-[16px] text-paper-ink">
            {tripId
              ? 'Opening your trip editor now. Use the button below if your browser does not redirect automatically.'
              : 'Clustering stops geographically, checking travel times, and slotting meals and rest buffers.'}
          </p>

          {connection !== 'live' && !tripId && !error ? (
            <p className="mt-2 text-[13px] font-semibold text-paper-ink">
              Connection: {connection}…
            </p>
          ) : null}

          {tripId ? (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link href={`/trip/${encodeURIComponent(tripId)}`} className="btn-stamp">
                Open your itinerary
                <ArrowRight size={18} strokeWidth={2.25} aria-hidden="true" />
              </Link>
            </div>
          ) : null}

          {error ? (
            <div
              role="alert"
              className="mt-5 rounded-lg border-2 border-[#a82e19] bg-[#fffdf8] p-4 text-vermilion-ink"
            >
              <p className="flex items-start gap-2 font-bold">
                <AlertCircle size={18} strokeWidth={2.25} aria-hidden="true" className="mt-0.5 shrink-0" />
                <span>{error.message}</span>
              </p>
              <button type="button" onClick={onStop} className="btn-line mt-3 text-navy">
                Back to review &amp; retry
              </button>
            </div>
          ) : null}

          {/* Streamed days */}
          <div className="mt-6 space-y-6">
            {days.map((day) => (
              <div key={day.dayNumber} className="perforation pt-5">
                <div className="flex items-baseline gap-3">
                  <span className="display rounded border-[1.5px] border-navy bg-saffron px-2.5 py-0.5 text-[22px] leading-none text-navy">
                    D{day.dayNumber}
                  </span>
                  <h2 className="display text-[30px] text-navy">{day.title}</h2>
                </div>

                <ol role="list" className="mt-3 space-y-2.5">
                  {day.items.map((item, idx) => {
                    const pin = stopPinsByKey.get(`${day.dayNumber}:${idx}`);
                    return (
                      <li
                        key={`${day.dayNumber}-${idx}-${item.title}`}
                        className="flex items-center gap-3 rounded-lg border border-navy/25 bg-[#fffdf8] px-3.5 py-2.5"
                      >
                        {item.startTime ? (
                          <span className="w-14 shrink-0 font-mono text-[13px] font-bold tabular-nums text-paper-ink">
                            {item.startTime}
                          </span>
                        ) : null}
                        <StopKindIcon kind={item.kind} />
                        <span className="min-w-0 flex-1 text-[16px] font-semibold text-navy">
                          {item.title}
                        </span>
                        {pin ? (
                          <span
                            aria-label={`Map pin ${pin}`}
                            className="display grid h-6 w-6 shrink-0 place-items-center rounded-full border border-navy bg-vermilion-deep text-[13px] leading-none text-[#fffdf8]"
                          >
                            {pin}
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}

            {!tripId && !error ? (
              <div className="perforation flex items-center gap-3 pt-5 text-[15px] font-semibold text-paper-ink">
                <span className="spinner text-vermilion-deep" aria-hidden="true" />
                <span>
                  {days.length === 0
                    ? 'Drafting Day 1 stops and coordinates…'
                    : `Drafting Day ${days.length + 1}…`}
                </span>
              </div>
            ) : null}

            {tripId ? (
              <p className="perforation flex items-center gap-2 pt-4 text-[15px] font-bold text-[#0F766E]">
                <CheckCircle2 size={18} strokeWidth={2.25} aria-hidden="true" />
                All {days.length} {days.length === 1 ? 'day' : 'days'} saved to your workspace.
              </p>
            ) : null}
          </div>
        </div>

        {/* Right: Live SVG Route Preview */}
        <aside
          aria-label="Live route preview"
          className="paper-surface on-paper lg:sticky lg:top-6 rounded-[14px] border-2 border-navy p-5 text-navy shadow-label"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="display text-[30px] text-navy">Live route map</h2>
            <span className="text-[13px] font-bold tabular-nums text-paper-ink">
              {svgPins.length} {svgPins.length === 1 ? 'pin' : 'pins'} plotted
            </span>
          </div>

          <div className="mt-3 overflow-hidden rounded-[10px] border-2 border-navy bg-[#EFE2C4]">
            <svg
              viewBox="0 0 420 360"
              className="block h-auto w-full"
              role="img"
              aria-label={
                svgPins.length > 0
                  ? `Route connecting ${svgPins.map((p) => p.label).join(', ')}`
                  : 'Waiting for first stop coordinates'
              }
            >
              <rect width="420" height="360" fill="#EFE2C4" />
              {/* Subtle map graticule */}
              <path
                d="M0 72H420M0 144H420M0 216H420M0 288H420M84 0V360M168 0V360M252 0V360M336 0V360"
                stroke="#14213D"
                strokeOpacity="0.1"
                strokeWidth="1"
              />
              {/* Topographic contour wash */}
              <path
                d="M28 46 C112 24 204 68 292 42 C356 26 392 88 398 164 C402 248 344 316 254 328 C162 340 72 302 36 226 Z"
                fill="#E3CFA4"
                fillOpacity="0.65"
                stroke="#14213D"
                strokeOpacity="0.22"
                strokeWidth="1.25"
              />

              {/* Dashed leader line connecting pins */}
              {polylinePath ? (
                <>
                  <path
                    d={polylinePath}
                    fill="none"
                    stroke="#14213D"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeOpacity="0.22"
                  />
                  <path
                    d={polylinePath}
                    fill="none"
                    stroke="#C7361F"
                    strokeWidth="2.5"
                    strokeDasharray="6 4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </>
              ) : null}

              {/* Plotted numbered pins */}
              {svgPins.map((p, idx) => {
                const showLabel = idx === 0 || idx === svgPins.length - 1 || svgPins.length <= 5;
                const shortText = p.label.length > 18 ? `${p.label.slice(0, 17)}…` : p.label;
                const labelAbove = p.y > 54;
                return (
                  <g
                    key={`${p.pin}-${p.label}`}
                    className="pin-drop"
                    style={{ animationDelay: `${Math.min(idx * 50, 300)}ms` }}
                  >
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r="12.5"
                      fill="#C7361F"
                      stroke="#14213D"
                      strokeWidth="2"
                    />
                    <text
                      x={p.x}
                      y={p.y + 4}
                      textAnchor="middle"
                      fill="#FFFDF8"
                      fontSize="11.5"
                      fontWeight="800"
                      fontFamily="Source Sans 3, sans-serif"
                    >
                      {p.pin}
                    </text>
                    {showLabel ? (
                      <g transform={`translate(${p.x}, ${labelAbove ? p.y - 20 : p.y + 26})`}>
                        <rect
                          x={-56}
                          y={-11}
                          width={112}
                          height={18}
                          rx={4}
                          fill="#FFFDF8"
                          stroke="#14213D"
                          strokeWidth="1.2"
                        />
                        <text
                          x={0}
                          y={2}
                          textAnchor="middle"
                          fill="#14213D"
                          fontSize="10.5"
                          fontWeight="700"
                          fontFamily="Source Sans 3, sans-serif"
                        >
                          {shortText}
                        </text>
                      </g>
                    ) : null}
                  </g>
                );
              })}

              {svgPins.length === 0 ? (
                <text
                  x="210"
                  y="184"
                  textAnchor="middle"
                  fill="#4F4533"
                  fontSize="14"
                  fontWeight="700"
                  fontFamily="Source Sans 3, sans-serif"
                >
                  Plotting stops as days stream in…
                </text>
              ) : null}
            </svg>
          </div>

          <p className="agate mt-2.5 text-paper-ink">
            Coordinates grounded against © OpenStreetMap contributors &amp; Wikidata. Full interactive MapLibre route
            opens in the next step.
          </p>
        </aside>
      </div>
    </div>
  );
}
