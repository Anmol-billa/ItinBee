import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { searchOpenPois } from '../modules/geo/poi-search.js';
import { estimateIndiaTransit } from '../modules/geo/transit-estimator.js';

export const geoRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/v1/places/search',
    {
      schema: {
        tags: ['Geo'],
        summary:
          '100% Open-Data POI Search (Overture / Foursquare OS / OSM Photon / Wikidata — zero Google Places API calls)',
        querystring: z.object({
          q: z.string().default(''),
          lat: z.coerce.number().optional(),
          lng: z.coerce.number().optional(),
          limit: z.coerce.number().int().min(1).max(25).default(10),
        }),
        response: {
          200: z.object({
            attribution: z.string(),
            googlePlacesUsed: z.literal(false),
            results: z.array(
              z.object({
                placeRefId: z.string(),
                name: z.string(),
                nameHi: z.string().optional(),
                city: z.string(),
                region: z.string(),
                countryCode: z.string(),
                category: z.string(),
                lat: z.number(),
                lng: z.number(),
                address: z.string(),
                addressLocalScript: z.string().optional(),
                dietaryHints: z.array(z.string()),
                accessibilityNotes: z.string(),
                terrainZone: z.enum(['metro', 'highway', 'hill', 'coastal']),
                sourceDataset: z.enum(['overture_osm_wikidata', 'osm_photon']),
                googleMapsUrl: z.string(),
              })
            ),
          }),
        },
      },
    },
    async (req) => {
      const results = await searchOpenPois({
        query: req.query.q,
        lat: req.query.lat,
        lng: req.query.lng,
        limit: req.query.limit,
      });

      return {
        attribution: '© OpenStreetMap contributors · Overture Maps · Wikidata',
        googlePlacesUsed: false as const,
        results: results.map(({ score: _s, aliases: _a, ...rest }) => rest),
      };
    }
  );

  app.post(
    '/v1/geo/estimate-transit',
    {
      schema: {
        tags: ['Geo'],
        summary:
          'India-calibrated transit estimator (18 km/h metro peak, 1.9x @ 22 km/h hill switchbacks, zero-key Google Maps api=1 URL)',
        body: z.object({
          origin: z.object({
            lat: z.number().min(-90).max(90),
            lng: z.number().min(-180).max(180),
            name: z.string().optional(),
          }),
          destination: z.object({
            lat: z.number().min(-90).max(90),
            lng: z.number().min(-180).max(180),
            name: z.string().optional(),
          }),
          profile: z
            .enum([
              'metro_peak',
              'hill_switchback',
              'indian_highway',
              'coastal_road',
              'walk',
            ])
            .optional(),
          departureTimeHHMM: z
            .string()
            .regex(/^\d{2}:\d{2}$/)
            .optional(),
        }),
        response: {
          200: z.object({
            profile: z.enum([
              'metro_peak',
              'hill_switchback',
              'indian_highway',
              'coastal_road',
              'walk',
            ]),
            straightLineKm: z.number(),
            distanceMultiplier: z.number(),
            estimatedRoadKm: z.number(),
            calibratedSpeedKmh: z.number(),
            bufferMins: z.number().int(),
            estimatedDurationMins: z.number().int(),
            advisories: z.array(z.string()),
            googleMapsUrl: z.string(),
            attribution: z.string(),
          }),
        },
      },
    },
    async (req) => {
      return estimateIndiaTransit(req.body);
    }
  );
};
