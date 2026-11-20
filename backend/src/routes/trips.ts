import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CurrencyCodeSchema,
  GuestShareResponseSchema,
  ItemKindSchema,
  MemberRoleSchema,
  PacingLevelSchema,
  TripMetaSchema,
  TripWorkspaceResponseSchema,
} from '../types/domain.js';
import type { TripStore } from '../store/repository.js';
import type { RealtimeAndQueueBus } from '../store/pubsub.js';
import { extractAuthClaims } from './auth-helper.js';
import { SEED_IDS } from '../store/seed-data.js';

export interface TripsPluginOpts {
  store: TripStore;
  bus: RealtimeAndQueueBus;
}

export const tripsRoutes: FastifyPluginAsyncZod<TripsPluginOpts> = async (
  app,
  opts
) => {
  app.get(
    '/v1/trips',
    {
      schema: {
        tags: ['Trips'],
        summary: 'List curated sample/template itineraries and user workspaces',
        response: {
          200: z.object({
            trips: z.array(TripMetaSchema),
          }),
        },
      },
    },
    async (req) => {
      const claims = extractAuthClaims(req);
      const trips = await opts.store.listSampleAndUserTrips(claims?.sub ?? null);
      return { trips };
    }
  );

  app.post(
    '/v1/trips',
    {
      schema: {
        tags: ['Trips'],
        summary: 'Create a new collaborative trip workspace',
        body: z.object({
          title: z.string().min(1).max(140),
          destinationSummary: z.string().max(240).optional(),
          startDate: z.string().nullable().optional(),
          endDate: z.string().nullable().optional(),
          homeCurrency: CurrencyCodeSchema.default('INR'),
          elderModeEnabled: z.boolean().default(true),
          isPublicTemplate: z.boolean().default(false),
          daysCount: z.number().int().min(1).max(30).default(3),
          ownerId: z.string().uuid().optional(),
        }),
        response: {
          201: TripWorkspaceResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const claims = extractAuthClaims(req);
      const ownerId =
        claims?.sub ?? req.body.ownerId ?? SEED_IDS.users.ananya;

      const ws = await opts.store.createTrip({
        ownerId,
        title: req.body.title,
        destinationSummary: req.body.destinationSummary,
        startDate: req.body.startDate,
        endDate: req.body.endDate,
        homeCurrency: req.body.homeCurrency,
        elderModeEnabled: req.body.elderModeEnabled,
        isPublicTemplate: req.body.isPublicTemplate,
        daysCount: req.body.daysCount,
      });

      return reply.code(201).send(ws);
    }
  );

  app.post(
    '/v1/trips/claim-sandbox',
    {
      schema: {
        tags: ['Trips'],
        summary:
          'Atomically migrate a local IndexedDB zero-signup sandbox draft into a cloud-synced trip',
        body: z.object({
          ownerId: z.string().uuid().optional(),
          title: z.string().min(1).max(140),
          destinationSummary: z.string().max(240).optional(),
          startDate: z.string().nullable().optional(),
          endDate: z.string().nullable().optional(),
          homeCurrency: CurrencyCodeSchema.default('INR'),
          elderModeEnabled: z.boolean().default(true),
          days: z
            .array(
              z.object({
                id: z.string().uuid().optional(),
                dayNumber: z.number().int().min(1),
                date: z.string().nullable().optional(),
                themeTitle: z.string().optional(),
                pacingLevel: PacingLevelSchema.optional(),
              })
            )
            .default([]),
          items: z
            .array(
              z.object({
                id: z.string().uuid().optional(),
                dayNumber: z.number().int().nullable().optional(),
                dayId: z.string().uuid().nullable().optional(),
                kind: ItemKindSchema,
                title: z.string().min(1),
                notes: z.string().optional(),
                lat: z.number().nullable().optional(),
                lng: z.number().nullable().optional(),
                placeRefId: z.string().nullable().optional(),
                addressLocalScript: z.string().nullable().optional(),
                sortKey: z.string().optional(),
                startTime: z.string().nullable().optional(),
                durationMins: z.number().int().nullable().optional(),
                dietaryFlags: z.array(z.string()).optional(),
                accessibilityNotes: z.string().optional(),
                elderSummaryI18n: z
                  .object({
                    en: z.string().optional(),
                    hi: z.string().optional(),
                  })
                  .optional(),
                isShortlist: z.boolean().optional(),
              })
            )
            .default([]),
        }),
        response: {
          201: TripWorkspaceResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const claims = extractAuthClaims(req);
      const ownerId =
        claims?.sub ?? req.body.ownerId ?? SEED_IDS.users.ananya;

      const ws = await opts.store.claimSandboxTrip({
        ...req.body,
        ownerId,
      });

      return reply.code(201).send(ws);
    }
  );

  app.get(
    '/v1/trips/:id',
    {
      schema: {
        tags: ['Trips'],
        summary:
          'Fetch full collaborative trip workspace (vault fields unlocked only for vault_access members)',
        params: z.object({
          id: z.string().uuid(),
        }),
        response: {
          200: TripWorkspaceResponseSchema,
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const claims = extractAuthClaims(req);
      const ws = await opts.store.getTripWorkspace(
        req.params.id,
        claims?.sub ?? null
      );
      if (!ws) {
        return reply.code(404).send({ error: 'Trip not found' });
      }
      return ws;
    }
  );

  app.post(
    '/v1/trips/:id/members',
    {
      schema: {
        tags: ['Trips'],
        summary: 'Add or update a co-traveller membership & dietary tags',
        params: z.object({
          id: z.string().uuid(),
        }),
        body: z.object({
          userId: z.string().uuid(),
          role: MemberRoleSchema.default('contributor'),
          vaultAccess: z.boolean().optional(),
          dietaryTags: z.array(z.string()).default([]),
        }),
        response: {
          200: z.object({ ok: z.boolean() }),
        },
      },
    },
    async (req) => {
      await opts.store.addTripMember({
        tripId: req.params.id,
        userId: req.body.userId,
        role: req.body.role,
        vaultAccess: req.body.vaultAccess,
        dietaryTags: req.body.dietaryTags,
      });
      return { ok: true };
    }
  );

  app.get(
    '/v1/t/:shortId',
    {
      schema: {
        tags: ['Share'],
        summary:
          'Redacted <150KB WhatsApp Guest & Family/Elder Card projection (always redact_pii = true)',
        params: z.object({
          shortId: z.string().min(2).max(24),
        }),
        response: {
          200: GuestShareResponseSchema,
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const share = await opts.store.getGuestShareByShortId(req.params.shortId);
      if (!share) {
        return reply.code(404).send({ error: 'Shared itinerary not found' });
      }
      return share;
    }
  );

  app.get(
    '/v1/trips/:id/offline-bundle',
    {
      schema: {
        tags: ['Trips'],
        summary:
          'Fetch complete offline PWA bundle + regional Protomaps .pmtiles slice hint',
        params: z.object({
          id: z.string().uuid(),
        }),
        response: {
          200: z.object({
            generatedAt: z.string(),
            pmtilesRegionHint: z.string(),
            mapAttribution: z.string(),
            workspace: TripWorkspaceResponseSchema,
          }),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const claims = extractAuthClaims(req);
      const bundle = await opts.store.getOfflineBundle(
        req.params.id,
        claims?.sub ?? null
      );
      if (!bundle) {
        return reply.code(404).send({ error: 'Trip not found' });
      }
      return bundle;
    }
  );

  app.get(
    '/v1/trips/:id/bookings/:bookingId/live-status',
    {
      schema: {
        tags: ['Trips'],
        summary:
          'Check transport status (static parsed view on Free; quota-capped licensed B2B feed on Trip Pass/Pro; zero scraping)',
        params: z.object({
          id: z.string().uuid(),
          bookingId: z.string().uuid(),
        }),
        response: {
          200: z.object({
            bookingId: z.string().uuid(),
            provider: z.string(),
            pnrMasked: z.string().nullable(),
            status: z.string(),
            sourceMode: z.enum(['static_parsed_free', 'licensed_b2b_cached']),
            quotaRemaining: z.number().int().nonnegative(),
            checkedAt: z.string(),
          }),
          404: z.object({ error: z.string() }),
          429: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const booking = await opts.store.getBookingById(
        req.params.id,
        req.params.bookingId
      );
      if (!booking) {
        return reply.code(404).send({ error: 'Booking not found' });
      }

      const claims = extractAuthClaims(req);
      const tier = claims?.tier ?? 'free';

      if (tier === 'free') {
        return {
          bookingId: booking.id,
          provider: booking.provider,
          pnrMasked: booking.pnrMasked,
          status: booking.status,
          sourceMode: 'static_parsed_free' as const,
          quotaRemaining: 0,
          checkedAt: new Date().toISOString(),
        };
      }

      // Hard per-trip 6-B2B-poll quota per Plan 02 §1.2
      const quota = await opts.bus.consumeTripQuota(req.params.id, 'b2b_poll', 6);
      if (!quota.allowed) {
        return reply
          .code(429)
          .send({ error: 'Trip Pass B2B live-status poll quota (6/trip) exhausted' });
      }

      return {
        bookingId: booking.id,
        provider: booking.provider,
        pnrMasked: booking.pnrMasked,
        status: booking.status,
        sourceMode: 'licensed_b2b_cached' as const,
        quotaRemaining: Math.max(0, quota.limit - quota.used),
        checkedAt: new Date().toISOString(),
      };
    }
  );
};
