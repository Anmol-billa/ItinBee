import React from 'react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Calendar, ChevronRight, Clock, Compass, MapPin, Sparkles } from 'lucide-react';
import { DieCutLabel } from '@/components/world/DieCutLabel';
import { MONTH_NAMES } from '@/data/showcase';
import { DestinationStamp } from '@/features/destinations/DestinationStamp';
import { ItineraryCard } from '@/features/explore/ItineraryCard';
import {
  fetchDestinationDetail,
  fetchDestinationItineraries,
  fetchDestinationPlaces,
  hasLocalPhoto,
  PLACE_CATEGORIES,
  shapeForSlug,
} from '@/lib/destinations-client';

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const detail = await fetchDestinationDetail(slug);
  if (!detail) {
    return { title: 'Destination not found' };
  }
  return {
    title: `${detail.destination.name} travel guide & itineraries`,
    description:
      detail.destination.summary ??
      `Best months to visit, top places and day-by-day itineraries for ${detail.destination.name}.`,
  };
}

export default async function DestinationDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const selectedCategory = first(sp.category);

  const detail = await fetchDestinationDetail(slug);
  if (!detail) {
    notFound();
  }

  const [placesData, itineraries] = await Promise.all([
    fetchDestinationPlaces(detail.destination.slug, selectedCategory, 24),
    fetchDestinationItineraries(detail.destination.slug),
  ]);

  const { destination, breadcrumb, children } = detail;
  const planHref = `/create?q=${encodeURIComponent(`Plan a trip to ${destination.name}`)}`;
  const exploreHref = `/explore?dest=${encodeURIComponent(destination.slug)}`;
  const bestMonthLabels = destination.bestMonths
    .filter((m) => m >= 1 && m <= 12)
    .map((m) => MONTH_NAMES[m - 1]!);

  return (
    <div className="trunk-ground-flat min-h-[75vh]">
      {/* Hero */}
      <section className="trunk-ground relative border-b border-saffron/30">
        <div className="mx-auto max-w-[1280px] px-5 py-12 md:px-8 md:py-16">
          <nav aria-label="Breadcrumb" className="mb-6">
            <ol role="list" className="flex flex-wrap items-center gap-1.5 text-[14px] font-semibold text-paper/80">
              <li>
                <Link href="/destinations" className="hover:text-saffron hover:underline">
                  Destinations
                </Link>
              </li>
              {breadcrumb.map((crumb) => (
                <React.Fragment key={crumb.slug}>
                  <li aria-hidden="true">
                    <ChevronRight size={14} strokeWidth={2.25} />
                  </li>
                  <li>
                    <Link href={`/destinations/${crumb.slug}`} className="hover:text-saffron hover:underline">
                      {crumb.name}
                    </Link>
                  </li>
                </React.Fragment>
              ))}
              <li aria-hidden="true">
                <ChevronRight size={14} strokeWidth={2.25} />
              </li>
              <li aria-current="page" className="font-bold text-saffron">
                {destination.name}
              </li>
            </ol>
          </nav>

          <div className="grid items-center gap-10 lg:grid-cols-[1.3fr_0.7fr]">
            <div>
              <h1 className="display text-[56px] text-saffron md:text-[86px]">
                {destination.name}
              </h1>

              <p className="mt-4 max-w-[62ch] text-[19px] leading-relaxed text-paper/95">
                {destination.summary ??
                  `Explore verified sights, local eateries and day-by-day routes across ${destination.name}.`}
              </p>

              {/* Best months to visit */}
              {bestMonthLabels.length > 0 ? (
                <div className="mt-6">
                  <div className="flex flex-wrap items-center gap-2 text-[15px] text-paper">
                    <span className="inline-flex items-center gap-1.5 font-bold text-saffron">
                      <Calendar size={16} strokeWidth={2.25} aria-hidden="true" />
                      Best months to visit:
                    </span>
                    {bestMonthLabels.map((m) => (
                      <span
                        key={m}
                        className="rounded-full border border-paper/35 bg-trunk-dark/70 px-3 py-0.5 text-[13px] font-semibold text-paper"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-8 flex flex-wrap items-center gap-3.5">
                <Link href={planHref} className="btn-stamp">
                  <Sparkles size={18} strokeWidth={2.25} aria-hidden="true" />
                  Plan a trip to {destination.name}
                </Link>
                <Link href={exploreHref} className="btn-line btn-line-light text-paper">
                  <Compass size={18} strokeWidth={2.25} aria-hidden="true" />
                  Browse {destination.name} itineraries
                </Link>
              </div>
            </div>

            {/* Destination Visual Label or Hero Photo */}
            <div className="mx-auto w-full max-w-[320px]">
              {hasLocalPhoto(destination.slug) ? (
                <DieCutLabel
                  slug={destination.slug}
                  name={destination.name}
                  days={destination.typicalDays}
                  shape={shapeForSlug(destination.slug)}
                  caption={destination.regionLabel}
                  priority
                  sizes="320px"
                  className="aspect-[1/1.05] rotate-[2deg]"
                />
              ) : destination.heroImage?.url ? (
                <figure className="on-paper overflow-hidden rounded-[16px] border-2 border-navy bg-paper p-2 text-navy shadow-label">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-[10px]">
                    <Image
                      src={destination.heroImage.url}
                      alt={destination.name}
                      fill
                      priority
                      sizes="320px"
                      className="object-cover"
                    />
                  </div>
                  {destination.heroImage.author ? (
                    <figcaption className="agate mt-2 px-1 text-paper-ink">
                      Photo: {destination.heroImage.author}
                      {destination.heroImage.license ? ` · ${destination.heroImage.license}` : ''}
                    </figcaption>
                  ) : null}
                </figure>
              ) : (
                <DestinationStamp destination={destination} childCount={children.length} />
              )}
            </div>
          </div>

          {/* Child destinations (e.g., Rajasthan -> Jaipur, Udaipur, Jodhpur, Jaisalmer) */}
          {children.length > 0 ? (
            <div className="mt-12 border-t border-saffron/25 pt-10">
              <h2 className="display text-[36px] text-saffron md:text-[44px]">
                Places inside {destination.name}
              </h2>
              <ul role="list" className="mt-6 grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {children.map((child, idx) => (
                  <li key={child.slug}>
                    {hasLocalPhoto(child.slug) ? (
                      <div
                        className="h-[236px]"
                        style={{ rotate: `${[-1.5, 1.5, -1, 1.2][idx % 4]}deg` }}
                      >
                        <DieCutLabel
                          slug={child.slug}
                          name={child.name}
                          days={child.typicalDays}
                          shape={shapeForSlug(child.slug)}
                          caption={destination.name}
                          sizes="260px"
                          className="h-full w-full"
                          href={`/destinations/${child.slug}`}
                        />
                      </div>
                    ) : (
                      <DestinationStamp destination={child} subtitle={destination.name} />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>

      {/* Top Places in <Name> */}
      <section aria-labelledby="top-places-heading" className="on-paper bg-paper py-16 text-navy">
        <div className="mx-auto max-w-[1280px] px-5 md:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="top-places-heading" className="display text-[44px] text-navy md:text-[62px]">
                Top places in {destination.name}
              </h2>
              <p className="mt-2 max-w-[64ch] text-[17px] text-paper-ink">
                Ranked from Wikipedia pageviews, Wikidata sitelinks and OpenStreetMap completeness — no paid placements
                or synthetic star ratings.
              </p>
            </div>
          </div>

          {/* Category filter links */}
          <nav aria-label="Filter places by category" className="mt-6 flex flex-wrap gap-2">
            <Link
              href={`/destinations/${destination.slug}`}
              scroll={false}
              aria-current={!selectedCategory ? 'page' : undefined}
              className={`chip-paper min-h-[44px] px-3.5 text-[14px] ${
                !selectedCategory ? '!bg-navy !text-paper' : ''
              }`}
            >
              All categories
            </Link>
            {PLACE_CATEGORIES.map((cat) => {
              const active = selectedCategory === cat.id;
              const count = detail.placeCounts[cat.id];
              return (
                <Link
                  key={cat.id}
                  href={`/destinations/${destination.slug}?category=${cat.id}`}
                  scroll={false}
                  aria-current={active ? 'page' : undefined}
                  className={`chip-paper min-h-[44px] px-3.5 text-[14px] ${
                    active ? '!bg-navy !text-paper' : ''
                  }`}
                >
                  <span>{cat.label}</span>
                  {typeof count === 'number' && count > 0 ? (
                    <span className="ml-1.5 text-[12px] opacity-75">({count})</span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          {placesData.status === 'building' ? (
            <p className="mt-6 rounded-lg border-[1.5px] border-dashed border-navy/45 bg-[#efe0be] px-4 py-3 text-[15px] font-semibold text-navy">
              Building full Destination Pack for {destination.name} in the background. Showing live open-data landmarks
              meanwhile.
            </p>
          ) : null}

          {placesData.places.length > 0 ? (
            <ul role="list" className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {placesData.places.map((place) => {
                const isPopular = place.popularity >= 0.65;
                const addPlaceHref = `/create?q=${encodeURIComponent(
                  `Plan a trip to ${destination.name} including ${place.name}`
                )}`;
                return (
                  <li
                    key={place.id}
                    className="flex flex-col overflow-hidden rounded-[14px] border-[1.5px] border-navy/40 bg-[#fffdf8] shadow-label"
                  >
                    {place.image?.url ? (
                      <div className="relative aspect-[16/10] overflow-hidden border-b border-navy/25 bg-trunk-dark">
                        <Image
                          src={place.image.url}
                          alt={place.name}
                          fill
                          sizes="(min-width:1024px) 30vw, (min-width:640px) 46vw, 92vw"
                          className="object-cover"
                        />
                        {place.image.author || place.image.license ? (
                          <span className="agate absolute bottom-1.5 right-1.5 rounded bg-paper/90 px-2 py-0.5 text-navy">
                            {place.image.author ? `Photo: ${place.image.author}` : 'Commons'}
                            {place.image.license ? ` · ${place.image.license}` : ''}
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="flex flex-1 flex-col justify-between p-5">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="display text-[28px] leading-tight text-navy">
                            {place.name}
                          </h3>
                          {isPopular ? (
                            <span className="shrink-0 rounded border border-navy bg-saffron px-2 py-0.5 text-[12px] font-bold uppercase tracking-wider text-navy">
                              Popular
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] font-semibold text-paper-ink">
                          <span className="capitalize">{place.category}</span>
                          {place.typicalDurationMins ? (
                            <span className="inline-flex items-center gap-1 tabular-nums">
                              <Clock size={13} strokeWidth={2.25} aria-hidden="true" />
                              ~{place.typicalDurationMins} min
                            </span>
                          ) : null}
                          {place.bestTime ? <span>· Best: {place.bestTime}</span> : null}
                        </div>

                        {place.whyVisit || place.description ? (
                          <p className="mt-3 text-[15px] leading-relaxed text-navy">
                            {place.whyVisit || place.description}
                          </p>
                        ) : null}

                        {place.dietaryHints.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {place.dietaryHints.map((hint) => (
                              <span
                                key={hint}
                                className="rounded-full border border-[#0F766E]/45 bg-[#F0FDFA] px-2.5 py-0.5 text-[12px] font-bold text-[#0F766E]"
                              >
                                {hint}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <div className="perforation mt-5 flex items-center justify-between gap-2 pt-3">
                        {place.address ? (
                          <span className="inline-flex min-w-0 items-center gap-1 truncate text-[13px] text-paper-ink">
                            <MapPin size={13} strokeWidth={2.25} aria-hidden="true" className="shrink-0" />
                            <span className="truncate">{place.address}</span>
                          </span>
                        ) : (
                          <span />
                        )}
                        <Link
                          href={addPlaceHref}
                          className="shrink-0 text-[14px] font-bold text-vermilion-ink underline underline-offset-2 hover:text-navy"
                        >
                          Include in trip
                        </Link>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="mt-8 max-w-[540px] rounded-[12px] border-2 border-dashed border-navy/40 bg-[#fffdf8] p-6">
              <h3 className="display text-[30px] text-navy">No places in this category yet</h3>
              <p className="mt-2 text-[16px] text-paper-ink">
                Switch back to all categories or build a custom itinerary for {destination.name}.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href={`/destinations/${destination.slug}`} className="btn-line text-navy">
                  Show all places
                </Link>
                <Link href={planHref} className="btn-stamp">
                  Plan a trip to {destination.name}
                </Link>
              </div>
            </div>
          )}

          <p className="agate mt-6 text-paper-ink">{placesData.attribution}</p>
        </div>
      </section>

      {/* Ready-made Itineraries for <Name> */}
      <section aria-labelledby="dest-itins-heading" className="mx-auto max-w-[1280px] px-5 py-16 md:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="dest-itins-heading" className="display text-[44px] text-saffron md:text-[62px]">
              Ready-made itineraries for {destination.name}
            </h2>
            <p className="mt-2 max-w-[60ch] text-[17px] text-paper/90">
              Clone a template straight into your editor, or customise its duration and pace with Smart Import.
            </p>
          </div>
          <Link href={exploreHref} className="btn-line btn-line-light text-paper">
            View all in Explore
          </Link>
        </div>

        {itineraries.items.length > 0 ? (
          <ul role="list" className="mt-10 grid gap-x-6 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            {itineraries.items.map((card) => (
              <li key={card.slug}>
                <ItineraryCard card={card} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="on-paper mt-8 max-w-[600px] rounded-[14px] bg-paper p-8 text-navy shadow-label">
            <h3 className="display text-[34px] text-navy">
              Be the first to build a {destination.name} route
            </h3>
            <p className="mt-2 text-[17px] text-paper-ink">
              No published template matches {destination.name} yet. Tell Itinbee how many days you have and who is
              travelling — we will map a complete plan in under a minute.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href={planHref} className="btn-stamp">
                <Sparkles size={18} strokeWidth={2.25} aria-hidden="true" />
                Plan a trip to {destination.name}
              </Link>
              <Link href="/explore" className="btn-line text-navy">
                Browse all templates
              </Link>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
