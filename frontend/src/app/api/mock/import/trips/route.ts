import { NextResponse } from 'next/server';
import { guard } from '../_guard';

export const dynamic = 'force-dynamic';

/** Mock of POST /v1/trips (used by the manual wizard). Lands on the bundled sample trip. */
export async function POST() {
  const blocked = guard();
  if (blocked) return blocked;
  return NextResponse.json({ trip: { id: 'rishi-lnd-4d', shortId: 'rishi-lnd-4d' } }, { status: 201 });
}
