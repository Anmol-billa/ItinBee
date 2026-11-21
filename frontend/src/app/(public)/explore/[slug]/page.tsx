import React from 'react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Bed, Clock, MapPin, StickyNote, Train, Utensils } from 'lucide-react';
import { MONTH_NAMES } from '@/data/showcase';
import { fetchExploreDetail, type ExploreDetailItem } from '@/lib/explore-client';
import { UseItineraryButton } from '@/features/explore/UseItineraryButton';

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const d = await fetchExploreDetail(slug);
  if (!d) return { title: 'Itinerary not found' };
  return {
    title: `${d.title} (${d.durationDays} days)`,
    description: d.summary,
    openGraph: { title: d.title, description: d.summary, type: 'article' },
  };
}

const KIND_ICON: Record<ExploreDetailItem['kind'], React.ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean }>> = {
  stay: Bed,
  transit: Train,
  activity: MapPin,
  meal: Utensils,
  note: StickyNote,
};

function monthsLabel(months: number[]): string {
  if (!months.length) return '';
  const sorted = [...months].sort((a, b) => a - b);
  return sorted.map((m) => MONTH_NAMES[m - 1]!.slice(0, 3)).join(', ');
}

export default async function ItineraryDetailPage({ params }: { params: Params }) {
  const { slug } = await params;
  const d = await fetchExploreDetail(slug);
  if (!d) notFound();

  return (
    <article>
      <header className="trunk-ground trunk-frame relative overflow-hidden">
        <div className="mx-auto grid max-w-[1280px] gap-10 px-5 py-12 md:px-8 md:py-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <Link href="/explore" className="text-[15px] font-bold text-saffron underline-offset-4 hover:underline">
              ← Browse itineraries
            </Link>
            <h1 className="display mt-4 text-[52px] text-paper md:text-[88px]">{d.title}</h1>
            <p className="mt-4 max-w-[56ch] text-[19px] text-paper/90">{d.summary}</p>

            <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3 text-[16px]">
              <div>
                <dt className="text-[13px] font-bold text-saffron">Length</dt>
                <dd className="font-semibold">{d.durationDays} days · {d.stopCount} {d.stopCount === 1 ? 'stop' : 'stops'}</dd>
              </div>
              <div>
                <dt className="text-[13px] font-bold text-saffron">Places</dt>
                <dd className="font-semibold">{d.destinations.map((x) => x.name).join(' · ')}</dd>
              </div>
              {d.bestMonths.length ? (
                <div>
                  <dt className="text-[13px] font-bold text-saffron">Best in</dt>
                  <dd className="font-semibold">{monthsLabel(d.bestMonths)}</dd>
                </div>
              ) : null}
              {d.budgetTier ? (
                <div>
                  <dt className="text-[13px] font-bold text-saffron">Budget</dt>
                  <dd className="font-semibold">{{ budget: 'Budget', mid: 'Mid-range', premium: 'Premium' }[d.budgetTier]}</dd>
                </div>
              ) : null}
            </dl>

            <div className="mt-8 flex flex-wrap items-start gap-4">
              <UseItineraryButton slug={d.slug} openHref={d.openHref} />
              <Link
                href={`/create?q=${encodeURIComponent(`Based on "${d.title}", but `)}&base=${encodeURIComponent(d.slug)}`}
                className="btn-line btn-line-light text-paper"
              >
                Customise with AI
              </Link>
            </div>
          </div>

          <figure className="on-paper relative mx-auto w-full max-w-[560px] rotate-[1.5deg] bg-paper p-[10px] shadow-label">
            <div className="relative aspect-[4/3] overflow-hidden border border-navy/25">
              {d.coverImage ? (
                <Image
                  src={d.coverImage.url}
                  alt={d.title}
                  fill
                  priority
                  sizes="(min-width:1024px) 40vw, 92vw"
                  className="object-cover"
                />
              ) : (
                <div className="trunk-ground-flat h-full w-full" />
              )}
            </div>
            <figcaption className="px-1 pb-1 pt-2 text-[12px] text-paper-ink">
              {d.coverImage ? (
                <>
                  Photo: {d.coverImage.author} · {d.coverImage.license} ·{' '}
                  <a className="underline" href={d.coverImage.sourceUrl} rel="noopener noreferrer">
                    source
                  </a>
                </>
              ) : (
                d.sample ? 'Sample itinerary' : 'Itinbee template'
              )}
            </figcaption>
          </figure>
        </div>
      </header>

      <section className="on-paper bg-paper text-navy" aria-labelledby="days-title">
        <div className="mx-auto max-w-[900px] px-5 py-16 md:px-8">
          <h2 id="days-title" className="display text-[48px] md:text-[64px]">Day by day</h2>
          <ol className="mt-10 space-y-12">
            {d.days.map((day) => (
              <li key={day.dayNumber}>
                <div className="flex items-center gap-4 border-b-2 border-dashed border-navy/30 pb-3">
                  <span className="display grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-navy bg-vermilion-deep text-[26px] leading-none text-[#FFFDF8]">
                    {day.dayNumber}
                  </span>
                  <h3 className="display text-[34px] md:text-[40px]">{day.title}</h3>
                </div>
                <ul className="mt-4 space-y-4">
                  {day.items.map((it) => {
                    const Icon = KIND_ICON[it.kind];
                    return (
                      <li key={it.id} className="flex gap-4">
                        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border-[1.5px] border-navy bg-saffron/60">
                          <Icon size={18} strokeWidth={2.25} aria-hidden />
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-baseline gap-x-3">
                            <span className="text-[18px] font-bold leading-snug">{it.title}</span>
                            {it.startTime ? (
                              <span className="inline-flex items-center gap-1 font-mono text-[13px] font-semibold tabular-nums text-paper-ink">
                                <Clock size={13} strokeWidth={2.25} aria-hidden />
                                {it.startTime}
                              </span>
                            ) : null}
                          </div>
                          {it.notes ? <p className="mt-0.5 text-[16px] leading-snug text-paper-ink">{it.notes}</p> : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ol>
          <p className="agate mt-14 text-paper-ink">{d.mapAttribution}</p>
        </div>
      </section>
    </article>
  );
}
