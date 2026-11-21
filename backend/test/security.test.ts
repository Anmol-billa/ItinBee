import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, type BuiltAppBundle } from '../src/app.js';
import { KmsEnvelopeService } from '../src/security/kms-envelope.js';
import { signAccessToken, signAuthToken } from '../src/security/auth-tokens.js';
import { SEED_IDS } from '../src/store/seed-data.js';

describe('DPDPA 2023 PII Redaction, Vault Access Boundaries & KMS Envelope Encryption', () => {
  let bundle: BuiltAppBundle | null = null;

  afterEach(async () => {
    if (bundle) {
      await bundle.app.close();
      bundle = null;
    }
  });

  it('GET /v1/t/:shortId strictly enforces redact_pii = true and never leaks full PNRs, S3 keys, Aadhaar numbers, or co-traveller demographics', async () => {
    bundle = await buildApp({ forceLocalStore: true, logger: false });
    const { app } = bundle;

    // Test both Rishikesh–Landour (IRCTC PNR 2451987842) and Varanasi Senior Yatra (IRCTC PNR 8910442639)
    for (const check of [
      {
        shortId: 'rishi-lnd-4d',
        secretFullPnr: '2451987842',
        expectedMasked: '••••••842',
        secretAadhaarPrefix: '4589-2310',
      },
      {
        shortId: 'kashi-snr-3d',
        secretFullPnr: '8910442639',
        expectedMasked: '••••••639',
        secretAadhaarPrefix: '8832-1190',
      },
      {
        shortId: 'goa-south-5d',
        secretFullPnr: 'K8M4Q2',
        expectedMasked: '••••••4Q2',
        secretAadhaarPrefix: '6721-9043',
      },
    ]) {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/t/${check.shortId}`,
      });
      expect(res.statusCode).toBe(200);

      const rawText = res.body;
      const body = res.json();

      expect(body.redactPii).toBe(true);
      expect(body.bookings.length).toBeGreaterThan(0);
      expect(body.bookings[0].pnrMasked).toBe(check.expectedMasked);

      // Zero leakage assertions across the ENTIRE serialized JSON payload
      expect(rawText).not.toContain(check.secretFullPnr);
      expect(rawText).not.toContain(check.secretAadhaarPrefix);
      expect(rawText).not.toContain('pnrEnc');
      expect(rawText).not.toContain('pnr_enc');
      expect(rawText).not.toContain('pnrPlain');
      expect(rawText).not.toContain('rawDocS3Key');
      expect(rawText).not.toContain('raw_doc_s3_key');
      expect(rawText).not.toContain('itinbee-vault-ap-south-1');
      expect(rawText).not.toContain('passengerMetaEnc');
    }
  });

  it('unlocks decrypted PNR on GET /v1/trips/:id ONLY for authenticated members with vault_access = true while still stripping unconsented co-traveller age/gender', async () => {
    bundle = await buildApp({ forceLocalStore: true, logger: false });
    const { app } = bundle;

    // 1. Unauthenticated caller on GET /v1/trips/:id -> pnrPlain must be null and passengers empty
    const unauthRes = await app.inject({
      method: 'GET',
      url: `/v1/trips/${SEED_IDS.trips.rishikeshLandour}`,
    });
    expect(unauthRes.statusCode).toBe(200);
    expect(unauthRes.json().bookings[0].pnrPlain).toBeNull();
    expect(unauthRes.json().bookings[0].passengers).toEqual([]);

    // 2. Authenticated Contributor WITHOUT vault_access (`karthik` on South Goa) -> pnrPlain must be null
    const contributorToken = signAuthToken({
      sub: SEED_IDS.users.karthik,
      displayName: 'Karthik Nair',
      tier: 'free',
    });
    const contribRes = await app.inject({
      method: 'GET',
      url: `/v1/trips/${SEED_IDS.trips.southGoa}`,
      headers: { authorization: `Bearer ${contributorToken}` },
    });
    expect(contribRes.statusCode).toBe(200);
    expect(contribRes.json().bookings[0].pnrPlain).toBeNull();

    // 3. Authenticated Owner WITH vault_access (`ananya` on Rishikesh–Landour) -> unlocks pnrPlain
    //    AND still strips unconsented co-traveller (2nd passenger) age/gender + masks Aadhaar to last 4
    const ownerToken = signAuthToken({
      sub: SEED_IDS.users.ananya,
      displayName: 'Ananya Sharma',
      tier: 'free',
    });
    const ownerRes = await app.inject({
      method: 'GET',
      url: `/v1/trips/${SEED_IDS.trips.rishikeshLandour}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(ownerRes.statusCode).toBe(200);
    const unlockedBooking = ownerRes.json().bookings[0];
    expect(unlockedBooking.pnrPlain).toBe('2451987842');
    expect(unlockedBooking.passengers).toHaveLength(2);
    expect(unlockedBooking.passengers[0].idNumberMasked).toBe('XXXX-XXXX-7741');
    // Unconsented co-traveller age & gender stripped per DPDPA 2023
    expect(unlockedBooking.passengers[1].name).toBe('Meera Iyer');
    expect(unlockedBooking.passengers[1].age).toBeNull();
    expect(unlockedBooking.passengers[1].gender).toBeNull();
    expect(unlockedBooking.passengers[1].idNumberMasked).toBe('XXXX-XXXX-1198');
  });

  it('verifies AES-256-GCM DEK envelope encryption roundtrip and rejects AAD / ciphertext tampering', async () => {
    const kms = new KmsEnvelopeService();
    const secret = 'PNR:2451987842|Coach:B4|Berth:32';
    const aad = 'booking:trip-123:b-456:pnr';

    const encrypted = await kms.encryptString(secret, aad);
    expect(encrypted.toString('utf8')).not.toContain('2451987842');

    const decrypted = await kms.decryptString(encrypted, aad);
    expect(decrypted).toBe(secret);

    // Wrong AAD context (cross-record swap attack) must fail AES-GCM authentication
    await expect(
      kms.decryptString(encrypted, 'booking:trip-999:b-456:pnr')
    ).rejects.toThrow();
  });

  it('redacts Aadhaar numbers on POST /v1/ingest/file and enforces Mumbai vault upload & 10MB scan limit', async () => {
    bundle = await buildApp({ forceLocalStore: true, logger: false });
    const { app } = bundle;

    const fakePdfText = `
      %PDF-1.4
      (IRCTC Electronic Reservation Slip) Tj
      (PNR No: 6654321890) Tj
      (Train No./Name: 12002 / BHOPAL SHATABDI) Tj
      (Passenger Aadhaar: 5432 8765 9912) Tj
      (1. ANANYA SHARMA  29  F  CNF/C2/18) Tj
    `;

    const ownerToken = signAccessToken({
      sub: SEED_IDS.users.ananya,
      displayName: 'Ananya Sharma',
      tier: 'free',
    });

    const uploadRes = await app.inject({
      method: 'POST',
      url: '/v1/ingest/file',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        tripId: SEED_IDS.trips.rishikeshLandour,
        fileName: 'irctc-ticket.pdf',
        mimeType: 'application/pdf',
        contentBase64: Buffer.from(fakePdfText, 'utf8').toString('base64'),
      },
    });

    expect(uploadRes.statusCode).toBe(200);
    const body = uploadRes.json();
    expect(body.vaultRegion).toBe('ap-south-1');
    expect(body.aadhaarRedactions).toBe(1);
    expect(body.sanitizedExcerpt).toContain('XXXX-XXXX-9912');
    expect(body.sanitizedExcerpt).not.toContain('5432 8765');
    expect(body.parsedBooking.pnrMasked).toBe('••••••890');

    // Public share link for that trip still never exposes the newly uploaded PNR `6654321890`
    const publicCheck = await app.inject({
      method: 'GET',
      url: '/v1/t/rishi-lnd-4d',
    });
    expect(publicCheck.body).not.toContain('6654321890');
    expect(publicCheck.body).toContain('••••••890');
  });
});
