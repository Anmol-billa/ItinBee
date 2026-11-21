import { NextResponse, type NextRequest } from 'next/server';
import { guard } from '../../../_guard';
import { confirmMockJob, getMockJob } from '@/lib/import-mock-engine';
import type { ConfirmBody } from '@/lib/import-types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const blocked = guard();
  if (blocked) return blocked;
  const { id } = await ctx.params;
  const job = getMockJob(id);
  if (!job) return NextResponse.json({ code: 'not_found', message: 'Unknown job.' }, { status: 404 });
  const body = (await req.json().catch(() => null)) as ConfirmBody | null;
  if (!body?.intent || !Array.isArray(body.intent.destinations) || body.intent.destinations.length < 1) {
    return NextResponse.json({ code: 'invalid_input', message: 'Intent needs at least one destination.' }, { status: 400 });
  }
  confirmMockJob(job, body.intent);
  return NextResponse.json({ status: 'building' }, { status: 202 });
}
