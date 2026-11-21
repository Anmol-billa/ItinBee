import { redactAadhaarNumbers } from '../../security/aadhaar-redactor.js';
import { classifyAndSanitizeInput, extractTextFromBuffer, type DetectedSourceKind } from '../ingest/classifier.js';
import { parseIrctcTicket, type ParsedBookingCandidate } from '../ingest/parsers/irctc.js';
import { parseFlightTicket } from '../ingest/parsers/flight.js';
import { parseBusTicket } from '../ingest/parsers/bus.js';
import { parseStayConfirmation } from '../ingest/parsers/stay.js';
import type { BookingAnchor } from './intent.js';
import { extractReadableText } from './html-text.js';
import { FetchLimitError, SafeFetcher, SsrfBlockedError } from './safe-fetch.js';

export const IMPORT_LIMITS = {
  textChars: 20_000,
  urls: 5,
  files: 3,
  totalBytes: 8 * 1024 * 1024,
  /** Max characters of user data sent to the model across all segments. */
  promptChars: 60_000,
  perUrlChars: 12_000,
} as const;

export interface ImportFile {
  name: string;
  mimeType: string;
  dataBase64: string;
}

export interface ImportInput {
  text?: string;
  urls?: string[];
  files?: ImportFile[];
  locale?: 'en' | 'hi';
  baseTripSlug?: string;
}

export type SegmentKind = 'chat' | 'notes' | 'ticket' | 'article' | 'social' | 'pdf' | 'file';

export interface Segment {
  id: string;
  kind: SegmentKind;
  label: string;
  text: string;
}

export interface MediaPart {
  name: string;
  mimeType: string;
  dataBase64: string;
}

export type DetectedKind = 'destination' | 'place' | 'dates' | 'travellers' | 'booking' | 'budget' | 'interest' | 'note';

export interface DetectedEvent {
  kind: DetectedKind;
  label: string;
  resolved?: boolean;
}

export interface NormalizedInput {
  segments: Segment[];
  /** Parser output for ticket-like text; PNR/passenger data stays server side (encrypted at rest in the job store). */
  bookingCandidates: ParsedBookingCandidate[];
  bookings: BookingAnchor[];
  media: MediaPart[];
  detected: DetectedEvent[];
  /** Human-readable notes (unreadable files, blocked links) surfaced as assumptions on the Review card. */
  notes: string[];
  redactions: number;
  hasChat: boolean;
  /** Concatenated text used for substring checks (e.g. mustInclude quotes). */
  corpus: string;
}

const SOCIAL_NO_FETCH =
  /(^|\.)(instagram\.com|instagr\.am|facebook\.com|fb\.watch|fb\.com|tiktok\.com|x\.com|twitter\.com)$/i;
const YOUTUBE = /(^|\.)(youtube\.com|youtu\.be)$/i;

export const PASTE_CAPTION_NOTE =
  "We can't read Instagram/Facebook/TikTok links automatically. Paste the caption or the place names from the post.";

// ---------------------------------------------------------------- WhatsApp

const WA_LINE =
  /^\s*(?:\[)?(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APap]\.?[Mm]\.?)?)(?:\])?\s*(?:-\s*)?([^:]{1,60}):\s?(.*)$/;
const WA_SYSTEM =
  /(end-to-end encrypted|messages and calls are|created group|added you|changed the (?:group|subject|icon)|left$|joined using|security code changed|deleted this message|<media omitted>|image omitted|video omitted|sticker omitted|this message was deleted|you were added|null$)/i;

export function looksLikeWhatsAppChat(text: string): boolean {
  let hits = 0;
  for (const line of text.split('\n', 400)) {
    if (WA_LINE.test(line)) hits += 1;
    if (hits >= 3) return true;
  }
  return false;
}

/**
 * Cleans a WhatsApp export for the model: drops system lines and media placeholders, pseudonymises senders that are
 * phone numbers and masks phone numbers in message bodies. Keeps timestamps (order matters: "last decision wins").
 */
export function preprocessWhatsApp(text: string): string {
  const out: string[] = [];
  const phone = /\+?\d[\d\s().-]{8,}\d/g;
  let last: string | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\u200e|\u200f|\u202f/g, ' ').trimEnd();
    if (!line.trim()) continue;
    const m = WA_LINE.exec(line);
    if (m) {
      const [, date, time, senderRaw, body] = m as unknown as [string, string, string, string, string];
      if (WA_SYSTEM.test(body) || WA_SYSTEM.test(line.slice(0, 120))) {
        last = null;
        continue;
      }
      const sender = /\d{6,}/.test(senderRaw) ? 'Member' : senderRaw.trim();
      last = `[${date} ${time}] ${sender}: ${body.replace(phone, '[phone]')}`;
      out.push(last);
    } else if (last !== null) {
      // continuation of the previous multi-line message
      if (!WA_SYSTEM.test(line)) out.push(`  ${line.trim().replace(phone, '[phone]')}`);
    } else if (!WA_SYSTEM.test(line)) {
      out.push(line.trim().replace(phone, '[phone]'));
    }
  }
  return out.join('\n');
}

// ---------------------------------------------------------------- bookings

const TICKET_KINDS: DetectedSourceKind[] = ['irctc', 'flight', 'bus', 'stay'];

export function parseBookingsFromText(text: string): ParsedBookingCandidate | null {
  const stage1 = classifyAndSanitizeInput(text);
  let candidate: ParsedBookingCandidate | null = null;
  switch (stage1.detectedKind) {
    case 'irctc':
      candidate = parseIrctcTicket(stage1.cleanedText);
      break;
    case 'flight':
      candidate = parseFlightTicket(stage1.cleanedText);
      break;
    case 'bus':
      candidate = parseBusTicket(stage1.cleanedText);
      break;
    case 'stay':
      candidate = parseStayConfirmation(stage1.cleanedText);
      break;
    default:
      return null;
  }
  return candidate && candidate.parserConfidence >= 0.7 ? candidate : null;
}

export function candidateToAnchor(c: ParsedBookingCandidate): BookingAnchor {
  const s = c.summary;
  return {
    itemKind: c.itemKind,
    title: c.suggestedTitle,
    provider: c.provider,
    ...(s.departureIso ?? s.checkInIso ? { startIso: (s.departureIso ?? s.checkInIso) as string } : {}),
    ...(s.arrivalIso ?? s.checkOutIso ? { endIso: (s.arrivalIso ?? s.checkOutIso) as string } : {}),
    summary: s,
    lowConfidenceFields: c.lowConfidenceFields,
  };
}

// ---------------------------------------------------------------- files

function sniff(buf: Buffer): 'pdf' | 'png' | 'jpeg' | 'webp' | 'heic' | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (buf.length >= 12 && buf.subarray(4, 8).toString('latin1') === 'ftyp') return 'heic';
  return null;
}

const MIME_BY_SNIFF = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  heic: 'image/heic',
} as const;

function looksBinary(buf: Buffer): boolean {
  const sample = buf.subarray(0, 2000);
  let bad = 0;
  for (const b of sample) if (b === 0) bad += 1;
  return bad > 0;
}

// ---------------------------------------------------------------- main

export interface NormalizeDeps {
  fetcher: SafeFetcher;
  /** True when a multimodal-capable model is available (images/PDF are forwarded as inlineData). */
  multimodal: boolean;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n[truncated]` : text;
}

function describeBooking(c: ParsedBookingCandidate): string {
  const s = c.summary;
  const when = (s.departureIso ?? s.checkInIso ?? '').slice(0, 10);
  const what = s.vehicleName ?? s.vehicleNumber ?? s.propertyName ?? c.suggestedTitle;
  return `${c.provider.toUpperCase()} ${what}${when ? ` · ${when}` : ''}`.slice(0, 120);
}

export async function normalizeInputs(input: ImportInput, deps: NormalizeDeps): Promise<NormalizedInput> {
  const out: NormalizedInput = {
    segments: [],
    bookingCandidates: [],
    bookings: [],
    media: [],
    detected: [],
    notes: [],
    redactions: 0,
    hasChat: false,
    corpus: '',
  };
  let seq = 0;
  const nextId = (): string => `S${(seq += 1)}`;

  const addBooking = (text: string, label: string): void => {
    const c = parseBookingsFromText(text);
    if (!c) return;
    const key = `${c.provider}|${c.pnr ?? ''}|${c.summary.departureIso ?? c.summary.checkInIso ?? ''}|${c.suggestedTitle}`;
    const dupe = out.bookingCandidates.some(
      (x) => `${x.provider}|${x.pnr ?? ''}|${x.summary.departureIso ?? x.summary.checkInIso ?? ''}|${x.suggestedTitle}` === key
    );
    if (dupe) return;
    out.bookingCandidates.push(c);
    out.bookings.push(candidateToAnchor(c));
    out.detected.push({ kind: 'booking', label: describeBooking(c), resolved: true });
    void label;
  };

  const addTextSegment = (rawText: string, label: string, hint?: SegmentKind): void => {
    const trimmed = rawText.trim();
    if (!trimmed) return;
    const { redactedText, redactionCount } = redactAadhaarNumbers(trimmed);
    out.redactions += redactionCount;
    let kind: SegmentKind = hint ?? 'notes';
    let text = redactedText;
    if (looksLikeWhatsAppChat(redactedText)) {
      kind = 'chat';
      text = preprocessWhatsApp(redactedText);
      out.hasChat = true;
    }
    const classified = classifyAndSanitizeInput(trimmed).detectedKind;
    if (TICKET_KINDS.includes(classified)) {
      addBooking(trimmed, label);
      if (kind === 'notes') kind = 'ticket';
    }
    out.segments.push({ id: nextId(), kind, label, text: truncate(text, IMPORT_LIMITS.textChars) });
  };

  if (input.text) addTextSegment(input.text.slice(0, IMPORT_LIMITS.textChars), 'pasted text');

  // -- files
  let totalBytes = 0;
  for (const file of (input.files ?? []).slice(0, IMPORT_LIMITS.files)) {
    let buf: Buffer;
    try {
      buf = Buffer.from(file.dataBase64, 'base64');
    } catch {
      out.notes.push(`Couldn't read file "${file.name}" (invalid encoding).`);
      continue;
    }
    totalBytes += buf.length;
    if (totalBytes > IMPORT_LIMITS.totalBytes) {
      out.notes.push(`Skipped "${file.name}": files exceed the 8 MB limit.`);
      continue;
    }
    const sniffed = sniff(buf);
    const safeName = file.name.replace(/[^\w.\- ]/g, '_').slice(0, 80);
    if (sniffed === 'pdf') {
      const text = extractTextFromBuffer(buf, 'application/pdf');
      const meaningful = (text.match(/\p{L}/gu) ?? []).length;
      let redactedHere = 0;
      if (meaningful >= 40) {
        const before = out.redactions;
        addTextSegment(text, `PDF ${safeName}`, 'pdf');
        redactedHere = out.redactions - before;
      }
      // Forward the raw PDF only when no Aadhaar number was found in its text layer (we cannot redact inside a PDF).
      if (deps.multimodal && redactedHere === 0) {
        out.media.push({ name: safeName, mimeType: MIME_BY_SNIFF.pdf, dataBase64: file.dataBase64 });
      } else if (meaningful < 40 && !deps.multimodal) {
        out.notes.push(`"${safeName}" looks like a scanned PDF and needs AI reading, which is unavailable right now.`);
      }
    } else if (sniffed) {
      if (deps.multimodal) {
        out.media.push({ name: safeName, mimeType: MIME_BY_SNIFF[sniffed], dataBase64: file.dataBase64 });
      } else {
        out.notes.push(`"${safeName}" is an image and needs AI reading, which is unavailable right now. Paste the text instead.`);
      }
    } else if (!looksBinary(buf) && (/^text\//i.test(file.mimeType) || /\.(txt|md|csv|json|rtf)$/i.test(file.name) || file.mimeType === 'application/json')) {
      addTextSegment(buf.toString('utf8'), `file ${safeName}`, 'file');
    } else {
      out.notes.push(`Couldn't read "${safeName}" (unsupported file type). Supported: text, PDF, PNG, JPEG, WebP.`);
    }
  }

  // -- urls
  for (const rawUrl of (input.urls ?? []).slice(0, IMPORT_LIMITS.urls)) {
    let url: URL;
    try {
      url = new URL(rawUrl.trim());
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('scheme');
    } catch {
      out.notes.push(`Ignored "${rawUrl.slice(0, 60)}" (not a valid http(s) link).`);
      continue;
    }
    const host = url.hostname.toLowerCase();
    if (SOCIAL_NO_FETCH.test(host)) {
      out.detected.push({ kind: 'note', label: PASTE_CAPTION_NOTE, resolved: false });
      out.notes.push(`Link to ${host} was not opened. ${PASTE_CAPTION_NOTE}`);
      continue;
    }
    try {
      if (YOUTUBE.test(host)) {
        const oembed = await deps.fetcher.fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(url.toString())}&format=json`
        );
        const data = JSON.parse(oembed.body.toString('utf8')) as { title?: string; author_name?: string };
        const text = [data.title, data.author_name ? `(channel: ${data.author_name})` : null].filter(Boolean).join(' ');
        if (text.trim().length >= 6) {
          const { redactedText, redactionCount } = redactAadhaarNumbers(`YouTube video title: ${text}`);
          out.redactions += redactionCount;
          out.segments.push({ id: nextId(), kind: 'social', label: 'YouTube video title', text: redactedText });
        } else {
          out.detected.push({ kind: 'note', label: PASTE_CAPTION_NOTE, resolved: false });
        }
        continue;
      }
      const res = await deps.fetcher.fetch(url.toString());
      const raw = res.body.toString('utf8');
      let text: string;
      if (/html|xml/i.test(res.contentType)) {
        const page = extractReadableText(raw, IMPORT_LIMITS.perUrlChars);
        text = [page.title ? `Title: ${page.title}` : null, page.description ? `Summary: ${page.description}` : null, page.text]
          .filter(Boolean)
          .join('\n\n');
      } else {
        text = raw.slice(0, IMPORT_LIMITS.perUrlChars);
      }
      if (text.replace(/\s+/g, ' ').trim().length < 80) {
        out.notes.push(`Couldn't find readable text at ${host}. Paste the relevant part instead.`);
        out.detected.push({ kind: 'note', label: `No readable text at ${host}. Paste the relevant part.`, resolved: false });
        continue;
      }
      const { redactedText, redactionCount } = redactAadhaarNumbers(text);
      out.redactions += redactionCount;
      out.segments.push({
        id: nextId(),
        kind: 'article',
        label: `web page ${host}`,
        text: truncate(redactedText, IMPORT_LIMITS.perUrlChars),
      });
    } catch (err) {
      const why =
        err instanceof SsrfBlockedError
          ? 'link was blocked for security reasons'
          : err instanceof FetchLimitError
            ? err.code === 'too_large'
              ? 'page is too large'
              : err.code === 'timeout'
                ? 'page took too long to load'
                : err.code === 'bad_content_type'
                  ? 'not a web page'
                  : 'page could not be loaded'
            : 'page could not be loaded';
      out.notes.push(`Couldn't read ${host}: ${why}.`);
      out.detected.push({ kind: 'note', label: `Couldn't read ${host}: ${why}.`, resolved: false });
    }
  }

  if (input.baseTripSlug) {
    out.segments.push({
      id: nextId(),
      kind: 'notes',
      label: 'base template',
      text: `The traveller wants to customise the published itinerary "${input.baseTripSlug.slice(0, 80)}".`,
    });
  }

  // -- global cap on what reaches the model
  let budget: number = IMPORT_LIMITS.promptChars;
  for (const seg of out.segments) {
    seg.text = truncate(seg.text, Math.max(500, budget));
    budget -= seg.text.length;
    if (budget < 500) budget = 500;
  }
  out.corpus = out.segments.map((s) => s.text).join('\n\n');
  return out;
}

/** Wraps user data so the model can tell data from instructions. Delimiter look-alikes inside data are defused. */
export function renderUserData(segments: Segment[]): string {
  return segments
    .map((s) => {
      const safe = s.text.replace(/<<<|>>>/g, (m) => (m === '<<<' ? '‹‹‹' : '›››'));
      return `<<<USER_DATA id="${s.id}" kind="${s.kind}" source="${s.label.replace(/["<>]/g, '')}">>>\n${safe}\n<<<END_USER_DATA>>>`;
    })
    .join('\n\n');
}
