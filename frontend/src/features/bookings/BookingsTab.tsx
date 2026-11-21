'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bed,
  Bus,
  Check,
  FolderLock,
  ListChecks,
  Plane,
  ShieldCheck,
  Sparkles,
  Train,
  Upload,
} from 'lucide-react';
import { ingestTicketOrReelText } from '@/lib/api-client';
import {
  encryptAndCacheTicketOffline,
  localDb,
  midpointSortKey,
  nextClientHlc,
} from '@/lib/offline-db';
import type { BookingView, ItineraryItem, TripDay, TripWorkspace } from '@/lib/types';

interface BookingsTabProps {
  workspace: TripWorkspace;
  currentDay: TripDay | null;
  isCloudSynced: boolean;
  onUpdateWorkspace: (updater: (prev: TripWorkspace) => TripWorkspace) => void;
  onNotify: (msg: string) => void;
}

const SAMPLE_IRCTC_SNIPPET =
  'IRCTC PNR: 2849105842 Train: 12017 DEHRADUN SHTBDI DOJ: 12-12-2026 NDLS 06:45 to HW 11:15CNF/C4/25/WS Passenger: R Sharma Aadhaar 4912 8834 9021';

const SAMPLE_REEL_SNIPPET =
  'Instagram Reel: Morning bun omelette at Chaar Dukan Landour, sunset walk to Lal Tibba Mussoorie & dinner at Cafe Ivy Landour #uttarakhand';

function ProviderIcon({ provider }: { provider: string }) {
  const p = provider.toLowerCase();
  if (p.includes('irctc') || p.includes('rail')) {
    return <Train className="h-4 w-4 text-navy" strokeWidth={1.8} aria-hidden="true" />;
  }
  if (p.includes('redbus') || p.includes('bus')) {
    return <Bus className="h-4 w-4 text-navy" strokeWidth={1.8} aria-hidden="true" />;
  }
  if (p.includes('airbnb') || p.includes('mmt') || p.includes('hotel') || p.includes('stay')) {
    return <Bed className="h-4 w-4 text-navy" strokeWidth={1.8} aria-hidden="true" />;
  }
  return <Plane className="h-4 w-4 text-navy" strokeWidth={1.8} aria-hidden="true" />;
}

export function BookingsTab({
  workspace,
  currentDay,
  isCloudSynced,
  onUpdateWorkspace,
  onNotify,
}: BookingsTabProps) {
  const [scoutText, setScoutText] = useState('');
  const [scoutBusy, setScoutBusy] = useState(false);
  const [scoutBanner, setScoutBanner] = useState<{
    headline: string;
    amberWarning: boolean;
    redactions: number;
  } | null>(null);

  const [vaultPassphrase, setVaultPassphrase] = useState('1234');
  const [vaultFiles, setVaultFiles] = useState<
    Array<{ id: string; fileName: string; byteLength: number; savedAt: string }>
  >([]);
  const [checkedChecklistIds, setCheckedChecklistIds] = useState<Record<string, boolean>>({});

  // Load persisted encrypted files for this trip from IndexedDB
  useEffect(() => {
    if (!localDb) return;
    let cancelled = false;
    localDb.encryptedVault
      .where('tripId')
      .equals(workspace.trip.id)
      .toArray()
      .then((rows) => {
        if (cancelled) return;
        setVaultFiles(
          rows
            .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
            .map((r) => ({
              id: r.id,
              fileName: r.fileName,
              byteLength: r.byteLength,
              savedAt: r.savedAt,
            }))
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [workspace.trip.id]);

  const activeDays = workspace.days
    .filter((d) => !d.deletedAt)
    .sort((a, b) => a.dayNumber - b.dayNumber);

  const handleScoutIngest = async (rawInput?: string) => {
    const text = (rawInput ?? scoutText).trim();
    if (!text) return;
    setScoutBusy(true);
    try {
      const result = await ingestTicketOrReelText(
        text,
        isCloudSynced ? workspace.trip.id : undefined
      );

      if (result.parsedBooking) {
        const pb = result.parsedBooking;
        const targetDay = currentDay ?? activeDays[0] ?? null;
        const dayStops = workspace.items
          .filter((i) => i.dayId === targetDay?.id && !i.deletedAt)
          .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
        const lastKey = dayStops[dayStops.length - 1]?.sortKey ?? null;
        const newStopId = crypto.randomUUID();

        const newItem: ItineraryItem = {
          id: newStopId,
          tripId: workspace.trip.id,
          dayId: targetDay?.id ?? null,
          kind: pb.provider === 'airbnb' || pb.provider === 'mmt' ? 'stay' : 'transit',
          title: pb.suggestedTitle,
          notes: String(pb.summary.headline ?? 'Parsed booking confirmation'),
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
            coachOrTerminal: String(
              pb.summary.coach ?? pb.summary.terminalOrPlatform ?? ''
            ),
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

        const normalizedStatus: BookingView['status'] =
          pb.status === 'rac' ||
          pb.status === 'wl' ||
          pb.status === 'cancelled' ||
          pb.status === 'pending'
            ? pb.status
            : 'confirmed';

        const newBooking: BookingView = {
          id: crypto.randomUUID(),
          tripId: workspace.trip.id,
          itemId: newStopId,
          provider: pb.provider,
          pnrMasked: pb.pnrMasked,
          pnrLast3: pb.pnrMasked ? pb.pnrMasked.slice(-3) : null,
          status: normalizedStatus,
          summary: {
            headline: String(pb.summary.headline ?? pb.suggestedTitle),
            coach: pb.summary.coach ? String(pb.summary.coach) : undefined,
            seatOrBerth: pb.summary.seatOrBerth
              ? String(pb.summary.seatOrBerth)
              : undefined,
          },
          lowConfidenceFields: pb.lowConfidenceFields,
          parserConfidence: pb.parserConfidence,
          createdAt: new Date().toISOString(),
        };

        onUpdateWorkspace((prev) => ({
          ...prev,
          items: [...prev.items, newItem],
          bookings: [newBooking, ...prev.bookings],
        }));

        setScoutBanner({
          headline: `Added ${pb.suggestedTitle}${pb.pnrMasked ? ` (${pb.pnrMasked})` : ''}`,
          amberWarning: result.requiresAmberVerification,
          redactions: result.aadhaarRedactions,
        });
        onNotify(`Parsed ${pb.provider.toUpperCase()} booking onto Day ${targetDay?.dayNumber ?? 1}.`);
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

        onUpdateWorkspace((prev) => ({
          ...prev,
          shortlist: [...prev.shortlist, ...added],
        }));

        setScoutBanner({
          headline: `Pinned ${added.length} places from link into Shortlist`,
          amberWarning: result.requiresAmberVerification,
          redactions: result.aadhaarRedactions,
        });
        onNotify(`Saved ${added.length} places to Shortlist.`);
      }

      setScoutText('');
    } catch {
      // Offline deterministic fallback
      const targetDay = currentDay ?? activeDays[0] ?? null;
      const pnrMatch = /\bPNR[:\s-]*(\d{6,10})\b/i.exec(text);
      if (pnrMatch) {
        const rawPnr = pnrMatch[1]!;
        const masked = `••••••${rawPnr.slice(-3)}`;
        const newStopId = crypto.randomUUID();
        const isRac = /\bRAC\b/i.test(text);
        const isWl = /\bWL\b/i.test(text);
        const status: BookingView['status'] = isRac
          ? 'rac'
          : isWl
            ? 'wl'
            : 'confirmed';

        const offlineBooking: BookingView = {
          id: crypto.randomUUID(),
          tripId: workspace.trip.id,
          itemId: newStopId,
          provider: /irctc|shtbdi|vande/i.test(text) ? 'irctc' : 'transit',
          pnrMasked: masked,
          pnrLast3: rawPnr.slice(-3),
          status,
          summary: {
            headline: text.slice(0, 72),
          },
          lowConfidenceFields: [],
          parserConfidence: 0.9,
          createdAt: new Date().toISOString(),
        };

        const offlineStop: ItineraryItem = {
          id: newStopId,
          tripId: workspace.trip.id,
          dayId: targetDay?.id ?? null,
          kind: 'transit',
          title: text.slice(0, 56),
          notes: `Offline parsed booking (${masked})`,
          lat: null,
          lng: null,
          placeRefId: null,
          addressLocalScript: null,
          sortKey: midpointSortKey(null, null),
          startTime: '08:00',
          durationMins: 180,
          transitMeta: { mode: 'rail' },
          dietaryFlags: [],
          accessibilityNotes: '',
          elderSummaryI18n: { en: text.slice(0, 56) },
          isShortlist: false,
          serverSeq: workspace.trip.latestSeq + 1,
          hlcTimestamp: nextClientHlc(),
          deletedAt: null,
          googleMapsUrl: null,
        };

        onUpdateWorkspace((prev) => ({
          ...prev,
          items: [...prev.items, offlineStop],
          bookings: [offlineBooking, ...prev.bookings],
        }));
        setScoutText('');
        onNotify(`Offline parser saved PNR ${masked} locally.`);
      } else {
        const noteItem: ItineraryItem = {
          id: crypto.randomUUID(),
          tripId: workspace.trip.id,
          dayId: targetDay?.id ?? null,
          kind: 'note',
          title: text.slice(0, 56),
          notes: 'Saved offline in browser workspace',
          lat: null,
          lng: null,
          placeRefId: null,
          addressLocalScript: null,
          sortKey: midpointSortKey(null, null),
          startTime: '10:00',
          durationMins: 60,
          transitMeta: {},
          dietaryFlags: [],
          accessibilityNotes: '',
          elderSummaryI18n: { en: text.slice(0, 56) },
          isShortlist: false,
          serverSeq: workspace.trip.latestSeq + 1,
          hlcTimestamp: nextClientHlc(),
          deletedAt: null,
          googleMapsUrl: null,
        };
        onUpdateWorkspace((prev) => ({
          ...prev,
          items: [...prev.items, noteItem],
        }));
        setScoutText('');
        onNotify('Backend offline — saved note directly to local workspace.');
      }
    } finally {
      setScoutBusy(false);
    }
  };

  const handleVaultUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
      setVaultFiles((prev) => [
        {
          id: encrypted.id,
          fileName: encrypted.fileName,
          byteLength: encrypted.byteLength,
          savedAt: encrypted.savedAt,
        },
        ...prev,
      ]);
      onNotify(`Encrypted "${file.name}" in local AES-256-GCM vault.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Could not encrypt ticket.');
    } finally {
      e.target.value = '';
    }
  };

  const statusBadgeStyle = (status: BookingView['status']) => {
    if (status === 'confirmed') {
      return 'border-jade/30 bg-jade-wash text-jade';
    }
    if (status === 'rac' || status === 'wl') {
      return 'border-honey/45 bg-honey-wash text-honey-darker';
    }
    return 'border-navy/25 bg-paper text-navy';
  };

  const statusShort = (status: BookingView['status']) => {
    if (status === 'confirmed') return 'CNF';
    return status.toUpperCase();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-4 sm:p-6 lg:p-8">
      {/* Scout Ticket & Reel Ingest Section */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="display text-[28px] leading-none text-navy">
            Bookings &amp; Ticket Vault
          </h2>
          <span className="text-[13px] text-paper-ink">
            Aadhaar numbers &amp; full PNRs are automatically masked before sharing
          </span>
        </div>

        <div className="space-y-3 rounded-xl border border-navy/20 bg-[#FFFDF8] p-4 shadow-panel sm:p-5">
          <label
            htmlFor="bookings-scout-textarea"
            className="block text-[14px] font-bold text-navy"
          >
            Paste IRCTC SMS, flight/bus confirmation, or Instagram Reel caption
          </label>
          <textarea
            id="bookings-scout-textarea"
            rows={3}
            value={scoutText}
            onChange={(e) => setScoutText(e.target.value)}
            placeholder="Paste IRCTC PNR SMS, IndiGo boarding text, redBus confirmation, or social caption…"
            className="field resize-y text-[14px]"
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => void handleScoutIngest(SAMPLE_IRCTC_SNIPPET)}
                className="chip-paper text-[12.5px]"
              >
                Sample IRCTC SMS
              </button>
              <button
                type="button"
                onClick={() => void handleScoutIngest(SAMPLE_REEL_SNIPPET)}
                className="chip-paper text-[12.5px]"
              >
                Sample Reel caption
              </button>
            </div>

            <button
              type="button"
              disabled={scoutBusy || !scoutText.trim()}
              onClick={() => void handleScoutIngest()}
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border-2 border-navy bg-navy px-4 py-2 text-[14px] font-bold text-[#FFFDF8] transition-colors hover:bg-trunk disabled:opacity-45"
            >
              <Sparkles className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              <span>{scoutBusy ? 'Parsing…' : 'Extract booking / stops'}</span>
            </button>
          </div>

          {scoutBanner && (
            <div
              role="status"
              className={`flex flex-wrap items-center justify-between gap-2 border-t border-navy/15 pt-3 text-[13.5px] ${
                scoutBanner.amberWarning ? 'text-honey-darker' : 'text-jade'
              }`}
            >
              <span className="inline-flex items-center gap-2 font-semibold">
                {scoutBanner.amberWarning ? (
                  <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
                ) : (
                  <ShieldCheck className="h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
                )}
                <span>
                  {scoutBanner.headline}
                  {scoutBanner.redactions > 0
                    ? ` · Redacted ${scoutBanner.redactions} Aadhaar number`
                    : ''}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setScoutBanner(null)}
                className="text-[12.5px] font-semibold text-navy underline"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Parsed Bookings List */}
      <section className="space-y-3">
        <h3 className="text-[17px] font-bold text-navy">
          Parsed Confirmations ({workspace.bookings.length})
        </h3>

        {workspace.bookings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-navy/30 bg-[#FFFDF8] p-5 text-[14px] text-paper-ink">
            No bookings attached yet. Paste an IRCTC, flight, bus, or hotel confirmation above to anchor it onto your timeline.
          </div>
        ) : (
          <ul className="divide-y divide-navy/15 rounded-xl border border-navy/20 bg-[#FFFDF8] shadow-panel">
            {workspace.bookings.map((bk) => (
              <li
                key={bk.id}
                className="flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 inline-grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-paper">
                    <ProviderIcon provider={bk.provider} />
                  </span>
                  <div className="min-w-0 space-y-1">
                    <div className="text-[15px] font-bold text-navy">
                      {bk.summary.headline}
                    </div>
                    <div className="font-mono text-[12px] tabular-nums text-paper-ink">
                      {bk.provider.toUpperCase()}
                      {bk.pnrMasked ? ` · PNR ${bk.pnrMasked}` : ''}
                      {bk.summary.coach ? ` · Coach ${bk.summary.coach}` : ''}
                      {bk.summary.seatOrBerth ? ` · Seat ${bk.summary.seatOrBerth}` : ''}
                    </div>
                  </div>
                </div>

                <span
                  className={`rounded-full border px-2.5 py-1 font-mono text-[12px] font-bold tabular-nums ${statusBadgeStyle(
                    bk.status
                  )}`}
                >
                  {statusShort(bk.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* WebCrypto AES-256-GCM Offline Ticket Vault */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="inline-flex items-center gap-2 text-[17px] font-bold text-navy">
            <FolderLock className="h-4 w-4 text-trunk" strokeWidth={1.8} aria-hidden="true" />
            <span>Offline Encrypted Ticket Vault (AES-256-GCM)</span>
          </h3>
          <span className="font-mono text-[12px] tabular-nums text-paper-ink">
            {Math.round(((workspace.trip.vaultBytesUsed ?? 0) / 1024 / 1024) * 10) / 10} / 50 MB
          </span>
        </div>

        <div className="space-y-3 rounded-xl border border-navy/20 bg-[#FFFDF8] p-4 shadow-panel sm:p-5">
          <p className="text-[13.5px] text-paper-ink">
            Store ticket PDFs, boarding passes, and e-visas encrypted in your browser’s IndexedDB with PBKDF2 + WebCrypto AES-GCM so they work with zero cell signal at railway gates or immigration desks.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <label
              htmlFor="vault-passphrase-field"
              className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-navy"
            >
              <span>Vault PIN:</span>
              <input
                id="vault-passphrase-field"
                type="password"
                value={vaultPassphrase}
                onChange={(e) => setVaultPassphrase(e.target.value)}
                className="min-h-[40px] w-28 rounded-lg border border-navy/35 bg-[#FFFDF8] px-2.5 py-1 font-mono text-[14px] text-navy"
              />
            </label>

            <label className="inline-flex min-h-[42px] cursor-pointer items-center gap-1.5 rounded-lg border-2 border-navy bg-trunk px-4 py-2 text-[13.5px] font-bold text-[#FFFDF8] transition-colors hover:bg-trunk-deep">
              <Upload className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />
              <span>Encrypt &amp; cache ticket</span>
              <input
                type="file"
                accept=".pdf,image/*"
                onChange={handleVaultUpload}
                className="sr-only"
              />
            </label>
          </div>

          {vaultFiles.length > 0 && (
            <ul className="divide-y divide-navy/10 border-t border-navy/15 pt-2">
              {vaultFiles.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between gap-2 py-2 font-mono text-[12.5px] text-jade"
                >
                  <span>Encrypted offline: {f.fileName}</span>
                  <span>{Math.max(1, Math.ceil(f.byteLength / 1024))} KB</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Outbound Corridor Readiness Checklist */}
      {workspace.outboundChecklist.length > 0 && (
        <section className="space-y-3">
          <h3 className="inline-flex items-center gap-2 text-[17px] font-bold text-navy">
            <ListChecks className="h-4 w-4 text-navy" strokeWidth={1.8} aria-hidden="true" />
            <span>
              Outbound Readiness Checklist ({workspace.outboundChecklist[0]?.corridor})
            </span>
          </h3>

          <ul className="divide-y divide-navy/15 rounded-xl border border-navy/20 bg-[#FFFDF8] shadow-panel">
            {workspace.outboundChecklist.map((item) => {
              const checked = Boolean(checkedChecklistIds[item.id]);
              return (
                <li key={item.id} className="p-4">
                  <button
                    type="button"
                    onClick={() =>
                      setCheckedChecklistIds((prev) => ({
                        ...prev,
                        [item.id]: !prev[item.id],
                      }))
                    }
                    aria-pressed={checked}
                    className="flex w-full items-start gap-3 whitespace-normal text-left"
                  >
                    <span
                      className={`mt-0.5 inline-grid h-5 w-5 shrink-0 place-items-center rounded border ${
                        checked
                          ? 'border-trunk bg-trunk text-[#FFFDF8]'
                          : 'border-navy/40 bg-[#FFFDF8]'
                      }`}
                    >
                      {checked && (
                        <Check className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                      )}
                    </span>
                    <div className="space-y-0.5">
                      <div
                        className={`text-[14.5px] font-bold ${
                          checked ? 'line-through text-paper-ink' : 'text-navy'
                        }`}
                      >
                        {item.title}
                      </div>
                      <p className="text-[13px] text-paper-ink">{item.detail}</p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
