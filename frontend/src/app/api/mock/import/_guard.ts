import { NextResponse } from 'next/server';
import { mockEnabled } from '@/lib/import-mock-engine';

/** Mock handlers are inert (404) unless NEXT_PUBLIC_IMPORT_MOCK=1 (or IMPORT_MOCK=1) is set. */
export function guard(): NextResponse | null {
  if (!mockEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return null;
}
