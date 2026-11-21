import crypto from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, type BuiltAppBundle } from '../src/app.js';
import { signAccessToken } from '../src/security/auth-tokens.js';
import { SEED_IDS } from '../src/store/seed-data.js';

describe('Unlimited Indian UPI Ledger, Kitty Pools, Turnstile Polls, Geo & Sandbox Claim', () => {
  let bundle: BuiltAppBundle | null = null;

  afterEach(async () => {
    if (bundle) {
      await bundle.app.close();
      bundle = null;
    }
  });

  it('handles unequal tag_exclude splits, kitty pools, compensating adjustments, FX conversion, min-cash-flow simplification, and the ₹2,000 NPCI UPI URI threshold', async () => {
    bundle = await buildApp({ forceLocalStore: true, logger: false });
    const { app } = bundle;
    const goaTripId = SEED_IDS.trips.southGoa;
    const ananyaHeaders = {
      authorization: `Bearer ${signAccessToken({
        sub: SEED_IDS.users.ananya,
        displayName: 'Ananya Sharma',
        tier: 'free',
      })}`,
    };
    const karthikHeaders = {
      authorization: `Bearer ${signAccessToken({
        sub: SEED_IDS.users.karthik,
        displayName: 'Karthik Nair',
        tier: 'free',
      })}`,
    };

    // 1. Create an upfront Kitty Pool: Ananya (custodian) & Rohan each contribute ₹1,000 (100,000 paise) -> ₹2,000 pool
    const kittyRes = await app.inject({
      method: 'POST',
      url: `/v1/trips/${goaTripId}/kitty-pools`,
      headers: ananyaHeaders,
      payload: {
        title: 'Goa Cab & Parking Kitty',
        custodianId: SEED_IDS.users.ananya,
        currency: 'INR',
        memberContributionsMinor: {
          [SEED_IDS.users.ananya]: 100_000,
          [SEED_IDS.users.rohan]: 100_000,
        },
      },
    });
    expect(kittyRes.statusCode).toBe(201);
    const kittyPoolId = kittyRes.json().id as string;
    expect(kittyRes.json().initialContributionMinor).toBe(200_000);

    // 2. Spend full ₹2,000 (200,000 paise) from Kitty Pool equally across all 4 crew members (₹500 = 50,000 paise each)
    const kittyExpRes = await app.inject({
      method: 'POST',
      url: `/v1/trips/${goaTripId}/expenses`,
      headers: ananyaHeaders,
      payload: {
        clientOpId: crypto.randomUUID(),
        title: 'Madgaon to Palolem Innova Cab',
        category: 'transit',
        paidBy: SEED_IDS.users.ananya,
        kittyPoolId,
        amountMinor: 200_000,
        currency: 'INR',
        splitMode: 'equal',
      },
    });
    expect(kittyExpRes.statusCode).toBe(201);

    // 3. Log a Craft Beer & Calamari bill of ₹3,000 (300,000 paise) paid by Rohan, excluding `non_drinker` & `vegetarian`
    const tagExcludeRes = await app.inject({
      method: 'POST',
      url: `/v1/trips/${goaTripId}/expenses`,
      headers: ananyaHeaders,
      payload: {
        clientOpId: crypto.randomUUID(),
        title: 'Beach Shack Craft Beer & Calamari',
        category: 'food_drink',
        paidBy: SEED_IDS.users.rohan,
        amountMinor: 300_000,
        currency: 'INR',
        splitMode: 'tag_exclude',
        excludedTags: ['vegetarian', 'non_drinker'],
      },
    });
    expect(tagExcludeRes.statusCode).toBe(201);
    const tagSplits = tagExcludeRes.json().splitsInrMinor as Record<string, number>;
    expect(tagSplits[SEED_IDS.users.ananya]).toBe(150_000);
    expect(tagSplits[SEED_IDS.users.rohan]).toBe(150_000);
    expect(tagSplits[SEED_IDS.users.meera]).toBeUndefined();
    expect(tagSplits[SEED_IDS.users.karthik]).toBeUndefined();

    // 4. Log an erroneous expense of ₹800, then immediately reverse it via an append-only `adjustment`
    const mistakeRes = await app.inject({
      method: 'POST',
      url: `/v1/trips/${goaTripId}/expenses`,
      headers: ananyaHeaders,
      payload: {
        clientOpId: crypto.randomUUID(),
        title: 'Duplicate Scooter Entry',
        paidBy: SEED_IDS.users.karthik,
        amountMinor: 80_000,
        currency: 'INR',
        splitMode: 'equal',
      },
    });
    expect(mistakeRes.statusCode).toBe(201);
    const mistakeId = mistakeRes.json().id as string;

    const reversalRes = await app.inject({
      method: 'POST',
      url: `/v1/trips/${goaTripId}/expenses`,
      headers: ananyaHeaders,
      payload: {
        clientOpId: crypto.randomUUID(),
        entryType: 'adjustment',
        reversesExpenseId: mistakeId,
        title: 'Reverse Duplicate Scooter Entry',
        paidBy: SEED_IDS.users.karthik,
      },
    });
    expect(reversalRes.statusCode).toBe(201);
    expect(reversalRes.json().inrEquivalentMinor).toBe(-80_000);

    const settleUnderLimit = await app.inject({
      method: 'GET',
      url: `/v1/trips/${goaTripId}/settlements`,
      headers: ananyaHeaders,
    });
    expect(settleUnderLimit.statusCode).toBe(200);
    const sBody1 = settleUnderLimit.json();
    expect(sBody1.kittyPools[0].remainingMinor).toBe(0);
    expect(sBody1.settlements.length).toBe(3);

    for (const instruction of sBody1.settlements) {
      expect(instruction.amountInrMinor).toBeLessThanOrEqual(200_000);
      expect(instruction.paymentMode).toBe('UPI_DEEP_LINK');
      expect(instruction.upiUri).toMatch(/^upi:\/\/pay\?pa=rohank%40okhdfcbank/);
      expect(instruction.qrPayload).toBe(instruction.upiUri);
    }

    // 5. Now add a larger Villa Booking of ₹12,000 (1,200,000 paise) paid by Rohan -> pushes Ananya's debt > ₹2,000!
    await app.inject({
      method: 'POST',
      url: `/v1/trips/${goaTripId}/expenses`,
      headers: ananyaHeaders,
      payload: {
        clientOpId: crypto.randomUUID(),
        title: 'Agonda Beach Villa Balance',
        category: 'stay',
        paidBy: SEED_IDS.users.rohan,
        amountMinor: 1_200_000,
        currency: 'INR',
        splitMode: 'equal',
      },
    });

    const settleOverLimit = await app.inject({
      method: 'GET',
      url: `/v1/trips/${goaTripId}/settlements`,
      headers: ananyaHeaders,
    });
    const sBody2 = settleOverLimit.json();
    for (const instruction of sBody2.settlements) {
      expect(instruction.amountInrMinor).toBeGreaterThan(200_000);
      expect(instruction.paymentMode).toBe('COPY_VPA_FALLBACK');
      expect(instruction.upiUri).toBeNull();
      expect(instruction.copyText).toContain('rohank@okhdfcbank');
      expect(instruction.qrPayload).toMatch(/^upi:\/\/pay\?/);
    }

    // 6. Verify Multi-Currency VND -> INR conversion on Vietnam 7D trip
    const vndExp = await app.inject({
      method: 'POST',
      url: `/v1/trips/${SEED_IDS.trips.vietnam7d}/expenses`,
      headers: karthikHeaders,
      payload: {
        clientOpId: crypto.randomUUID(),
        title: 'Hanoi Old Quarter Chay Dinner',
        paidBy: SEED_IDS.users.karthik,
        amountMinor: 500_000, // 500,000 VND
        currency: 'VND',
        splitMode: 'shares',
        shareWeights: {
          [SEED_IDS.users.karthik]: 1,
          [SEED_IDS.users.ananya]: 2,
        },
      },
    });
    expect(vndExp.statusCode).toBe(201);
    const vndBody = vndExp.json();
    expect(vndBody.inrEquivalentMinor).toBe(170_000);
    const weightSum =
      vndBody.splitsInrMinor[SEED_IDS.users.karthik] +
      vndBody.splitsInrMinor[SEED_IDS.users.ananya];
    expect(weightSum).toBe(170_000);
  });

  it('enforces Cloudflare Turnstile verification and guest_session_hash deduplication on zero-OTP WhatsApp polls', async () => {
    bundle = await buildApp({ forceLocalStore: true, logger: false });
    const { app } = bundle;
    const ownerHeaders = {
      authorization: `Bearer ${signAccessToken({
        sub: SEED_IDS.users.ananya,
        displayName: 'Ananya Sharma',
        tier: 'free',
      })}`,
    };

    const pollRes = await app.inject({
      method: 'POST',
      url: `/v1/trips/${SEED_IDS.trips.rishikeshLandour}/polls`,
      headers: ownerHeaders,
      payload: {
        question: 'Rishikesh Rafting Stretch?',
        options: [
          { id: 'shivpuri', label: 'Shivpuri 16 km' },
          { id: 'marine', label: 'Marine Drive 26 km' },
        ],
      },
    });
    expect(pollRes.statusCode).toBe(201);
    const pollId = pollRes.json().id as string;

    // 1. Bot/invalid Turnstile token rejected with 403
    const botVote = await app.inject({
      method: 'POST',
      url: `/v1/t/rishi-lnd-4d/polls/${pollId}/vote`,
      payload: {
        optionId: 'shivpuri',
        guestDisplayName: 'Spam Bot',
        turnstileToken: 'invalid-turnstile-token',
      },
    });
    expect(botVote.statusCode).toBe(403);

    // 2. Valid guest vote succeeds and sets session deduplication
    const guestVote1 = await app.inject({
      method: 'POST',
      url: `/v1/t/rishi-lnd-4d/polls/${pollId}/vote`,
      payload: {
        optionId: 'shivpuri',
        guestDisplayName: 'Vikram (WhatsApp)',
        turnstileToken: 'cf-turnstile-valid-token-xyz',
        guestSessionId: 'vikram-whatsapp-webview-session-1',
      },
    });
    expect(guestVote1.statusCode).toBe(200);
    expect(guestVote1.json().totalVotes).toBe(1);

    // 3. Repeat click with the same guestSessionId deduplicates cleanly (totalVotes stays 1)
    const guestVoteDuplicate = await app.inject({
      method: 'POST',
      url: `/v1/t/rishi-lnd-4d/polls/${pollId}/vote`,
      payload: {
        optionId: 'shivpuri',
        guestDisplayName: 'Vikram (WhatsApp)',
        turnstileToken: 'cf-turnstile-valid-token-xyz',
        guestSessionId: 'vikram-whatsapp-webview-session-1',
      },
    });
    expect(guestVoteDuplicate.statusCode).toBe(200);
    expect(guestVoteDuplicate.json().totalVotes).toBe(1);

    // 4. Changing vote option from the same guest session moves their single vote to `marine`
    const guestVoteSwitch = await app.inject({
      method: 'POST',
      url: `/v1/t/rishi-lnd-4d/polls/${pollId}/vote`,
      payload: {
        optionId: 'marine',
        guestDisplayName: 'Vikram (WhatsApp)',
        turnstileToken: 'cf-turnstile-valid-token-xyz',
        guestSessionId: 'vikram-whatsapp-webview-session-1',
      },
    });
    expect(guestVoteSwitch.statusCode).toBe(200);
    expect(guestVoteSwitch.json().totalVotes).toBe(1);
    const marineOpt = guestVoteSwitch
      .json()
      .options.find((o: { id: string }) => o.id === 'marine');
    expect(marineOpt.voteCount).toBe(1);
  });

  it('serves zero-Google-Places open POI search, India-calibrated hill/metro transit estimates, and OTP + Sandbox Claim', async () => {
    bundle = await buildApp({ forceLocalStore: true, logger: false });
    const { app } = bundle;

    // 1. Health check
    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json().status).toBe('ok');

    // 2. Open POI Search (Varanasi)
    const poiRes = await app.inject({
      method: 'GET',
      url: '/v1/places/search?q=Kashi+Vishwanath',
    });
    expect(poiRes.statusCode).toBe(200);
    expect(poiRes.json().googlePlacesUsed).toBe(false);
    expect(poiRes.json().results[0].placeRefId).toContain('kashi-vishwanath');
    expect(poiRes.json().results[0].googleMapsUrl).toContain(
      'https://www.google.com/maps/search/?api=1'
    );

    // 3. India-calibrated Hill Switchback Transit Estimator (Rishikesh -> Landour departing 17:00)
    const hillTransit = await app.inject({
      method: 'POST',
      url: '/v1/geo/estimate-transit',
      payload: {
        origin: { lat: 30.1193, lng: 78.3125, name: 'Rishikesh' },
        destination: { lat: 30.4631, lng: 78.0972, name: 'Landour' },
        departureTimeHHMM: '17:00',
      },
    });
    expect(hillTransit.statusCode).toBe(200);
    const ht = hillTransit.json();
    expect(ht.profile).toBe('hill_switchback');
    expect(ht.distanceMultiplier).toBe(1.9);
    expect(ht.calibratedSpeedKmh).toBe(22);
    expect(
      ht.advisories.some((a: string) => a.toLowerCase().includes('sunset'))
    ).toBe(true);
    expect(ht.googleMapsUrl).toContain('https://www.google.com/maps/dir/?api=1');

    // 4. Metro Peak 18 km/h calibration
    const metroTransit = await app.inject({
      method: 'POST',
      url: '/v1/geo/estimate-transit',
      payload: {
        origin: { lat: 28.6429, lng: 77.2191, name: 'NDLS' },
        destination: { lat: 28.5562, lng: 77.1, name: 'DEL T3' },
        profile: 'metro_peak',
      },
    });
    expect(metroTransit.json().calibratedSpeedKmh).toBe(18);

    // 5. OTP Auth + Sandbox Claim
    const otpReq = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/request',
      payload: { phone: '+919900112233', channel: 'whatsapp' },
    });
    expect(otpReq.statusCode).toBe(200);
    const otp = otpReq.json().devOtpPreview as string;

    const otpVerify = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: {
        phone: '+919900112233',
        otp,
        displayName: 'Priya Menon',
        upiVpa: 'priya.m@okicici',
      },
    });
    expect(otpVerify.statusCode).toBe(200);
    const token = otpVerify.json().token as string;

    const claimRes = await app.inject({
      method: 'POST',
      url: '/v1/trips/claim-sandbox',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        title: 'Munnar & Kochi 3D Family Plan',
        destinationSummary: 'Fort Kochi · Munnar Tea Gardens',
        days: [
          { dayNumber: 1, date: '2026-12-24', themeTitle: 'Fort Kochi Walk' },
          { dayNumber: 2, date: '2026-12-25', themeTitle: 'Munnar Ghat Drive' },
        ],
        items: [
          {
            dayNumber: 1,
            kind: 'activity',
            title: 'Chinese Fishing Nets Sunset',
            startTime: '17:30',
          },
          {
            kind: 'meal',
            title: 'Kashi Art Cafe',
            isShortlist: true,
          },
        ],
      },
    });
    expect(claimRes.statusCode).toBe(201);
    expect(claimRes.json().days).toHaveLength(2);
    expect(claimRes.json().items).toHaveLength(1);
    expect(claimRes.json().shortlist).toHaveLength(1);
  });
});
