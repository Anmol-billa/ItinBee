'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  ShieldCheck,
  Vote,
} from 'lucide-react';
import { ScoutBeeMark } from '@/components/mascot/ScoutBeeMark';
import { TurnstileWidget } from '@/components/security/TurnstileWidget';
import { ElderCardView } from '@/components/share/ElderCardView';
import { LazyRouteMap } from '@/components/map/LazyRouteMap';
import { castGuestPollVote } from '@/lib/api-client';
import { formatDietaryTag, redactSharedSummaryText } from '@/lib/formatters';
import { exportItineraryWithLiveQrPdf } from '@/lib/pdf-export';
import { runAccessibleViewTransition } from '@/lib/view-transition';
import type { GuestShareProjection, PollView } from '@/lib/types';

interface GuestShareClientProps {
  projection: GuestShareProjection;
}

export function GuestShareClient({ projection }: GuestShareClientProps) {
  const [viewMode, setViewMode] = useState<'standard' | 'elder'>(
    projection.trip.elderModeEnabled ? 'elder' : 'standard'
  );
  const [polls, setPolls] = useState<PollView[]>(projection.polls);
  const [guestName, setGuestName] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [copiedDigest, setCopiedDigest] = useState(false);

  // Sanitize all stop notes & bilingual Elder Card strings against any PNR/Coach/Seat leaks
  const sanitizedItems = useMemo(
    () =>
      projection.items.map((item) => ({
        ...item,
        notes: redactSharedSummaryText(item.notes),
        elderSummaryI18n: {
          en: item.elderSummaryI18n?.en
            ? redactSharedSummaryText(item.elderSummaryI18n.en)
            : undefined,
          hi: item.elderSummaryI18n?.hi
            ? redactSharedSummaryText(item.elderSummaryI18n.hi)
            : undefined,
        },
      })),
    [projection.items]
  );

  const [highlightedId, setHighlightedId] = useState<string | null>(
    sanitizedItems[0]?.id ?? null
  );

  const activeDays = projection.days
    .filter((d) => !d.deletedAt)
    .sort((a, b) => a.dayNumber - b.dayNumber);

  const bookingByItem = new Map(
    projection.bookings.filter((b) => b.itemId).map((b) => [b.itemId as string, b])
  );

  const handleVote = async (pollId: string, optionId: string) => {
    const name = guestName.trim() || 'WhatsApp Guest';
    try {
      const updated = await castGuestPollVote({
        shortId: projection.trip.shortId,
        pollId,
        optionId,
        guestDisplayName: name,
        turnstileToken: turnstileToken || undefined,
      });
      setPolls((prev) => prev.map((p) => (p.id === pollId ? updated : p)));
    } catch {
      setPolls((prev) =>
        prev.map((p) => {
          if (p.id !== pollId) return p;
          const opts = p.options.map((o) => {
            const others = o.voterNames.filter((n) => n !== name);
            if (o.id === optionId) {
              return { ...o, voterNames: [...others, name], voteCount: others.length + 1 };
            }
            return { ...o, voterNames: others, voteCount: others.length };
          });
          return {
            ...p,
            options: opts,
            totalVotes: opts.reduce((a, b) => a + b.voteCount, 0),
          };
        })
      );
    }
  };

  const handleCopyDigest = async () => {
    await navigator.clipboard.writeText(projection.whatsappDigestText);
    setCopiedDigest(true);
    setTimeout(() => setCopiedDigest(false), 2000);
  };

  const liveUrl =
    typeof window !== 'undefined'
      ? window.location.href
      : `https://itinbee.com/t/${projection.trip.shortId}`;

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <header className="sticky top-0 z-20 flex min-h-12 flex-wrap items-center justify-between gap-3 border-b border-line bg-canvas/95 px-4 py-2 backdrop-blur-sm sm:px-6">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink"
          >
            <ScoutBeeMark variant="glyph" className="h-4 w-4" />
            <span>itinbee</span>
          </Link>
          <span className="hidden text-micro text-ink-tertiary sm:inline">
            Shared by {projection.plannerName}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-line bg-canvas-subtle p-0.5">
            <button
              type="button"
              onClick={() =>
                runAccessibleViewTransition(
                  () => setViewMode('standard'),
                  '#guest-share-heading'
                )
              }
              className={`rounded px-2.5 py-1 text-micro font-medium transition-colors ${
                viewMode === 'standard'
                  ? 'bg-canvas-elevated text-ink shadow-panel'
                  : 'text-ink-secondary hover:text-ink'
              }`}
            >
              Itinerary &amp; Polls
            </button>
            <button
              type="button"
              onClick={() =>
                runAccessibleViewTransition(
                  () => setViewMode('elder'),
                  '#guest-share-heading'
                )
              }
              className={`rounded px-2.5 py-1 text-micro font-medium transition-colors ${
                viewMode === 'elder'
                  ? 'bg-ink text-canvas-elevated'
                  : 'text-ink-secondary hover:text-ink'
              }`}
            >
              Elder Card (अ/A)
            </button>
          </div>

          <button
            type="button"
            onClick={() => void handleCopyDigest()}
            className="inline-flex items-center gap-1 rounded-md border border-line bg-canvas-elevated px-2.5 py-1 text-compact text-ink hover:bg-canvas-subtle"
          >
            {copiedDigest ? (
              <Check className="h-3.5 w-3.5 text-jade" strokeWidth={1.7} aria-hidden="true" />
            ) : (
              <Copy className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" />
            )}
            <span>{copiedDigest ? 'Copied' : 'WhatsApp text'}</span>
          </button>
          <span role="status" aria-live="polite" className="sr-only">
            {copiedDigest ? 'Copied WhatsApp itinerary summary to clipboard.' : ''}
          </span>

          <button
            type="button"
            onClick={() =>
              void exportItineraryWithLiveQrPdf({
                trip: projection.trip,
                days: projection.days,
                items: sanitizedItems,
                liveShareUrl: liveUrl,
              })
            }
            className="inline-flex items-center gap-1 rounded-md border border-line bg-canvas-elevated px-2.5 py-1 text-compact text-ink hover:bg-canvas-subtle"
          >
            <Download className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" />
            QR PDF
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        {viewMode === 'elder' ? (
          <div id="guest-share-heading" tabIndex={-1} className="focus:outline-none">
            <ElderCardView
              trip={projection.trip}
              days={projection.days}
              items={sanitizedItems}
              bookings={projection.bookings}
            />
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-6">
              <div className="space-y-1.5 border-b border-line pb-4">
                <h1
                  id="guest-share-heading"
                  tabIndex={-1}
                  className="text-xl font-semibold tracking-tight text-ink focus:outline-none"
                >
                  {projection.trip.title}
                </h1>
                <p className="text-compact text-ink-secondary">
                  {projection.trip.destinationSummary}
                </p>
                <div className="inline-flex items-center gap-1.5 pt-1 text-micro text-jade">
                  <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.7} aria-hidden="true" />
                  <span>Zero-login view · Sensitive PNRs, seats &amp; IDs automatically masked</span>
                </div>
              </div>

              {activeDays.map((day) => {
                const dayStops = sanitizedItems
                  .filter((i) => i.dayId === day.id && !i.deletedAt)
                  .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

                return (
                  <section key={day.id} className="space-y-2.5">
                    <h2 className="text-body font-semibold text-ink">
                      Day {day.dayNumber}
                      {day.date ? ` (${day.date})` : ''} — {day.themeTitle}
                    </h2>
                    <ol className="space-y-2">
                      {dayStops.map((stop) => {
                        const bk = bookingByItem.get(stop.id);
                        const isHighlighted = stop.id === highlightedId;
                        return (
                          <li
                            key={stop.id}
                            tabIndex={0}
                            onMouseEnter={() => setHighlightedId(stop.id)}
                            onClick={() => setHighlightedId(stop.id)}
                            onFocus={() => setHighlightedId(stop.id)}
                            className={`flex cursor-pointer flex-wrap items-start justify-between gap-3 rounded-lg border p-3.5 text-compact transition-colors ${
                              isHighlighted
                                ? 'border-line-strong bg-canvas-elevated shadow-panel'
                                : 'border-line bg-canvas-elevated hover:border-line-strong'
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-micro font-medium tabular-nums text-honey-deep">
                                  {stop.startTime || 'Flex'}
                                </span>
                                <span className="text-ui font-medium text-ink">
                                  {stop.title}
                                </span>
                                {bk?.pnrMasked && (
                                  <span className="rounded border border-jade/30 bg-jade-wash px-1.5 py-0.5 font-mono text-micro tabular-nums text-jade">
                                    {bk.status.toUpperCase()} · {bk.pnrMasked}
                                  </span>
                                )}
                              </div>
                              {stop.notes && (
                                <p className="text-ink-secondary">{stop.notes}</p>
                              )}
                              {stop.dietaryFlags.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 pt-0.5">
                                  {stop.dietaryFlags.map((flag) => (
                                    <span
                                      key={flag}
                                      className="rounded border border-jade/30 bg-jade-wash px-2 py-0.5 text-micro font-medium text-jade"
                                    >
                                      {formatDietaryTag(flag)}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            {stop.googleMapsUrl && (
                              <a
                                href={stop.googleMapsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-micro text-ink-secondary hover:text-ink"
                              >
                                Map
                                <ExternalLink className="h-3 w-3" strokeWidth={1.6} aria-hidden="true" />
                              </a>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  </section>
                );
              })}

              {/* Zero-OTP Guest Polls */}
              {polls.length > 0 && (
                <section className="space-y-3 border-t border-line pt-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="inline-flex items-center gap-1.5 text-body font-semibold text-ink">
                      <Vote className="h-4 w-4 text-ink-secondary" strokeWidth={1.6} aria-hidden="true" />
                      Group Polls (No Login Needed)
                    </h2>
                    <input
                      type="text"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="Your name to vote…"
                      aria-label="Your name for voting"
                      className="w-40 rounded-md border border-line bg-canvas-elevated px-2.5 py-1 text-compact text-ink"
                    />
                  </div>

                  <TurnstileWidget onToken={setTurnstileToken} />

                  {polls.map((poll) => (
                    <div
                      key={poll.id}
                      className="rounded-lg border border-line bg-canvas-elevated p-4 space-y-2.5"
                    >
                      <div className="text-ui font-medium text-ink">{poll.question}</div>
                      <div className="space-y-1.5">
                        {poll.options.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => void handleVote(poll.id, opt.id)}
                            className="flex w-full items-center justify-between rounded-md border border-line bg-canvas px-3 py-2 text-left text-compact hover:border-ink"
                          >
                            <span>{opt.label}</span>
                            <span className="font-mono text-micro tabular-nums text-ink-secondary">
                              {opt.voteCount} votes
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </section>
              )}
            </div>

            <aside className="h-[380px] rounded-xl border border-line bg-canvas-subtle p-4 lg:sticky lg:top-16">
              <LazyRouteMap
                items={sanitizedItems}
                highlightedItemId={highlightedId}
                onSelectStop={(id) => setHighlightedId(id)}
                attribution={projection.trip.mapAttribution}
              />
            </aside>
          </div>
        )}

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-micro text-ink-tertiary">
          <span>Organised on Itinbee · Zero-signup travel itinerary &amp; UPI splits</span>
          <Link href="/" className="font-medium text-ink underline underline-offset-4">
            Create your free trip in 30s
          </Link>
        </footer>
      </main>
    </div>
  );
}
