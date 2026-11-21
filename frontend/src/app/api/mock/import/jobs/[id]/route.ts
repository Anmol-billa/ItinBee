import { NextResponse, type NextRequest } from 'next/server';
import { guard } from '../../_guard';
import { getMockJob, jobState } from '@/lib/import-mock-engine';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const blocked = guard();
  if (blocked) return blocked;
  const { id } = await ctx.params;
  const job = getMockJob(id);
  if (!job) return NextResponse.json({ code: 'not_found', message: 'Unknown job.' }, { status: 404 });
  return NextResponse.json(jobState(job));
}
