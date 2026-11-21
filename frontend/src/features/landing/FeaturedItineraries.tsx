import React from 'react';
import Link from 'next/link';
import { fetchExplore } from '@/lib/explore-client';
import { ItineraryCard } from '@/features/explore/ItineraryCard';

/** Server-rendered strip of featured itineraries pulled from the Explore service. */
export async function FeaturedItineraries() {
  const result = await fetchExplore({ sort: 'popular' });
  const items = result.items.slice(0, 6);
  if (items.length === 0) return null;

  return (
    <section className="trunk-ground relative overflow-hidden">
      <div className="mx-auto max-w-[1280px] px-5 py-20 md:px-8 md:py-24">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h2 className="display text-[48px] text-saffron md:text-[72px]">
              Ready-made trips you can make yours
            </h2>
            <p className="mt-4 max-w-[60ch] text-[19px] text-paper/90">
              Open any template, tweak the days, swap stops from real map data, or ask Itinbee to adapt it for your
              group and dates.
            </p>
          </div>
          <Link href="/explore" className="btn-line btn-line-light text-paper">
            Explore all itineraries
          </Link>
        </div>

        <ul role="list" className="mt-12 grid gap-x-6 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((card) => (
            <li key={card.slug}>
              <ItineraryCard card={card} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
