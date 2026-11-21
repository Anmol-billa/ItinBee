import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Compass, Search, Sparkles } from 'lucide-react';
import { DieCutLabel } from '@/components/world/DieCutLabel';
import { MONTH_NAMES } from '@/data/showcase';
import { DestinationStamp } from '@/features/destinations/DestinationStamp';
import {
  fetchDestinationsHub,
  hasLocalPhoto,
  shapeForSlug,
  type DestinationSummary,
  type DestinationTreeNode,
} from '@/lib/destinations-client';

export const metadata: Metadata = {
  title: 'Destinations',
  description:
    'Explore Indian states, hill stations, beaches, heritage cities and international corridors with seasonal guidance, top places and ready-made itineraries.',
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

const SCOPE_FILTERS = [
  { id: 'all', label: 'All destinations' },
  { id: 'india', label: 'India' },
  { id: 'international', label: 'International' },
  { id: 'season', label: 'Best right now' },
] as const;

const VIBE_FILTERS = [
  { id: '', label: 'All landscapes' },
  { id: 'hills', label: 'Himalayas & hills' },
  { id: 'beaches', label: 'Beaches & backwaters' },
  { id: 'heritage', label: 'Forts & heritage' },
  { id: 'spiritual', label: 'Spiritual & ghats' },
] as const;

function buildHref(params: { q?: string; scope?: string; vibe?: string }): string {
  const sp = new URLSearchParams();
  if (params.q) sp.set('q', params.q);
  if (params.scope && params.scope !== 'all') sp.set('scope', params.scope);
  if (params.vibe) sp.set('vibe', params.vibe);
  const s = sp.toString();
  return s ? `/destinations?${s}` : '/destinations';
}

function matchesSearchAndVibe(
  d: DestinationSummary,
  q: string | undefined,
  vibe: string | undefined
): boolean {
  if (vibe && d.vibe && d.vibe !== vibe) return false;
  if (vibe && !d.vibe) {
    const hay = `${d.name} ${d.slug} ${d.regionLabel ?? ''}`.toLowerCase();
    if (vibe === 'hills' && !/spiti|manali|kasol|munnar|darjeeling|ladakh|himachal|uttarakhand|hill/.test(hay)) return false;
    if (vibe === 'beaches' && !/goa|alleppey|kerala|bali|ha-long|beach|coast/.test(hay)) return false;
    if (vibe === 'heritage' && !/jaipur|udaipur|jodhpur|jaisalmer|hampi|kyoto|rajasthan|karnataka/.test(hay)) return false;
    if (vibe === 'spiritual' && !/varanasi|rishikesh|kashi|sarnath|tirupati|ayodhya/.test(hay)) return false;
  }
  if (q) {
    const hay = `${d.name} ${d.slug} ${d.regionLabel ?? ''} ${d.aliases.join(' ')}`.toLowerCase();
    const tokens = q.toLowerCase().trim().split(/\s+/);
    if (!tokens.every((t) => hay.includes(t))) return false;
  }
  return true;
}

function DestinationTile({
  dest,
  subtitle,
  childCount,
  index,
}: {
  dest: DestinationSummary;
  subtitle?: string;
  childCount?: number;
  index: number;
}) {
  if (hasLocalPhoto(dest.slug)) {
    const rot = [-1.8, 1.4, -1, 1.8, -1.4, 1.1][index % 6];
    return (
      <div className="h-[252px]" style={{ rotate: `${rot}deg` }}>
        <DieCutLabel
          slug={dest.slug}
          name={dest.name}
          days={dest.typicalDays}
          shape={shapeForSlug(dest.slug)}
          caption={subtitle ?? dest.regionLabel}
          sizes="(min-width:1024px) 22vw, (min-width:640px) 44vw, 90vw"
          className="h-full w-full"
          href={`/destinations/${dest.slug}`}
        />
      </div>
    );
  }
  return (
    <div className="min-h-[188px]">
      <DestinationStamp destination={dest} subtitle={subtitle} childCount={childCount} />
    </div>
  );
}

export default async function DestinationsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = first(sp.q);
  const scope = first(sp.scope) ?? 'all';
  const vibe = first(sp.vibe) ?? '';
  const currentMonth = new Date().getUTCMonth() + 1;
  const monthName = MONTH_NAMES[currentMonth - 1]!;

  const hub = await fetchDestinationsHub();
  const bySlug = new Map(hub.destinations.map((d) => [d.slug, d]));

  // Extract India states/regions and leaf destinations
  const indiaRoot: DestinationTreeNode | undefined = hub.tree.find(
    (n) => n.slug === 'india' || n.countryCode === 'IN'
  );

  const allLeafOrFeatured = hub.destinations.filter(
    (d) => d.kind !== 'country' && matchesSearchAndVibe(d, q, vibe)
  );

  const seasonalNow = allLeafOrFeatured
    .filter((d) => {
      if (scope === 'india' && d.countryCode !== 'IN') return false;
      if (scope === 'international' && d.countryCode === 'IN') return false;
      return d.bestMonths.includes(currentMonth);
    })
    .sort((a, b) => Number(hasLocalPhoto(b.slug)) - Number(hasLocalPhoto(a.slug)))
    .slice(0, 8);

  const indiaStates = (
    indiaRoot?.children.length
      ? indiaRoot.children
      : hub.destinations.filter((d) => d.countryCode === 'IN' && (d.kind === 'state' || d.kind === 'region'))
  ).filter((st) => {
    const kids = hub.destinations.filter((d) => d.parentSlug === st.slug);
    return (
      matchesSearchAndVibe(st, q, vibe) ||
      kids.some((k) => matchesSearchAndVibe(k, q, vibe))
    );
  });

  const indiaHighlights = allLeafOrFeatured.filter(
    (d) => d.countryCode === 'IN' && (d.kind === 'city' || d.kind === 'area' || hasLocalPhoto(d.slug))
  );

  const internationalCountries = hub.tree.filter((n) => n.countryCode !== 'IN');
  const internationalHighlights = hub.destinations.filter(
    (d) => d.countryCode !== 'IN' && matchesSearchAndVibe(d, q, vibe)
  );

  const showIndia = scope === 'all' || scope === 'india' || scope === 'season';
  const showInternational = scope === 'all' || scope === 'international' || scope === 'season';

  return (
    <div className="trunk-ground-flat min-h-[75vh]">
      {/* Hero */}
      <section className="trunk-ground relative border-b border-saffron/30">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-end justify-between gap-6 px-5 py-14 md:px-8 md:py-16">
          <div>
            <h1 className="display text-[56px] text-saffron md:text-[84px]">Destinations</h1>
            <p className="mt-3 max-w-[60ch] text-[19px] text-paper/90">
              Pick an Indian state, mountain valley, coastline or international corridor to inspect seasonal timing,
              top open-map sights and ready-made itineraries.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/create" className="btn-stamp">
              <Sparkles size={18} strokeWidth={2.25} aria-hidden="true" />
              Plan any destination
            </Link>
            <Link href="/explore" className="btn-line btn-line-light text-paper">
              <Compass size={18} strokeWidth={2.25} aria-hidden="true" />
              Browse templates
            </Link>
          </div>
        </div>
      </section>

      {/* Search & Region Filter Bar */}
      <div className="on-paper sticky top-0 z-30 border-b-2 border-navy bg-paper text-navy shadow-[0_8px_16px_-8px_rgba(3,18,14,0.5)]">
        <div className="mx-auto max-w-[1280px] px-5 py-4 md:px-8">
          <search>
            <form action="/destinations" method="get" className="flex flex-wrap items-center gap-3">
              {scope !== 'all' ? <input type="hidden" name="scope" value={scope} /> : null}
              {vibe ? <input type="hidden" name="vibe" value={vibe} /> : null}

              <div className="relative w-full sm:w-[320px]">
                <label htmlFor="dest-hub-q" className="sr-only">
                  Search destinations
                </label>
                <Search
                  size={18}
                  strokeWidth={2.25}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-paper-ink"
                />
                <input
                  id="dest-hub-q"
                  type="search"
                  name="q"
                  defaultValue={q ?? ''}
                  spellCheck={false}
                  placeholder="Search Rajasthan, Spiti, Kyoto…"
                  className="field pl-10"
                />
              </div>

              <button type="submit" className="btn-line min-h-[44px] px-4 py-2 text-[15px] text-navy">
                Search
              </button>

              <nav aria-label="Region scope" className="flex flex-wrap items-center gap-2">
                {SCOPE_FILTERS.map((f) => {
                  const active = scope === f.id;
                  return (
                    <Link
                      key={f.id}
                      href={buildHref({ q, scope: f.id, vibe })}
                      aria-current={active ? 'page' : undefined}
                      className={`chip-paper min-h-[44px] px-3.5 text-[14px] ${
                        active ? '!bg-navy !text-paper' : ''
                      }`}
                    >
                      {f.label}
                    </Link>
                  );
                })}
              </nav>

              {(q || scope !== 'all' || vibe) ? (
                <Link
                  href="/destinations"
                  className="ml-auto min-h-[44px] inline-flex items-center font-bold text-vermilion-deep underline underline-offset-2"
                >
                  Reset filters
                </Link>
              ) : null}
            </form>
          </search>

          <nav aria-label="Landscape filter" className="mt-3 flex flex-wrap items-center gap-2">
            {VIBE_FILTERS.map((vf) => {
              const active = vibe === vf.id;
              return (
                <Link
                  key={vf.id || 'all'}
                  href={buildHref({ q, scope, vibe: vf.id })}
                  className={`chip-paper min-h-[40px] px-3 text-[13px] ${
                    active ? '!bg-navy !text-paper' : ''
                  }`}
                >
                  {vf.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Best Right Now (Seasonal Highlight) */}
      {seasonalNow.length > 0 && !q ? (
        <section aria-labelledby="best-now-heading" className="mx-auto max-w-[1280px] px-5 py-14 md:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 id="best-now-heading" className="display text-[44px] text-saffron md:text-[60px]">
              Best right now in {monthName}
            </h2>
            <p className="max-w-[46ch] text-[16px] text-paper/85">
              Clear skies, open mountain passes or peak coastal weather this month.
            </p>
          </div>

          <ul role="list" className="mt-8 grid gap-x-6 gap-y-8 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {seasonalNow.map((dest, idx) => {
              const parentName = dest.parentSlug ? bySlug.get(dest.parentSlug)?.name : undefined;
              return (
                <li key={dest.slug}>
                  <DestinationTile dest={dest} subtitle={parentName} index={idx} />
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* India Section: States & Regions -> Cities / Hills / Beaches / Heritage */}
      {showIndia && scope !== 'season' ? (
        <section aria-labelledby="india-heading" className="on-paper bg-paper py-16 text-navy">
          <div className="mx-auto max-w-[1280px] px-5 md:px-8">
            <h2 id="india-heading" className="display text-[48px] text-navy md:text-[68px]">
              India — States, Valleys &amp; Coasts
            </h2>
            <p className="mt-2 max-w-[65ch] text-[18px] text-paper-ink">
              Browse by state or jump straight into hill stations, heritage cities, beaches and pilgrimage towns.
            </p>

            {/* Featured Indian Places (Die-cut photo labels + stamps) */}
            {indiaHighlights.length > 0 ? (
              <ul role="list" className="mt-10 grid gap-x-6 gap-y-9 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {indiaHighlights.map((dest, idx) => {
                  const parentName = dest.parentSlug ? bySlug.get(dest.parentSlug)?.name : 'India';
                  return (
                    <li key={dest.slug}>
                      <DestinationTile dest={dest} subtitle={parentName} index={idx} />
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {/* State & Region Directory */}
            {indiaStates.length > 0 ? (
              <div className="perforation mt-14 pt-10">
                <h3 className="display text-[36px] text-navy">Browse by Indian state &amp; region</h3>
                <ul role="list" className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {indiaStates.map((stateNode) => {
                    const children = hub.destinations.filter((d) => d.parentSlug === stateNode.slug);
                    return (
                      <li
                        key={stateNode.slug}
                        className="flex flex-col justify-between rounded-[12px] border-2 border-navy/35 bg-[#fffdf8] p-5"
                      >
                        <div>
                          <div className="flex items-baseline justify-between gap-2">
                            <Link
                              href={`/destinations/${stateNode.slug}`}
                              className="display text-[30px] text-navy hover:text-vermilion-deep"
                            >
                              {stateNode.name}
                            </Link>
                            <Link
                              href={`/explore?dest=${stateNode.slug}`}
                              className="text-[13px] font-bold text-vermilion-ink underline underline-offset-2"
                            >
                              Itineraries
                            </Link>
                          </div>
                          {children.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {children.map((child) => (
                                <Link
                                  key={child.slug}
                                  href={`/destinations/${child.slug}`}
                                  className="chip-paper min-h-[38px]"
                                >
                                  {child.name}
                                </Link>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-2 text-[14px] text-paper-ink">
                              Explore sights, routes and templates in {stateNode.name}.
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* International Section */}
      {showInternational && scope !== 'season' ? (
        <section aria-labelledby="intl-heading" className="mx-auto max-w-[1280px] px-5 py-16 md:px-8">
          <h2 id="intl-heading" className="display text-[48px] text-saffron md:text-[68px]">
            International Corridors
          </h2>
          <p className="mt-2 max-w-[64ch] text-[18px] text-paper/90">
            Short-haul Asia and Europe favourites planned with INR-anchored budgets and multi-currency group splits.
          </p>

          {internationalHighlights.length > 0 ? (
            <ul role="list" className="mt-10 grid gap-x-6 gap-y-9 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {internationalHighlights.map((dest, idx) => {
                const parentName =
                  dest.parentSlug
                    ? bySlug.get(dest.parentSlug)?.name
                    : internationalCountries.find((c) => c.countryCode === dest.countryCode)?.name;
                return (
                  <li key={dest.slug}>
                    <DestinationTile
                      dest={dest}
                      subtitle={parentName ?? dest.regionLabel}
                      index={idx}
                    />
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="on-paper mt-8 max-w-[560px] rounded-[14px] bg-paper p-8 text-navy shadow-label">
              <h3 className="display text-[34px] text-navy">No matching destinations</h3>
              <p className="mt-2 text-[16px] text-paper-ink">
                Even if a destination isn&rsquo;t listed in this directory yet, Smart Import can map any town or
                country worldwide using OpenStreetMap &amp; Photon.
              </p>
              <Link
                href={q ? `/create?q=${encodeURIComponent(`Plan a trip to ${q}`)}` : '/create'}
                className="btn-stamp mt-5"
              >
                Plan {q ? `a trip to ${q}` : 'any destination'}
              </Link>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
