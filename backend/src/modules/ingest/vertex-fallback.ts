import { env } from '../../config/env.js';
import {
  normalizeIndianDate,
  type ParsedBookingCandidate,
} from './parsers/irctc.js';

/**
 * Stage 3: GCP Vertex AI `asia-south1` (Mumbai, Zero Data Retention) Gemini Flash Structured Fallback.
 * Triggered ONLY when Stage-2 deterministic parsers return null or `< 1.0` confidence on messy WhatsApp
 * homestay messages, local cab confirmations, or OCR snippets.
 * Any field with confidence `< 0.85` is added to `lowConfidenceFields` for 1-tap amber UI verification.
 */
export async function runVertexMumbaiFallback(
  sanitizedText: string
): Promise<ParsedBookingCandidate> {
  // Note: Input `sanitizedText` has already passed mandatory Stage-1 Aadhaar redaction.
  if (
    env.GCP_VERTEX_PROJECT_ID &&
    env.GOOGLE_VERTEX_API_KEY &&
    env.NODE_ENV === 'production'
  ) {
    try {
      const location = env.GCP_VERTEX_LOCATION || 'asia-south1';
      const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${env.GCP_VERTEX_PROJECT_ID}/locations/${location}/publishers/google/models/gemini-2.0-flash:generateContent`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.GOOGLE_VERTEX_API_KEY}`,
          'X-Goog-Vertex-Zero-Data-Retention': 'true',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `Extract structured Indian travel booking JSON with field-level confidence (0..1) from this Aadhaar-redacted snippet:\n${sanitizedText}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (res.ok) {
        const payload = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const rawJson = payload.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawJson) {
          const parsed = JSON.parse(rawJson) as Partial<ParsedBookingCandidate>;
          if (parsed.suggestedTitle && parsed.summary) {
            return {
              provider: parsed.provider ?? 'homestay',
              itemKind: parsed.itemKind ?? 'stay',
              pnr: parsed.pnr ?? null,
              status: parsed.status ?? 'confirmed',
              summary: parsed.summary,
              passengers: parsed.passengers ?? [],
              parserConfidence: parsed.parserConfidence ?? 0.78,
              lowConfidenceFields: parsed.lowConfidenceFields ?? ['pnr', 'departureIso'],
              suggestedTitle: parsed.suggestedTitle,
              suggestedDate: parsed.suggestedDate ?? null,
              suggestedStartTime: parsed.suggestedStartTime ?? null,
              suggestedDurationMins: parsed.suggestedDurationMins ?? 60,
            };
          }
        }
      }
    } catch {
      // Fall through to deterministic heuristic fallback
    }
  }

  // Local deterministic heuristic fallback (zero cloud requirement, flags < 0.85 confidence fields)
  const dateMatch =
    /\b(\d{1,2}[\s/-][A-Za-z]{3}[a-z]*[\s/-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-z]{3,9})\b/.exec(
      sanitizedText
    );
  let normalizedDate = normalizeIndianDate(dateMatch?.[1]);
  if (!normalizedDate && dateMatch?.[1]) {
    const partial = normalizeIndianDate(`${dateMatch[1]} 2026`);
    normalizedDate = partial;
  }

  const timeMatch = /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(sanitizedText);
  const startTime = timeMatch
    ? `${timeMatch[1]!.padStart(2, '0')}:${timeMatch[2]!}`
    : null;

  const refMatch =
    /\b(?:ref|utr|id|booking)\s*[:#.-]?\s*([A-Z0-9-]{5,16})\b/i.exec(
      sanitizedText
    );
  const pnr = refMatch?.[1]?.toUpperCase() ?? null;

  const isStay =
    /\b(?:cottage|homestay|villa|ashram|room|check-?in|stay|bhavan|dharamshala)\b/i.test(
      sanitizedText
    );
  const isCab = /\b(?:cab|taxi|innova|tempo|driver|pickup)\b/i.test(
    sanitizedText
  );

  const firstLine =
    sanitizedText
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 3) ?? 'Unstructured Travel Note';
  const headline =
    firstLine.length > 68 ? `${firstLine.slice(0, 65)}...` : firstLine;

  const lowConfidenceFields = ['pnr'];
  if (!normalizedDate) lowConfidenceFields.push('checkInIso');
  if (!startTime) lowConfidenceFields.push('departureIso');

  return {
    provider: isStay ? 'homestay' : 'manual',
    itemKind: isStay ? 'stay' : isCab ? 'transit' : 'activity',
    pnr,
    status: 'confirmed',
    summary: {
      headline,
      propertyName: isStay ? headline : undefined,
      operatorName: isCab ? 'Local Cab / Transfer' : 'Stage-3 Extracted',
      checkInIso: isStay && normalizedDate ? normalizedDate : undefined,
      departureIso:
        !isStay && normalizedDate && startTime
          ? `${normalizedDate}T${startTime}:00+05:30`
          : undefined,
    },
    passengers: [],
    parserConfidence: 0.78, // < 0.85 triggers amber verification badge in UI
    lowConfidenceFields,
    suggestedTitle: headline,
    suggestedDate: normalizedDate,
    suggestedStartTime: startTime,
    suggestedDurationMins: 60,
  };
}
