import crypto from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { PackNotSupportedError } from '../modules/places/pack-service.js';
import { isPackBuildable } from '../modules/places/pack-builder.js';
import type { PlacesServices } from '../modules/places/places-module.js';
import type { LivePlace } from '../modules/places/places-service.js';
import { PLACE_CATEGORIES, DESTINATION_KINDS } from '../modules/places/types.js';
import type {
  DestinationRecord,
  PackStatus,
  PlaceRecord,
} from '../modules/places/types.js';
import { isValidLatLng } from '../modules/places/util/geo.js';

export const PLACES_ATTRIBUTION =
  'Place data © OpenStreetMap contributors (ODbL) · Wikivoyage & Wikipedia text CC BY-SA 4.0 · Wikidata CC0 · Images: Wikimedia Commons (per-image licence)';

const ImageSchema = z.object({
  url: z.string(),
  author: z.string().nullable(),
  license: z.string().nullable(),
  licenseUrl: z.string().nullable(),
  sourceUrl: z.string().nullable(),
});

const SourceSchema = z.object({
  provider: z.enum(['wikivoyage', 'wikipedia', 'wikidata', 'osm', 'commons', 'curated']),
  fields: z.array(z.string()),
  license: z.string(),
  url: z.string().nullable(),
  ref: z.string().nullable(),
  retrievedAt: z.string(),
});

const CategorySchema = z.enum(PLACE_CATEGORIES);
const PackStatusSchema = z.enum(['none', 'building', 'ready', 'stale']);

const PlaceSchema = z.object({
  id: z.string(),
  refId: z.string(),
  name: z.string(),
  nameLocal: z.record(z.string()),
  category: CategorySchema,
  subtype: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  address: z.string().nullable(),
  website: z.string().nullable(),
  openingHours: z.string().nullable(),
  description: z.string().nullable(),
  whyVisit: z.string().nullable(),
  typicalDurationMins: z.number().int().nullable(),
  bestTime: z.string().nullable(),
  dietaryHints: z.array(z.string()),
  image: ImageSchema.nullable(),
  /** 0-1 "Popular" signal (Wikipedia pageviews, Wikidata sitelinks, tag completeness, Wikivoyage prominence). Not a rating. */
  popularity: z.number(),
  distanceM: z.number().nullable(),
  /** `pack`: Destination Pack row; `curated`: hand-curated seed row; `live`: temporary Wikipedia geosearch fallback. */
  origin: z.enum(['pack', 'curated', 'live']),
  wikipediaUrl: z.string().nullable(),
  wikidataId: z.string().nullable(),
  sources: z.array(SourceSchema),
});
type PlaceDto = z.infer<typeof PlaceSchema>;

const DestinationSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  kind: z.enum(DESTINATION_KINDS),
  parentSlug: z.string().nullable(),
  countryCode: z.string(),
  lat: z.number(),
  lng: z.number(),
  aliases: z.array(z.string()),
  bestMonths: z.array(z.number().int()),
  heroImage: ImageSchema.nullable(),
  packStatus: PackStatusSchema,
});
type DestinationSummaryDto = z.infer<typeof DestinationSummarySchema>;

const TreeLeaf = DestinationSummarySchema;
const TreeL2 = DestinationSummarySchema.extend({ children: z.array(TreeLeaf) });
const TreeL1 = DestinationSummarySchema.extend({ children: z.array(TreeL2) });
const TreeRoot = DestinationSummarySchema.extend({ children: z.array(TreeL1) });
interface TreeNodeDto extends DestinationSummaryDto {
  children: TreeNodeDto[];
}

const PackInfoSchema = z.object({
  status: PackStatusSchema,
  buildable: z.boolean(),
  builtAt: z.string().nullable(),
  startedAt: z.string().nullable(),
  attemptedAt: z.string().nullable(),
  error: z.string().nullable(),
  stats: z.record(z.unknown()),
});

function wikipediaUrl(title: string | null): string | null {
  return title ? `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}` : null;
}

function placeToDto(p: PlaceRecord, distanceM: number | null): PlaceDto {
  return {
    id: p.id,
    refId: p.refId,
    name: p.name,
    nameLocal: p.nameLocal,
    category: p.category,
    subtype: p.subtype,
    lat: p.lat,
    lng: p.lng,
    address: p.address,
    website: p.website,
    openingHours: p.openingHours,
    description: p.description,
    whyVisit: p.whyVisit,
    typicalDurationMins: p.typicalDurationMins,
    bestTime: p.bestTime,
    dietaryHints: p.dietaryHints,
    image: p.image,
    popularity: p.popularity,
    distanceM,
    origin: p.sources.length > 0 && p.sources.every((s) => s.provider === 'curated') ? 'curated' : 'pack',
    wikipediaUrl: wikipediaUrl(p.wikipediaTitle),
    wikidataId: p.wikidataId,
    sources: p.sources,
  };
}

function livePlaceToDto(p: LivePlace, retrievedAt: string): PlaceDto {
  return {
    id: p.id,
    refId: p.id,
    name: p.name,
    nameLocal: {},
    category: p.category,
    subtype: p.subtype,
    lat: p.lat,
    lng: p.lng,
    address: null,
    website: null,
    openingHours: null,
    description: p.description,
    whyVisit: null,
    typicalDurationMins: null,
    bestTime: null,
    dietaryHints: [],
    image: p.imageUrl
      ? { url: p.imageUrl, author: null, license: null, licenseUrl: null, sourceUrl: wikipediaUrl(p.wikipediaTitle) }
      : null,
    popularity: 0,
    distanceM: p.distanceM,
    origin: 'live',
    wikipediaUrl: wikipediaUrl(p.wikipediaTitle),
    wikidataId: p.wikidataId,
    sources: [
      {
        provider: 'wikipedia',
        fields: ['name', 'location', 'description'],
        license: 'CC BY-SA 4.0',
        url: wikipediaUrl(p.wikipediaTitle),
        ref: null,
        retrievedAt,
      },
    ],
  };
}

const latLngParse = (v: string): { lat: number; lng: number } | null => {
  const m = v.split(',').map((x) => Number(x.trim()));
  if (m.length !== 2 || m.some((n) => !Number.isFinite(n))) return null;
  const [lat, lng] = m as [number, number];
  return isValidLatLng(lat, lng) ? { lat, lng } : null;
};

export const placesRoutes: FastifyPluginAsyncZod<{ services: PlacesServices }> = async (app, opts) => {
  const { services } = opts;
  const { repo, packs, places } = services;

  async function summarize(d: DestinationRecord, parentSlugById?: Map<string, string>): Promise<DestinationSummaryDto> {
    let parentSlug: string | null = null;
    if (d.parentId) {
      parentSlug =
        parentSlugById?.get(d.parentId) ?? (await repo.getDestinationById(d.parentId))?.slug ?? null;
    }
    return {
      id: d.id,
      slug: d.slug,
      name: d.name,
      kind: d.kind,
      parentSlug,
      countryCode: d.countryCode,
      lat: d.lat,
      lng: d.lng,
      aliases: d.aliases,
      bestMonths: d.bestMonths,
      heroImage: d.heroImage,
      packStatus: packs.effectiveStatus(d) as PackStatus,
    };
  }

  function requireAdmin(req: FastifyRequest, reply: FastifyReply): boolean {
    const configured = services.adminToken;
    if (!configured) {
      if (services.nodeEnv === 'production') {
        void reply.code(403).send({ error: 'ADMIN_TOKEN is not configured; pack rebuilds are disabled' });
        return false;
      }
      return true;
    }
    const header = req.headers['x-admin-token'];
    const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    const provided = (Array.isArray(header) ? header[0] : header) ?? bearer ?? '';
    const a = Buffer.from(provided);
    const b = Buffer.from(configured);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
    void reply.code(401).send({ error: 'Invalid or missing admin token' });
    return false;
  }

  // ---------------------------------------------------------------- autocomplete
  app.get(
    '/v1/geo/autocomplete',
    {
      schema: {
        tags: ['Geo'],
        summary:
          'Destination/place typeahead: local destinations (instant) merged with cached Photon (OSM) results. Debounce >= 250 ms.',
        querystring: z.object({
          q: z.string().trim().min(2).max(100),
          lat: z.coerce.number().min(-90).max(90).optional(),
          lng: z.coerce.number().min(-180).max(180).optional(),
          lang: z.string().min(2).max(5).optional(),
          limit: z.coerce.number().int().min(1).max(15).default(10),
        }),
        response: {
          200: z.object({
            query: z.string(),
            results: z.array(
              z.object({
                id: z.string(),
                source: z.enum(['destination', 'photon']),
                slug: z.string().nullable(),
                name: z.string(),
                secondary: z.string(),
                kind: z.enum(['country', 'state', 'region', 'city', 'area', 'place']),
                lat: z.number(),
                lng: z.number(),
                countryCode: z.string().nullable(),
                packStatus: PackStatusSchema.nullable(),
              })
            ),
            cached: z.boolean(),
            photonAvailable: z.boolean(),
            attribution: z.string(),
          }),
          429: z.object({ error: z.string(), retryAfterSec: z.number() }),
        },
      },
    },
    async (req, reply) => {
      const gate = services.autocompleteLimiter.check(req.ip);
      if (!gate.allowed) {
        void reply.header('Retry-After', String(gate.retryAfterSec));
        return reply.code(429).send({ error: 'Too many autocomplete requests', retryAfterSec: gate.retryAfterSec });
      }
      const out = await places.autocomplete(req.query.q, {
        lat: req.query.lat,
        lng: req.query.lng,
        lang: req.query.lang,
        limit: req.query.limit,
      });
      void reply.header('Cache-Control', 'public, max-age=60');
      void reply.header('X-Cache', out.cached ? 'HIT' : 'MISS');
      return reply.code(200).send({
        query: req.query.q,
        results: out.results,
        cached: out.cached,
        photonAvailable: out.photonAvailable,
        attribution: '© OpenStreetMap contributors (Photon) · Itinbee destinations',
      });
    }
  );

  // ---------------------------------------------------------------- destinations
  app.get(
    '/v1/destinations',
    {
      schema: {
        tags: ['Destinations'],
        summary: 'List destinations (countries, states, regions, cities, areas). `tree=true` returns the full nested hierarchy.',
        querystring: z.object({
          kind: z.enum(DESTINATION_KINDS).optional(),
          country: z.string().length(2).optional(),
          q: z.string().trim().min(1).max(80).optional(),
          parent: z.string().max(80).optional(),
          tree: z
            .enum(['true', 'false'])
            .default('false')
            .transform((v) => v === 'true'),
        }),
        response: {
          200: z.object({
            destinations: z.array(DestinationSummarySchema),
            tree: z.array(TreeRoot).optional(),
          }),
        },
      },
    },
    async (req) => {
      const { kind, country, q, parent, tree } = req.query;
      const all = await repo.listDestinations({});
      const slugById = new Map(all.map((d) => [d.id, d.slug]));
      const filtered = await repo.listDestinations({
        kind,
        countryCode: country,
        q,
        parentSlug: parent,
      });
      const destinations = await Promise.all(filtered.map((d) => summarize(d, slugById)));
      if (!tree) return { destinations };

      const scope = country ? all.filter((d) => d.countryCode === country.toUpperCase()) : all;
      const summaries = await Promise.all(scope.map((d) => summarize(d, slugById)));
      const nodes = new Map<string, TreeNodeDto>(summaries.map((s) => [s.slug, { ...s, children: [] }]));
      const roots: TreeNodeDto[] = [];
      for (const node of nodes.values()) {
        const parentNode = node.parentSlug ? nodes.get(node.parentSlug) : undefined;
        if (parentNode) parentNode.children.push(node);
        else roots.push(node);
      }
      return { destinations, tree: roots as unknown as z.infer<typeof TreeRoot>[] };
    }
  );

  app.get(
    '/v1/destinations/:slug',
    {
      schema: {
        tags: ['Destinations'],
        summary: 'Destination profile: summary, hero image, breadcrumb, children and Destination Pack status',
        params: z.object({ slug: z.string().min(1).max(80) }),
        response: {
          200: z.object({
            destination: DestinationSummarySchema.extend({
              wikidataId: z.string().nullable(),
              wikipediaTitle: z.string().nullable(),
              summary: z.string().nullable(),
            }),
            breadcrumb: z.array(z.object({ slug: z.string(), name: z.string(), kind: z.enum(DESTINATION_KINDS) })),
            children: z.array(DestinationSummarySchema),
            pack: PackInfoSchema,
            placeCounts: z.record(z.number().int()),
            attribution: z.string(),
          }),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const dest = await repo.getDestinationBySlug(req.params.slug);
      if (!dest) return reply.code(404).send({ error: 'Destination not found' });
      const [chain, kids, subtree] = await Promise.all([
        places.ancestors(dest),
        repo.listChildren(dest.id),
        places.subtreeIds(dest),
      ]);
      const slugById = new Map<string, string>([[dest.id, dest.slug], ...chain.map((c): [string, string] => [c.id, c.slug])]);
      const summary = await summarize(dest, slugById);
      const counts = await repo.countPlacesByCategory(subtree.ids);
      return reply.code(200).send({
        destination: {
          ...summary,
          wikidataId: dest.wikidataId,
          wikipediaTitle: dest.wikipediaTitle,
          summary: dest.summary,
        },
        breadcrumb: chain.map((c) => ({ slug: c.slug, name: c.name, kind: c.kind })),
        children: await Promise.all(kids.map((k) => summarize(k, slugById))),
        pack: {
          status: packs.effectiveStatus(dest),
          buildable: isPackBuildable(dest.kind),
          builtAt: dest.packBuiltAt,
          startedAt: dest.packStartedAt,
          attemptedAt: dest.packAttemptedAt,
          error: dest.packError,
          stats: dest.packStats as Record<string, unknown>,
        },
        placeCounts: counts,
        attribution: PLACES_ATTRIBUTION,
      });
    }
  );

  const PlacesResponse = z.object({
    status: PackStatusSchema,
    source: z.enum(['pack', 'live']),
    destination: z.object({ slug: z.string(), name: z.string(), kind: z.enum(DESTINATION_KINDS) }),
    total: z.number().int(),
    nextCursor: z.string().nullable(),
    places: z.array(PlaceSchema),
    attribution: z.string(),
  });

  app.get(
    '/v1/destinations/:slug/places',
    {
      schema: {
        tags: ['Destinations', 'Places'],
        summary:
          'Ranked places for a destination. Pack ready: served instantly (200). Pack missing/stale: a build is enqueued and a 202 payload with live Wikipedia fallback results is returned.',
        params: z.object({ slug: z.string().min(1).max(80) }),
        querystring: z.object({
          category: CategorySchema.optional(),
          q: z.string().trim().min(1).max(80).optional(),
          near: z.string().optional().describe('lat,lng'),
          radius: z.coerce.number().int().min(100).max(50_000).default(5000).describe('metres, used with `near`'),
          bbox: z.string().optional().describe('minLng,minLat,maxLng,maxLat'),
          limit: z.coerce.number().int().min(1).max(100).default(30),
          cursor: z.string().max(100).optional(),
        }),
        response: {
          200: PlacesResponse,
          202: PlacesResponse,
          400: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const dest = await repo.getDestinationBySlug(req.params.slug);
      if (!dest) return reply.code(404).send({ error: 'Destination not found' });

      let near: { lat: number; lng: number; radiusM: number } | undefined;
      if (req.query.near) {
        const parsed = latLngParse(req.query.near);
        if (!parsed) return reply.code(400).send({ error: '`near` must be "lat,lng"' });
        near = { ...parsed, radiusM: req.query.radius };
      }
      let bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number } | undefined;
      if (req.query.bbox) {
        const nums = req.query.bbox.split(',').map((x) => Number(x.trim()));
        if (nums.length !== 4 || nums.some((n) => !Number.isFinite(n))) {
          return reply.code(400).send({ error: '`bbox` must be "minLng,minLat,maxLng,maxLat"' });
        }
        const [minLng, minLat, maxLng, maxLat] = nums as [number, number, number, number];
        if (minLng >= maxLng || minLat >= maxLat) {
          return reply.code(400).send({ error: '`bbox` min values must be below max values' });
        }
        bbox = { minLng, minLat, maxLng, maxLat };
      }

      const result = await places.listPlaces(dest, {
        category: req.query.category,
        q: req.query.q,
        near,
        bbox,
        limit: req.query.limit,
        cursor: req.query.cursor,
      });
      const now = new Date().toISOString();
      const body = {
        status: result.status,
        source: result.source,
        destination: { slug: dest.slug, name: dest.name, kind: dest.kind },
        total: result.total,
        nextCursor: result.nextCursor,
        places: [
          ...result.places.map((r) => placeToDto(r.place, r.distanceM)),
          ...result.live.map((l) => livePlaceToDto(l, now)),
        ],
        attribution: PLACES_ATTRIBUTION,
      };
      void reply.header('Cache-Control', result.source === 'pack' ? 'public, max-age=60' : 'no-store');
      return reply.code(result.source === 'pack' ? 200 : 202).send(body);
    }
  );

  // ---------------------------------------------------------------- pack admin
  app.post(
    '/v1/destinations/:slug/pack',
    {
      schema: {
        tags: ['Destinations'],
        summary: 'Enqueue a Destination Pack (re)build. Requires the ADMIN_TOKEN (x-admin-token header or Bearer).',
        params: z.object({ slug: z.string().min(1).max(80) }),
        body: z
          .object({
            force: z.boolean().default(false).describe('Rebuild even if the pack is ready/fresh'),
            refresh: z.boolean().default(false).describe('Bypass provider caches'),
          })
          .default({}),
        response: {
          202: z.object({
            slug: z.string(),
            enqueued: z.boolean(),
            status: PackStatusSchema,
            reason: z.enum(['enqueued', 'already-building', 'fresh', 'cooldown']),
            jobId: z.string().nullable(),
          }),
          400: z.object({ error: z.string() }),
          401: z.object({ error: z.string() }),
          403: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      if (!requireAdmin(req, reply)) return reply;
      const dest = await repo.getDestinationBySlug(req.params.slug);
      if (!dest) return reply.code(404).send({ error: 'Destination not found' });
      try {
        const r = await packs.requestBuild(dest, { force: req.body.force, refresh: req.body.refresh });
        return reply.code(202).send({ slug: dest.slug, ...r });
      } catch (err) {
        if (err instanceof PackNotSupportedError) return reply.code(400).send({ error: err.message });
        throw err;
      }
    }
  );

  app.get(
    '/v1/destinations/:slug/pack/status',
    {
      schema: {
        tags: ['Destinations'],
        summary: 'Destination Pack build status (none | building | ready | stale) and last build statistics',
        params: z.object({ slug: z.string().min(1).max(80) }),
        response: {
          200: z.object({ slug: z.string(), pack: PackInfoSchema, placeCounts: z.record(z.number().int()) }),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const dest = await repo.getDestinationBySlug(req.params.slug);
      if (!dest) return reply.code(404).send({ error: 'Destination not found' });
      return reply.code(200).send({
        slug: dest.slug,
        pack: {
          status: packs.effectiveStatus(dest),
          buildable: isPackBuildable(dest.kind),
          builtAt: dest.packBuiltAt,
          startedAt: dest.packStartedAt,
          attemptedAt: dest.packAttemptedAt,
          error: dest.packError,
          stats: dest.packStats as Record<string, unknown>,
        },
        placeCounts: await repo.countPlacesByCategory([dest.id]),
      });
    }
  );

  // ---------------------------------------------------------------- routing
  app.post(
    '/v1/geo/route',
    {
      schema: {
        tags: ['Geo'],
        summary:
          'Route polyline + distance + duration via OpenRouteService (cached by coordinate hash). Falls back to the India transit estimator (`source: "estimate"`, straight-line geometry).',
        body: z.object({
          profile: z.enum(['driving-car', 'foot-walking']).default('driving-car'),
          coordinates: z
            .array(
              z.object({
                lat: z.number().min(-90).max(90),
                lng: z.number().min(-180).max(180),
              })
            )
            .min(2)
            .max(25),
        }),
        response: {
          200: z.object({
            profile: z.enum(['driving-car', 'foot-walking']),
            distanceM: z.number(),
            durationS: z.number(),
            geometry: z.string().describe('Encoded polyline, precision 5'),
            geometryFormat: z.literal('polyline5'),
            coordinates: z.array(z.tuple([z.number(), z.number()])).describe('[lng, lat] pairs (decoded geometry)'),
            source: z.enum(['openrouteservice', 'estimate']),
            cached: z.boolean(),
            attribution: z.string(),
          }),
          429: z.object({ error: z.string(), retryAfterSec: z.number() }),
        },
      },
    },
    async (req, reply) => {
      const gate = services.routeLimiter.check(req.ip);
      if (!gate.allowed) {
        void reply.header('Retry-After', String(gate.retryAfterSec));
        return reply.code(429).send({ error: 'Too many routing requests', retryAfterSec: gate.retryAfterSec });
      }
      const r = await services.providers.routing.route(req.body.profile, req.body.coordinates);
      return reply.code(200).send({
        ...r,
        attribution:
          r.source === 'openrouteservice'
            ? 'Routing by openrouteservice.org · © OpenStreetMap contributors'
            : 'Estimated with the Itinbee India transit calibration (no routing key / provider unavailable)',
      });
    }
  );
};
