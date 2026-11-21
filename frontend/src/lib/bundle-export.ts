import { formatDietaryTag, redactSharedSummaryText } from '@/lib/formatters';
import type { ItineraryItem, TripDay, TripMeta, TripWorkspace } from '@/lib/types';

export interface ItinbeeBundleEnvelope {
  format: 'itinbee.bundle.v1';
  version: 1;
  exportedAt: string;
  workspace: TripWorkspace;
}

/**
 * Serializes a complete `TripWorkspace` into a portable `.itinbee.json` archive.
 */
export function exportTripBundleJson(workspace: TripWorkspace): string {
  const envelope: ItinbeeBundleEnvelope = {
    format: 'itinbee.bundle.v1',
    version: 1,
    exportedAt: new Date().toISOString(),
    workspace,
  };
  return JSON.stringify(envelope, null, 2);
}

/**
 * Triggers a browser download of `<shortId>.itinbee.json`.
 */
export function downloadTripBundleJson(workspace: TripWorkspace): void {
  const json = exportTripBundleJson(workspace);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeSlug =
    (workspace.trip.shortId || 'trip').replace(/[^a-zA-Z0-9_-]+/g, '-') || 'trip';
  a.href = url;
  a.download = `${safeSlug}.itinbee.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Parses and validates an `.itinbee.json` string (accepting either the v1 envelope
 * or a direct `TripWorkspace` object) into a normalized `TripWorkspace`.
 */
export function importTripBundleJson(rawJson: string): TripWorkspace {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('Invalid JSON file — please select a valid .itinbee.json bundle.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Unrecognized .itinbee.json bundle structure.');
  }

  const root = parsed as Record<string, unknown>;
  const wsCandidate =
    typeof root.workspace === 'object' && root.workspace !== null
      ? (root.workspace as Record<string, unknown>)
      : root;

  if (
    typeof wsCandidate.trip !== 'object' ||
    wsCandidate.trip === null ||
    !Array.isArray(wsCandidate.days) ||
    !Array.isArray(wsCandidate.items)
  ) {
    throw new Error('Missing trip, days, or items in .itinbee.json bundle.');
  }

  const rawTrip = wsCandidate.trip as Partial<TripMeta>;
  const now = new Date().toISOString();
  const tripId =
    typeof rawTrip.id === 'string' && rawTrip.id.trim()
      ? rawTrip.id.trim()
      : crypto.randomUUID();
  const shortId =
    typeof rawTrip.shortId === 'string' && rawTrip.shortId.trim()
      ? rawTrip.shortId.trim()
      : `draft-${tripId.slice(0, 6)}`;

  const normalized: TripWorkspace = {
    trip: {
      id: tripId,
      shortId,
      title:
        typeof rawTrip.title === 'string' && rawTrip.title.trim()
          ? rawTrip.title.trim()
          : 'Imported Trip',
      destinationSummary:
        typeof rawTrip.destinationSummary === 'string'
          ? rawTrip.destinationSummary
          : '',
      startDate: rawTrip.startDate ?? null,
      endDate: rawTrip.endDate ?? null,
      homeCurrency: rawTrip.homeCurrency ?? 'INR',
      isPublicTemplate: false,
      isSample: false,
      elderModeEnabled: Boolean(rawTrip.elderModeEnabled ?? true),
      vaultBytesUsed: rawTrip.vaultBytesUsed ?? 0,
      vaultQuotaBytes: rawTrip.vaultQuotaBytes ?? 52428800,
      latestSeq: typeof rawTrip.latestSeq === 'number' ? rawTrip.latestSeq : 0,
      mapAttribution:
        rawTrip.mapAttribution ||
        '© OpenStreetMap contributors · Overture Maps · Wikidata',
      createdAt: rawTrip.createdAt || now,
      updatedAt: now,
    },
    members: Array.isArray(wsCandidate.members)
      ? (wsCandidate.members as TripWorkspace['members'])
      : [],
    days: wsCandidate.days as TripDay[],
    items: wsCandidate.items as ItineraryItem[],
    shortlist: Array.isArray(wsCandidate.shortlist)
      ? (wsCandidate.shortlist as ItineraryItem[])
      : [],
    bookings: Array.isArray(wsCandidate.bookings)
      ? (wsCandidate.bookings as TripWorkspace['bookings'])
      : [],
    polls: Array.isArray(wsCandidate.polls)
      ? (wsCandidate.polls as TripWorkspace['polls'])
      : [],
    kittyPools: Array.isArray(wsCandidate.kittyPools)
      ? (wsCandidate.kittyPools as TripWorkspace['kittyPools'])
      : [],
    expenses: Array.isArray(wsCandidate.expenses)
      ? (wsCandidate.expenses as TripWorkspace['expenses'])
      : [],
    outboundChecklist: Array.isArray(wsCandidate.outboundChecklist)
      ? (wsCandidate.outboundChecklist as TripWorkspace['outboundChecklist'])
      : [],
  };

  return normalized;
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = words[0]!;
  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i]!;
    }
  }
  lines.push(current);
  return lines;
}

/**
 * Renders a crisp 1080px-wide Trunk Labels WhatsApp Elder Card PNG onto an HTML `<canvas>`
 * (with masked PNRs/seats and embedded live share QR code) and triggers download.
 */
export async function exportWhatsAppElderCardPng(params: {
  trip: Pick<TripMeta, 'title' | 'destinationSummary' | 'shortId'>;
  days: TripDay[];
  items: ItineraryItem[];
  liveShareUrl: string;
}): Promise<void> {
  const QRCode = await import('qrcode');
  const width = 1080;
  const padX = 56;
  const contentWidth = width - padX * 2;

  const activeDays = params.days
    .filter((d) => !d.deletedAt)
    .sort((a, b) => a.dayNumber - b.dayNumber);

  // Measure pass on scratch canvas to compute exact dynamic card height
  const measureCanvas = document.createElement('canvas');
  measureCanvas.width = width;
  measureCanvas.height = 400;
  const mctx = measureCanvas.getContext('2d');
  if (!mctx) return;

  type PreparedDay = {
    header: string;
    stops: Array<{
      time: string;
      titleLines: string[];
      noteLines: string[];
      tags: string[];
    }>;
  };

  const preparedDays: PreparedDay[] = [];
  let bodyHeight = 60;

  for (const d of activeDays) {
    const dayStops = params.items
      .filter((i) => i.dayId === d.id && !i.deletedAt)
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    bodyHeight += 64; // Day heading
    const stops: PreparedDay['stops'] = [];

    if (dayStops.length === 0) {
      stops.push({
        time: 'FLEX',
        titleLines: ['Open schedule & rest buffer'],
        noteLines: [],
        tags: [],
      });
      bodyHeight += 72;
    } else {
      for (const s of dayStops) {
        mctx.font = '700 28px "Source Sans 3", system-ui, sans-serif';
        const cleanTitle = redactSharedSummaryText(s.title) || s.title;
        const titleLines = wrapCanvasText(mctx, cleanTitle, contentWidth - 150).slice(0, 2);

        mctx.font = '400 23px "Source Sans 3", system-ui, sans-serif';
        const rawSub = redactSharedSummaryText(
          s.elderSummaryI18n?.en || s.notes || s.accessibilityNotes || ''
        );
        const noteLines =
          rawSub && rawSub !== cleanTitle
            ? wrapCanvasText(mctx, rawSub, contentWidth - 150).slice(0, 2)
            : [];

        const tags = s.dietaryFlags.slice(0, 3).map(formatDietaryTag).filter(Boolean);

        bodyHeight +=
          28 +
          titleLines.length * 36 +
          noteLines.length * 31 +
          (tags.length > 0 ? 38 : 0) +
          18;
        stops.push({
          time: s.startTime || 'FLEX',
          titleLines,
          noteLines,
          tags,
        });
      }
    }
    bodyHeight += 28;
    preparedDays.push({
      header: `DAY ${d.dayNumber}${d.date ? ` · ${d.date}` : ''} — ${d.themeTitle}`,
      stops,
    });
  }

  const headerHeight = 236;
  const footerHeight = 210;
  const totalHeight = Math.max(960, headerHeight + bodyHeight + footerHeight);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // 1. Outer Trunk Green Frame (#08291F)
  ctx.fillStyle = '#08291F';
  ctx.fillRect(0, 0, width, totalHeight);

  // 2. Top Brand Header
  ctx.fillStyle = '#062119';
  ctx.fillRect(0, 0, width, headerHeight);

  // Saffron brand pill + Day chip
  ctx.fillStyle = '#F2A71B';
  ctx.fillRect(padX, 40, 148, 42);
  ctx.fillStyle = '#14213D';
  ctx.font = '900 26px "Big Shoulders Display", system-ui, sans-serif';
  ctx.fillText('ITINBEE', padX + 20, 69);

  const dayBadge = `${activeDays.length}D ELDER CARD`;
  ctx.strokeStyle = 'rgba(244, 234, 210, 0.45)';
  ctx.lineWidth = 2;
  ctx.strokeRect(padX + 166, 40, 210, 42);
  ctx.fillStyle = '#F4EAD2';
  ctx.font = '700 20px "JetBrains Mono", monospace';
  ctx.fillText(dayBadge, padX + 184, 68);

  // Trip Title & Summary
  ctx.fillStyle = '#FAF4E6';
  ctx.font = '900 54px "Big Shoulders Display", system-ui, sans-serif';
  const headerTitleLines = wrapCanvasText(ctx, params.trip.title, contentWidth);
  ctx.fillText(headerTitleLines[0] ?? params.trip.title, padX, 142);

  ctx.fillStyle = 'rgba(244, 234, 210, 0.88)';
  ctx.font = '600 24px "Source Sans 3", system-ui, sans-serif';
  const summaryLine =
    wrapCanvasText(
      ctx,
      params.trip.destinationSummary || 'Shared Family & Elder Itinerary',
      contentWidth
    )[0] ?? '';
  ctx.fillText(summaryLine, padX, 188);

  // Saffron rule
  ctx.fillStyle = '#F2A71B';
  ctx.fillRect(0, headerHeight - 6, width, 6);

  // 3. Warm Paper Luggage Tag Surface (#F4EAD2)
  const cardTop = headerHeight + 28;
  const cardHeight = totalHeight - headerHeight - 56;
  ctx.fillStyle = '#F4EAD2';
  ctx.fillRect(32, cardTop, width - 64, cardHeight);
  ctx.strokeStyle = '#14213D';
  ctx.lineWidth = 4;
  ctx.strokeRect(32, cardTop, width - 64, cardHeight);

  let y = cardTop + 52;

  for (const d of preparedDays) {
    // Day Stamp Banner
    ctx.fillStyle = '#14213D';
    ctx.fillRect(padX, y - 30, contentWidth, 44);
    ctx.fillStyle = '#F2A71B';
    ctx.font = '800 23px "Source Sans 3", system-ui, sans-serif';
    const dayTitleFit = wrapCanvasText(ctx, d.header, contentWidth - 32)[0] ?? d.header;
    ctx.fillText(dayTitleFit, padX + 16, y - 1);
    y += 42;

    for (const stop of d.stops) {
      // Time pill
      ctx.fillStyle = '#FFFDF8';
      ctx.fillRect(padX, y - 22, 118, 36);
      ctx.strokeStyle = '#14213D';
      ctx.lineWidth = 2;
      ctx.strokeRect(padX, y - 22, 118, 36);

      ctx.fillStyle = '#C7361F';
      ctx.font = '700 21px "JetBrains Mono", monospace';
      ctx.fillText(stop.time, padX + 16, y + 3);

      // Stop title
      const textX = padX + 140;
      ctx.fillStyle = '#14213D';
      ctx.font = '700 28px "Source Sans 3", system-ui, sans-serif';
      for (const line of stop.titleLines) {
        ctx.fillText(line, textX, y + 4);
        y += 36;
      }

      // Stop notes
      if (stop.noteLines.length > 0) {
        ctx.fillStyle = '#4F4533';
        ctx.font = '400 23px "Source Sans 3", system-ui, sans-serif';
        for (const nline of stop.noteLines) {
          ctx.fillText(nline, textX, y + 2);
          y += 31;
        }
      }

      // Dietary badges
      if (stop.tags.length > 0) {
        let tagX = textX;
        for (const tag of stop.tags) {
          ctx.font = '700 18px "Source Sans 3", system-ui, sans-serif';
          const tw = ctx.measureText(tag).width + 24;
          ctx.fillStyle = '#F0FDFA';
          ctx.fillRect(tagX, y - 14, tw, 28);
          ctx.strokeStyle = '#0F766E';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(tagX, y - 14, tw, 28);
          ctx.fillStyle = '#0F766E';
          ctx.fillText(tag, tagX + 12, y + 6);
          tagX += tw + 10;
        }
        y += 36;
      }

      y += 20;
    }

    y += 14;
  }

  // 4. Footer Perforation + Live Share QR Code
  const footerTop = totalHeight - footerHeight;
  ctx.save();
  ctx.setLineDash([10, 8]);
  ctx.strokeStyle = 'rgba(20, 33, 61, 0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padX, footerTop);
  ctx.lineTo(width - padX, footerTop);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = '#14213D';
  ctx.font = '700 24px "Source Sans 3", system-ui, sans-serif';
  ctx.fillText('Live Hindi / English Elder Card & Map', padX, footerTop + 56);

  ctx.fillStyle = '#4F4533';
  ctx.font = '600 20px "JetBrains Mono", monospace';
  ctx.fillText(params.liveShareUrl, padX, footerTop + 92);

  ctx.font = '400 18px "Source Sans 3", system-ui, sans-serif';
  ctx.fillText(
    'Privacy active: PNRs & IDs masked · © OpenStreetMap contributors',
    padX,
    footerTop + 130
  );

  try {
    const qrDataUrl = await QRCode.toDataURL(params.liveShareUrl, {
      margin: 1,
      width: 136,
      color: { dark: '#14213D', light: '#FFFDF8' },
    });
    const qrImg = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = qrDataUrl;
    });
    const qrX = width - padX - 136;
    const qrY = footerTop + 20;
    ctx.fillStyle = '#FFFDF8';
    ctx.fillRect(qrX - 6, qrY - 6, 148, 148);
    ctx.strokeStyle = '#14213D';
    ctx.lineWidth = 2;
    ctx.strokeRect(qrX - 6, qrY - 6, 148, 148);
    ctx.drawImage(qrImg, qrX, qrY, 136, 136);
  } catch {
    /* QR optional if canvas image blocked */
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png')
  );
  if (!blob) return;
  const dlUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeSlug =
    (params.trip.shortId || 'trip').replace(/[^a-zA-Z0-9_-]+/g, '-') || 'trip';
  a.href = dlUrl;
  a.download = `itinbee-${safeSlug}-card.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(dlUrl), 5000);
}
