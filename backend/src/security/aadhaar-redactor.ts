export interface RawPassengerMeta {
  name: string;
  age?: number | null;
  gender?: string | null;
  seatOrBerth?: string | null;
  coach?: string | null;
  bookingStatus?: string | null;
  idType?: string | null;
  idNumber?: string | null;
  isPrimaryUser?: boolean;
}

export interface SanitizedPassengerMeta {
  name: string;
  age?: number | null;
  gender?: string | null;
  seatOrBerth?: string | null;
  coach?: string | null;
  bookingStatus?: string | null;
  idType?: string | null;
  idNumberMasked?: string | null;
}

/**
 * Mandatory DPDPA 2023 Aadhaar Redaction:
 * Masks the first 8 digits of any 12-digit Indian Aadhaar number to `XXXX-XXXX-1234`
 * BEFORE persistence, logging, or Stage-3 LLM fallback calls.
 *
 * Rules:
 * 1. UIDAI Aadhaar numbers are 12 digits and always begin with digits 2–9.
 * 2. Formatted groups (`2345 6789 0123` or `2345-6789-0123`) are always redacted to `XXXX-XXXX-0123`.
 * 3. Bare 12-digit numbers (`234567890123`) are redacted to `XXXX-XXXX-0123` unless preceded by `+91` / `91-`
 *    phone prefixes or embedded inside longer numeric tokens.
 */
export function redactAadhaarNumbers(input: string): {
  redactedText: string;
  redactionCount: number;
} {
  if (!input) {
    return { redactedText: '', redactionCount: 0 };
  }

  let redactionCount = 0;

  // 1. Spaced or hyphenated 4-4-4 Aadhaar patterns (UIDAI starts with 2-9)
  let output = input.replace(
    /(?<![\d+])([2-9]\d{3})([\s-])(\d{4})\2(\d{4})(?!\d)/g,
    (_match, _g1: string, _sep: string, _g2: string, last4: string) => {
      redactionCount += 1;
      return `XXXX-XXXX-${last4}`;
    }
  );

  // 2. Contextual or bare 12-digit Aadhaar numbers (excluding +91XXXXXXXXXX mobile numbers)
  output = output.replace(
    /(?<!\+)(?<![\d-])([2-9]\d{3})(\d{4})(\d{4})(?!\d)/g,
    (fullMatch, g1: string, _g2: string, last4: string, offset: number, str: string) => {
      // Do not clobber 91 + 10-digit Indian phone numbers when preceded by '+' or 'tel:' or 'ph'
      const prefixWindow = str.slice(Math.max(0, offset - 14), offset).toLowerCase();
      if (
        g1.startsWith('91') &&
        (/(?:phone|mob|mobile|tel|whatsapp|call|contact)\s*[:.-]?\s*$/.test(prefixWindow) ||
          str[offset - 1] === '+')
      ) {
        return fullMatch;
      }
      redactionCount += 1;
      return `XXXX-XXXX-${last4}`;
    }
  );

  return { redactedText: output, redactionCount };
}

/**
 * Masks any government ID number to last 4 characters (`XXXX-XXXX-1234`).
 */
export function maskIdLast4(rawId: string | null | undefined): string | null {
  if (!rawId) return null;
  const cleaned = rawId.replace(/[\s-]/g, '');
  if (cleaned.length <= 4) return 'XXXX';
  const last4 = cleaned.slice(-4);
  return `XXXX-XXXX-${last4}`;
}

/**
 * Masks a PNR or booking reference to `••••••<last3>`.
 */
export function maskPnrLast3(pnrOrLast3: string | null | undefined): string | null {
  if (!pnrOrLast3) return null;
  const trimmed = pnrOrLast3.trim();
  if (!trimmed) return null;
  const last3 = trimmed.slice(-3);
  return `••••••${last3}`;
}

/**
 * Extracts the last 3 characters of a PNR for `bookings.pnr_last3`.
 */
export function extractPnrLast3(pnr: string | null | undefined): string | null {
  if (!pnr) return null;
  const cleaned = pnr.trim();
  if (!cleaned) return null;
  return cleaned.slice(-3).padStart(3, '0');
}

/**
 * Strips co-traveller ages/genders unless explicit co-traveller consent is recorded,
 * and masks all ID numbers to last 4 digits.
 */
export function sanitizePassengerMeta(
  passengers: RawPassengerMeta[],
  hasCoTravellerConsent: boolean
): SanitizedPassengerMeta[] {
  return passengers.map((p, idx) => {
    const allowDemographics = Boolean(p.isPrimaryUser || idx === 0 || hasCoTravellerConsent);
    return {
      name: p.name,
      age: allowDemographics ? (p.age ?? null) : null,
      gender: allowDemographics ? (p.gender ?? null) : null,
      seatOrBerth: p.seatOrBerth ?? null,
      coach: p.coach ?? null,
      bookingStatus: p.bookingStatus ?? null,
      idType: p.idType ?? null,
      idNumberMasked: maskIdLast4(p.idNumber),
    };
  });
}
