import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { guard } from '../../../_guard';
import { getMockJob, visibleEvents } from '@/lib/import-mock-engine';

export const dynamic = 'force-dynamic';

/** Replays history on connect, then streams live. Heartbeat comment every 15s. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const blocked = guard();
  if (blocked) return blocked;
  const { id } = await ctx.params;
  const job = getMockJob(id);
  if (!job) return NextResponse.json({ code: 'not_found', message: 'Unknown job.' }, { status: 404 });

  const enc = new TextEncoder();
  let sent = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let beat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => {
        clearInterval(timer);
        clearInterval(beat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      const tick = () => {
        const events = visibleEvents(job);
        for (; sent < events.length; sent++) {
          const e = events[sent].event;
          controller.enqueue(enc.encode(`event: ${e.type}\ndata: ${JSON.stringify(e.data)}\n\n`));
          if (e.type === 'done' || e.type === 'error') return close();
        }
      };
      controller.enqueue(enc.encode(': connected\n\n'));
      tick();
      timer = setInterval(tick, 120);
      beat = setInterval(() => controller.enqueue(enc.encode(': ping\n\n')), 15_000);
      req.signal.addEventListener('abort', close, { once: true });
    },
    cancel() {
      clearInterval(timer);
      clearInterval(beat);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
