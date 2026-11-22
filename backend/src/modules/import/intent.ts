import { z } from 'zod';
import { redactAadhaarNumbers } from '../../security/aadhaar-redactor.js';
import {
  BookingProviderSchema,
  BookingSummaryPublicSchema,
  ItemKindSchema,
  type BookingProvider,
} from '../../types/domain.js';
import type { ParsedBookingCandidate } from '../ingest/parsers/irctc.js';
import { namesSimilar, normalizeName } from '../places/util/text.js';
import { toGeminiSchema } from './gemini-schema.js';

/** Source of truth for the Smart Import contract (see plan/05_api_contracts_import_explore.md). */

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

export const GROUPS = ['solo', 'couple', 'family', 'friends', 'seniors', 'mixed'] as const;
export const PACES = ['relaxed', 'moderate', 'packed'] as const;
export const BUDGET_TIERS = ['budget', 'mid', 'premium'] as const;

export const BookingAnchorSchema = z.object({
  itemKind: ItemKindSchema,
  title: z.string(),
  provider: BookingProviderSchema,
  startIso: z.string().optional(),
  endIso: z.string().optional(),
  summary: BookingSummaryPublicSchema,
  lowConfidenceFields: z.array(z.string()),
});
export type BookingAnchor = z.infer<typeof BookingAnchorSchema>;

export const IntentDestinationSchema = z.object({
  name: z.string().min(1).max(120),
  country: z.string().max(80).optional(),
  nights: z.number().int().min(0).max(60).optional(),
  order: z.number().int(),
  confidence: z.number().min(0).max(1),
  // filled by grounding (never by the model)
  destinationSlug: z.string().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  resolved: z.boolean(),
});
export type IntentDestination = z.infer<typeof IntentDestinationSchema>;

export const IntentMustIncludeSchema = z.object({
  name: z.string().min(1).max(160),
  sourceQuote: z.string().max(400),
  placeRefId: z.string().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  resolved: z.boolean(),
});
export type IntentMustInclude = z.infer<typeof IntentMustIncludeSchema>;

export const ClarifyingQuestionSchema = z.object({
  id: z.string().min(1).max(40),
  question: z.string().min(1).max(300),
  options: z.array(z.string().max(80)).max(6).optional(),
});

export const TripIntentSchema = z.object({
  title: z.string().min(1).max(140),
  destinations: z.array(IntentDestinationSchema).min(1).max(12),
  dates: z.object({
    start: IsoDate.nullable(),
    end: IsoDate.nullable(),
    lengthDays: z.number().int().min(1).max(60).nullable(),
    flexibleMonth: z.number().int().min(1).max(12).nullable(),
  }),
  travellers: z.object({
    count: z.number().int().min(1).max(100).nullable(),
    group: z.enum(GROUPS).nullable(),
    hasChildren: z.boolean().nullable(),
    hasSeniors: z.boolean().nullable(),
  }),
  budget: z.object({
    amount: z.number().nonnegative().nullable(),
    currency: z.string().max(8).nullable(),
    tier: z.enum(BUDGET_TIERS).nullable(),
  }),
  interests: z.array(z.string().max(60)).max(20),
  pace: z.enum(PACES).nullable(),
  diet: z.array(z.string().max(40)).max(10),
  mustInclude: z.array(IntentMustIncludeSchema).max(40),
  avoid: z.array(z.string().max(120)).max(20),
  bookings: z.array(BookingAnchorSchema).max(40),
  assumptions: z.array(z.string().max(300)).max(30),
  clarifyingQuestions: z.array(ClarifyingQuestionSchema).max(3),
});
export type TripIntent = z.infer<typeof TripIntentSchema>;

export const ModelExtractedBookingSchema = z.object({
  itemKind: z.enum(['stay', 'transit', 'activity', 'meal']),
  title: z.string(),
  provider: z.string().nullable(),
  pnr: z.string().nullable(),
  vehicleNumber: z.string().nullable(),
  originName: z.string().nullable(),
  destinationName: z.string().nullable(),
  startIso: z.string().nullable(),
  endIso: z.string().nullable(),
  coach: z.string().nullable(),
  seatOrBerth: z.string().nullable(),
  passengerNames: z.array(z.string()).max(12).nullable(),
});
export type ModelExtractedBooking = z.infer<typeof ModelExtractedBookingSchema>;

const ModelIntentBaseFields = {
  title: z.string().describe('Short trip title, e.g. "Leh & Nubra Valley (5 Days)".'),
  destinations: z
    .array(
      z.object({
        name: z.string().describe('Place name as a traveller would type it (city, region or country).'),
        country: z.string().nullable().describe('Country name if stated or obvious, else null.'),
        nights: z.number().int().nullable().describe('Nights spent here if stated, else null.'),
        order: z.number().int().describe('1-based visiting order.'),
        confidence: z.number().describe('0..1 confidence that this is a sightseeing destination.'),
      })
    )
    .max(12),
  dates: z.object({
    start: z.string().nullable().describe('YYYY-MM-DD if stated, else null.'),
    end: z.string().nullable().describe('YYYY-MM-DD if stated, else null.'),
    lengthDays: z.number().int().nullable(),
    flexibleMonth: z.number().int().nullable().describe('1..12 month number if only a month is known, else null.'),
  }),
  travellers: z.object({
    count: z.number().int().nullable(),
    group: z.enum(GROUPS).nullable(),
    hasChildren: z.boolean().nullable(),
    hasSeniors: z.boolean().nullable(),
  }),
  budget: z.object({
    amount: z.number().nullable(),
    currency: z.string().nullable().describe('ISO code such as INR, USD, else null.'),
    tier: z.enum(BUDGET_TIERS).nullable(),
  }),
  interests: z.array(z.string()).max(20).describe('e.g. food, heritage, trekking, cafes, beaches.'),
  pace: z.enum(PACES).nullable(),
  diet: z.array(z.string()).max(10).describe('e.g. Vegetarian, Jain, Vegan, Halal, Gluten-free.'),
  mustInclude: z
    .array(
      z.object({
        name: z.string().describe('Specific named place/attraction/restaurant the user wants to visit.'),
        sourceQuote: z.string().describe('Short VERBATIM excerpt from the input that mentions it.'),
      })
    )
    .max(30),
  avoid: z.array(z.string()).max(20),
  assumptions: z
    .array(z.string())
    .max(20)
    .describe('Concise plain-English notes for values inferred from the input.'),
  clarifyingQuestions: z
    .array(
      z.object({
        id: z.string(),
        question: z.string(),
        options: z.array(z.string()).max(6).nullable(),
      })
    )
    .max(3)
    .describe('At most 3 high-impact questions.'),
};

/** Lean Stage-A schema used when no images/scanned PDFs are attached (fast grammar compilation). */
export const ModelIntentTextOnlySchema = z.object(ModelIntentBaseFields);

/** Vision Stage-A schema used when ticket screenshots or scanned PDFs are attached (all properties required). */
export const ModelIntentVisionOnlySchema = z.object({
  ...ModelIntentBaseFields,
  extractedBookings: z
    .array(ModelExtractedBookingSchema)
    .max(12)
    .describe('Structured tickets/bookings read from attached screenshots or scanned PDFs ([] if none).'),
});

/**
 * Unified Zod parser for Stage A outputs (accepts both text-only and vision responses).
 */
export const ModelIntentSchema = z.object({
  ...ModelIntentBaseFields,
  extractedBookings: z.array(ModelExtractedBookingSchema).max(20).nullable().optional(),
});
export type ModelIntent = z.infer<typeof ModelIntentSchema>;

export const modelIntentGeminiSchema = toGeminiSchema(ModelIntentTextOnlySchema);
export const modelIntentVisionGeminiSchema = toGeminiSchema(ModelIntentVisionOnlySchema);

/** Strips markup and control characters from model-written free text, redacts Aadhaar, and caps length. */
export function cleanText(input: string, max = 300): string {
  return redactAadhaarNumbers(input)
    .redactedText.replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * Canonicalizes dietary preference labels so ReviewStep checkboxes (`Vegetarian`, `Jain`, `Vegan`, `Halal`, `Gluten-free`)
 * check automatically regardless of whether the user or model wrote `"pure veg"`, `"satvik"`, `"veg"`, etc.
 */
export function canonicalizeDiet(items: readonly string[]): string[] {
  const out: string[] = [];
  const add = (label: string): void => {
    if (!out.some((x) => x.toLowerCase() === label.toLowerCase())) {
      out.push(label);
    }
  };

  for (const raw of items) {
    const s = cleanText(raw, 40);
    if (!s) continue;
    const lower = s.toLowerCase();
    let matchedCanonical = false;

    if (/\bjain\b/.test(lower)) {
      add('Jain');
      matchedCanonical = true;
    }
    if (/\bvegan\b/.test(lower)) {
      add('Vegan');
      matchedCanonical = true;
    }
    if (/\bhalal\b/.test(lower)) {
      add('Halal');
      matchedCanonical = true;
    }
    if (/\bgluten[\s-]*free\b|\bceliac\b/.test(lower)) {
      add('Gluten-free');
      matchedCanonical = true;
    }
    if (
      !/\bnon[\s-]*veg/i.test(lower) &&
      (/\b(?:pure[\s-]*veg|vegetarian|veg\b|satvik|sattvik|shakahari)\b/.test(lower) ||
        lower === 'veg')
    ) {
      add('Vegetarian');
      matchedCanonical = true;
    }

    if (!matchedCanonical) {
      add(s);
    }
  }
  return out.slice(0, 10);
}

/**
 * Case-insensitively and normalized-alphanumeric deduplicates `mustInclude` items so repeated mentions
 * of `"Hawa Mahal"` / `"hawa mahal"` / `"The Hawa Mahal"` never produce duplicate chips.
 */
export function dedupeMustInclude<T extends { name: string }>(items: readonly T[]): T[] {
  const seenAlnum = new Set<string>();
  const kept: T[] = [];

  for (const item of items) {
    const alnum = normalizeName(item.name).replace(/[^a-z0-9]+/g, '');
    if (!alnum) continue;
    if (seenAlnum.has(alnum)) continue;
    if (kept.some((existing) => namesSimilar(existing.name, item.name))) continue;
    seenAlnum.add(alnum);
    kept.push(item);
  }
  return kept;
}

function mapExtractedProvider(raw: string | null | undefined): BookingProvider {
  if (!raw) return 'manual';
  const norm = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const direct = BookingProviderSchema.safeParse(norm);
  if (direct.success) return direct.data;
  if (norm.includes('irctc') || norm.includes('railway')) return 'irctc';
  if (norm.includes('indigo') || norm === '6e') return 'indigo';
  if (norm.includes('air_india')) return 'air_india';
  if (norm.includes('akasa')) return 'akasa';
  if (norm.includes('spicejet')) return 'spicejet';
  if (norm.includes('redbus')) return 'redbus';
  if (norm.includes('abhibus')) return 'abhibus';
  if (norm.includes('makemytrip') || norm === 'mmt') return 'mmt';
  if (norm.includes('goibibo')) return 'goibibo';
  if (norm.includes('airbnb')) return 'airbnb';
  if (norm.includes('zostel')) return 'zostel';
  if (norm.includes('homestay') || norm.includes('hotel') || norm.includes('resort')) return 'homestay';
  return 'manual';
}

/**
 * Converts a Gemini Vision `extractedBookings` entry (from a ticket screenshot or scanned PDF)
 * into an Aadhaar-redacted `ParsedBookingCandidate` ready for encrypted Vault storage + `BookingAnchor`.
 */
export function modelExtractedBookingToCandidate(
  eb: ModelExtractedBooking
): ParsedBookingCandidate | null {
  const title = cleanText(eb.title, 160);
  if (!title) return null;

  const provider = mapExtractedProvider(eb.provider);
  const pnr = eb.pnr ? cleanText(eb.pnr, 40) || null : null;
  const vehicleNumber = eb.vehicleNumber ? cleanText(eb.vehicleNumber, 40) || undefined : undefined;
  const originName = eb.originName ? cleanText(eb.originName, 120) || undefined : undefined;
  const destinationName = eb.destinationName
    ? cleanText(eb.destinationName, 120) || undefined
    : undefined;
  const startIso = eb.startIso ? cleanText(eb.startIso, 40) || undefined : undefined;
  const endIso = eb.endIso ? cleanText(eb.endIso, 40) || undefined : undefined;
  const coach = eb.coach ? cleanText(eb.coach, 40) || undefined : undefined;
  const seatOrBerth = eb.seatOrBerth ? cleanText(eb.seatOrBerth, 60) || undefined : undefined;

  const isStay = eb.itemKind === 'stay';
  const routeLabel =
    originName && destinationName ? `${originName} → ${destinationName}` : undefined;
  const headlineParts = [
    title,
    routeLabel && !title.toLowerCase().includes(destinationName!.toLowerCase())
      ? `(${routeLabel})`
      : null,
  ].filter(Boolean);

  const passengers = (eb.passengerNames ?? [])
    .map((n) => cleanText(n, 80))
    .filter((n) => n.length > 0)
    .map((name) => ({
      name,
      seatOrBerth: seatOrBerth ?? null,
      coach: coach ?? null,
      bookingStatus: 'CNF',
    }));

  const lowConfidenceFields: string[] = [];
  if (!pnr) lowConfidenceFields.push('pnr');
  if (!startIso) lowConfidenceFields.push(isStay ? 'checkInIso' : 'departureIso');

  const datePart = startIso && /^\d{4}-\d{2}-\d{2}/.test(startIso) ? startIso.slice(0, 10) : null;
  const timeMatch = startIso ? /T(\d{2}:\d{2})/.exec(startIso) : null;

  return {
    provider,
    itemKind: eb.itemKind,
    pnr,
    status: 'confirmed',
    summary: {
      headline: headlineParts.join(' ').slice(0, 180),
      ...(routeLabel ? { routeLabel } : {}),
      ...(vehicleNumber ? { vehicleNumber } : {}),
      ...(originName ? { originName } : {}),
      ...(destinationName ? { destinationName } : {}),
      ...(isStay
        ? {
            propertyName: title,
            ...(startIso ? { checkInIso: startIso } : {}),
            ...(endIso ? { checkOutIso: endIso } : {}),
          }
        : {
            ...(startIso ? { departureIso: startIso } : {}),
            ...(endIso ? { arrivalIso: endIso } : {}),
          }),
      ...(coach ? { coach } : {}),
      ...(seatOrBerth ? { seatOrBerth } : {}),
    },
    passengers,
    parserConfidence: lowConfidenceFields.length === 0 ? 0.86 : 0.8,
    lowConfidenceFields,
    suggestedTitle: title,
    suggestedDate: datePart,
    suggestedStartTime: timeMatch?.[1] ?? null,
    suggestedDurationMins: isStay ? 60 : 120,
  };
}

function normalizeIsoDateOrNull(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
  return m ? m[1]! : null;
}

function clampNullableInt(
  raw: number | null | undefined,
  min: number,
  max: number
): number | null {
  if (raw === null || raw === undefined || !Number.isFinite(raw)) return null;
  const rounded = Math.round(raw);
  if (rounded < min) return null;
  return Math.min(max, rounded);
}

/** Maps the model's nullable output to the contract's TripIntent shape (grounding fields start unresolved). */
export function modelIntentToTripIntent(
  m: ModelIntent,
  extras: { bookings?: BookingAnchor[]; extraAssumptions?: string[] } = {}
): Omit<TripIntent, 'destinations'> & { destinations: IntentDestination[] } {
  const dests = [...m.destinations]
    .sort((a, b) => a.order - b.order)
    .map((d, i) => {
      const nights = clampNullableInt(d.nights, 0, 60);
      const conf = Number.isFinite(d.confidence)
        ? Math.max(0, Math.min(1, d.confidence))
        : 0.85;
      return {
        name: cleanText(d.name, 120),
        ...(d.country && cleanText(d.country, 80) ? { country: cleanText(d.country, 80) } : {}),
        ...(nights !== null ? { nights } : {}),
        order: i + 1,
        confidence: conf,
        resolved: false,
      };
    })
    .filter((d) => d.name.length > 0);
  const rawMust = m.mustInclude
    .map((p) => ({
      name: cleanText(p.name, 160),
      sourceQuote: cleanText(p.sourceQuote, 400),
      resolved: false,
    }))
    .filter((p) => p.name.length > 0);

  const normStart = normalizeIsoDateOrNull(m.dates.start);
  const normEnd = normalizeIsoDateOrNull(m.dates.end);
  const normCurrency = m.budget.currency ? cleanText(m.budget.currency, 8).toUpperCase() || null : null;
  const normAmount =
    m.budget.amount !== null && Number.isFinite(m.budget.amount) && m.budget.amount > 0
      ? m.budget.amount
      : null;

  return {
    title: cleanText(m.title, 140) || 'My trip',
    destinations: dests,
    dates: {
      start: normStart,
      end: normEnd && (!normStart || normEnd >= normStart) ? normEnd : null,
      lengthDays: clampNullableInt(m.dates.lengthDays, 1, 60),
      flexibleMonth: clampNullableInt(m.dates.flexibleMonth, 1, 12),
    },
    travellers: {
      count: clampNullableInt(m.travellers.count, 1, 100),
      group: m.travellers.group,
      hasChildren: m.travellers.hasChildren,
      hasSeniors: m.travellers.hasSeniors,
    },
    budget: {
      amount: normAmount,
      currency: normCurrency,
      tier: m.budget.tier,
    },
    interests: dedupe(m.interests.map((s) => cleanText(s, 60)).filter(Boolean)).slice(0, 20),
    pace: m.pace,
    diet: canonicalizeDiet(m.diet),
    mustInclude: dedupeMustInclude(rawMust).slice(0, 40),
    avoid: dedupe(m.avoid.map((s) => cleanText(s, 120)).filter(Boolean)).slice(0, 20),
    bookings: extras.bookings ?? [],
    assumptions: [
      ...m.assumptions.map((s) => cleanText(s, 300)).filter(Boolean),
      ...(extras.extraAssumptions ?? []).map((s) => cleanText(s, 300)).filter(Boolean),
    ].slice(0, 30),
    clarifyingQuestions: m.clarifyingQuestions
      .map((q) => ({
        id: cleanText(q.id, 40) || 'q',
        question: cleanText(q.question, 300),
        ...(q.options && q.options.length > 0
          ? { options: q.options.map((o) => cleanText(o, 80)).filter(Boolean).slice(0, 6) }
          : {}),
      }))
      .filter((q) => q.question.length > 0)
      .slice(0, 3),
  };
}

function dedupe(items: string[]): string[] {
  return [...new Set(items.map((s) => s.toLowerCase()))].map(
    (lower) => items.find((s) => s.toLowerCase() === lower) as string
  );
}
