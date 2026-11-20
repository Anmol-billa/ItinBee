import { describe, expect, it } from 'vitest';
import { redactAadhaarNumbers } from '../src/security/aadhaar-redactor.js';
import { runHybridTextIngestion } from '../src/modules/ingest/pipeline.js';
import { extractStopsFromSocialLink } from '../src/modules/ingest/parsers/social.js';

interface TicketFixture {
  name: string;
  rawText: string;
  expectedProvider: string;
  expectedPnr: string;
  expectedStatus: string;
  expectedVehicleOrProperty: string;
}

const INDIAN_TICKET_FIXTURES: TicketFixture[] = [
  {
    name: '1. IRCTC Electronic Reservation Slip — Mumbai Rajdhani CNF',
    rawText: `
      IRCTC Electronic Reservation Slip (Personal User)
      PNR No: 2451987842
      Train No./Name: 12951 / MUMBAI RAJDHANI
      Quota: GENERAL (GN)
      From: NEW DELHI (NDLS)   To: MUMBAI CENTRAL (MMCT)
      Scheduled Departure: 14-Dec-2026 17:00
      Scheduled Arrival: 15-Dec-2026 08:35
      Passenger Details:
      1. ANANYA SHARMA   29   F   CNF/B4/32/LOWER
      2. ROHAN KULKARNI  31   M   CNF/B4/35/UPPER
      Aadhaar ID Verified: 4589 2310 7741
    `,
    expectedProvider: 'irctc',
    expectedPnr: '2451987842',
    expectedStatus: 'confirmed',
    expectedVehicleOrProperty: '12951',
  },
  {
    name: '2. IRCTC Compact SMS — Dehradun Shatabdi',
    rawText:
      'PNR:2849103764,TRN:12017,DOJ:22-11-26,CC,NDLS-DDN,Dep:06:45,ANANYA SHARMA,C4,21,CNF',
    expectedProvider: 'irctc',
    expectedPnr: '2849103764',
    expectedStatus: 'confirmed',
    expectedVehicleOrProperty: '12017',
  },
  {
    name: '3. IRCTC RAC Ticket — Karnataka Express',
    rawText: `
      IRCTC e-Ticket Confirmation
      PNR Number: 4519820344
      Train No./Name: 12627 / KARNATAKA EXP
      From: BENGALURU (SBC)  To: NEW DELHI (NDLS)
      Scheduled Departure: 19-Dec-2026 19:20
      1. KARTHIK NAIR  27  M  RAC/S2/47
    `,
    expectedProvider: 'irctc',
    expectedPnr: '4519820344',
    expectedStatus: 'rac',
    expectedVehicleOrProperty: '12627',
  },
  {
    name: '4. IRCTC Waitlisted Ticket — Vande Bharat Express',
    rawText: `
      IRCTC Reservation Advice
      PNR No: 8839201745
      Train No./Name: 22436 / VANDE BHARAT EXP
      From: NEW DELHI (NDLS) To: VARANASI JN (BSB)
      Scheduled Departure: 26-Nov-2026 06:00
      1. SURESH IYER  64  M  RLWL/14
    `,
    expectedProvider: 'irctc',
    expectedPnr: '8839201745',
    expectedStatus: 'wl',
    expectedVehicleOrProperty: '22436',
  },
  {
    name: '5. IndiGo Flight Confirmation — DEL to GOX',
    rawText: `
      IndiGo Flight Confirmation
      Booking Reference: K8M4Q2
      Passenger: Ms. Ananya Sharma
      Flight: 6E 2045 | Date: 18 Dec 2026
      New Delhi (DEL) to Goa Mopa (GOX)
      Terminal: T1 | Dep: 07:15 | Arr: 09:55
      Seat: 12A | Check-in Baggage: 15 Kg
    `,
    expectedProvider: 'indigo',
    expectedPnr: 'K8M4Q2',
    expectedStatus: 'confirmed',
    expectedVehicleOrProperty: '6E-2045',
  },
  {
    name: '6. Air India e-Ticket — DEL to BLR T3',
    rawText: `
      Air India Booking Confirmation
      PNR: W9X7LP
      Passenger: Mr. Karthik Nair
      Flight AI-803 | 14-Jan-2027
      New Delhi (DEL) -> Bengaluru (BLR)
      Terminal 3 | Departure: 06:10 | Arrival: 08:55
      Seat No: 18F | Baggage: 25 Kg
    `,
    expectedProvider: 'air_india',
    expectedPnr: 'W9X7LP',
    expectedStatus: 'confirmed',
    expectedVehicleOrProperty: 'AI-803',
  },
  {
    name: '7. Akasa Air Boarding Confirmation — BLR to VNS',
    rawText: `
      It's Your Sky — Akasa Air
      Confirmation Code: Q7R2V9
      Flight: QP 1324 | 26 Nov 2026
      Bengaluru (BLR) to Varanasi (VNS)
      Terminal: T2 | STD: 08:20 | STA: 10:55 | Seat: 9A
    `,
    expectedProvider: 'akasa',
    expectedPnr: 'Q7R2V9',
    expectedStatus: 'confirmed',
    expectedVehicleOrProperty: 'QP-1324',
  },
  {
    name: '8. SpiceJet Flight SMS — DEL to DED',
    rawText: `
      SpiceJet Confirmed! PNR: M4T9K1. Flight SG-8194 on 10-Dec-2026 DEL -> DED Terminal T1D Dep: 11:40 Arr: 12:35 Seat: 4C.
    `,
    expectedProvider: 'spicejet',
    expectedPnr: 'M4T9K1',
    expectedStatus: 'confirmed',
    expectedVehicleOrProperty: 'SG-8194',
  },
  {
    name: '9. redBus Intercity Sleeper — Delhi to Rishikesh',
    rawText: `
      redBus mTicket Confirmed
      TIN: TUC84920143
      Operator: Zingbus Plus Volvo Eicher A/C Semi Sleeper
      Delhi to Rishikesh
      Journey Date: 10-Dec-2026 | Departure: 22:45
      Boarding Point: Kashmere Gate ISBT Gate 3
      Dropping Point: Rishikesh Nepali Farm
      Seat(s): L12, L13
    `,
    expectedProvider: 'redbus',
    expectedPnr: 'TUC84920143',
    expectedStatus: 'confirmed',
    expectedVehicleOrProperty: 'Zingbus',
  },
  {
    name: '10. AbhiBus Intercity Sleeper — Bengaluru to Madgaon',
    rawText: `
      AbhiBus Booking Confirmed!
      AbhiBus Booking ID: ABH7741290
      Operator: KSRTC Airavat Club Class
      Bengaluru to Madgaon
      DOJ: 17-Dec-2026 | Reporting Time: 21:15
      Boarding Point: Majestic Bus Stand Platform 2
      Dropping Point: Madgaon KTC Bus Stand
      Seat No: U4
    `,
    expectedProvider: 'abhibus',
    expectedPnr: 'ABH7741290',
    expectedStatus: 'confirmed',
    expectedVehicleOrProperty: 'KSRTC',
  },
  {
    name: '11. MakeMyTrip Hotel Voucher — Landour',
    rawText: `
      MakeMyTrip Hotel Confirmation Voucher
      Booking ID: NH74829104523
      Property Name: Rokeby Manor Landour
      Check-in Date: 11-Dec-2026 (14:00)
      Check-out Date: 13-Dec-2026 (11:00)
      2 Nights | Breakfast Included | Govt ID Aadhaar 6721-9043-1198
    `,
    expectedProvider: 'mmt',
    expectedPnr: 'NH74829104523',
    expectedStatus: 'confirmed',
    expectedVehicleOrProperty: 'Rokeby Manor',
  },
  {
    name: '12. Airbnb Stay Confirmation — Palolem South Goa',
    rawText: `
      Airbnb Reservation Confirmed
      Confirmation Code: HM8K9P2Q4R
      Property Name: Palolem Seafront Heritage Cottage
      Check-in: 2026-12-18 15:00
      Check-out: 2026-12-22 11:00
    `,
    expectedProvider: 'airbnb',
    expectedPnr: 'HM8K9P2Q4R',
    expectedStatus: 'confirmed',
    expectedVehicleOrProperty: 'Palolem Seafront Heritage Cottage',
  },
  {
    name: '13. Zostel Hostel Confirmation — Spiti Kaza',
    rawText: `
      Zostel Booking Confirmation
      Booking Ref: ZOS-88412
      Hostel Name: Zostel Spiti Kaza
      Check-in Date: 15-Jun-2026
      Check-out Date: 18-Jun-2026
    `,
    expectedProvider: 'zostel',
    expectedPnr: 'ZOS-88412',
    expectedStatus: 'confirmed',
    expectedVehicleOrProperty: 'Zostel Spiti Kaza',
  },
];

describe('Stage 1 & Stage 2 Deterministic Indian Parsers + Social Reel Extraction', () => {
  it('achieves >= 95% field-level extraction accuracy across 13 Indian rail/flight/bus/stay fixtures at $0 LLM cost', async () => {
    let totalChecks = 0;
    let passedChecks = 0;

    for (const fx of INDIAN_TICKET_FIXTURES) {
      const res = await runHybridTextIngestion(fx.rawText);
      expect(res.stageUsed, fx.name).toBe('stage2_deterministic');
      expect(res.bookingCandidate, fx.name).not.toBeNull();
      const b = res.bookingCandidate!;

      totalChecks += 4;
      if (b.provider === fx.expectedProvider) passedChecks += 1;
      if (b.pnr === fx.expectedPnr) passedChecks += 1;
      if (b.status === fx.expectedStatus) passedChecks += 1;

      const combinedMeta = `${b.summary.vehicleNumber ?? ''} ${b.summary.operatorName ?? ''} ${b.summary.propertyName ?? ''}`;
      if (
        combinedMeta
          .toLowerCase()
          .includes(fx.expectedVehicleOrProperty.toLowerCase())
      ) {
        passedChecks += 1;
      }
    }

    const accuracy = passedChecks / totalChecks;
    expect(accuracy).toBeGreaterThanOrEqual(0.95);
    expect(passedChecks).toBe(totalChecks); // 100% across all 52 field assertions
  });

  it('extracts geo-grounded open POIs and flags ungrounded caption stops (<0.85 confidence) from Instagram Reels & YouTube Shorts', async () => {
    const reel = await extractStopsFromSocialLink({
      url: 'https://www.instagram.com/reel/C9xLandourWeekend/',
      captionOrTranscript: `
        Save this 2-day Landour & Rishikesh itinerary!
        1. Parmarth Niketan Ganga Aarti Ghat — reach before 5pm
        2. Char Dukan, Landour — pancakes & bun omelette
        3. Lal Tibba Scenic Point — clear winter peaks
        4. Sharma Ji Pahadi Maggi Corner — hidden turn near bazaar
      `,
    });

    expect(reel.platform).toBe('instagram');
    expect(reel.stops.length).toBeGreaterThanOrEqual(4);

    const charDukan = reel.stops.find((s) => s.title.includes('Char Dukan'));
    expect(charDukan).toBeDefined();
    expect(charDukan!.lat).toBeCloseTo(30.4631, 3);
    expect(charDukan!.confidence).toBeGreaterThanOrEqual(0.9);
    expect(charDukan!.needsVerification).toBe(false);

    const ungrounded = reel.stops.find((s) =>
      s.title.includes('Sharma Ji Pahadi Maggi Corner')
    );
    expect(ungrounded).toBeDefined();
    expect(ungrounded!.confidence).toBeLessThan(0.85);
    expect(ungrounded!.needsVerification).toBe(true);

    const ytShort = await extractStopsFromSocialLink({
      url: 'https://www.youtube.com/shorts/kashiYatraGuide',
      captionOrTranscript:
        'Morning Subah-e-Banaras at Assi Ghat followed by Gate 4 Sugam Darshan at Kashi Vishwanath and Dashashwamedh evening aarti.',
    });
    expect(ytShort.platform).toBe('youtube');
    expect(ytShort.stops.length).toBeGreaterThanOrEqual(3);
  });

  it('routes unstructured Hinglish homestay WhatsApp messages to Stage 3 fallback and flags <0.85 confidence fields in amber', async () => {
    const messyWhatsapp =
      'Raju ji Pahadi Cottage Mukteshwar room lock kar diya hai 19 Dec ko aana hai advance ₹3000 mil gaya';
    const out = await runHybridTextIngestion(messyWhatsapp);
    expect(out.stageUsed).toBe('stage3_vertex_mumbai');
    expect(out.requiresAmberVerification).toBe(true);
    expect(out.bookingCandidate?.parserConfidence).toBeLessThan(0.85);
    expect(out.bookingCandidate?.lowConfidenceFields.length).toBeGreaterThan(0);
  });

  it('masks first 8 digits of spaced, hyphenated, and bare 12-digit Aadhaar numbers without corrupting 10-digit PNRs or +91 phones', () => {
    const sample = `
      Passenger 1 Aadhaar: 4589 2310 7741
      Passenger 2 UID: 6721-9043-1198
      Passenger 3 Bare ID: 883211905520
      IRCTC PNR: 2451987842
      Contact Mobile: +919810011101
    `;
    const { redactedText, redactionCount } = redactAadhaarNumbers(sample);

    expect(redactionCount).toBe(3);
    expect(redactedText).toContain('XXXX-XXXX-7741');
    expect(redactedText).toContain('XXXX-XXXX-1198');
    expect(redactedText).toContain('XXXX-XXXX-5520');
    expect(redactedText).not.toContain('4589 2310');
    expect(redactedText).not.toContain('6721-9043');
    expect(redactedText).not.toContain('88321190');
    // Preserves 10-digit IRCTC PNR and +91 mobile number
    expect(redactedText).toContain('2451987842');
    expect(redactedText).toContain('+919810011101');
  });
});
