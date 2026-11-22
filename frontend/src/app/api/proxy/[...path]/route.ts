import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function normalizeHttpOrigin(raw: string): string {
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

function resolveCandidateBackendOrigins(reqHost?: string | null): string[] {
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

  // Automatic Render fallback when `itinbee-frontend` runs on `*.onrender.com`
  // (e.g. free-tier Blueprint where internal `hostport` private network is blocked)
  if (reqHost && reqHost.endsWith('.onrender.com')) {
    pushUnique('https://itinbee-backend.onrender.com');
  }

  if (candidates.length === 0) {
    candidates.push('http://127.0.0.1:4000');
  }
  return candidates;
}

/**
 * Resolves the browser-reachable WebSocket base URL.
 * NEVER exposes a private Render internal host (`http://itinbee-backend-xxxx:10000`) to browsers!
 */
function resolveBrowserWsBaseUrl(): string {
  const toWs = (httpUrl: string) =>
    httpUrl.replace(/\/+$/, '').replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:');

  if (process.env.NEXT_PUBLIC_API_URL?.trim()) {
    return toWs(normalizeHttpOrigin(process.env.NEXT_PUBLIC_API_URL.trim()));
  }
  if (process.env.PUBLIC_BACKEND_URL?.trim()) {
    return toWs(normalizeHttpOrigin(process.env.PUBLIC_BACKEND_URL.trim()));
  }
  if (process.env.PUBLIC_BACKEND_HOST?.trim()) {
    return toWs(normalizeHttpOrigin(process.env.PUBLIC_BACKEND_HOST.trim()));
  }

  const internal = process.env.INTERNAL_API_URL?.trim();
  if (internal) {
    try {
      const parsed = new URL(normalizeHttpOrigin(internal));
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        return toWs(parsed.origin);
      }
    } catch {
      /* ignore invalid URL */
    }
  }

  return 'ws://localhost:4000';
}

function rewriteSetCookieForFirstParty(rawCookie: string): string {
  return rawCookie.replace(/;\s*Domain=[^;]*/gi, '');
}

const FORWARDED_REQUEST_HEADERS = [
  'content-type',
  'accept',
  'authorization',
  'cookie',
  'last-event-id',
  'x-forwarded-for',
  'x-real-ip',
  'user-agent',
] as const;

async function handleProxy(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  const { path } = await context.params;

  if (path.length === 1 && path[0] === '_ws') {
    return NextResponse.json({
      wsBaseUrl: resolveBrowserWsBaseUrl(),
    });
  }

  const candidateOrigins = resolveCandidateBackendOrigins(req.headers.get('host'));
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const val = req.headers.get(name);
    if (val) headers.set(name, val);
  }

  const isEventStream =
    req.headers.get('accept')?.includes('text/event-stream') ||
    path[path.length - 1] === 'events';
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const bodyBuffer = hasBody ? await req.arrayBuffer() : undefined;

  let lastErr: unknown = null;
  let lastGatewayStatus: number | null = null;

  for (let i = 0; i < candidateOrigins.length; i += 1) {
    const backendOrigin = candidateOrigins[i]!;
    const targetUrl = `${backendOrigin}/${path.join('/')}${req.nextUrl.search}`;

    // On the final candidate, retry transient Render cold-wake / rolling-deploy 502/503/504 HTML pages
    const isFinalCandidate = i === candidateOrigins.length - 1;
    const maxAttempts = isFinalCandidate ? 5 : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const upstream = await fetch(targetUrl, {
          method: req.method,
          headers,
          body: bodyBuffer,
          cache: 'no-store',
          signal: isEventStream ? req.signal : AbortSignal.timeout(70_000),
        });

        const upstreamType = upstream.headers.get('content-type') ?? '';
        const isTransientGatewayHtml =
          (upstream.status === 502 || upstream.status === 503 || upstream.status === 504) &&
          !upstreamType.toLowerCase().includes('application/json');

        if (isTransientGatewayHtml) {
          lastGatewayStatus = upstream.status;
          // Drain body before retrying or trying next candidate origin
          await upstream.arrayBuffer().catch(() => {});
          if (attempt < maxAttempts) {
            await new Promise((r) => setTimeout(r, attempt * 2000));
            continue;
          }
          // Try next candidate origin if available
          break;
        }

        const respHeaders = new Headers();
        if (upstreamType) respHeaders.set('content-type', upstreamType);
        const contentDisposition = upstream.headers.get('content-disposition');
        if (contentDisposition) respHeaders.set('content-disposition', contentDisposition);
        const retryAfter = upstream.headers.get('retry-after');
        if (retryAfter) respHeaders.set('retry-after', retryAfter);

        const setCookies =
          typeof upstream.headers.getSetCookie === 'function'
            ? upstream.headers.getSetCookie()
            : [];
        for (const c of setCookies) {
          respHeaders.append('set-cookie', rewriteSetCookieForFirstParty(c));
        }

        if (upstreamType.includes('text/event-stream') && upstream.body) {
          respHeaders.set('cache-control', 'no-cache, no-transform');
          respHeaders.set('x-accel-buffering', 'no');
          return new Response(upstream.body, {
            status: upstream.status,
            headers: respHeaders,
          });
        }

        const payload = await upstream.arrayBuffer();
        return new NextResponse(payload, {
          status: upstream.status,
          headers: respHeaders,
        });
      } catch (err) {
        lastErr = err;
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, attempt * 2000));
        }
      }
    }
  }

  const causeCode =
    lastErr &&
    typeof lastErr === 'object' &&
    'cause' in lastErr &&
    lastErr.cause &&
    typeof lastErr.cause === 'object' &&
    'code' in lastErr.cause
      ? String((lastErr.cause as { code?: unknown }).code)
      : lastGatewayStatus
        ? `upstream_${lastGatewayStatus}`
        : undefined;

  return NextResponse.json(
    {
      code: 'backend_unreachable',
      error: 'backend_unreachable',
      message:
        'The Itinbee API service is finishing a deploy or waking from idle on Render. Wait 10–15 seconds and click Retry connection.',
      ...(causeCode ? { detail: causeCode } : {}),
    },
    { status: 502 }
  );
}

export const GET = handleProxy;
export const POST = handleProxy;
export const PUT = handleProxy;
export const PATCH = handleProxy;
export const DELETE = handleProxy;
