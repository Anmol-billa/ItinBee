import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SHOWCASE } from '@/data/showcase';
import { fetchExplore, parseDays, type ExploreQuery } from '@/lib/explore-client';
import { FilterBar } from '@/features/explore/FilterBar';
import { ItineraryCard } from '@/features/explore/ItineraryCard';

export const metadata: Metadata = {
  title: 'Browse itineraries',
  description: 'Ready-made trips built from real places. Filter by destination, duration, trip type and budget, then use one as it is or make it yours.',
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

function toQuery(sp: Record<string, string | string[] | undefined>): ExploreQuery {
  const sort = first(sp.sort);
  return {
    dest: first(sp.dest),
    q: first(sp.q),
    days: first(sp.days),
    type: first(sp.type),
    budget: first(sp.budget),
    month: first(sp.month),
    sort: sort === 'newest' || sort === 'shortest' ? sort : undefined,
    cursor: first(sp.cursor),
  };
}

function destLabelFor(slug: string | undefined): string | undefined {
  if (!slug) return undefined;
  const hit = SHOWCASE.find((d) => d.slug === slug);
  if (hit) return hit.name;
  return slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function emptyPrompt(q: ExploreQuery, label?: string): string {
  const range = parseDays(q.days);
  const days = range && range[0] > 0 ? `${range[0]}${Number.isFinite(range[1]) && range[1] !== range[0] ? `-${range[1]}` : ''} days ` : '';
  return `${days}${label ? `in ${label}` : 'trip'}`.trim();
}

async function Results({ query }: { query: ExploreQuery }) {
  const result = await fetchExplore(query);
  const label = destLabelFor(query.dest);

  return (
    <>
      <FilterBar query={query} destLabel={label} total={result.total} facets={result.facets} />
      <div className="mx-auto max-w-[1280px] px-5 py-12 md:px-8">
        {result.fallback ? (
          <p className="mb-8 max-w-[70ch] rounded-lg border-2 border-dashed border-saffron/60 bg-trunk-dark/60 px-4 py-3 text-[15px] text-paper/90">
            The Itinbee template library is still being published. Until then you are seeing the sample itineraries
            that come with Itinbee. Filters work on them the same way.
          </p>
        ) : null}

        {result.items.length > 0 ? (
          <ul className="grid gap-x-6 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            {result.items.map((card, i) => (
              <li key={card.slug}>
                <ItineraryCard card={card} priority={i < 3} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="on-paper mx-auto max-w-[620px] rotate-[-0.6deg] bg-paper px-8 py-10 text-navy shadow-label">
            <h2 className="display text-[40px]">Nothing here yet{label ? ` for ${label}` : ''}</h2>
            <p className="mt-3 text-[18px] text-paper-ink">
              No itinerary matches these filters. Loosen a filter, or let Itinbee build one for you. It takes a minute.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={`/create?q=${encodeURIComponent(emptyPrompt(query, label))}`} className="btn-stamp">
                Build one{label ? ` for ${label}` : ''}
              </Link>
              <Link href="/explore" className="btn-line text-navy">
                Clear filters
              </Link>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default async function ExplorePage({ searchParams }: { searchParams: SearchParams }) {
  const query = toQuery(await searchParams);
  return (
    <div className="trunk-ground-flat min-h-[70vh]">
      <section className="trunk-ground relative border-b border-saffron/30">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-end justify-between gap-6 px-5 py-14 md:px-8 md:py-16">
          <div>
            <h1 className="display text-[56px] text-saffron md:text-[88px]">Browse itineraries</h1>
            <p className="mt-3 max-w-[56ch] text-[19px] text-paper/90">
              Ready-made trips built from real places. Use one as it is, or make it yours.
            </p>
          </div>
          <Link href="/create" className="btn-stamp">
            Build my own
          </Link>
        </div>
      </section>
      <Results query={query} />
    </div>
  );
}
