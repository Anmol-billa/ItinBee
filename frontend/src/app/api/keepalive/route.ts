import { NextRequest, NextResponse } from 'next/server';
import { warmBackendQuietly } from '@/lib/backend-origin';

export const dynamic = 'force-dynamic';

/**
 * Lightweight keep-warm endpoint:
 * - Browser focus/mount pings (`GET /api/keepalive`) trigger a background server-side
 *   wake call to the backend and return immediately in < 5ms.
 * - External cron monitors (`GET /api/keepalive?wait=1`) await backend readiness (up to 45s)
 *   so both frontend and backend stay warm continuously.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const shouldWait = req.nextUrl.searchParams.get('wait') === '1';
  if (shouldWait) {
    const backendAwake = await warmBackendQuietly(45_000);
    return NextResponse.json(
      {
        ok: backendAwake,
        frontend: 'awake',
        backend: backendAwake ? 'awake' : 'warming',
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  }

  // Fire-and-forget server-side wake so client page loads never block
  void warmBackendQuietly(45_000);
  return NextResponse.json(
    {
      ok: true,
      frontend: 'awake',
      backend: 'warming_or_awake',
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}
