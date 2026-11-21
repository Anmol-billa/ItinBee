import crypto from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { env, type AppEnv } from '../../config/env.js';

interface ParsedSentryDsn {
  envelopeUrl: string;
  publicKey: string;
  rawDsn: string;
}

function parseSentryDsn(rawDsn?: string): ParsedSentryDsn | null {
  const trimmed = rawDsn?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const publicKey = url.username;
    const projectId = url.pathname.replace(/^\/+|\/+$/g, '');
    if (!publicKey || !projectId) return null;
    const envelopeUrl = `${url.protocol}//${url.host}/api/${projectId}/envelope/`;
    return { envelopeUrl, publicKey, rawDsn: trimmed };
  } catch {
    return null;
  }
}

/**
 * Lightweight zero-dependency Sentry HTTP Envelope reporter when `SENTRY_DSN` is configured.
 * Never throws or blocks request completion.
 */
export async function captureBackendException(
  err: unknown,
  req?: FastifyRequest,
  config: Pick<AppEnv, 'SENTRY_DSN' | 'NODE_ENV'> = env,
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  const parsed = parseSentryDsn(config.SENTRY_DSN);
  if (!parsed) return false;

  const eventId = crypto.randomUUID().replace(/-/g, '');
  const nowIso = new Date().toISOString();
  const errorObj = err instanceof Error ? err : new Error(String(err));

  const envelopeHeader = JSON.stringify({
    event_id: eventId,
    sent_at: nowIso,
    dsn: parsed.rawDsn,
  });
  const itemHeader = JSON.stringify({ type: 'event' });
  const eventPayload = JSON.stringify({
    event_id: eventId,
    timestamp: nowIso,
    platform: 'node',
    level: 'error',
    environment: config.NODE_ENV,
    server_name: 'itinbee-backend',
    exception: {
      values: [
        {
          type: errorObj.name || 'Error',
          value: errorObj.message,
          stacktrace: errorObj.stack
            ? {
                frames: errorObj.stack
                  .split('\n')
                  .slice(1, 20)
                  .reverse()
                  .map((line) => ({ filename: line.trim() })),
              }
            : undefined,
        },
      ],
    },
    ...(req
      ? {
          request: {
            method: req.method,
            url: req.url,
          },
        }
      : {}),
  });

  const body = `${envelopeHeader}\n${itemHeader}\n${eventPayload}\n`;

  try {
    const res = await fetchImpl(parsed.envelopeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${parsed.publicKey}, sentry_client=itinbee-backend/1.0`,
      },
      body,
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
