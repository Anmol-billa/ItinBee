import type { BookingProvider } from '../../../types/domain.js';
import {
  normalizeIndianDate,
  type ParsedBookingCandidate,
} from './irctc.js';

/**
 * Deterministic Stage-2 Parser for MakeMyTrip, Goibibo, Airbnb, Zostel & Indian Homestay confirmations.
 */
export function parseStayConfirmation(
  text: string
): ParsedBookingCandidate | null {
  const lower = text.toLowerCase();
  let provider: BookingProvider = 'mmt';
  if (lower.includes('airbnb')) provider = 'airbnb';
  else if (lower.includes('goibibo')) provider = 'goibibo';
  else if (lower.includes('zostel')) provider = 'zostel';
  else if (lower.includes('makemytrip') || lower.includes('mmt')) provider = 'mmt';
  else provider = 'homestay';

  // Booking / Confirmation Code
  const idMatch =
    /\b(?:Booking\s*(?:ID|No\.?|Ref)|Confirmation\s*(?:Code|No\.?)|Reservation\s*ID)\s*[:#.-]?\s*([A-Z0-9-]{6,20})\b/i.exec(
      text
    );
  const pnr = idMatch?.[1]?.toUpperCase() ?? null;

  // Property Name
  const propMatch =
    /\b(?:Property|Hotel|Resort|Stay|Homestay|Hostel|Listing)\s*(?:Name)?\s*[:.-]\s*([^\n|]{3,65})/i.exec(
      text
    ) ??
    /\b((?:Zostel|The\s+Hosteller|Rokeby\s+Manor|Taj|ITC|FabHotel|Treebo)[A-Za-z0-9\s,'&-]{2,45})/i.exec(
      text
    );
  const propertyName = propMatch?.[1]?.trim();

  if (!pnr && !propertyName) {
    return null;
  }

  // Check-in / Check-out
  const checkInMatch =
    /\bCheck-?\s*in(?:\s*Date)?\s*[:.-]?\s*(\d{1,2}[\s/-][A-Za-z0-9]{2,9}[\s/-]\d{2,4}|\d{4}-\d{2}-\d{2})/i.exec(
      text
    );
  const checkOutMatch =
    /\bCheck-?\s*out(?:\s*Date)?\s*[:.-]?\s*(\d{1,2}[\s/-][A-Za-z0-9]{2,9}[\s/-]\d{2,4}|\d{4}-\d{2}-\d{2})/i.exec(
      text
    );

  const checkInDate = normalizeIndianDate(checkInMatch?.[1]);
  const checkOutDate = normalizeIndianDate(checkOutMatch?.[1]);

  const checkInTimeMatch =
    /\bCheck-?\s*in[\s\S]{0,30}?(\d{2}:\d{2})\b/i.exec(text);
  const checkInTime = checkInTimeMatch?.[1] ?? '14:00';

  const lowConfidenceFields: string[] = [];
  let confidence = 1.0;
  if (!pnr) {
    confidence -= 0.16;
    lowConfidenceFields.push('pnr');
  }
  if (!propertyName) {
    confidence -= 0.2;
    lowConfidenceFields.push('propertyName');
  }
  if (!checkInDate) {
    confidence -= 0.12;
    lowConfidenceFields.push('checkInIso');
  }

  const displayProp = propertyName ?? 'Confirmed Stay';
  const headline = checkInDate
    ? `${displayProp} (Check-in ${checkInDate})`
    : displayProp;

  return {
    provider,
    itemKind: 'stay',
    pnr,
    status: 'confirmed',
    summary: {
      headline,
      propertyName: displayProp,
      operatorName: provider.toUpperCase(),
      checkInIso: checkInDate ?? undefined,
      checkOutIso: checkOutDate ?? undefined,
    },
    passengers: [],
    parserConfidence: Math.max(0.5, Number(confidence.toFixed(2))),
    lowConfidenceFields,
    suggestedTitle: `Check-in: ${displayProp}`,
    suggestedDate: checkInDate,
    suggestedStartTime: checkInTime,
    suggestedDurationMins: 60,
  };
}
