import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function resolveServerBackendOrigin(): string {
  const raw =
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://127.0.0.1:4000';
  const normalized = raw.startsWith('http') ? raw : `http://${raw}`;
  return normalized.replace(/\/+$/, '');
}

async function handleProxy(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  const { path } = await context.params;
  const backendOrigin = resolveServerBackendOrigin();

  if (path.length === 1 && path[0] === '_ws') {
    return NextResponse.json({
      wsBaseUrl: backendOrigin.replace(/^http/, 'ws'),
    });
  }

  const targetUrl = `${backendOrigin}/${path.join('/')}${req.nextUrl.search}`;
  const headers = new Headers();
  for (const name of ['content-type', 'accept', 'authorization', 'cookie', 'last-event-id']) {
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
    const retryAfter = upstream.headers.get('retry-after');
    if (retryAfter) respHeaders.set('retry-after', retryAfter);

    const setCookies =
      typeof upstream.headers.getSetCookie === 'function'
        ? upstream.headers.getSetCookie()
        : [];
    for (const c of setCookies) {
      respHeaders.append('set-cookie', c);
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
