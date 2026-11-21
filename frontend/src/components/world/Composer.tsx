'use client';

import React, { useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Paperclip } from 'lucide-react';

const EXAMPLES = [
  '5 days Kerala backwaters, honeymoon',
  'Goa with 6 friends in December',
  'Spiti in June, we like trekking',
] as const;

interface ComposerProps {
  /** Where the form submits (GET). */
  action?: string;
  autoFocus?: boolean;
  rows?: number;
  submitLabel?: string;
  showBrowse?: boolean;
}

/**
 * The luggage-tag composer. A plain GET form, so it works before hydration:
 * /create?q=… receives whatever the visitor typed or pasted.
 */
export function Composer({
  action = '/create',
  autoFocus,
  rows = 3,
  submitLabel = 'Build my trip',
  showBrowse = true,
}: ComposerProps) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const labelId = useId();

  return (
    <form action={action} method="get" className="on-paper">
      <label id={labelId} htmlFor={`${labelId}-q`} className="sr-only">
        Describe your trip, paste your notes, or drop a ticket
      </label>
      <div className="rounded-[10px] border-2 border-navy bg-[#fffdf8] px-4 pb-2.5 pt-3.5 shadow-[inset_0_2px_5px_rgba(20,33,61,0.08)] focus-within:outline focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-navy">
        <textarea
          id={`${labelId}-q`}
          ref={ref}
          name="q"
          rows={rows}
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus={autoFocus}
          placeholder="Describe your trip, paste your notes, or drop a ticket…"
          className="block w-full resize-none border-0 bg-transparent p-0 text-[17px] leading-[1.45] text-navy outline-none placeholder:text-[#566079]"
        />
        <div className="mt-1 flex items-center justify-between">
          <Link
            href="/create?attach=1"
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md px-1.5 text-[13px] font-semibold text-paper-ink hover:text-navy [@media(pointer:coarse)]:min-h-[44px]"
          >
            <Paperclip size={15} strokeWidth={2.25} aria-hidden="true" />
            Attach a ticket or screenshot
          </Link>
          <span className="text-[12px] text-paper-ink" aria-hidden="true">
            Any language, any format
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-stamp">
          {submitLabel}
        </button>
        {showBrowse ? (
          <Link href="/explore" className="btn-line text-navy">
            Browse itineraries
          </Link>
        ) : null}
      </div>

      <div className="perforation -mx-6 mt-5 flex flex-wrap items-center gap-2 px-6 pt-4 sm:-mx-[42px] sm:px-[42px]">
        <span className="mr-1 text-[12px] font-bold uppercase tracking-[0.1em] text-paper-ink">Try</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            className="chip-paper"
            onClick={() => {
              setText(ex);
              ref.current?.focus();
            }}
          >
            {ex}
          </button>
        ))}
      </div>
    </form>
  );
}
