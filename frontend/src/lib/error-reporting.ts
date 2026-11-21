/**
 * Lightweight client error reporter that posts to Sentry's HTTP Envelope API
 * when `NEXT_PUBLIC_SENTRY_DSN` is configured. Fails silently when unset or offline.
 */
export function reportClientErrorToSentry(error: Error & { digest?: string }): void {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
  if (!dsn || typeof fetch === 'undefined') return;

  try {
    const parsed = new URL(dsn);
    const publicKey = parsed.username;
    const segments = parsed.pathname.split('/').filter(Boolean);
    const projectId = segments[segments.length - 1];
    if (!publicKey || !projectId) return;

    const basePath = segments.slice(0, -1).join('/');
    const envelopeUrl = `${parsed.protocol}//${parsed.host}${
      basePath ? `/${basePath}` : ''
    }/api/${encodeURIComponent(projectId)}/envelope/?sentry_key=${encodeURIComponent(publicKey)}&sentry_version=7`;

    const eventId = (typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}0000000000000000`
    )
      .replace(/-/g, '')
      .slice(0, 32);

    const envelopeHeader = JSON.stringify({
      event_id: eventId,
      sent_at: new Date().toISOString(),
      dsn,
    });
    const itemHeader = JSON.stringify({ type: 'event' });
    const payload = JSON.stringify({
      event_id: eventId,
      timestamp: Date.now() / 1000,
      platform: 'javascript',
      level: 'error',
      environment: process.env.NODE_ENV || 'production',
      exception: {
        values: [
          {
            type: error.name || 'Error',
            value: error.message || 'Unhandled application error',
          },
        ],
      },
      tags: error.digest ? { digest: error.digest } : undefined,
      request: typeof window !== 'undefined' ? { url: window.location.href } : undefined,
    });

    void fetch(envelopeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body: `${envelopeHeader}\n${itemHeader}\n${payload}`,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Never throw inside an error boundary
  }
}
