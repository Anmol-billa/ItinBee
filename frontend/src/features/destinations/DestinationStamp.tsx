import React from 'react';
import Link from 'next/link';
import { ArrowUpRight, Calendar, MapPin } from 'lucide-react';
import { formatBestMonths, type DestinationSummary } from '@/lib/destinations-client';

interface DestinationStampProps {
  destination: DestinationSummary;
  subtitle?: string;
  childCount?: number;
  className?: string;
}

/**
 * Crisp paper destination stamp used where no local Wikimedia photograph is bundled yet.
 * Pairs seamlessly beside DieCutLabel in the Trunk Labels visual world.
 */
export function DestinationStamp({
  destination,
  subtitle,
  childCount,
  className = '',
}: DestinationStampProps) {
  const season = formatBestMonths(destination.bestMonths);

  return (
    <Link
      href={`/destinations/${destination.slug}`}
      className={`group paper-surface on-paper relative flex h-full flex-col justify-between rounded-[14px] border-2 border-navy p-5 text-navy shadow-label transition-[translate,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-[0_20px_28px_rgba(3,18,14,0.5)] ${className}`}
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <h3 className="display text-[32px] leading-[0.95] text-navy group-hover:text-vermilion-deep">
            {destination.name}
          </h3>
          {destination.typicalDays ? (
            <span className="display shrink-0 rounded border border-navy bg-saffron px-2 py-0.5 text-[18px] leading-none text-navy">
              {destination.typicalDays}D
            </span>
          ) : (
            <ArrowUpRight
              size={20}
              strokeWidth={2.25}
              aria-hidden="true"
              className="shrink-0 text-paper-ink transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-navy"
            />
          )}
        </div>

        {subtitle || destination.regionLabel ? (
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-[14px] font-semibold text-paper-ink">
            <MapPin size={14} strokeWidth={2.25} aria-hidden="true" className="shrink-0 text-[#0F766E]" />
            <span>{subtitle || destination.regionLabel}</span>
          </p>
        ) : null}
      </div>

      <div className="perforation mt-5 flex flex-wrap items-center justify-between gap-2 pt-3 text-[13px] font-semibold text-paper-ink">
        <span className="inline-flex items-center gap-1.5">
          <Calendar size={13} strokeWidth={2.25} aria-hidden="true" />
          <span>Best: {season}</span>
        </span>
        {childCount && childCount > 0 ? (
          <span className="rounded-full border border-navy/35 bg-[#efe0be] px-2.5 py-0.5 text-[12px] font-bold text-navy">
            {childCount} {childCount === 1 ? 'place' : 'places'}
          </span>
        ) : null}
      </div>
    </Link>
  );
}
