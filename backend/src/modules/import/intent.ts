import { z } from 'zod';
import {
  BookingProviderSchema,
  BookingSummaryPublicSchema,
  ItemKindSchema,
} from '../../types/domain.js';
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

/**
 * What we ask the model for in Stage A. Deliberately has NO coordinates, NO slugs, NO `resolved` flags and NO
 * bookings (those come from the deterministic parsers). Optional values are `nullable` because Gemini's schema
 * subset treats "omitted" less reliably than explicit null.
 */
export const ModelIntentSchema = z.object({
  title: z.string().max(140).describe('Short trip title, e.g. "Jaipur & Udaipur long weekend".'),
  destinations: z
    .array(
      z.object({
        name: z.string().max(120).describe('Place name exactly as a traveller would type it (city, region or country).'),
        country: z.string().max(80).nullable().describe('Country name if stated or obvious, else null.'),
        nights: z.number().int().min(0).max(60).nullable().describe('Nights spent here if stated, else null.'),
        order: z.number().int().describe('1-based visiting order.'),
        confidence: z.number().min(0).max(1).describe('0..1 confidence that this is a real destination the user wants.'),
      })
    )
    .max(12),
  dates: z.object({
    start: IsoDate.nullable().describe('YYYY-MM-DD, only if the input states or clearly implies it.'),
    end: IsoDate.nullable().describe('YYYY-MM-DD'),
    lengthDays: z.number().int().min(1).max(60).nullable(),
    flexibleMonth: z.number().int().min(1).max(12).nullable().describe('Month number if only a month is known.'),
  }),
  travellers: z.object({
    count: z.number().int().min(1).max(100).nullable(),
    group: z.enum(GROUPS).nullable(),
    hasChildren: z.boolean().nullable(),
    hasSeniors: z.boolean().nullable(),
  }),
  budget: z.object({
    amount: z.number().nonnegative().nullable(),
    currency: z.string().max(8).nullable().describe('ISO code such as INR, USD.'),
    tier: z.enum(BUDGET_TIERS).nullable(),
  }),
  interests: z.array(z.string().max(60)).max(20).describe('e.g. food, heritage, trekking, nightlife, beaches.'),
  pace: z.enum(PACES).nullable(),
  diet: z.array(z.string().max(40)).max(10).describe('e.g. veg, jain, halal.'),
  mustInclude: z
    .array(
      z.object({
        name: z.string().max(160).describe('Specific named place/attraction/restaurant the user wants to visit.'),
        sourceQuote: z.string().max(400).describe('Short VERBATIM excerpt from the input that mentions it.'),
      })
    )
    .max(40),
  avoid: z.array(z.string().max(120)).max(20),
  assumptions: z
    .array(z.string().max(300))
    .max(30)
    .describe('One short sentence for EVERY value you inferred rather than read from the input.'),
  clarifyingQuestions: z
    .array(
      z.object({
        id: z.string().max(40),
        question: z.string().max(300),
        options: z.array(z.string().max(80)).max(6).nullable(),
      })
    )
    .max(3)
    .describe('At most 3, only questions whose answer would change the plan.'),
});
export type ModelIntent = z.infer<typeof ModelIntentSchema>;

export const modelIntentGeminiSchema = toGeminiSchema(ModelIntentSchema);

/** Strips markup and control characters from model-written free text and caps its length. */
export function cleanText(input: string, max = 300): string {
  return input
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Maps the model's nullable output to the contract's TripIntent shape (grounding fields start unresolved). */
export function modelIntentToTripIntent(
  m: ModelIntent,
  extras: { bookings?: BookingAnchor[]; extraAssumptions?: string[] } = {}
): Omit<TripIntent, 'destinations'> & { destinations: IntentDestination[] } {
  const dests = [...m.destinations]
    .sort((a, b) => a.order - b.order)
    .map((d, i) => ({
      name: cleanText(d.name, 120),
      ...(d.country ? { country: cleanText(d.country, 80) } : {}),
      ...(d.nights !== null && d.nights !== undefined ? { nights: d.nights } : {}),
      order: i + 1,
      confidence: d.confidence,
      resolved: false,
    }))
    .filter((d) => d.name.length > 0);
  return {
    title: cleanText(m.title, 140) || 'My trip',
    destinations: dests,
    dates: { ...m.dates },
    travellers: { ...m.travellers },
    budget: { ...m.budget },
    interests: dedupe(m.interests.map((s) => cleanText(s, 60)).filter(Boolean)),
    pace: m.pace,
    diet: dedupe(m.diet.map((s) => cleanText(s, 40)).filter(Boolean)),
    mustInclude: m.mustInclude
      .map((p) => ({
        name: cleanText(p.name, 160),
        sourceQuote: cleanText(p.sourceQuote, 400),
        resolved: false,
      }))
      .filter((p) => p.name.length > 0),
    avoid: m.avoid.map((s) => cleanText(s, 120)).filter(Boolean),
    bookings: extras.bookings ?? [],
    assumptions: [...m.assumptions.map((s) => cleanText(s, 300)).filter(Boolean), ...(extras.extraAssumptions ?? [])],
    clarifyingQuestions: m.clarifyingQuestions.slice(0, 3).map((q) => ({
      id: cleanText(q.id, 40) || 'q',
      question: cleanText(q.question, 300),
      ...(q.options && q.options.length > 0 ? { options: q.options.map((o) => cleanText(o, 80)) } : {}),
    })),
  };
}

function dedupe(items: string[]): string[] {
  return [...new Set(items.map((s) => s.toLowerCase()))].map(
    (lower) => items.find((s) => s.toLowerCase() === lower) as string
  );
}
