import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function normalizeHttpOrigin(raw: string): string {
  const withProto = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `http://${raw}`;
  return withProto.replace(/\/+$/, '');
}

function resolveServerBackendOrigin(): string {
  const raw =
    process.env.INTERNAL_API_URL ||
    process.env.PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://127.0.0.1:4000';
  return normalizeHttpOrigin(raw);
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
    const host = process.env.PUBLIC_BACKEND_HOST.trim()
      .replace(/^https?:\/\//i, '')
      .replace(/\/+$/, '');
    return `wss://${host}`;
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
  const backendOrigin = resolveServerBackendOrigin();

  if (path.length === 1 && path[0] === '_ws') {
    return NextResponse.json({
      wsBaseUrl: resolveBrowserWsBaseUrl(),
    });
  }

  const targetUrl = `${backendOrigin}/${path.join('/')}${req.nextUrl.search}`;
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

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: bodyBuffer,
      cache: 'no-store',
      signal: isEventStream ? req.signal : AbortSignal.timeout(45_000),
    });

    const respHeaders = new Headers();
    const upstreamType = upstream.headers.get('content-type');
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

    if (upstreamType?.includes('text/event-stream') && upstream.body) {
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
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Backend service is waking up; please retry in a moment.',
      },
      { status: 502 }
    );
  }
}

export const GET = handleProxy;
export const POST = handleProxy;
export const PUT = handleProxy;
export const PATCH = handleProxy;
export const DELETE = handleProxy;
