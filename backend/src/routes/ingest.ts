import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { env, type AppEnv } from '../config/env.js';
import {
  extractTextFromBufferAsync,
  redactAadhaarInText,
} from '../modules/ingest/classifier.js';
import { runHybridTextIngestion } from '../modules/ingest/pipeline.js';
import { extractStopsFromSocialLink } from '../modules/ingest/parsers/social.js';
import {
  defaultMumbaiVault,
  getVaultQuotaForTier,
  VaultQuotaExceededError,
  type MumbaiS3VaultService,
} from '../modules/ingest/s3-vault.js';
import { requireTripAccess } from '../security/permissions.js';
import {
  BookingVaultViewSchema,
  ItineraryItemSchema,
  ItemKindSchema,
} from '../types/domain.js';
import type { TripStore } from '../store/repository.js';
import type { RealtimeAndQueueBus } from '../store/pubsub.js';

export interface IngestPluginOpts {
  store: TripStore;
  bus: RealtimeAndQueueBus;
  config?: AppEnv;
  vault?: MumbaiS3VaultService;
}

const ErrorSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
});

const ExtractedSocialStopSchema = z.object({
  title: z.string(),
  kind: ItemKindSchema,
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  placeRefId: z.string().nullable(),
  addressLocalScript: z.string().nullable(),
  dietaryFlags: z.array(z.string()),
  accessibilityNotes: z.string(),
  googleMapsUrl: z.string().nullable(),
  confidence: z.number(),
  needsVerification: z.boolean(),
});

const IngestPipelineResponseSchema = z.object({
  stageUsed: z.enum([
    'stage2_deterministic',
    'stage3_vertex_mumbai',
    'social_oembed',
  ]),
  detectedKind: z.string(),
  aadhaarRedactions: z.number().int().nonnegative(),
  sanitizedExcerpt: z.string(),
  requiresAmberVerification: z.boolean(),
  parsedBooking: z
    .object({
      provider: z.string(),
      pnrMasked: z.string().nullable(),
      status: z.string(),
      summary: z.record(z.string(), z.unknown()),
      parserConfidence: z.number(),
      lowConfidenceFields: z.array(z.string()),
      suggestedTitle: z.string(),
      suggestedDate: z.string().nullable(),
      suggestedStartTime: z.string().nullable(),
    })
    .nullable(),
  savedBooking: BookingVaultViewSchema.nullable(),
  savedShortlistItems: z.array(ItineraryItemSchema),
  extractedSocialStops: z.array(ExtractedSocialStopSchema),
});

function verifyWebhookHmac(
  req: FastifyRequest & { rawWebhookBody?: Buffer },
  reply: FastifyReply,
  cfg: AppEnv
): boolean {
  const secret = cfg.WEBHOOK_HMAC_SECRET?.trim();
  if (!secret) {
    if (cfg.NODE_ENV === 'production') {
      void reply.code(503).send({
        error: 'webhook_unconfigured',
        message: 'WEBHOOK_HMAC_SECRET is not configured on this server.',
      });
      return false;
    }
    return true;
  }

  const rawHeader = req.headers['x-itinbee-signature'];
  const headerStr = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  if (!headerStr) {
    void reply.code(401).send({ error: 'Missing x-itinbee-signature header' });
    return false;
  }

  const providedHex = headerStr.trim().replace(/^sha256=/i, '').toLowerCase();
  const payloadBytes =
    req.rawWebhookBody ?? Buffer.from(JSON.stringify(req.body ?? {}), 'utf8');
  const expectedHex = crypto
    .createHmac('sha256', secret)
    .update(payloadBytes)
    .digest('hex');

  const sigBuf = Buffer.from(providedHex, 'utf8');
  const expBuf = Buffer.from(expectedHex, 'utf8');
  if (
    sigBuf.length !== expBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expBuf)
  ) {
    void reply.code(401).send({ error: 'Invalid webhook HMAC signature' });
    return false;
  }
  return true;
}

async function captureWebhookRawBody(
  req: FastifyRequest & { rawWebhookBody?: Buffer },
  _reply: FastifyReply,
  payload: NodeJS.ReadableStream
): Promise<NodeJS.ReadableStream> {
  const chunks: Buffer[] = [];
  for await (const chunk of payload) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const buf = Buffer.concat(chunks);
  req.rawWebhookBody = buf;
  return Readable.from(buf);
}

export const ingestRoutes: FastifyPluginAsyncZod<IngestPluginOpts> = async (
  app,
  opts
) => {
  const cfg = opts.config ?? env;
  const vault = opts.vault ?? defaultMumbaiVault;

  app.post(
    '/v1/ingest/text',
    {
      schema: {
        tags: ['Ingest'],
        summary:
          '3-Stage Hybrid Ingestion for pasted IRCTC/flight/bus/stay SMS, confirmation emails, or Hinglish notes',
        body: z.object({
          text: z.string().min(3),
          tripId: z.string().uuid().optional(),
          coTravellerConsent: z.boolean().default(false),
        }),
        response: {
          200: IngestPipelineResponseSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (req, reply) => {
      if (req.body.tripId) {
        const access = await requireTripAccess(
          req,
          reply,
          opts.store,
          req.body.tripId,
          { write: true, config: cfg }
        );
        if (!access) return;
      }

      const output = await runHybridTextIngestion(req.body.text);
      let savedBooking = null;
      const savedShortlistItems = [];

      if (req.body.tripId && output.bookingCandidate) {
        const c = output.bookingCandidate;
        const createdItem = await opts.store.createShortlistItem({
          tripId: req.body.tripId,
          kind: c.itemKind,
          title: c.suggestedTitle,
          notes: c.summary.headline,
        });
        savedShortlistItems.push(createdItem);

        savedBooking = await opts.store.createBooking({
          tripId: req.body.tripId,
          itemId: createdItem.id,
          provider: c.provider,
          pnr: c.pnr,
          passengers: c.passengers,
          summary: c.summary,
          lowConfidenceFields: c.lowConfidenceFields,
          status: c.status,
          parserConfidence: c.parserConfidence,
          coTravellerConsent: req.body.coTravellerConsent,
        });

        await opts.bus.publishTripEvent({
          type: 'booking_ingested',
          tripId: req.body.tripId,
          timestamp: new Date().toISOString(),
          payload: { bookingId: savedBooking.id, headline: c.summary.headline },
        });
      } else if (req.body.tripId && output.socialResult) {
        for (const stop of output.socialResult.stops) {
          const item = await opts.store.createShortlistItem({
            tripId: req.body.tripId,
            kind: stop.kind,
            title: stop.title,
            lat: stop.lat,
            lng: stop.lng,
            placeRefId: stop.placeRefId,
            addressLocalScript: stop.addressLocalScript,
            dietaryFlags: stop.dietaryFlags,
            accessibilityNotes: stop.accessibilityNotes,
          });
          savedShortlistItems.push(item);
        }
      }

      const c = output.bookingCandidate;
      return {
        stageUsed: output.stageUsed,
        detectedKind: output.detectedKind,
        aadhaarRedactions: output.aadhaarRedactions,
        sanitizedExcerpt: output.sanitizedExcerpt,
        requiresAmberVerification: output.requiresAmberVerification,
        parsedBooking: c
          ? {
              provider: c.provider,
              pnrMasked: c.pnr ? `••••••${c.pnr.slice(-3)}` : null,
              status: c.status,
              summary: c.summary as Record<string, unknown>,
              parserConfidence: c.parserConfidence,
              lowConfidenceFields: c.lowConfidenceFields,
              suggestedTitle: c.suggestedTitle,
              suggestedDate: c.suggestedDate,
              suggestedStartTime: c.suggestedStartTime,
            }
          : null,
        savedBooking,
        savedShortlistItems,
        extractedSocialStops: output.socialResult?.stops ?? [],
      };
    }
  );

  app.post(
    '/v1/ingest/file',
    {
      schema: {
        tags: ['Ingest'],
        summary:
          'Upload compressed booking PDF/image: masks Aadhaar, AES-256-GCM envelope-encrypts into R2/S3 or PostgreSQL vault, and parses booking',
        body: z.object({
          tripId: z.string().uuid(),
          fileName: z.string().min(1),
          mimeType: z.string().default('application/pdf'),
          contentBase64: z.string().min(1).optional(),
          fileBase64: z.string().min(1).optional(),
          extractedTextHint: z.string().optional(),
          coTravellerConsent: z.boolean().default(false),
        }),
        response: {
          200: IngestPipelineResponseSchema.extend({
            vaultRegion: z.literal('ap-south-1'),
            encryptedBytesStored: z.number().int().nonnegative(),
          }),
          400: ErrorSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
          413: ErrorSchema,
        },
      },
    },
    async (req, reply) => {
      const access = await requireTripAccess(
        req,
        reply,
        opts.store,
        req.body.tripId,
        { write: true, config: cfg }
      );
      if (!access) return;

      const b64Payload = req.body.contentBase64 ?? req.body.fileBase64;
      if (!b64Payload) {
        return reply
          .code(400)
          .send({ error: 'contentBase64 is required' });
      }
      const rawBuffer = Buffer.from(b64Payload, 'base64');
      if (rawBuffer.byteLength > 10 * 1024 * 1024) {
        return reply.code(413).send({
          error:
            'Single upload exceeds 10MB limit—downsample camera scan to WebP/compressed PDF first',
        });
      }

      const rawExtracted =
        req.body.extractedTextHint ??
        (await extractTextFromBufferAsync(rawBuffer, req.body.mimeType));

      // Run Stage 1 + Stage 2/3 first (which masks Aadhaar immediately)
      const output = await runHybridTextIngestion(rawExtracted);

      // Store encrypted document inside Vault (enforcing 50MB/trip free quota)
      const quotaBytes = getVaultQuotaForTier(access.claims?.tier ?? 'free');
      let vaultStored: { s3Key: string; encryptedSizeBytes: number };
      try {
        const isPlainTextUpload = req.body.mimeType
          .toLowerCase()
          .startsWith('text/');
        const bufferForVault =
          output.aadhaarRedactions > 0 && isPlainTextUpload
            ? Buffer.from(
                redactAadhaarInText(rawBuffer.toString('utf8')).redactedText,
                'utf8'
              )
            : rawBuffer;

        vaultStored = await vault.storeEncryptedBookingDoc({
          tripId: req.body.tripId,
          currentBytesUsed: access.trip.vaultBytesUsed,
          quotaBytes,
          rawBuffer: bufferForVault,
          mimeType: req.body.mimeType,
          fileName: req.body.fileName,
          store: opts.store,
        });
      } catch (err) {
        if (err instanceof VaultQuotaExceededError) {
          return reply.code(413).send({ error: err.message });
        }
        throw err;
      }

      let savedBooking = null;
      const savedShortlistItems = [];

      if (output.bookingCandidate) {
        const c = output.bookingCandidate;
        const createdItem = await opts.store.createShortlistItem({
          tripId: req.body.tripId,
          kind: c.itemKind,
          title: c.suggestedTitle,
          notes: c.summary.headline,
        });
        savedShortlistItems.push(createdItem);

        savedBooking = await opts.store.createBooking({
          tripId: req.body.tripId,
          itemId: createdItem.id,
          provider: c.provider,
          pnr: c.pnr,
          passengers: c.passengers,
          summary: c.summary,
          lowConfidenceFields: c.lowConfidenceFields,
          status: c.status,
          rawDocS3Key: vaultStored.s3Key,
          docSizeBytes: vaultStored.encryptedSizeBytes,
          docFileName: req.body.fileName,
          docMimeType: req.body.mimeType,
          parserConfidence: c.parserConfidence,
          coTravellerConsent: req.body.coTravellerConsent,
        });
      } else {
        savedBooking = await opts.store.createBooking({
          tripId: req.body.tripId,
          itemId: null,
          provider: 'manual',
          pnr: null,
          passengers: [],
          summary: { headline: req.body.fileName },
          lowConfidenceFields: [],
          status: 'confirmed',
          rawDocS3Key: vaultStored.s3Key,
          docSizeBytes: vaultStored.encryptedSizeBytes,
          docFileName: req.body.fileName,
          docMimeType: req.body.mimeType,
          parserConfidence: 0.5,
          coTravellerConsent: req.body.coTravellerConsent,
        });
      }

      await opts.bus.publishTripEvent({
        type: 'booking_ingested',
        tripId: req.body.tripId,
        timestamp: new Date().toISOString(),
        payload: {
          bookingId: savedBooking.id,
          headline: savedBooking.summary.headline,
        },
      });

      const c = output.bookingCandidate;
      return {
        stageUsed: output.stageUsed,
        detectedKind: output.detectedKind,
        aadhaarRedactions: output.aadhaarRedactions,
        sanitizedExcerpt: output.sanitizedExcerpt,
        requiresAmberVerification: output.requiresAmberVerification,
        parsedBooking: c
          ? {
              provider: c.provider,
              pnrMasked: c.pnr ? `••••••${c.pnr.slice(-3)}` : null,
              status: c.status,
              summary: c.summary as Record<string, unknown>,
              parserConfidence: c.parserConfidence,
              lowConfidenceFields: c.lowConfidenceFields,
              suggestedTitle: c.suggestedTitle,
              suggestedDate: c.suggestedDate,
              suggestedStartTime: c.suggestedStartTime,
            }
          : null,
        savedBooking,
        savedShortlistItems,
        extractedSocialStops: output.socialResult?.stops ?? [],
        vaultRegion: 'ap-south-1' as const,
        encryptedBytesStored: vaultStored.encryptedSizeBytes,
      };
    }
  );

  app.post(
    '/v1/ingest/link',
    {
      schema: {
        tags: ['Ingest'],
        summary:
          'Extract geo-grounded Shortlist Idea Cards from Instagram Reel / YouTube Short oEmbed & caption (zero scraping)',
        body: z.object({
          url: z.string().url(),
          captionOrTranscript: z.string().optional(),
          tripId: z.string().uuid().optional(),
        }),
        response: {
          200: z.object({
            platform: z.enum(['instagram', 'youtube', 'web']),
            sourceUrl: z.string(),
            stops: z.array(ExtractedSocialStopSchema),
            savedShortlistItems: z.array(ItineraryItemSchema),
          }),
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (req, reply) => {
      if (req.body.tripId) {
        const access = await requireTripAccess(
          req,
          reply,
          opts.store,
          req.body.tripId,
          { write: true, config: cfg }
        );
        if (!access) return;
      }

      const social = await extractStopsFromSocialLink({
        url: req.body.url,
        captionOrTranscript: req.body.captionOrTranscript,
      });

      const savedShortlistItems = [];
      if (req.body.tripId) {
        for (const stop of social.stops) {
          const item = await opts.store.createShortlistItem({
            tripId: req.body.tripId,
            kind: stop.kind,
            title: stop.title,
            notes: `From ${social.platform}: ${social.sourceUrl}`,
            lat: stop.lat,
            lng: stop.lng,
            placeRefId: stop.placeRefId,
            addressLocalScript: stop.addressLocalScript,
            dietaryFlags: stop.dietaryFlags,
            accessibilityNotes: stop.accessibilityNotes,
          });
          savedShortlistItems.push(item);
        }
      }

      return {
        platform: social.platform,
        sourceUrl: social.sourceUrl,
        stops: social.stops,
        savedShortlistItems,
      };
    }
  );

  app.post(
    '/v1/webhooks/inbound-email',
    {
      preParsing: [captureWebhookRawBody],
      schema: {
        tags: ['Webhooks'],
        summary:
          'HMAC-verified Cloudflare Email Routing webhook for forwarded confirmations to trips@itinbee.com',
        body: z.object({
          from: z.string(),
          to: z.string().default('trips@itinbee.com'),
          subject: z.string().default(''),
          textBody: z.string().optional(),
          htmlBody: z.string().optional(),
          tripId: z.string().uuid().optional(),
        }),
        response: {
          202: z.object({
            accepted: z.boolean(),
            jobId: z.string(),
            aadhaarRedactions: z.number().int().nonnegative(),
            headline: z.string().nullable(),
          }),
          401: ErrorSchema,
          503: ErrorSchema,
        },
      },
    },
    async (req, reply) => {
      if (!verifyWebhookHmac(req, reply, cfg)) return;

      const combined = [
        req.body.subject,
        req.body.textBody ?? '',
        req.body.htmlBody ?? '',
      ].join('\n');

      const parsed = await runHybridTextIngestion(combined);
      const jobId = await opts.bus.enqueueIngestJob({
        jobType: 'text',
        tripId: req.body.tripId,
        rawText: parsed.sanitizedExcerpt,
      });

      return reply.code(202).send({
        accepted: true,
        jobId,
        aadhaarRedactions: parsed.aadhaarRedactions,
        headline: parsed.bookingCandidate?.summary.headline ?? null,
      });
    }
  );

  app.post(
    '/v1/webhooks/whatsapp',
    {
      preParsing: [captureWebhookRawBody],
      schema: {
        tags: ['Webhooks'],
        summary: 'HMAC-verified WhatsApp Cloud API webhook for forwarded tickets & social links',
        body: z.object({
          senderPhone: z.string(),
          messageText: z.string().min(1),
          tripId: z.string().uuid().optional(),
        }),
        response: {
          200: z.object({
            replyMessage: z.string(),
            aadhaarRedactions: z.number().int().nonnegative(),
            requiresVerification: z.boolean(),
          }),
          401: ErrorSchema,
          503: ErrorSchema,
        },
      },
    },
    async (req, reply) => {
      if (!verifyWebhookHmac(req, reply, cfg)) return;

      const output = await runHybridTextIngestion(req.body.messageText);

      if (output.bookingCandidate) {
        const c = output.bookingCandidate;
        if (req.body.tripId) {
          const item = await opts.store.createShortlistItem({
            tripId: req.body.tripId,
            kind: c.itemKind,
            title: c.suggestedTitle,
            notes: c.summary.headline,
          });
          const booking = await opts.store.createBooking({
            tripId: req.body.tripId,
            itemId: item.id,
            provider: c.provider,
            pnr: c.pnr,
            passengers: c.passengers,
            summary: c.summary,
            lowConfidenceFields: c.lowConfidenceFields,
            status: c.status,
            parserConfidence: c.parserConfidence,
          });
          await opts.bus.publishTripEvent({
            type: 'booking_ingested',
            tripId: req.body.tripId,
            timestamp: new Date().toISOString(),
            payload: { bookingId: booking.id, headline: c.summary.headline },
          });
        }
        const verifyNote = output.requiresAmberVerification
          ? ' (Tap to verify highlighted details)'
          : '';
        return {
          replyMessage: `Added ${c.summary.headline}${verifyNote}`,
          aadhaarRedactions: output.aadhaarRedactions,
          requiresVerification: output.requiresAmberVerification,
        };
      }

      const stopCount = output.socialResult?.stops.length ?? 0;
      return {
        replyMessage:
          stopCount > 0
            ? `Saved ${stopCount} stop(s) to your Itinbee Shortlist.`
            : 'Saved note to your Itinbee Shortlist.',
        aadhaarRedactions: output.aadhaarRedactions,
        requiresVerification: output.requiresAmberVerification,
      };
    }
  );
};
