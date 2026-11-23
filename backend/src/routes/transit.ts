import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppEnv } from '../config/env.js';
import type { PlacesServices } from '../modules/places/places-module.js';
import {
  JourneyPlaceSchema,
  TransitRouteOptionSchema,
  TransportModeSchema,
} from '../modules/import/intent.js';
import type { LlmProvider } from '../modules/import/llm/types.js';
import { resolveDoorToDoorJourney } from '../modules/transit/corridor-service.js';

export interface TransitRoutesOpts {
  places: PlacesServices;
  llm: LlmProvider;
  config: AppEnv;
}

export const transitRoutes: FastifyPluginAsyncZod<TransitRoutesOpts> = async (
  app,
  opts
) => {
  app.post(
    '/v1/transit/options',
    {
      schema: {
        tags: ['Geo', 'Import'],
        summary:
          'Resolves real multi-modal outbound and return transit options (train, flight, drive, combo) between an origin and destination(s)',
        body: z.object({
          origin: JourneyPlaceSchema.nullable().optional(),
          returnPoint: JourneyPlaceSchema.nullable().optional(),
          roundTrip: z.boolean().optional(),
          transportMode: TransportModeSchema.optional(),
          firstDestination: z
            .object({
              name: z.string().min(1).max(120),
              destinationSlug: z.string().optional(),
              lat: z.number().optional(),
              lng: z.number().optional(),
            })
            .nullable()
            .optional(),
          lastDestination: z
            .object({
              name: z.string().min(1).max(120),
              destinationSlug: z.string().optional(),
              lat: z.number().optional(),
              lng: z.number().optional(),
            })
            .nullable()
            .optional(),
          startDateIso: z.string().nullable().optional(),
          endDateIso: z.string().nullable().optional(),
        }),
        response: {
          200: z.object({
            origin: JourneyPlaceSchema.nullable(),
            returnPoint: JourneyPlaceSchema.nullable(),
            roundTrip: z.boolean(),
            selectedOutboundOptionId: z.string().nullable(),
            selectedReturnOptionId: z.string().nullable(),
            routeOptions: z.object({
              outbound: z.array(TransitRouteOptionSchema),
              return: z.array(TransitRouteOptionSchema),
            }),
          }),
        },
      },
    },
    async (req) => {
      const resolved = await resolveDoorToDoorJourney({
        origin: req.body.origin,
        returnPoint: req.body.returnPoint,
        roundTrip: req.body.roundTrip,
        transportMode: req.body.transportMode ?? 'any',
        firstDestination: req.body.firstDestination ?? null,
        lastDestination: req.body.lastDestination ?? req.body.firstDestination ?? null,
        startDateIso: req.body.startDateIso ?? null,
        endDateIso: req.body.endDateIso ?? null,
        places: opts.places,
        llm: opts.llm,
        config: opts.config,
        allowLiveAutocomplete: opts.places.nodeEnv !== 'test',
      });

      return {
        origin: resolved.origin,
        returnPoint: resolved.returnPoint,
        roundTrip: resolved.roundTrip,
        selectedOutboundOptionId: resolved.selectedOutboundOptionId,
        selectedReturnOptionId: resolved.selectedReturnOptionId,
        routeOptions: {
          outbound: resolved.outboundOptions,
          return: resolved.returnOptions,
        },
      };
    }
  );
};
