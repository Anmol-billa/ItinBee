import { NextResponse } from 'next/server';
import { guard } from '../../_guard';

export const dynamic = 'force-dynamic';

export async function POST() {
  const blocked = guard();
  if (blocked) return blocked;
  const res = NextResponse.json({
    token: 'mock-guest-token',
    user: { id: 'mock-guest', displayName: 'Guest' },
    guest: true,
  });
  res.cookies.set('itinbee_mock_guest', '1', { httpOnly: true, sameSite: 'lax', path: '/' });
  return res;
}
