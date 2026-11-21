'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { reportClientErrorToSentry } from '@/lib/error-reporting';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientErrorToSentry(error);
  }, [error]);

  return (
    <main className="min-h-screen bg-[#08291F] px-5 py-16 text-[#F6EBD3] md:px-8">
      <div className="mx-auto max-w-[620px]">
        <div className="paper-surface on-paper rounded-[14px] border-2 border-[#14213D] bg-[#F6EBD3] p-8 text-[#14213D] shadow-tag sm:p-10">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#14213D]/35 bg-[#FEF3C7] px-3 py-1 text-[13px] font-bold text-[#B45309]">
            <AlertTriangle size={15} strokeWidth={2.25} aria-hidden="true" />
            <span>Route interrupted</span>
          </div>
          <h1 className="display text-[42px] leading-[0.96] text-[#14213D] sm:text-[52px]">
            Something went off-route
          </h1>
          <p className="mt-3 text-[16px] leading-relaxed text-[#4F4533]">
            We hit an unexpected snag loading this page. Your saved trip drafts and offline vault remain intact on your
            device.
          </p>
          {error.digest ? (
            <p className="mt-2 font-mono text-[12px] text-[#4F4533]">Reference: {error.digest}</p>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => reset()} className="btn-stamp">
              <RotateCcw size={17} strokeWidth={2.25} aria-hidden="true" />
              Try again
            </button>
            <Link href="/" className="btn-line text-[#14213D]">
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
