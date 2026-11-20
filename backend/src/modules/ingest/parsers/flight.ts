import type { BookingProvider } from '../../../types/domain.js';
import {
  normalizeIndianDate,
  type ParsedBookingCandidate,
} from './irctc.js';

const PNR_STOPWORDS = new Set([
  'INDIGO',
  'FLIGHT',
  'TICKET',
  'STATUS',
  'DEPART',
  'ARRIVE',
  'BOOKED',
  'NUMBER',
  'SECTOR',
  'SOURCE',
  'TRAVEL',
  'BAGGAG',
  'RETURN',
  'DIRECT',
  'ONLINE',
]);

/**
 * Deterministic Stage-2 Parser for IndiGo (6E), Air India (AI/IX), Akasa Air (QP), and SpiceJet (SG).
 */
export function parseFlightTicket(text: string): ParsedBookingCandidate | null {
  const flightMatch = /\b(6E|AI|IX|QP|SG|UK)[-\s]?(\d{3,4})\b/i.exec(text);
  const carrierPrefix = flightMatch?.[1]?.toUpperCase();
  const flightDigits = flightMatch?.[2];
  const flightNumber =
    carrierPrefix && flightDigits ? `${carrierPrefix}-${flightDigits}` : null;

  let provider: BookingProvider = 'indigo';
  const lower = text.toLowerCase();
  if (carrierPrefix === 'AI' || carrierPrefix === 'IX' || lower.includes('air india')) {
    provider = 'air_india';
  } else if (carrierPrefix === 'QP' || lower.includes('akasa')) {
    provider = 'akasa';
  } else if (carrierPrefix === 'SG' || lower.includes('spicejet')) {
    provider = 'spicejet';
  } else if (carrierPrefix === '6E' || lower.includes('indigo')) {
    provider = 'indigo';
  } else if (!flightNumber) {
    return null;
  }

  // 6-character alphanumeric Airline PNR
  let pnr: string | null = null;
  const labeledPnrRegex =
    /\b(?:PNR|Booking\s*(?:Ref(?:erence)?|ID)|Confirmation\s*(?:Code|No\.?))\s*[:#.-]?\s*([A-Z0-9]{6})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = labeledPnrRegex.exec(text)) !== null) {
    const candidate = m[1]!.toUpperCase();
    if (!PNR_STOPWORDS.has(candidate)) {
      pnr = candidate;
      break;
    }
  }

  if (!pnr && !flightNumber) {
    return null;
  }

  // Route IATA codes: e.g. `DEL -> GOI`, `DEL (T3) to BLR (T2)`, `From: New Delhi (DEL) To: Goa (GOX)`
  let originCode: string | undefined;
  let destinationCode: string | undefined;
  let originName: string | undefined;
  let destinationName: string | undefined;

  const parenIataMatch =
    /\b([A-Za-z\s]{3,24}?)\s*\(([A-Z]{3})\)[\s\S]{0,60}?\b([A-Za-z\s]{3,24}?)\s*\(([A-Z]{3})\)/.exec(
      text
    );
  if (parenIataMatch) {
    originName = parenIataMatch[1]!.trim();
    originCode = parenIataMatch[2]!;
    destinationName = parenIataMatch[3]!.trim();
    destinationCode = parenIataMatch[4]!;
  } else {
    const arrowIataMatch =
      /\b([A-Z]{3})\s*(?:->|→|–|-|to)\s*([A-Z]{3})\b/i.exec(text);
    if (arrowIataMatch) {
      originCode = arrowIataMatch[1]!.toUpperCase();
      destinationCode = arrowIataMatch[2]!.toUpperCase();
    }
  }

  // Terminal extraction
  const terminalMatch =
    /\b(?:Terminal|Term)\s*[:.-]?\s*(T?[1-3][A-D]?)\b/i.exec(text) ??
    /\b(T[1-3][A-D]?)\b/.exec(text);
  const terminal = terminalMatch
    ? terminalMatch[1]!.toUpperCase().startsWith('T')
      ? terminalMatch[1]!.toUpperCase()
      : `T${terminalMatch[1]!.toUpperCase()}`
    : undefined;

  // Date & Times
  const dateMatch =
    /\b(\d{1,2}[\s/-][A-Za-z]{3}[a-z]*[\s/-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4})\b/.exec(
      text
    );
  const flightDate = normalizeIndianDate(dateMatch?.[1]);

  const depMatch =
    /\b(?:Dep(?:arts|arture)?|STD)\s*[:.-]?\s*(\d{2}:\d{2})\b/i.exec(text);
  const arrMatch =
    /\b(?:Arr(?:ives|ival)?|STA)\s*[:.-]?\s*(\d{2}:\d{2})\b/i.exec(text);
  let depTime = depMatch?.[1] ?? null;
  let arrTime = arrMatch?.[1] ?? null;

  if (!depTime) {
    const allTimes = [...text.matchAll(/\b([01]\d|2[0-3]):([0-5]\d)\b/g)].map(
      (tm) => tm[0]!
    );
    if (allTimes.length >= 1) depTime = allTimes[0]!;
    if (allTimes.length >= 2) arrTime = allTimes[1]!;
  }

  // Seat & Baggage
  const seatMatch = /\bSeat(?:\s*No\.?)?\s*[:.-]?\s*(\d{1,2}[A-F])\b/i.exec(text);
  const seat = seatMatch?.[1]?.toUpperCase();

  const baggageMatch =
    /\b(?:Check-?in|Baggage)\s*[:.-]?\s*(\d{1,2}\s*Kg)\b/i.exec(text);
  const baggage = baggageMatch?.[1];

  // Passenger name
  const paxMatch =
    /\b(?:Passenger|Traveller|Guest|Name)\s*[:.-]?\s*((?:Mr\.?|Ms\.?|Mrs\.?)?\s*[A-Za-z][A-Za-z\s]{2,32}?)(?=\s*(?:\n|PNR|Seat|Flight|Booking|,|$))/i.exec(
      text
    );
  const passengers = paxMatch
    ? [
        {
          name: paxMatch[1]!.trim(),
          seatOrBerth: seat ?? null,
          bookingStatus: 'Confirmed',
          isPrimaryUser: true,
        },
      ]
    : [];

  const operatorLabel: Record<string, string> = {
    indigo: 'IndiGo',
    air_india: 'Air India',
    akasa: 'Akasa Air',
    spicejet: 'SpiceJet',
  };

  const lowConfidenceFields: string[] = [];
  let confidence = 1.0;
  if (!pnr) {
    confidence -= 0.18;
    lowConfidenceFields.push('pnr');
  }
  if (!flightNumber) {
    confidence -= 0.18;
    lowConfidenceFields.push('vehicleNumber');
  }
  if (!originCode || !destinationCode) {
    confidence -= 0.1;
  }

  const routeLabel =
    originCode && destinationCode ? `${originCode} → ${destinationCode}` : undefined;
  const headline = [
    operatorLabel[provider] ?? 'Flight',
    flightNumber,
    routeLabel,
    terminal ? `(${terminal})` : null,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    provider,
    itemKind: 'transit',
    pnr,
    status: 'confirmed',
    summary: {
      headline,
      routeLabel,
      vehicleNumber: flightNumber ?? undefined,
      operatorName: operatorLabel[provider] ?? 'Airline',
      originCode,
      originName,
      destinationCode,
      destinationName,
      departureIso:
        flightDate && depTime ? `${flightDate}T${depTime}:00+05:30` : depTime ?? undefined,
      arrivalIso:
        flightDate && arrTime ? `${flightDate}T${arrTime}:00+05:30` : arrTime ?? undefined,
      terminalOrPlatform: terminal,
      seatOrBerth: seat,
      baggageAllowance: baggage,
    },
    passengers,
    parserConfidence: Math.max(0.5, Number(confidence.toFixed(2))),
    lowConfidenceFields,
    suggestedTitle: headline,
    suggestedDate: flightDate,
    suggestedStartTime: depTime,
    suggestedDurationMins: 135,
  };
}
