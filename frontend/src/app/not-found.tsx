import React from 'react';
import Link from 'next/link';
import { ScoutBeeMark } from '@/components/mascot/ScoutBeeMark';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-4 text-center text-ink">
      <ScoutBeeMark variant="vignette" />
      <h1 className="mt-4 text-lg font-semibold tracking-tight">
        Route or shared link not found
      </h1>
      <p className="mt-1.5 max-w-sm text-compact text-ink-secondary">
        This itinerary link may have expired or been moved. You can open a fresh trip workspace below.
      </p>
      <Link
        href="/"
        className="mt-5 rounded-md bg-ink px-3.5 py-2 text-compact font-medium text-canvas-elevated hover:bg-ink/90"
      >
        Open Itinbee workspace
      </Link>
    </main>
  );
}
