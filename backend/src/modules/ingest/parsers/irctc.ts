import type {
  BookingProvider,
  BookingStatus,
  BookingSummaryPublic,
  ItemKind,
} from '../../../types/domain.js';
import type { RawPassengerMeta } from '../../../security/aadhaar-redactor.js';

export interface ParsedBookingCandidate {
  provider: BookingProvider;
  itemKind: ItemKind;
  pnr: string | null;
  status: BookingStatus;
  summary: BookingSummaryPublic;
  passengers: RawPassengerMeta[];
  parserConfidence: number;
  lowConfidenceFields: string[];
  suggestedTitle: string;
  suggestedDate: string | null;
  suggestedStartTime: string | null;
  suggestedDurationMins: number | null;
}

const MONTH_MAP: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

export function normalizeIndianDate(rawDate: string | undefined): string | null {
  if (!rawDate) return null;
  const trimmed = rawDate.trim();

  // YYYY-MM-DD
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoMatch) return trimmed;

  // DD-MMM-YYYY or DD MMM YYYY or DD-MMM-YY (e.g. 14-Dec-2026, 22 Nov 26)
  const alphaMatch = /^(\d{1,2})[\s/-]([A-Za-z]{3})[a-z]*[\s/-](\d{2,4})$/.exec(
    trimmed
  );
  if (alphaMatch) {
    const dd = alphaMatch[1]!.padStart(2, '0');
    const mon = MONTH_MAP[alphaMatch[2]!.toLowerCase()];
    let yyyy = alphaMatch[3]!;
    if (yyyy.length === 2) yyyy = `20${yyyy}`;
    if (mon) return `${yyyy}-${mon}-${dd}`;
  }

  // DD-MM-YYYY or DD/MM/YYYY or DD-MM-YY
  const numMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(trimmed);
  if (numMatch) {
    const dd = numMatch[1]!.padStart(2, '0');
    const mm = numMatch[2]!.padStart(2, '0');
    let yyyy = numMatch[3]!;
    if (yyyy.length === 2) yyyy = `20${yyyy}`;
    return `${yyyy}-${mm}-${dd}`;
  }

  return null;
}

/**
 * Deterministic Stage-2 Parser for IRCTC Electronic Reservation Slips (PDF) & IRCTC SMS.
 * Zero LLM cost, zero automated IRCTC scraping.
 */
export function parseIrctcTicket(text: string): ParsedBookingCandidate | null {
  // 1. 10-digit IRCTC PNR
  const pnrMatch =
    /\bPNR(?:\s*(?:No\.?|Number))?\s*[:.-]?\s*(\d{10})\b/i.exec(text) ??
    /\b(\d{10})\b/.exec(text);
  const pnr = pnrMatch?.[1] ?? null;

  // 2. Train Number (5 digits) & Train Name
  const trainFullMatch =
    /\bTrain\s*(?:No\.?\s*(?:\/|&)?\s*Name|No\.?|Number)?\s*[:.-]?\s*(\d{5})\s*(?:\/|-|–|\s)\s*([A-Z][A-Z0-9\s()-]{2,38}?)(?=\s*(?:\n|Quota|Class|From|Date|DOJ| Boarding|Scheduled|,|$))/i.exec(
      text
    ) ??
    /\bTRN\s*[:.-]?\s*(\d{5})\b/i.exec(text) ??
    /\bTrain\s*[:.-]?\s*(\d{5})\b/i.exec(text);

  const trainNumber = trainFullMatch?.[1] ?? null;
  const rawTrainName = trainFullMatch?.[2]?.trim().replace(/\s{2,}/g, ' ');
  const trainName = rawTrainName || undefined;

  if (!pnr && !trainNumber) {
    return null;
  }

  // 3. Stations (From / To or StationCode-StationCode in SMS)
  let originName: string | undefined;
  let originCode: string | undefined;
  let destinationName: string | undefined;
  let destinationCode: string | undefined;

  const fromMatch =
    /\b(?:From|Boarding(?:\s*At)?)\s*[:.-]?\s*([A-Za-z\s.]{2,30}?)\s*\(([A-Z]{2,5})\)/i.exec(
      text
    );
  const toMatch =
    /\b(?:To|Reservation\s*Upto)\s*[:.-]?\s*([A-Za-z\s.]{2,30}?)\s*\(([A-Z]{2,5})\)/i.exec(
      text
    );

  if (fromMatch) {
    originName = fromMatch[1]!.trim();
    originCode = fromMatch[2]!.trim();
  }
  if (toMatch) {
    destinationName = toMatch[1]!.trim();
    destinationCode = toMatch[2]!.trim();
  }

  if (!originCode || !destinationCode) {
    const smsRouteMatch = /\b([A-Z]{2,5})\s*-\s*([A-Z]{2,5})\b/.exec(text);
    if (
      smsRouteMatch &&
      smsRouteMatch[1] !== 'XXXX' &&
      !['CNF', 'RAC', 'IRCTC', 'TRN', 'PNR', 'DOJ'].includes(smsRouteMatch[1]!)
    ) {
      originCode = originCode ?? smsRouteMatch[1]!;
      destinationCode = destinationCode ?? smsRouteMatch[2]!;
    }
  }

  // 4. Quota
  const quotaMatch =
    /\bQuota\s*[:.-]?\s*([A-Za-z\s()]{2,24}?)(?=\s*(?:\n|From|To|Class|Date|$))/i.exec(
      text
    );
  const quota = quotaMatch?.[1]?.trim();

  // 5. Date & Departure / Arrival Times
  const dojMatch =
    /\b(?:DOJ|Date(?:\s*of\s*Journey)?|Scheduled\s*Departure)\s*[:.-]?\s*(\d{1,2}[\s/-](?:[A-Za-z]{3,9}|\d{1,2})[\s/-]\d{2,4}|\d{4}-\d{2}-\d{2})/i.exec(
      text
    );
  const journeyDate = normalizeIndianDate(dojMatch?.[1]);

  const depTimeMatch =
    /\b(?:Scheduled\s*Departure|Departure|Dep)\s*[:.-]?\s*(?:\d{1,2}[\s/-][A-Za-z0-9]{2,9}[\s/-]\d{2,4}\s+)?(\d{2}:\d{2})\b/i.exec(
      text
    );
  const arrTimeMatch =
    /\b(?:Scheduled\s*Arrival|Arrival|Arr)\s*[:.-]?\s*(?:\d{1,2}[\s/-][A-Za-z0-9]{2,9}[\s/-]\d{2,4}\s+)?(\d{2}:\d{2})\b/i.exec(
      text
    );

  const depTime = depTimeMatch?.[1] ?? null;
  const arrTime = arrTimeMatch?.[1] ?? null;

  // 6. Status, Coach, Berth & Passengers
  let status: BookingStatus = 'confirmed';
  if (/\b(?:RLWL|PQWL|TQWL|GNWL|WL)\s*[/-]?\s*\d+/i.test(text)) {
    status = 'wl';
  } else if (/\bRAC\s*[/-]?\s*[A-Z0-9]*/i.test(text)) {
    status = 'rac';
  } else if (/\bCAN(?:CELLED)?\b/i.test(text)) {
    status = 'cancelled';
  }

  let primaryCoach: string | undefined;
  let primaryBerth: string | undefined;
  const passengers: RawPassengerMeta[] = [];

  // Structured passenger rows: `1. ANANYA SHARMA  29  F  CNF/B4/32/LOWER`
  const paxRowRegex =
    /(?:^|\n)\s*\d+\.\s*([A-Za-z][A-Za-z\s.]{1,32}?)\s+(\d{1,3})\s+(M|F|T|Male|Female)\s+((?:CNF|RAC|RLWL|PQWL|TQWL|GNWL|WL)[A-Za-z0-9/\s-]*)/gi;
  let paxMatch: RegExpExecArray | null;
  while ((paxMatch = paxRowRegex.exec(text)) !== null) {
    const paxName = paxMatch[1]!.trim();
    const paxAge = Number.parseInt(paxMatch[2]!, 10);
    const paxGender = paxMatch[3]!.toUpperCase()[0] ?? null;
    const rawStatusToken = paxMatch[4]!.trim();

    // Parse CNF/B4/32/LOWER or RAC/S2/47 or WL/14
    const statusParts = rawStatusToken.split('/').map((s) => s.trim());
    const stCode = statusParts[0]?.toUpperCase() ?? 'CNF';
    let coach: string | null = null;
    let berth: string | null = null;
    if (stCode === 'CNF' && statusParts.length >= 3) {
      coach = statusParts[1] ?? null;
      berth = statusParts.slice(2).join('/');
    } else if (stCode === 'RAC' && statusParts.length >= 2) {
      coach = statusParts.length >= 3 ? (statusParts[1] ?? null) : null;
      berth = statusParts[statusParts.length - 1] ?? null;
    } else if (statusParts.length >= 2) {
      berth = statusParts[1] ?? null;
    }

    if (!primaryCoach && coach) primaryCoach = coach;
    if (!primaryBerth && berth) primaryBerth = berth;

    passengers.push({
      name: paxName,
      age: Number.isFinite(paxAge) ? paxAge : null,
      gender: paxGender,
      coach,
      seatOrBerth: berth,
      bookingStatus: rawStatusToken,
      isPrimaryUser: passengers.length === 0,
    });
  }

  // Fallback coach/berth extraction from SMS or single-line formats (`CNF/B2/34` or `Coach: B4, Berth: 32` or `,B2,34,CNF`)
  if (!primaryCoach || !primaryBerth) {
    const slashStatus = /\b(CNF|RAC)\s*\/\s*([A-Z]{1,2}\d{1,2})\s*\/\s*(\d{1,3}(?:\/[A-Z]+)?)\b/i.exec(
      text
    );
    if (slashStatus) {
      primaryCoach = primaryCoach ?? slashStatus[2]!.toUpperCase();
      primaryBerth = primaryBerth ?? slashStatus[3]!;
    }
  }
  if (!primaryCoach || !primaryBerth) {
    const labeledCoach = /\bCoach\s*[:.-]?\s*([A-Z]{1,2}\d{1,2})\b/i.exec(text);
    const labeledBerth = /\b(?:Berth|Seat)(?:s|\s*No\.?)?\s*[:.-]?\s*(\d{1,3}(?:[,/]\s*\d{1,3})*)\b/i.exec(
      text
    );
    if (labeledCoach) primaryCoach = primaryCoach ?? labeledCoach[1]!.toUpperCase();
    if (labeledBerth) primaryBerth = primaryBerth ?? labeledBerth[1]!.replace(/\s+/g, '');
  }
  if (!primaryCoach || !primaryBerth) {
    const smsCommaSeat = /,([A-Z]{1,2}\d{1,2}),(\d{1,3}),(CNF|RAC|WL)/i.exec(text);
    if (smsCommaSeat) {
      primaryCoach = primaryCoach ?? smsCommaSeat[1]!.toUpperCase();
      primaryBerth = primaryBerth ?? smsCommaSeat[2]!;
      const st = smsCommaSeat[3]!.toUpperCase();
      status = st === 'CNF' ? 'confirmed' : st === 'RAC' ? 'rac' : 'wl';
    }
  }

  const lowConfidenceFields: string[] = [];
  let confidence = 1.0;
  if (!pnr) {
    confidence -= 0.2;
    lowConfidenceFields.push('pnr');
  }
  if (!trainNumber) {
    confidence -= 0.2;
    lowConfidenceFields.push('vehicleNumber');
  }
  if (!depTime) {
    confidence -= 0.1;
    lowConfidenceFields.push('departureIso');
  }

  const routeLabel =
    originCode && destinationCode
      ? `${originCode} → ${destinationCode}`
      : originName && destinationName
        ? `${originName} → ${destinationName}`
        : undefined;

  const trainDisplay = [trainNumber, trainName].filter(Boolean).join(' ');
  const coachSummary = [
    status.toUpperCase(),
    primaryCoach ? `Coach ${primaryCoach}` : null,
    primaryBerth ? `Berth ${primaryBerth}` : null,
  ]
    .filter(Boolean)
    .join(' • ');

  const headline = `Train ${trainDisplay || 'IRCTC'} (${coachSummary})`;

  return {
    provider: 'irctc',
    itemKind: 'transit',
    pnr,
    status,
    summary: {
      headline,
      routeLabel,
      vehicleNumber: trainNumber ?? undefined,
      vehicleName: trainName,
      operatorName: 'Indian Railways (IRCTC)',
      originCode,
      originName,
      destinationCode,
      destinationName,
      departureIso: journeyDate && depTime ? `${journeyDate}T${depTime}:00+05:30` : depTime ?? undefined,
      arrivalIso: journeyDate && arrTime ? `${journeyDate}T${arrTime}:00+05:30` : arrTime ?? undefined,
      coach: primaryCoach,
      seatOrBerth: primaryBerth,
      quota,
    },
    passengers,
    parserConfidence: Math.max(0.5, Number(confidence.toFixed(2))),
    lowConfidenceFields,
    suggestedTitle: routeLabel ? `Train ${trainDisplay} (${routeLabel})` : headline,
    suggestedDate: journeyDate,
    suggestedStartTime: depTime,
    suggestedDurationMins: null,
  };
}
