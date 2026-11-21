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
): Promise<NextResponse> {
  const { path } = await context.params;
  const backendOrigin = resolveServerBackendOrigin();

  if (path.length === 1 && path[0] === '_ws') {
    return NextResponse.json({
      wsBaseUrl: backendOrigin.replace(/^http/, 'ws'),
    });
  }

  const targetUrl = `${backendOrigin}/${path.join('/')}${req.nextUrl.search}`;
  const headers = new Headers();
  const contentType = req.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  const authorization = req.headers.get('authorization');
  if (authorization) headers.set('authorization', authorization);
  const cookie = req.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const bodyBuffer = hasBody ? await req.arrayBuffer() : undefined;

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: bodyBuffer,
      cache: 'no-store',
      // Generous timeout to absorb Render Free Tier 15-min idle cold starts
      signal: AbortSignal.timeout(45_000),
    });

    const respHeaders = new Headers();
    const upstreamType = upstream.headers.get('content-type');
    if (upstreamType) respHeaders.set('content-type', upstreamType);

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
