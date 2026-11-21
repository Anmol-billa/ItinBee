import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { env, type AppEnv } from '../config/env.js';
import { signAuthToken } from '../security/auth-tokens.js';
import type { TripStore } from '../store/repository.js';
import { extractAuthClaims } from './auth-helper.js';
import {
  ExplorePublishError,
  type ExploreService,
} from '../modules/explore/explore-service.js';
import {
  ExploreBudgetTierSchema,
  ExploreCardSchema,
  ExploreDetailSchema,
  ExploreListResponseSchema,
  ImageCreditSchema,
} from '../modules/explore/types.js';

export interface ExploreRoutesOpts {
  explore: ExploreService;
  store: TripStore;
  config?: AppEnv;
}

export const exploreRoutes: FastifyPluginAsyncZod<ExploreRoutesOpts> = async (
  app,
  opts
) => {
  const cfg = opts.config ?? env;
  const isProd = cfg.NODE_ENV === 'production';

  app.get(
    '/v1/explore',
    {
      schema: {
        tags: ['Explore'],
        summary:
          'Browse curated templates and user-published itineraries with hierarchical destination, duration, type, budget, and month filters',
        querystring: z.object({
          dest: z.string().trim().max(80).optional(),
          q: z.string().trim().max(120).optional(),
          days: z.string().trim().max(16).optional(),
          type: z.string().trim().max(160).optional(),
          budget: ExploreBudgetTierSchema.optional(),
          month: z.coerce.number().int().min(1).max(12).optional(),
          sort: z.enum(['popular', 'newest', 'shortest']).default('popular'),
          cursor: z.string().max(100).optional(),
          limit: z.coerce.number().int().min(1).max(60).default(24),
        }),
        response: {
          200: ExploreListResponseSchema,
        },
      },
    },
    async (req) => {
      return opts.explore.list(req.query);
    }
  );

  app.get(
    '/v1/explore/:slug',
    {
      schema: {
        tags: ['Explore'],
        summary: 'Fetch full day-by-day public itinerary detail for an Explore template or published trip',
        params: z.object({
          slug: z.string().min(1).max(100),
        }),
        response: {
          200: ExploreDetailSchema,
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const detail = await opts.explore.getDetail(req.params.slug);
      if (!detail) {
        return reply.code(404).send({ error: 'Itinerary not found' });
      }
      return detail;
    }
  );

  app.post(
    '/v1/explore/:slug/clone',
    {
      schema: {
        tags: ['Explore'],
        summary: 'Clone an Explore itinerary into a new editable trip draft owned by the caller (creates guest session if needed)',
        params: z.object({
          slug: z.string().min(1).max(100),
        }),
        response: {
          201: z.object({
            tripId: z.string().uuid(),
            shortId: z.string(),
          }),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      let ownerId: string | null = null;
      const claims = extractAuthClaims(req);
      if (claims) {
        const existingUser = await opts.store.getUserById(claims.sub);
        if (existingUser) {
          ownerId = existingUser.id;
        }
      }

      if (!ownerId) {
        const guest = await opts.store.createGuestUser('Traveller');
        ownerId = guest.id;
        const token = signAuthToken({
          sub: guest.id,
          displayName: guest.displayName,
          tier: guest.tier,
          guest: true,
        });
        reply.setCookie('itinbee_session', token, {
          httpOnly: true,
          sameSite: 'lax',
          secure: isProd,
          path: '/',
          maxAge: 60 * 60 * 24 * 30,
        });
      }

      const cloned = await opts.explore.cloneIntoStore(req.params.slug, ownerId);
      if (!cloned) {
        return reply.code(404).send({ error: 'Itinerary not found' });
      }
      return reply.code(201).send(cloned);
    }
  );

  app.post(
    '/v1/trips/:id/publish',
    {
      schema: {
        tags: ['Explore', 'Trips'],
        summary: 'Publish a user trip into the public Explore catalogue',
        params: z.object({
          id: z.string().uuid(),
        }),
        body: z.object({
          slug: z.string().trim().min(2).max(80).optional(),
          summary: z.string().trim().max(400).optional(),
          tripTypes: z.array(z.string().trim().min(1).max(40)).min(1).max(8),
          budgetTier: ExploreBudgetTierSchema.optional(),
          bestMonths: z.array(z.number().int().min(1).max(12)).max(12).optional(),
          coverImage: ImageCreditSchema.optional(),
        }),
        response: {
          200: ExploreCardSchema,
          400: z.object({ error: z.string() }),
          403: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const claims = extractAuthClaims(req);
      try {
        const card = await opts.explore.publishTrip({
          tripId: req.params.id,
          requesterUserId: claims?.sub ?? null,
          slug: req.body.slug,
          summary: req.body.summary,
          tripTypes: req.body.tripTypes,
          budgetTier: req.body.budgetTier,
          bestMonths: req.body.bestMonths,
          coverImage: req.body.coverImage,
        });
        return card;
      } catch (err) {
        if (err instanceof ExplorePublishError) {
          return reply.code(err.statusCode).send({ error: err.message });
        }
        throw err;
      }
    }
  );
};
