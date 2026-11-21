import { describe, expect, it } from 'vitest';
import {
  buildGuestFallbackFromSample,
  SAMPLE_WORKSPACES,
} from '../src/data/sample-trips';
import {
  exportTripBundleJson,
  importTripBundleJson,
} from '../src/lib/bundle-export';
import { redactSharedSummaryText } from '../src/lib/formatters';
import {
  base64ToUint8,
  computeLocalSettlements,
  midpointSortKey,
  uint8ToBase64,
} from '../src/lib/offline-db';

describe('Itinbee Frontend Offline UPI, Vault Chunking, Bundle & Redaction Checks', () => {
  it('never fabricates @okicici VPAs when payee has no upiVpa, and routes verified VPAs by ₹2,000 cap', () => {
    // 1. Unset upiVpa -> payeeVpa: null, upiUri: null, qrPayload: null, COPY_VPA_FALLBACK
    const unsetSample = structuredClone(SAMPLE_WORKSPACES['rishi-lnd-4d']!);
    for (const m of unsetSample.members) {
      m.upiVpa = null;
    }
    const unsetSettlements = computeLocalSettlements(unsetSample);
    expect(unsetSettlements.length).toBe(3);
    for (const s of unsetSettlements) {
      expect(s.amountInrMinor).toBe(160000); // ₹1,600
      expect(s.payeeVpa).toBeNull();
      expect(s.upiUri).toBeNull();
      expect(s.qrPayload).toBeNull();
      expect(s.paymentMode).toBe('COPY_VPA_FALLBACK');
    }

    // 2. Real configured upiVpa -> <= ₹2,000 uses UPI_DEEP_LINK; > ₹2,000 uses COPY_VPA_FALLBACK + QR
    const configuredSample = structuredClone(SAMPLE_WORKSPACES['rishi-lnd-4d']!);
    configuredSample.members[1]!.upiVpa = 'rohan@okaxis';

    const settlementsUnder2k = computeLocalSettlements(configuredSample);
    expect(settlementsUnder2k.length).toBe(3);
    for (const s of settlementsUnder2k) {
      expect(s.amountInrMinor).toBe(160000); // ₹1,600
      expect(s.payeeVpa).toBe('rohan@okaxis');
      expect(s.paymentMode).toBe('UPI_DEEP_LINK');
      expect(s.upiUri).toContain('upi://pay?pa=rohan%40okaxis');
      expect(s.qrPayload).toContain('upi://pay?pa=rohan%40okaxis');
    }

    // Add a larger ₹12,000 villa expense (> ₹2,000 per person)
    configuredSample.expenses.push({
      id: '88888888-8888-4888-8888-888888888899',
      tripId: configuredSample.trip.id,
      clientOpId: '99999999-9999-4999-8999-999999999999',
      entryType: 'charge',
      reversesExpenseId: null,
      title: 'Private Villa Booking',
      category: 'stay',
      paidBy: configuredSample.members[1]!.userId,
      kittyPoolId: null,
      amountMinor: 1200000,
      currency: 'INR',
      inrEquivalentMinor: 1200000,
      fxRate: 1,
      splitMode: 'equal',
      excludedTags: [],
      splitsInrMinor: {
        [configuredSample.members[0]!.userId]: 300000,
        [configuredSample.members[1]!.userId]: 300000,
        [configuredSample.members[2]!.userId]: 300000,
        [configuredSample.members[3]!.userId]: 300000,
      },
      upiTxnRef: null,
      createdAt: '2026-11-20T06:00:00Z',
    });

    const settlementsOver2k = computeLocalSettlements(configuredSample);
    for (const s of settlementsOver2k) {
      expect(s.amountInrMinor).toBe(460000); // ₹4,600
      expect(s.payeeVpa).toBe('rohan@okaxis');
      expect(s.paymentMode).toBe('COPY_VPA_FALLBACK');
      expect(s.upiUri).toBeNull();
      expect(s.qrPayload).toContain('upi://pay?pa=rohan%40okaxis');
    }
  });

  it('encodes and decodes >64KB binary vault attachments without call-stack overflow', () => {
    const size = 180 * 1024; // 180 KB (> 64KB String.fromCharCode spread limit)
    const original = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      original[i] = (i * 31 + 7) & 0xff;
    }

    const encoded = uint8ToBase64(original);
    expect(encoded.length).toBeGreaterThan(240000);

    const decoded = base64ToUint8(encoded);
    expect(decoded.length).toBe(original.length);
    expect(decoded[0]).toBe(original[0]);
    expect(decoded[77777]).toBe(original[77777]);
    expect(decoded[size - 1]).toBe(original[size - 1]);
  });

  it('round-trips .itinbee.json trip bundles cleanly', () => {
    const sample = structuredClone(SAMPLE_WORKSPACES['rishi-lnd-4d']!);
    const json = exportTripBundleJson(sample);
    const restored = importTripBundleJson(json);

    expect(restored.trip.title).toBe(sample.trip.title);
    expect(restored.days).toHaveLength(sample.days.length);
    expect(restored.items).toHaveLength(sample.items.length);
    expect(restored.trip.isSample).toBe(false);
  });

  it('redacts PNR, Coach, Seat, and Berth details in both English and Hindi Elder Card summaries', () => {
    const hindiLeak =
      'सुबह 06:45 बजे नई दिल्ली से शताब्दी एक्सप्रेस (कोच C4, सीट 21–24, पीएनआर 2849105842) से प्रस्थान। अपनी सीट पर आराम करें।';
    const sanitizedHi = redactSharedSummaryText(hindiLeak);
    expect(sanitizedHi).not.toContain('2849105842');
    expect(sanitizedHi).not.toContain('C4');
    expect(sanitizedHi).not.toContain('21–24');
    expect(sanitizedHi).toContain('अपनी सीट पर आराम करें।');

    const englishLeak =
      'Board Shatabdi Express (Coach C4, Seat 21-24, PNR: 2849105842, Berth 12) at 06:45.';
    const sanitizedEn = redactSharedSummaryText(englishLeak);
    expect(sanitizedEn).not.toContain('2849105842');
    expect(sanitizedEn).not.toContain('Coach C4');
    expect(sanitizedEn).not.toContain('Seat 21-24');
    expect(sanitizedEn).not.toContain('Berth 12');
    expect(sanitizedEn).toContain('Board Shatabdi Express');
  });

  it('keeps guest share projection compact (<150KB) and strictly redacted', () => {
    const projection = buildGuestFallbackFromSample('rishi-lnd-4d');
    expect(projection).not.toBeNull();
    expect(projection!.redactPii).toBe(true);
    const serialized = JSON.stringify(projection);
    expect(Buffer.byteLength(serialized, 'utf8')).toBeLessThan(25 * 1024);
    expect(serialized).toContain('••••••842');
    expect(serialized).not.toContain('2849105842');
  });

  it('generates monotonic fractional sort keys', () => {
    const k1 = midpointSortKey(null, null);
    const k2 = midpointSortKey(k1, null);
    const kMid = midpointSortKey(k1, k2);
    expect(k1 < k2).toBe(true);
    expect(k1 < kMid).toBe(true);
  });
});
