import {
  classifyAndSanitizeInput,
  type DetectedSourceKind,
} from './classifier.js';
import {
  parseIrctcTicket,
  type ParsedBookingCandidate,
} from './parsers/irctc.js';
import { parseFlightTicket } from './parsers/flight.js';
import { parseBusTicket } from './parsers/bus.js';
import { parseStayConfirmation } from './parsers/stay.js';
import {
  extractStopsFromSocialLink,
  type SocialExtractionResult,
} from './parsers/social.js';
import { runVertexMumbaiFallback } from './vertex-fallback.js';

export interface HybridIngestionOutput {
  stageUsed: 'stage2_deterministic' | 'stage3_vertex_mumbai' | 'social_oembed';
  detectedKind: DetectedSourceKind;
  aadhaarRedactions: number;
  sanitizedExcerpt: string;
  requiresAmberVerification: boolean;
  bookingCandidate: ParsedBookingCandidate | null;
  socialResult: SocialExtractionResult | null;
}

/**
 * Orchestrates the 3-Stage Hybrid Indian Booking & Social Ingestion Pipeline:
 * 1. Stage 1: Strip HTML/MIME + mandatory Aadhaar first-8-digit masking (`XXXX-XXXX-1234`).
 * 2. Stage 2: `$0`-LLM deterministic parsers for IRCTC, IndiGo/Air India/Akasa, redBus/AbhiBus, MMT/Airbnb/Zostel.
 * 3. Stage 3: GCP Vertex AI `asia-south1` (Mumbai) Gemini Flash structured fallback when Stage 2 cannot parse confidently,
 *    flagging any fields `< 0.85` confidence for 1-tap human verification.
 */
export async function runHybridTextIngestion(
  rawText: string
): Promise<HybridIngestionOutput> {
  const stage1 = classifyAndSanitizeInput(rawText);
  const { cleanedText, aadhaarRedactions, detectedKind } = stage1;

  if (detectedKind === 'social') {
    const urlMatch = /(https?:\/\/[^\s]+)/i.exec(cleanedText);
    const url = urlMatch?.[1] ?? 'https://instagram.com/reel/unknown';
    const socialResult = await extractStopsFromSocialLink({
      url,
      captionOrTranscript: cleanedText,
    });
    return {
      stageUsed: 'social_oembed',
      detectedKind,
      aadhaarRedactions,
      sanitizedExcerpt: cleanedText.slice(0, 500),
      requiresAmberVerification: socialResult.stops.some(
        (s) => s.confidence < 0.85
      ),
      bookingCandidate: null,
      socialResult,
    };
  }

  let candidate: ParsedBookingCandidate | null = null;

  switch (detectedKind) {
    case 'irctc':
      candidate = parseIrctcTicket(cleanedText);
      break;
    case 'flight':
      candidate = parseFlightTicket(cleanedText);
      break;
    case 'bus':
      candidate = parseBusTicket(cleanedText);
      break;
    case 'stay':
      candidate = parseStayConfirmation(cleanedText);
      break;
    default:
      candidate =
        parseIrctcTicket(cleanedText) ??
        parseFlightTicket(cleanedText) ??
        parseBusTicket(cleanedText) ??
        parseStayConfirmation(cleanedText);
      break;
  }

  if (candidate && candidate.parserConfidence >= 0.82) {
    return {
      stageUsed: 'stage2_deterministic',
      detectedKind,
      aadhaarRedactions,
      sanitizedExcerpt: cleanedText.slice(0, 500),
      requiresAmberVerification:
        candidate.parserConfidence < 0.85 ||
        candidate.lowConfidenceFields.length > 0,
      bookingCandidate: candidate,
      socialResult: null,
    };
  }

  // Stage 3 fallback (GCP Vertex AI asia-south1 Mumbai / local structured fallback)
  const fallbackCandidate = await runVertexMumbaiFallback(cleanedText);
  return {
    stageUsed: 'stage3_vertex_mumbai',
    detectedKind,
    aadhaarRedactions,
    sanitizedExcerpt: cleanedText.slice(0, 500),
    requiresAmberVerification:
      fallbackCandidate.parserConfidence < 0.85 ||
      fallbackCandidate.lowConfidenceFields.length > 0,
    bookingCandidate: fallbackCandidate,
    socialResult: null,
  };
}
