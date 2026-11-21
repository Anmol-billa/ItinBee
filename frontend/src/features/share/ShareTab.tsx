'use client';

import React, { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FileJson,
  Globe,
  Image as ImageIcon,
  Languages,
  Share2,
  Upload,
} from 'lucide-react';
import { ElderCardView } from '@/components/share/ElderCardView';
import { SAMPLE_WORKSPACES } from '@/data/sample-trips';
import { browserApiBase } from '@/lib/api-base';
import {
  claimSandboxToCloud,
  getSignedInUserBearerToken,
} from '@/lib/api-client';
import {
  downloadTripBundleJson,
  exportWhatsAppElderCardPng,
  importTripBundleJson,
} from '@/lib/bundle-export';
import { BUDGETS, TRIP_TYPES, type BudgetTier } from '@/lib/explore-client';
import { exportItineraryWithLiveQrPdf } from '@/lib/pdf-export';
import type { TripWorkspace } from '@/lib/types';

interface ShareTabProps {
  workspace: TripWorkspace;
  isCloudSynced: boolean;
  onUpgradeToCloud?: (draft: TripWorkspace) => Promise<TripWorkspace>;
  onUpdateWorkspace: (updater: (prev: TripWorkspace) => TripWorkspace) => void;
  onNotify: (msg: string) => void;
}

export function ShareTab({
  workspace,
  isCloudSynced,
  onUpgradeToCloud,
  onUpdateWorkspace,
  onNotify,
}: ShareTabProps) {
  const [claimedUrl, setClaimedUrl] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showElderPreview, setShowElderPreview] = useState(true);
  const [renderingPng, setRenderingPng] = useState(false);
  const bundleInputRef = useRef<HTMLInputElement | null>(null);

  // Publish to Explore state
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['friends']);
  const [budgetTier, setBudgetTier] = useState<BudgetTier>('mid');
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);
  const [publishStatusMsg, setPublishStatusMsg] = useState<string | null>(null);

  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://itinbee.com';

  const shareUrl =
    claimedUrl || `${origin}/t/${workspace.trip.shortId}`;

  const activeDays = useMemo(
    () =>
      workspace.days
        .filter((d) => !d.deletedAt)
        .sort((a, b) => a.dayNumber - b.dayNumber),
    [workspace.days]
  );

  const whatsappSummary = useMemo(() => {
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
    lines.push(`\nLive itinerary, Elder Card & polls: ${shareUrl}`);
    return lines.join('\n');
  }, [workspace.trip.title, workspace.items, activeDays, shareUrl]);

  const ensureShareableLink = async (): Promise<string> => {
    if (claimedUrl) return claimedUrl;
    if (SAMPLE_WORKSPACES[workspace.trip.shortId] || isCloudSynced) {
      const direct = `${origin}/t/${workspace.trip.shortId}`;
      setClaimedUrl(direct);
      return direct;
    }
    setClaiming(true);
    try {
      const synced = onUpgradeToCloud
        ? await onUpgradeToCloud(workspace)
        : await claimSandboxToCloud(workspace);
      if (!onUpgradeToCloud) {
        onUpdateWorkspace(() => synced);
      }
      const url = `${origin}/t/${synced.trip.shortId}`;
      setClaimedUrl(url);
      return url;
    } catch {
      const fallback = `${origin}/t/${workspace.trip.shortId}`;
      setClaimedUrl(fallback);
      return fallback;
    } finally {
      setClaiming(false);
    }
  };

  const handleCopy = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((curr) => (curr === key ? null : curr)), 2000);
  };

  const handleCopyShareLink = async () => {
    const url = await ensureShareableLink();
    await handleCopy('link', url);
    onNotify('Copied WhatsApp guest share link.');
  };

  const handleDownloadElderPng = async () => {
    setRenderingPng(true);
    try {
      await exportWhatsAppElderCardPng({
        trip: workspace.trip,
        days: workspace.days,
        items: workspace.items,
        liveShareUrl: shareUrl,
      });
      onNotify('Downloaded WhatsApp Elder Card PNG.');
    } catch {
      onNotify('Could not generate Elder Card image.');
    } finally {
      setRenderingPng(false);
    }
  };

  const handleImportBundleFile = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const raw = await file.text();
      const imported = importTripBundleJson(raw);
      onUpdateWorkspace(() => imported);
      onNotify(`Imported "${imported.trip.title}" from .itinbee.json bundle.`);
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Could not import .itinbee.json file.'
      );
    } finally {
      e.target.value = '';
    }
  };

  const handlePublishToExplore = async (e: React.FormEvent) => {
    e.preventDefault();
    setPublishBusy(true);
    setPublishStatusMsg(null);

    try {
      let targetTripId = workspace.trip.id;
      if (!isCloudSynced && !SAMPLE_WORKSPACES[workspace.trip.shortId]) {
        try {
          const synced = onUpgradeToCloud
            ? await onUpgradeToCloud(workspace)
            : await claimSandboxToCloud(workspace);
          if (!onUpgradeToCloud) {
            onUpdateWorkspace(() => synced);
          }
          targetTripId = synced.trip.id;
        } catch {
          // Proceed with current tripId
        }
      }

      const publishBody = JSON.stringify({
        tripTypes: selectedTypes.length > 0 ? selectedTypes : ['friends'],
        budgetTier,
      });
      const userToken = getSignedInUserBearerToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(userToken ? { Authorization: `Bearer ${userToken}` } : {}),
      };

      let res = await fetch(
        `${browserApiBase()}/v1/trips/${encodeURIComponent(targetTripId)}/publish`,
        {
          method: 'POST',
          credentials: 'include',
          headers,
          body: publishBody,
        }
      );

      if (res.status === 401) {
        await fetch(`${browserApiBase()}/v1/auth/guest`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        }).catch(() => {});
        res = await fetch(
          `${browserApiBase()}/v1/trips/${encodeURIComponent(targetTripId)}/publish`,
          {
            method: 'POST',
            credentials: 'include',
            headers,
            body: publishBody,
          }
        );
      }

      if (res.ok) {
        const card = (await res.json()) as { slug?: string };
        const slug = card.slug || workspace.trip.shortId;
        setPublishedSlug(slug);
        onUpdateWorkspace((prev) => ({
          ...prev,
          trip: { ...prev.trip, isPublicTemplate: true },
        }));
        onNotify('Published itinerary to Explore!');
      } else {
        setPublishStatusMsg(
          'Sign in or connect to the live server to publish this draft publicly on Explore. Your WhatsApp share link above already works.'
        );
      }
    } catch {
      setPublishStatusMsg(
        'Currently offline — reconnect to publish to the community Explore catalog. Your offline PDF & .itinbee.json exports work right now.'
      );
    } finally {
      setPublishBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="display text-[28px] leading-none text-navy">
          Share, Elder Card &amp; Publish
        </h2>
        <span className="text-[13px] text-paper-ink">
          Zero-login WhatsApp card · Masked PNRs · Portable .itinbee.json
        </span>
      </div>

      {/* WhatsApp Share Link, Elder Card PNG, QR PDF & .itinbee.json */}
      <section className="space-y-4 rounded-xl border border-navy/20 bg-[#FFFDF8] p-4 shadow-panel sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="inline-flex items-center gap-2 text-[17px] font-bold text-navy">
            <Share2 className="h-4 w-4 text-trunk" strokeWidth={1.9} aria-hidden="true" />
            <span>Zero-Login WhatsApp Guest Link</span>
          </h3>
          <Link
            href={`/t/${workspace.trip.shortId}`}
            className="inline-flex items-center gap-1 text-[13px] font-bold text-navy underline"
          >
            <span>Open guest view</span>
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
          </Link>
        </div>

        <p className="text-[13.5px] text-paper-ink">
          Anyone with this link can read the day-by-day plan, switch between English and Hindi (अ/A), and vote on polls without signing up. Ticket PNRs and seats stay redacted.
        </p>

        <div className="flex flex-wrap gap-2">
          <label htmlFor="share-tab-url" className="sr-only">
            Guest share URL
          </label>
          <input
            id="share-tab-url"
            type="text"
            readOnly
            value={claiming ? 'Syncing link…' : shareUrl}
            className="field min-w-[220px] flex-1 font-mono text-[13px]"
          />

          <button
            type="button"
            onClick={() => void handleCopyShareLink()}
            className="btn-stamp text-[14px]"
          >
            {copiedKey === 'link' ? (
              <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            ) : (
              <Copy className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />
            )}
            <span>{copiedKey === 'link' ? 'Copied link' : 'Copy WhatsApp link'}</span>
          </button>
        </div>

        {copiedKey && (
          <p role="status" className="text-[12.5px] font-semibold text-jade">
            {copiedKey === 'link'
              ? 'WhatsApp share link copied to clipboard.'
              : 'Formatted WhatsApp digest copied to clipboard.'}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => void handleCopy('digest', whatsappSummary)}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-navy/35 bg-[#FFFDF8] px-3.5 py-2 text-[13.5px] font-semibold text-navy hover:bg-paper"
          >
            <Copy className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
            <span>
              {copiedKey === 'digest' ? 'Copied WhatsApp digest' : 'Copy formatted WhatsApp message'}
            </span>
          </button>

          <button
            type="button"
            disabled={renderingPng}
            onClick={() => void handleDownloadElderPng()}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border-2 border-navy bg-saffron px-3.5 py-2 text-[13.5px] font-bold text-navy hover:bg-saffron/85 disabled:opacity-50"
          >
            <ImageIcon className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />
            <span>
              {renderingPng
                ? 'Rendering PNG…'
                : 'Download WhatsApp Elder Card (PNG)'}
            </span>
          </button>

          <button
            type="button"
            onClick={() =>
              void exportItineraryWithLiveQrPdf({
                trip: workspace.trip,
                days: workspace.days,
                items: workspace.items,
                liveShareUrl: shareUrl,
              })
            }
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-navy/35 bg-[#FFFDF8] px-3.5 py-2 text-[13.5px] font-semibold text-navy hover:bg-paper"
          >
            <Download className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
            <span>Download printable QR PDF</span>
          </button>
        </div>

        {/* Portable .itinbee.json Bundle Export / Import */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-navy/15 pt-3.5">
          <div className="text-[12.5px] text-paper-ink">
            <strong className="text-navy">Portable trip archive:</strong> Export or restore a full offline backup (`.itinbee.json`).
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                downloadTripBundleJson(workspace);
                onNotify('Exported .itinbee.json bundle.');
              }}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-navy/35 bg-[#FFFDF8] px-3 py-1.5 text-[13px] font-semibold text-navy hover:bg-paper"
            >
              <FileJson className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
              <span>Export .itinbee.json</span>
            </button>

            <input
              ref={bundleInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImportBundleFile}
              className="sr-only"
            />
            <button
              type="button"
              onClick={() => bundleInputRef.current?.click()}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-navy/35 bg-paper px-3 py-1.5 text-[13px] font-semibold text-navy hover:bg-paper-dark"
            >
              <Upload className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
              <span>Import .itinbee.json</span>
            </button>
          </div>
        </div>
      </section>

      {/* Publish to Explore Community Templates */}
      <section className="space-y-4 rounded-xl border border-navy/20 bg-[#FFFDF8] p-4 shadow-panel sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="inline-flex items-center gap-2 text-[17px] font-bold text-navy">
            <Globe className="h-4 w-4 text-trunk" strokeWidth={1.9} aria-hidden="true" />
            <span>Publish to Explore Community</span>
          </h3>
          {publishedSlug && (
            <Link
              href={`/explore/${publishedSlug}`}
              className="inline-flex items-center gap-1 rounded-full bg-jade-wash px-3 py-1 text-[12.5px] font-bold text-jade"
            >
              <span>View on Explore</span>
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
            </Link>
          )}
        </div>

        <p className="text-[13.5px] text-paper-ink">
          Share your day-by-day route on <Link href="/explore" className="font-semibold text-navy underline">/explore</Link> so other travellers can clone it. Personal bookings, expenses, vault files, and group members are never included.
        </p>

        <form onSubmit={handlePublishToExplore} className="space-y-4">
          <div className="space-y-1.5">
            <span className="block text-[13px] font-bold text-navy">Trip style tags</span>
            <div className="flex flex-wrap gap-1.5">
              {TRIP_TYPES.map((typeTag) => {
                const active = selectedTypes.includes(typeTag);
                return (
                  <button
                    key={typeTag}
                    type="button"
                    onClick={() =>
                      setSelectedTypes((prev) =>
                        prev.includes(typeTag)
                          ? prev.filter((t) => t !== typeTag)
                          : [...prev, typeTag]
                      )
                    }
                    aria-pressed={active}
                    className={`inline-flex min-h-[34px] items-center gap-1 rounded-full border px-3 py-1 text-[12.5px] font-semibold capitalize transition-colors ${
                      active
                        ? 'border-navy bg-navy text-[#FFFDF8]'
                        : 'border-navy/25 bg-[#FFFDF8] text-navy hover:bg-paper'
                    }`}
                  >
                    {typeTag}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="space-y-1 text-[13px] font-bold text-navy">
              <span className="block">Budget tier</span>
              <select
                value={budgetTier}
                onChange={(e) => setBudgetTier(e.target.value as BudgetTier)}
                className="min-h-[42px] rounded-lg border-2 border-navy/60 bg-[#FFFDF8] px-3 text-[14px] font-semibold text-navy"
              >
                {BUDGETS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="submit"
              disabled={publishBusy}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border-2 border-navy bg-trunk px-4 py-2 text-[14px] font-bold text-[#FFFDF8] transition-colors hover:bg-trunk-deep disabled:opacity-45"
            >
              <Globe className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              <span>
                {publishBusy
                  ? 'Publishing…'
                  : publishedSlug
                    ? 'Update published template'
                    : 'Publish to Explore'}
              </span>
            </button>
          </div>

          {publishStatusMsg && (
            <p role="status" className="text-[13px] font-medium text-paper-ink">
              {publishStatusMsg}
            </p>
          )}
        </form>
      </section>

      {/* Family & Elder Card (अ / A) Live Preview */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="inline-flex items-center gap-2 text-[17px] font-bold text-navy">
            <Languages className="h-4 w-4 text-trunk" strokeWidth={1.9} aria-hidden="true" />
            <span>Family &amp; Elder Card Preview (English / हिन्दी)</span>
          </h3>

          <button
            type="button"
            onClick={() => setShowElderPreview((v) => !v)}
            aria-expanded={showElderPreview}
            className="inline-flex min-h-[36px] items-center rounded-full border border-navy/30 bg-[#FFFDF8] px-3.5 py-1 text-[13px] font-semibold text-navy hover:bg-paper"
          >
            {showElderPreview ? 'Hide preview' : 'Show Elder Card (A / अ)'}
          </button>
        </div>

        {showElderPreview && (
          <ElderCardView
            trip={workspace.trip}
            days={workspace.days}
            items={workspace.items}
            bookings={workspace.bookings}
          />
        )}
      </section>
    </div>
  );
}
