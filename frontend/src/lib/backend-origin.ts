export function normalizeHttpOrigin(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  if (trimmed.startsWith('localhost') || trimmed.startsWith('127.0.0.1') || /:\d+$/.test(trimmed)) {
    return `http://${trimmed}`;
  }
  if (!trimmed.includes('.')) {
    return `https://${trimmed}.onrender.com`;
  }
  return `https://${trimmed}`;
}

export function resolveCandidateBackendOrigins(reqHost?: string | null): string[] {
  const candidates: string[] = [];
  const pushUnique = (raw?: string | null) => {
    if (!raw || !raw.trim()) return;
    const norm = normalizeHttpOrigin(raw);
    if (!candidates.includes(norm)) candidates.push(norm);
  };

  pushUnique(process.env.INTERNAL_API_URL);
  pushUnique(process.env.PUBLIC_BACKEND_URL);
  pushUnique(process.env.PUBLIC_BACKEND_HOST);
  pushUnique(process.env.NEXT_PUBLIC_API_URL);

  if (reqHost && reqHost.endsWith('.onrender.com')) {
    pushUnique('https://itinbee-backend.onrender.com');
  }

  if (candidates.length === 0) {
    candidates.push('http://127.0.0.1:4000');
  }
  return candidates;
}

/**
 * Fires a non-blocking server-side health probe so any sleeping upstream container
 * begins waking immediately without blocking SSR or client rendering.
 */
export async function warmBackendQuietly(): Promise<void> {
  const origins = resolveCandidateBackendOrigins(
    process.env.FRONTEND_HOST ? `${process.env.FRONTEND_HOST}.onrender.com` : undefined
  );
  for (const origin of origins) {
    try {
      const res = await fetch(`${origin}/health`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(12_000),
      });
      if (res.ok) return;
    } catch {
      /* continue to next candidate */
    }
  }
}
