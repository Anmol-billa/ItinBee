import { NextResponse, type NextRequest } from 'next/server';
import { guard } from '../_guard';
import { createMockJob } from '@/lib/import-mock-engine';
import { LIMITS, type CreateJobBody } from '@/lib/import-types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const blocked = guard();
  if (blocked) return blocked;
  let body: CreateJobBody;
  try {
    body = (await req.json()) as CreateJobBody;
  } catch {
    return NextResponse.json({ code: 'invalid_input', message: 'Body must be JSON.' }, { status: 400 });
  }
  const text = (body.text ?? '').trim();
  if (!text && !(body.urls?.length) && !(body.files?.length)) {
    return NextResponse.json({ code: 'invalid_input', message: 'Add text, a link or a file.' }, { status: 400 });
  }
  if (text.length > LIMITS.textChars || (body.urls?.length ?? 0) > LIMITS.urls || (body.files?.length ?? 0) > LIMITS.files) {
    return NextResponse.json({ code: 'invalid_input', message: 'Input is over the limits.' }, { status: 400 });
  }
  if (/\bquota\b/i.test(text)) {
    return NextResponse.json(
      { code: 'quota_exceeded', message: 'Daily limit reached.', resetAt: new Date(Date.now() + 3 * 3600_000).toISOString() },
      { status: 429 }
    );
  }
  const job = createMockJob(body);
  return NextResponse.json(
    { jobId: job.id, status: 'queued', eventsUrl: `/v1/import/jobs/${job.id}/events` },
    { status: 202 }
  );
}
