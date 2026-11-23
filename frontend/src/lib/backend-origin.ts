function isPrivateNonLocalHttp(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== 'http:') return false;
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return false;
    return true;
  } catch {
    return false;
  }
}

export function normalizeHttpOrigin(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  if (
    trimmed.startsWith('localhost') ||
    trimmed.startsWith('127.0.0.1') ||
    /^localhost:\d+$/.test(trimmed) ||
    /^127\.0\.0\.1:\d+$/.test(trimmed)
  ) {
    return `http://${trimmed}`;
  }
  // Render private `service:10000` hostport
  if (/^[a-z0-9-]+:\d+$/i.test(trimmed)) {
    return `http://${trimmed}`;
  }
  if (!trimmed.includes('.')) {
    return `https://${trimmed}.onrender.com`;
  }
  return `https://${trimmed}`;
}

/**
 * Resolves candidate backend origins, strictly prioritizing public HTTPS URLs
 * (`https://*.onrender.com` / custom domains) ahead of private internal `http://service:10000`
 * addresses because sleeping Render containers ONLY wake up on external HTTPS traffic.
 */
export function resolveCandidateBackendOrigins(reqHost?: string | null): string[] {
  const wakeCapable: string[] = [];
  const privateFallback: string[] = [];

  const pushCandidate = (raw?: string | null) => {
    if (!raw || !raw.trim()) return;
    const norm = normalizeHttpOrigin(raw);
    if (isPrivateNonLocalHttp(norm)) {
      if (!privateFallback.includes(norm)) privateFallback.push(norm);
    } else if (!wakeCapable.includes(norm)) {
      wakeCapable.push(norm);
    }
  };

  pushCandidate(process.env.PUBLIC_BACKEND_URL);
  pushCandidate(process.env.PUBLIC_BACKEND_HOST);
  pushCandidate(process.env.NEXT_PUBLIC_API_URL);
  pushCandidate(process.env.INTERNAL_API_URL);

  if (
    (reqHost && reqHost.endsWith('.onrender.com')) ||
    process.env.RENDER === 'true' ||
    Boolean(process.env.RENDER_EXTERNAL_URL)
  ) {
    pushCandidate('https://itinbee-backend.onrender.com');
  }

  const combined = [...wakeCapable, ...privateFallback];
  if (combined.length === 0) {
    combined.push('http://127.0.0.1:4000');
  }
  return combined;
}

/**
 * Fires a server-side health probe that holds the connection long enough (up to 45s)
 * for a sleeping container to finish cold-booting.
 */
export async function warmBackendQuietly(timeoutMs = 45_000): Promise<boolean> {
  const origins = resolveCandidateBackendOrigins(
    process.env.FRONTEND_HOST ? `${process.env.FRONTEND_HOST}.onrender.com` : undefined
  );
  for (const origin of origins) {
    try {
      const res = await fetch(`${origin}/health`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return true;
    } catch {
      /* continue to next candidate */
    }
  }
  return false;
}
