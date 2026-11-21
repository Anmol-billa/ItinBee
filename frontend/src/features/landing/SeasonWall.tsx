import React from 'react';
import Link from 'next/link';
import { DieCutLabel } from '@/components/world/DieCutLabel';
import { MONTH_NAMES, SHOWCASE, destinationsForMonth } from '@/data/showcase';

interface SeasonWallProps {
  /** 1-12 */
  month: number;
}

/** A wall of destination labels at their best this month. Month is computed on the server, daily. */
export function SeasonWall({ month }: SeasonWallProps) {
  const inSeason = destinationsForMonth(month, 8);
  const list = inSeason.length >= 4 ? inSeason : SHOWCASE.slice(0, 8);
  const heading = inSeason.length >= 4 ? `Where to go in ${MONTH_NAMES[month - 1]}` : 'Where to go next';

  return (
    <section aria-labelledby="season-title" className="on-paper relative bg-paper text-navy">
      <div className="mx-auto max-w-[1280px] px-5 py-20 md:px-8 md:py-24">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h2 id="season-title" className="display text-[48px] text-navy md:text-[72px]">
            {heading}
          </h2>
          <Link href="/explore" className="btn-line text-navy">
            Browse all itineraries
          </Link>
        </div>
        <p className="mt-4 max-w-[60ch] text-[18px] text-paper-ink">
          Pick a place to see ready-made itineraries for it, or start your own from the label.
        </p>

        <ul className="mt-12 grid auto-rows-[260px] grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
          {list.map((d, i) => (
            <li
              key={d.slug}
              style={{ rotate: `${[-2, 1.5, -1, 2.5, -2.5, 1, -1.5, 2][i % 8]}deg` }}
            >
              <DieCutLabel
                slug={d.slug}
                name={d.name}
                days={d.days}
                shape={d.shape}
                caption={d.region}
                sizes="(min-width:1024px) 22vw, 45vw"
                className="h-full w-full"
                href={`/explore?dest=${d.slug}`}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
