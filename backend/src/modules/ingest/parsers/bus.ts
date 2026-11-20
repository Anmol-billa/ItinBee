import type { BookingProvider } from '../../../types/domain.js';
import {
  normalizeIndianDate,
  type ParsedBookingCandidate,
} from './irctc.js';

/**
 * Deterministic Stage-2 Parser for redBus & AbhiBus intercity bus tickets / SMS.
 */
export function parseBusTicket(text: string): ParsedBookingCandidate | null {
  const lower = text.toLowerCase();
  const provider: BookingProvider = lower.includes('abhibus')
    ? 'abhibus'
    : 'redbus';

  // TIN / Ticket Number
  const tinMatch =
    /\b(?:TIN|Ticket\s*(?:No\.?|ID|Number)|AbhiBus\s*(?:Booking\s*)?ID|Booking\s*ID)\s*[:#.-]?\s*([A-Z0-9-]{6,18})\b/i.exec(
      text
    );
  const pnr = tinMatch?.[1]?.toUpperCase() ?? null;

  // Bus Operator
  const operatorMatch =
    /\b(?:Operator|Travels|Bus\s*Service)\s*[:.-]?\s*([^\n,|]{3,45})/i.exec(text) ??
    /\b((?:Zingbus|NueGo|IntrCity\s*SmartBus|VRL\s*Travels|SRS\s*Travels|KSRTC|UPSRTC|HRTC|MSRTC|Orange\s*Travels|Parveen\s*Travels)[A-Za-z0-9\s()-]{0,25})/i.exec(
      text
    );
  const operatorName = operatorMatch?.[1]?.trim();

  if (!pnr && !operatorName) {
    return null;
  }

  // Boarding Point & Dropping Point
  const boardingMatch =
    /\bBoarding(?:\s*Point|\s*Landmark)?\s*[:.-]?\s*([^\n|]{3,60})/i.exec(text);
  const droppingMatch =
    /\b(?:Dropping|Drop)(?:\s*Point)?\s*[:.-]?\s*([^\n|]{3,50})/i.exec(text);
  const routeMatch =
    /\b([A-Za-z\s]{3,22}?)\s*(?:to|->|→|–)\s*([A-Za-z\s]{3,22}?)(?=\s*(?:\n|\||,|on|Date|Journey|Dep|TIN|Seat|$))/i.exec(
      text
    );

  const boardingPoint = boardingMatch?.[1]?.trim();
  const originName = routeMatch?.[1]?.trim() ?? boardingPoint;
  const destinationName = droppingMatch?.[1]?.trim() ?? routeMatch?.[2]?.trim();

  // Seat Number(s)
  const seatMatch =
    /\bSeat(?:\(s\)|s|\s*No\.?)?\s*[:.-]?\s*([A-Z0-9,\s/-]{1,18}?)(?=\s*(?:\n|\||Boarding|Dep|Time|Date|Fare|$))/i.exec(
      text
    );
  const seat = seatMatch?.[1]?.trim().replace(/\s+/g, ' ');

  // Date & Departure
  const dateMatch =
    /\b(?:DOJ|Journey\s*Date|Date)\s*[:.-]?\s*(\d{1,2}[\s/-][A-Za-z0-9]{2,9}[\s/-]\d{2,4}|\d{4}-\d{2}-\d{2})/i.exec(
      text
    ) ??
    /\b(\d{1,2}[\s/-][A-Za-z]{3}[a-z]*[\s/-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/.exec(
      text
    );
  const journeyDate = normalizeIndianDate(dateMatch?.[1]);

  const timeMatch =
    /\b(?:Departure|Reporting\s*Time|Dep|Time)\s*[:.-]?\s*(\d{2}:\d{2})\b/i.exec(
      text
    ) ?? /\b([01]\d|2[0-3]):([0-5]\d)\b/.exec(text);
  const depTime = timeMatch ? (timeMatch[1]!.includes(':') ? timeMatch[1]! : `${timeMatch[1]}:${timeMatch[2]}`) : null;

  const lowConfidenceFields: string[] = [];
  let confidence = 1.0;
  if (!pnr) {
    confidence -= 0.18;
    lowConfidenceFields.push('pnr');
  }
  if (!boardingPoint) {
    confidence -= 0.12;
  }

  const routeLabel =
    originName && destinationName ? `${originName} → ${destinationName}` : undefined;
  const headline = [
    operatorName ?? (provider === 'abhibus' ? 'AbhiBus' : 'redBus'),
    routeLabel,
    seat ? `Seat ${seat}` : null,
  ]
    .filter(Boolean)
    .join(' • ');

  return {
    provider,
    itemKind: 'transit',
    pnr,
    status: 'confirmed',
    summary: {
      headline,
      routeLabel,
      operatorName: operatorName ?? (provider === 'abhibus' ? 'AbhiBus' : 'redBus'),
      originName,
      destinationName,
      boardingPoint,
      seatOrBerth: seat,
      departureIso:
        journeyDate && depTime ? `${journeyDate}T${depTime}:00+05:30` : depTime ?? undefined,
    },
    passengers: [],
    parserConfidence: Math.max(0.55, Number(confidence.toFixed(2))),
    lowConfidenceFields,
    suggestedTitle: headline,
    suggestedDate: journeyDate,
    suggestedStartTime: depTime,
    suggestedDurationMins: 330,
  };
}
