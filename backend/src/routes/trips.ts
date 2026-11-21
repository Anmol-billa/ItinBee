import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { env, type AppEnv } from '../config/env.js';
import {
  resolvePublicFrontendUrl,
  sendTripInviteEmail,
} from '../modules/email/mailer.js';
import {
  defaultMumbaiVault,
  type MumbaiS3VaultService,
} from '../modules/ingest/s3-vault.js';
import {
  requireTripAccess,
  resolveCallerOrCreateGuest,
} from '../security/permissions.js';
import {
  CurrencyCodeSchema,
  GuestShareResponseSchema,
  InviteRoleSchema,
  ItemKindSchema,
  MemberRoleSchema,
  PacingLevelSchema,
  TripInvitePublicSchema,
  TripMemberPublicSchema,
  TripMetaSchema,
  TripWorkspaceResponseSchema,
} from '../types/domain.js';
import type { TripStore } from '../store/repository.js';
import type { RealtimeAndQueueBus } from '../store/pubsub.js';
import { extractAuthClaims } from './auth-helper.js';

export interface TripsPluginOpts {
  store: TripStore;
  bus: RealtimeAndQueueBus;
  config?: AppEnv;
  vault?: MumbaiS3VaultService;
  fetchImpl?: typeof fetch;
}

const ErrorSchema = z.object({ error: z.string() });

export const tripsRoutes: FastifyPluginAsyncZod<TripsPluginOpts> = async (
  app,
  opts
) => {
  const cfg = opts.config ?? env;
  const vault = opts.vault ?? defaultMumbaiVault;

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
      const claims = extractAuthClaims(req, cfg.JWT_SECRET);
      const trips = await opts.store.listSampleAndUserTrips(claims?.sub ?? null);
      return { trips };
    }
  );

  app.post(
    '/v1/trips',
    {
      schema: {
        tags: ['Trips'],
        summary: 'Create a new collaborative trip workspace (auto-provisions guest session if unauthenticated)',
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
      const caller = await resolveCallerOrCreateGuest(
        req,
        reply,
        opts.store,
        cfg
      );

      const ws = await opts.store.createTrip({
        ownerId: caller.userId,
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
      const caller = await resolveCallerOrCreateGuest(
        req,
        reply,
        opts.store,
        cfg
      );

      const ws = await opts.store.claimSandboxTrip({
        ...req.body,
        ownerId: caller.userId,
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
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (req, reply) => {
      const access = await requireTripAccess(
        req,
        reply,
        opts.store,
        req.params.id,
        { allowSamplePublicRead: true, config: cfg }
      );
      if (!access) return;

      const ws = await opts.store.getTripWorkspace(
        req.params.id,
        access.userId
      );
      if (!ws) {
        return reply.code(404).send({ error: 'Trip not found' });
      }
      return ws;
    }
  );

  app.patch(
    '/v1/trips/:id',
    {
      schema: {
        tags: ['Trips'],
        summary: 'Update trip title, destination summary, dates, or Elder comfort mode',
        params: z.object({
          id: z.string().uuid(),
        }),
        body: z.object({
          title: z.string().trim().min(1).max(140).optional(),
          destinationSummary: z.string().trim().max(240).optional(),
          elderModeEnabled: z.boolean().optional(),
          startDate: z.string().nullable().optional(),
          endDate: z.string().nullable().optional(),
          homeCurrency: CurrencyCodeSchema.optional(),
        }),
        response: {
          200: z.object({ trip: TripMetaSchema }),
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (req, reply) => {
      const access = await requireTripAccess(
        req,
        reply,
        opts.store,
        req.params.id,
        { write: true, config: cfg }
      );
      if (!access) return;

      const updated = await opts.store.updateTripMeta(req.params.id, req.body);
      if (!updated) {
        return reply.code(404).send({ error: 'Trip not found' });
      }

      await opts.bus.publishTripEvent({
        type: 'trip_updated',
        tripId: req.params.id,
        timestamp: new Date().toISOString(),
        payload: { trip: updated },
      });

      return { trip: updated };
    }
  );

  // ---------------------------------------------------------------- Co-Travellers & Member UPI VPA
  app.post(
    '/v1/trips/:id/members',
    {
      schema: {
        tags: ['Trips'],
        summary: 'Add a co-traveller or companion member (with optional dietary tags & encrypted UPI VPA)',
        params: z.object({
          id: z.string().uuid(),
        }),
        body: z.object({
          userId: z.string().uuid().optional(),
          displayName: z.string().trim().min(1).max(80).optional(),
          role: MemberRoleSchema.default('contributor'),
          vaultAccess: z.boolean().optional(),
          dietaryTags: z.array(z.string()).default([]),
          upiVpa: z.string().trim().max(100).nullable().optional(),
        }),
        response: {
          201: z.object({ member: TripMemberPublicSchema }),
          400: ErrorSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (req, reply) => {
      const access = await requireTripAccess(
        req,
        reply,
        opts.store,
        req.params.id,
        { write: true, config: cfg }
      );
      if (!access) return;

      if (!req.body.userId && !req.body.displayName) {
        return reply
          .code(400)
          .send({ error: 'Either userId or displayName is required' });
      }

      if (
        (req.body.role === 'owner' || req.body.vaultAccess === true) &&
        access.member?.role !== 'owner'
      ) {
        return reply
          .code(403)
          .send({ error: 'Only trip owners can grant owner role or vault access' });
      }

      const member = await opts.store.upsertTripMemberWithDetails({
        tripId: req.params.id,
        userId: req.body.userId,
        displayName: req.body.displayName,
        role: req.body.role,
        vaultAccess:
          req.body.vaultAccess ??
          (access.member?.role === 'owner'
            ? req.body.role === 'owner' || req.body.role === 'editor'
            : false),
        dietaryTags: req.body.dietaryTags,
        upiVpa: req.body.upiVpa,
        callerUserId: access.userId ?? undefined,
      });

      await opts.bus.publishTripEvent({
        type: 'member_updated',
        tripId: req.params.id,
        timestamp: new Date().toISOString(),
        payload: { action: 'upserted', member },
      });

      return reply.code(201).send({ member });
    }
  );

  app.patch(
    '/v1/trips/:id/members/:memberUserId',
    {
      schema: {
        tags: ['Trips'],
        summary: 'Update a co-traveller role, vault access, dietary tags, display name, or UPI VPA',
        params: z.object({
          id: z.string().uuid(),
          memberUserId: z.string().uuid(),
        }),
        body: z.object({
          role: MemberRoleSchema.optional(),
          vaultAccess: z.boolean().optional(),
          dietaryTags: z.array(z.string()).optional(),
          displayName: z.string().trim().min(1).max(80).optional(),
          upiVpa: z.string().trim().max(100).nullable().optional(),
        }),
        response: {
          200: z.object({ member: TripMemberPublicSchema }),
          400: ErrorSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (req, reply) => {
      const access = await requireTripAccess(
        req,
        reply,
        opts.store,
        req.params.id,
        { write: true, config: cfg }
      );
      if (!access) return;

      if (
        (req.body.vaultAccess !== undefined || req.body.role === 'owner') &&
        access.member?.role !== 'owner'
      ) {
        return reply
          .code(403)
          .send({ error: 'Only trip owners can modify vault access or owner role' });
      }

      const updated = await opts.store.updateTripMemberDetails({
        tripId: req.params.id,
        memberUserId: req.params.memberUserId,
        callerUserId: access.userId!,
        role: req.body.role,
        vaultAccess: req.body.vaultAccess,
        dietaryTags: req.body.dietaryTags,
        displayName: req.body.displayName,
        upiVpa: req.body.upiVpa,
      });

      if (updated === 'last_owner') {
        return reply
          .code(400)
          .send({ error: 'Cannot demote the last owner of a trip' });
      }
      if (!updated) {
        return reply.code(404).send({ error: 'Trip member not found' });
      }

      await opts.bus.publishTripEvent({
        type: 'member_updated',
        tripId: req.params.id,
        timestamp: new Date().toISOString(),
        payload: { action: 'updated', member: updated },
      });

      return { member: updated };
    }
  );

  app.delete(
    '/v1/trips/:id/members/:memberUserId',
    {
      schema: {
        tags: ['Trips'],
        summary: 'Remove a co-traveller from the trip (cannot remove the last owner)',
        params: z.object({
          id: z.string().uuid(),
          memberUserId: z.string().uuid(),
        }),
        response: {
          204: z.null(),
          400: ErrorSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (req, reply) => {
      const access = await requireTripAccess(
        req,
        reply,
        opts.store,
        req.params.id,
        { write: true, config: cfg }
      );
      if (!access) return;

      const targetInfo = await opts.store.getTripAccessInfo(
        req.params.id,
        req.params.memberUserId
      );
      if (!targetInfo?.member) {
        return reply.code(404).send({ error: 'Trip member not found' });
      }
      if (
        targetInfo.member.role === 'owner' &&
        access.member?.role !== 'owner'
      ) {
        return reply
          .code(403)
          .send({ error: 'Only a trip owner can remove another owner' });
      }

      const result = await opts.store.removeTripMember(
        req.params.id,
        req.params.memberUserId
      );
      if (result === 'last_owner') {
        return reply
          .code(400)
          .send({ error: 'Cannot delete the last owner of a trip' });
      }
      if (result === 'not_found') {
        return reply.code(404).send({ error: 'Trip member not found' });
      }

      await opts.bus.publishTripEvent({
        type: 'member_updated',
        tripId: req.params.id,
        timestamp: new Date().toISOString(),
        payload: { action: 'removed', userId: req.params.memberUserId },
      });

      return reply.code(204).send(null);
    }
  );

  // ---------------------------------------------------------------- Real Co-Editor Invites
  app.post(
    '/v1/trips/:id/invites',
    {
      schema: {
        tags: ['Trips'],
        summary: 'Create a 7-day co-editor / viewer invitation link (with optional email delivery)',
        params: z.object({
          id: z.string().uuid(),
        }),
        body: z.object({
          role: InviteRoleSchema.default('editor'),
          vaultAccess: z.boolean().default(false),
          email: z.string().trim().email().max(160).optional(),
        }),
        response: {
          201: z.object({
            token: z.string(),
            inviteUrl: z.string(),
            role: InviteRoleSchema,
            vaultAccess: z.boolean(),
            expiresAt: z.string(),
            emailed: z.boolean(),
          }),
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (req, reply) => {
      const access = await requireTripAccess(
        req,
        reply,
        opts.store,
        req.params.id,
        { write: true, config: cfg }
      );
      if (!access) return;

      if (req.body.vaultAccess && access.member?.role !== 'owner') {
        return reply
          .code(403)
          .send({ error: 'Only trip owners can create vault-enabled invites' });
      }

      const invite = await opts.store.createTripInvite({
        tripId: req.params.id,
        createdBy: access.userId!,
        role: req.body.role,
        vaultAccess: req.body.vaultAccess,
        inviteeEmail: req.body.email,
      });

      const publicBaseUrl = resolvePublicFrontendUrl(cfg);
      const inviteUrl = `${publicBaseUrl}/invite/${invite.token}`;

      let emailed = false;
      if (req.body.email) {
        emailed = await sendTripInviteEmail({
          to: req.body.email.trim().toLowerCase(),
          inviterName: access.member?.displayName ?? 'A co-traveller',
          tripTitle: invite.tripTitle,
          role: invite.role,
          inviteUrl,
          config: cfg,
          fetchImpl: opts.fetchImpl,
        });
      }

      return reply.code(201).send({
        token: invite.token,
        inviteUrl,
        role: invite.role,
        vaultAccess: invite.vaultAccess,
        expiresAt: invite.expiresAt,
        emailed,
      });
    }
  );

  app.get(
    '/v1/invites/:token',
    {
      schema: {
        tags: ['Trips'],
        summary: 'Preview a co-editor trip invitation token',
        params: z.object({
          token: z.string().min(8).max(128),
        }),
        response: {
          200: TripInvitePublicSchema,
          404: ErrorSchema,
          410: ErrorSchema,
        },
      },
    },
    async (req, reply) => {
      const invite = await opts.store.getTripInvite(req.params.token);
      if (!invite) {
        return reply.code(404).send({ error: 'Invite not found' });
      }
      if (new Date(invite.expiresAt).getTime() < Date.now()) {
        return reply.code(410).send({ error: 'Invite link has expired' });
      }
      return {
        tripId: invite.tripId,
        tripTitle: invite.tripTitle,
        destinationSummary: invite.destinationSummary,
        role: invite.role,
        vaultAccess: invite.vaultAccess,
        ...(invite.inviterName ? { inviterName: invite.inviterName } : {}),
        expiresAt: invite.expiresAt,
      };
    }
  );

  app.post(
    '/v1/invites/:token/accept',
    {
      schema: {
        tags: ['Trips'],
        summary: 'Accept a co-editor trip invite (reuses signed-in session or provisions guest)',
        params: z.object({
          token: z.string().min(8).max(128),
        }),
        body: z.record(z.string(), z.unknown()).optional(),
        response: {
          200: z.object({
            tripId: z.string().uuid(),
            role: MemberRoleSchema,
          }),
          404: ErrorSchema,
          410: ErrorSchema,
        },
      },
    },
    async (req, reply) => {
      const preview = await opts.store.getTripInvite(req.params.token);
      if (!preview) {
        return reply.code(404).send({ error: 'Invite not found' });
      }
      if (new Date(preview.expiresAt).getTime() < Date.now()) {
        return reply.code(410).send({ error: 'Invite link has expired' });
      }

      const caller = await resolveCallerOrCreateGuest(
        req,
        reply,
        opts.store,
        cfg
      );
      const accepted = await opts.store.acceptTripInvite(
        req.params.token,
        caller.userId
      );
      if (accepted === 'not_found') {
        return reply.code(404).send({ error: 'Invite not found' });
      }
      if (accepted === 'expired') {
        return reply.code(410).send({ error: 'Invite link has expired' });
      }

      return accepted;
    }
  );

  // ---------------------------------------------------------------- Encrypted Ticket Vault Attachment & Deletion
  app.get(
    '/v1/trips/:id/bookings/:bookingId/attachment',
    {
      schema: {
        tags: ['Trips'],
        summary: 'Download decrypted ticket attachment (requires vault_access = true)',
        params: z.object({
          id: z.string().uuid(),
          bookingId: z.string().uuid(),
        }),
        response: {
          200: z.object({
            fileName: z.string(),
            mimeType: z.string(),
            dataBase64: z.string(),
            sizeBytes: z.number().int().nonnegative(),
          }),
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (req, reply) => {
      const access = await requireTripAccess(
        req,
        reply,
        opts.store,
        req.params.id,
        { vaultOnly: true, config: cfg }
      );
      if (!access) return;

      const meta = await opts.store.getBookingVaultMeta(
        req.params.id,
        req.params.bookingId
      );
      if (!meta || !meta.rawDocS3Key) {
        return reply
          .code(404)
          .send({ error: 'Booking has no uploaded vault document' });
      }

      const decrypted = await vault.getDecryptedDocument(meta.rawDocS3Key, {
        store: opts.store,
        fallbackFileName: meta.docFileName ?? 'ticket.pdf',
        fallbackMimeType: meta.docMimeType ?? 'application/pdf',
      });
      if (!decrypted) {
        return reply
          .code(404)
          .send({ error: 'Booking attachment document not found in vault' });
      }

      return {
        fileName: decrypted.fileName,
        mimeType: decrypted.mimeType,
        dataBase64: decrypted.bytes.toString('base64'),
        sizeBytes: decrypted.bytes.byteLength,
      };
    }
  );

  app.delete(
    '/v1/trips/:id/bookings/:bookingId',
    {
      schema: {
        tags: ['Trips'],
        summary: 'Delete a booking and purge its encrypted document from the vault',
        params: z.object({
          id: z.string().uuid(),
          bookingId: z.string().uuid(),
        }),
        response: {
          204: z.null(),
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (req, reply) => {
      const access = await requireTripAccess(
        req,
        reply,
        opts.store,
        req.params.id,
        { write: true, config: cfg }
      );
      if (!access) return;

      const deleted = await opts.store.deleteBooking(
        req.params.id,
        req.params.bookingId
      );
      if (!deleted) {
        return reply.code(404).send({ error: 'Booking not found' });
      }

      if (deleted.rawDocS3Key) {
        await vault.deleteEncryptedDocument(deleted.rawDocS3Key, opts.store);
      }

      await opts.bus.publishTripEvent({
        type: 'booking_deleted',
        tripId: req.params.id,
        timestamp: new Date().toISOString(),
        payload: { bookingId: req.params.bookingId },
      });

      return reply.code(204).send(null);
    }
  );

  // ---------------------------------------------------------------- Public Redacted Share & Offline Bundle
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
          404: ErrorSchema,
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
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (req, reply) => {
      const access = await requireTripAccess(
        req,
        reply,
        opts.store,
        req.params.id,
        { allowSamplePublicRead: true, config: cfg }
      );
      if (!access) return;

      const bundle = await opts.store.getOfflineBundle(
        req.params.id,
        access.userId
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
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
          429: ErrorSchema,
        },
      },
    },
    async (req, reply) => {
      const access = await requireTripAccess(
        req,
        reply,
        opts.store,
        req.params.id,
        { allowSamplePublicRead: true, config: cfg }
      );
      if (!access) return;

      const booking = await opts.store.getBookingById(
        req.params.id,
        req.params.bookingId
      );
      if (!booking) {
        return reply.code(404).send({ error: 'Booking not found' });
      }

      const tier = access.claims?.tier ?? 'free';

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
