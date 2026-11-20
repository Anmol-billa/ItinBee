import { describe, expect, it } from 'vitest';
import {
  buildGuestFallbackFromSample,
  SAMPLE_WORKSPACES,
} from '../src/data/sample-trips';
import {
  computeLocalSettlements,
  midpointSortKey,
} from '../src/lib/offline-db';

describe('Itinbee Frontend Offline UPI & SSR Budget Checks', () => {
  it('routes <= ₹2,000 settlements to UPI_DEEP_LINK and > ₹2,000 to COPY_VPA_FALLBACK', () => {
    const sample = structuredClone(SAMPLE_WORKSPACES['rishi-lnd-4d']!);
    const settlementsUnder2k = computeLocalSettlements(sample);
    expect(settlementsUnder2k.length).toBe(3);
    for (const s of settlementsUnder2k) {
      expect(s.amountInrMinor).toBe(160000); // ₹1,600
      expect(s.paymentMode).toBe('UPI_DEEP_LINK');
      expect(s.upiUri).toContain('upi://pay?');
    }

    // Add a larger ₹12,000 villa expense (> ₹2,000 per person)
    sample.expenses.push({
      id: '88888888-8888-4888-8888-888888888899',
      tripId: sample.trip.id,
      clientOpId: '99999999-9999-4999-8999-999999999999',
      entryType: 'charge',
      reversesExpenseId: null,
      title: 'Private Villa Booking',
      category: 'stay',
      paidBy: sample.members[1]!.userId,
      kittyPoolId: null,
      amountMinor: 1200000,
      currency: 'INR',
      inrEquivalentMinor: 1200000,
      fxRate: 1,
      splitMode: 'equal',
      excludedTags: [],
      splitsInrMinor: {
        [sample.members[0]!.userId]: 300000,
        [sample.members[1]!.userId]: 300000,
        [sample.members[2]!.userId]: 300000,
        [sample.members[3]!.userId]: 300000,
      },
      upiTxnRef: null,
      createdAt: '2026-11-20T06:00:00Z',
    });

    const settlementsOver2k = computeLocalSettlements(sample);
    for (const s of settlementsOver2k) {
      expect(s.amountInrMinor).toBe(460000); // ₹4,600
      expect(s.paymentMode).toBe('COPY_VPA_FALLBACK');
      expect(s.upiUri).toBeNull();
      expect(s.qrPayload).toContain('upi://pay?');
    }
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
