import crypto from 'node:crypto';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { env, type AppEnv } from '../config/env.js';
import {
  deriveGuestSessionHash,
  verifyTurnstileToken,
} from '../security/auth-tokens.js';
import { requireTripAccess } from '../security/permissions.js';
import {
  CurrencyCodeSchema,
  ExpenseEntryTypeSchema,
  ExpenseViewSchema,
  KittyPoolSchema,
  PollViewSchema,
  SplitModeSchema,
  UpiSettlementInstructionSchema,
} from '../types/domain.js';
import type { TripStore } from '../store/repository.js';
import type { RealtimeAndQueueBus } from '../store/pubsub.js';
import { extractAuthClaims } from './auth-helper.js';

export interface PollsLedgerPluginOpts {
  store: TripStore;
  bus: RealtimeAndQueueBus;
  config?: AppEnv;
}

const ErrorSchema = z.object({ error: z.string() });

export const pollsLedgerRoutes: FastifyPluginAsyncZod<PollsLedgerPluginOpts> =
  async (app, opts) => {
    const cfg = opts.config ?? env;

    app.post(
      '/v1/trips/:id/polls',
      {
        schema: {
          tags: ['Polls'],
          summary: 'Create a group consensus poll for stays, dates, or restaurants',
          params: z.object({
            id: z.string().uuid(),
          }),
          body: z.object({
            question: z.string().min(3).max(200),
            options: z
              .array(
                z.object({
                  id: z.string().optional(),
                  label: z.string().min(1).max(120),
                  subtitle: z.string().max(160).optional(),
                })
              )
              .min(2)
              .max(8),
            closesAt: z.string().nullable().optional(),
          }),
          response: {
            201: PollViewSchema,
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

        try {
          const poll = await opts.store.createPoll({
            tripId: req.params.id,
            createdBy: access.userId,
            question: req.body.question,
            options: req.body.options,
            closesAt: req.body.closesAt,
          });

          await opts.bus.publishTripEvent({
            type: 'poll_updated',
            tripId: req.params.id,
            timestamp: new Date().toISOString(),
            payload: { poll },
          });

          return reply.code(201).send(poll);
        } catch (err) {
          if (err instanceof Error && err.message.startsWith('Trip not found')) {
            return reply.code(404).send({ error: err.message });
          }
          throw err;
        }
      }
    );

    app.post(
      '/v1/t/:shortId/polls/:pollId/vote',
      {
        schema: {
          tags: ['Polls'],
          summary:
            'Zero-OTP WhatsApp guest poll vote gated by Cloudflare Turnstile + guest_session_hash deduplication',
          params: z.object({
            shortId: z.string().min(2).max(24),
            pollId: z.string().uuid(),
          }),
          body: z.object({
            optionId: z.string().min(1),
            guestDisplayName: z.string().min(1).max(60),
            turnstileToken: z.string().min(1),
            guestSessionId: z.string().optional(),
          }),
          response: {
            200: PollViewSchema,
            400: ErrorSchema,
            403: ErrorSchema,
            404: ErrorSchema,
          },
        },
      },
      async (req, reply) => {
        const claims = extractAuthClaims(req, cfg.JWT_SECRET);

        if (!claims) {
          const turnstile = await verifyTurnstileToken(
            req.body.turnstileToken,
            req.ip,
            cfg
          );
          if (!turnstile.valid) {
            return reply.code(403).send({
              error: turnstile.reason ?? 'Turnstile verification failed',
            });
          }
        }

        const rawGuestSeed =
          req.cookies?.itinbee_voter_sid ??
          req.body.guestSessionId ??
          crypto.randomUUID();

        if (!req.cookies?.itinbee_voter_sid) {
          reply.setCookie('itinbee_voter_sid', rawGuestSeed, {
            httpOnly: true,
            sameSite: 'lax',
            secure: cfg.NODE_ENV === 'production',
            path: '/',
            maxAge: 60 * 60 * 24 * 90,
          });
        }

        const guestSessionHash = claims
          ? null
          : deriveGuestSessionHash(rawGuestSeed, cfg.JWT_SECRET);

        try {
          const poll = await opts.store.castPollVote({
            shortId: req.params.shortId,
            pollId: req.params.pollId,
            optionId: req.body.optionId,
            voterId: claims?.sub ?? null,
            guestSessionHash,
            guestDisplayName: claims?.displayName ?? req.body.guestDisplayName,
          });

          await opts.bus.publishTripEvent({
            type: 'poll_updated',
            tripId: poll.tripId,
            timestamp: new Date().toISOString(),
            payload: { poll },
          });

          return poll;
        } catch (err) {
          if (err instanceof Error) {
            if (err.message.includes('not found')) {
              return reply.code(404).send({ error: err.message });
            }
            return reply.code(400).send({ error: err.message });
          }
          throw err;
        }
      }
    );

    app.post(
      '/v1/trips/:id/kitty-pools',
      {
        schema: {
          tags: ['Ledger'],
          summary: 'Create an upfront shared trip cash/UPI Kitty Pool',
          params: z.object({
            id: z.string().uuid(),
          }),
          body: z.object({
            title: z.string().min(1).max(100),
            custodianId: z.string().uuid(),
            currency: CurrencyCodeSchema.default('INR'),
            memberContributionsMinor: z.record(
              z.string().uuid(),
              z.number().int().nonnegative()
            ),
          }),
          response: {
            201: KittyPoolSchema,
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

        try {
          const pool = await opts.store.createKittyPool({
            tripId: req.params.id,
            title: req.body.title,
            custodianId: req.body.custodianId,
            currency: req.body.currency,
            memberContributionsMinor: req.body.memberContributionsMinor,
          });
          return reply.code(201).send(pool);
        } catch (err) {
          if (err instanceof Error && err.message.startsWith('Trip not found')) {
            return reply.code(404).send({ error: err.message });
          }
          throw err;
        }
      }
    );

    app.post(
      '/v1/trips/:id/expenses',
      {
        schema: {
          tags: ['Ledger'],
          summary:
            'Append an expense, compensating adjustment, or UPI settlement to the trip ledger',
          params: z.object({
            id: z.string().uuid(),
          }),
          body: z.object({
            clientOpId: z.string().uuid(),
            entryType: ExpenseEntryTypeSchema.default('charge'),
            reversesExpenseId: z.string().uuid().nullable().optional(),
            title: z.string().min(1).max(160),
            category: z.string().max(40).default('general'),
            paidBy: z.string().uuid(),
            kittyPoolId: z.string().uuid().nullable().optional(),
            amountMinor: z.number().int().optional(),
            currency: CurrencyCodeSchema.default('INR'),
            fxRateOverride: z.number().positive().optional(),
            splitMode: SplitModeSchema.default('equal'),
            participantIds: z.array(z.string().uuid()).optional(),
            excludedTags: z.array(z.string()).optional(),
            exactSplitsInrMinor: z
              .record(z.string().uuid(), z.number().int())
              .optional(),
            shareWeights: z
              .record(z.string().uuid(), z.number().nonnegative())
              .optional(),
            upiTxnRef: z.string().max(80).nullable().optional(),
          }),
          response: {
            201: ExpenseViewSchema,
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

        try {
          const expense = await opts.store.appendExpense({
            tripId: req.params.id,
            ...req.body,
          });

          await opts.bus.publishTripEvent({
            type: 'expense_added',
            tripId: req.params.id,
            timestamp: new Date().toISOString(),
            payload: { expense },
          });

          return reply.code(201).send(expense);
        } catch (err) {
          if (err instanceof Error) {
            if (err.message.startsWith('Trip not found')) {
              return reply.code(404).send({ error: err.message });
            }
            return reply.code(400).send({ error: err.message });
          }
          throw err;
        }
      }
    );

    app.delete(
      '/v1/trips/:id/expenses/:expenseId',
      {
        schema: {
          tags: ['Ledger'],
          summary: 'Delete an expense from the trip ledger and recompute kitty pool balances',
          params: z.object({
            id: z.string().uuid(),
            expenseId: z.string().uuid(),
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

        const deleted = await opts.store.deleteExpense(
          req.params.id,
          req.params.expenseId
        );
        if (!deleted) {
          return reply.code(404).send({ error: 'Expense not found' });
        }

        await opts.bus.publishTripEvent({
          type: 'expense_deleted',
          tripId: req.params.id,
          timestamp: new Date().toISOString(),
          payload: { expenseId: req.params.expenseId },
        });

        return reply.code(204).send(null);
      }
    );

    app.get(
      '/v1/trips/:id/settlements',
      {
        schema: {
          tags: ['Ledger'],
          summary:
            'Compute min-cash-flow simplified debts and NPCI-aware UPI settlement payloads (restricted to trip members)',
          params: z.object({
            id: z.string().uuid(),
          }),
          response: {
            200: z.object({
              tripId: z.string().uuid(),
              shortId: z.string(),
              netBalancesInrMinor: z.record(z.string(), z.number().int()),
              settlements: z.array(UpiSettlementInstructionSchema),
              kittyPools: z.array(KittyPoolSchema),
              expenseCount: z.number().int().nonnegative(),
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
          { config: cfg }
        );
        if (!access) return;

        try {
          return await opts.store.getSettlements(req.params.id);
        } catch (err) {
          if (err instanceof Error && err.message.startsWith('Trip not found')) {
            return reply.code(404).send({ error: err.message });
          }
          throw err;
        }
      }
    );
  };
