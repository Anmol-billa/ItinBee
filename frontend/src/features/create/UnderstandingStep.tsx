'use client';

import React from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Compass,
  MapPin,
  Sparkles,
  Ticket,
  Users,
  Wallet,
  WifiOff,
} from 'lucide-react';
import type {
  FlowDetected,
  FlowError,
  FlowLine,
} from '@/features/create/flow-reducer';
import type { ConnectionState, DetectedKind } from '@/lib/import-types';

interface UnderstandingStepProps {
  connection: ConnectionState;
  lines: FlowLine[];
  detected: FlowDetected[];
  error: FlowError | null;
  onBackToEdit: () => void;
  onRetry: () => void;
}

function DetectedIcon({ kind }: { kind: DetectedKind }) {
  switch (kind) {
    case 'destination':
      return <MapPin size={15} strokeWidth={2.25} aria-hidden="true" className="shrink-0 text-[#0F766E]" />;
    case 'place':
      return <Compass size={15} strokeWidth={2.25} aria-hidden="true" className="shrink-0 text-navy" />;
    case 'dates':
      return <Calendar size={15} strokeWidth={2.25} aria-hidden="true" className="shrink-0 text-navy" />;
    case 'travellers':
      return <Users size={15} strokeWidth={2.25} aria-hidden="true" className="shrink-0 text-navy" />;
    case 'booking':
      return <Ticket size={15} strokeWidth={2.25} aria-hidden="true" className="shrink-0 text-vermilion-ink" />;
    case 'budget':
      return <Wallet size={15} strokeWidth={2.25} aria-hidden="true" className="shrink-0 text-navy" />;
    case 'interest':
      return <Sparkles size={15} strokeWidth={2.25} aria-hidden="true" className="shrink-0 text-navy" />;
  }
}

export function UnderstandingStep({
  connection,
  lines,
  detected,
  error,
  onBackToEdit,
  onRetry,
}: UnderstandingStepProps) {
  return (
    <div className="mx-auto max-w-[760px] px-5 pb-16 pt-6 md:px-8">
      <div className="paper-surface on-paper rounded-[14px] border-2 border-navy p-6 text-navy shadow-tag sm:p-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="display text-[42px] text-navy sm:text-[54px]">
            Reading your notes &amp; tickets
          </h1>
          {connection !== 'live' && !error ? (
            <span className="chip-static">
              <WifiOff size={14} strokeWidth={2.25} aria-hidden="true" />
              {connection === 'reconnecting'
                ? 'Reconnecting…'
                : connection === 'polling'
                  ? 'Checking progress…'
                  : 'Waiting for connection…'}
            </span>
          ) : null}
        </div>

        <p className="mt-2 max-w-[62ch] text-[17px] text-paper-ink">
          Matching your destinations on the open map, checking any attached tickets, and preparing a reviewable plan.
        </p>

        {/* Live progress stream */}
        <ol
          role="list"
          aria-label="Analysis progress"
          className="mt-6 space-y-2.5"
        >
          {lines.map((line, idx) => {
            const isLast = idx === lines.length - 1 && !error;
            return (
              <li
                key={line.id}
                className="flex items-center gap-3 text-[16px] font-semibold text-navy"
              >
                {isLast ? (
                  <span className="spinner text-vermilion-deep" aria-hidden="true" />
                ) : (
                  <CheckCircle2
                    size={18}
                    strokeWidth={2.25}
                    aria-hidden="true"
                    className="shrink-0 text-[#0F766E]"
                  />
                )}
                <span>{line.text}</span>
              </li>
            );
          })}
        </ol>

        {/* Stamped detected chips */}
        {detected.length > 0 ? (
          <div className="perforation mt-6 pt-5">
            <h2 className="display text-[26px] text-navy">Spotted so far</h2>
            <ul role="list" className="mt-3 flex flex-wrap gap-2.5">
              {detected.map((d, i) => (
                <li
                  key={d.id}
                  className="chip-static anim-stamp"
                  style={{ ['--delay' as string]: `${Math.min(i * 60, 360)}ms` }}
                >
                  <DetectedIcon kind={d.kind} />
                  <span>{d.label}</span>
                  {!d.resolved ? (
                    <span className="rounded bg-[#fffdf8] px-1.5 py-0.5 text-[11px] font-bold text-vermilion-ink">
                      Check pin
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Error & recovery controls */}
        {error ? (
          <div
            role="alert"
            className="perforation mt-6 pt-6"
          >
            <div className="rounded-lg border-2 border-[#a82e19] bg-[#fffdf8] p-5">
              <p className="flex items-start gap-2.5 text-[16px] font-bold text-vermilion-ink">
                <AlertCircle size={20} strokeWidth={2.25} aria-hidden="true" className="mt-0.5 shrink-0" />
                <span>{error.message}</span>
              </p>
              {error.kind === 'quota' && error.resetAt ? (
                <p className="mt-2 text-[14px] text-paper-ink">
                  Resets around {new Date(error.resetAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}.
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-3">
                <button type="button" onClick={onRetry} className="btn-stamp">
                  Try again
                </button>
                <button type="button" onClick={onBackToEdit} className="btn-line text-navy">
                  Edit my input
                </button>
                <Link href="/create/manual" className="btn-line text-navy">
                  Build manually
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="perforation mt-8 flex items-center justify-between pt-5">
            <button type="button" onClick={onBackToEdit} className="btn-line text-navy">
              <ArrowLeft size={17} strokeWidth={2.25} aria-hidden="true" />
              Back to edit input
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
