import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Layers } from 'lucide-react';
import type { ExploreCard } from '@/lib/explore-client';

export function CoverImage({
  card,
  sizes = '(min-width:1024px) 30vw, (min-width:640px) 45vw, 92vw',
  priority,
}: {
  card: Pick<ExploreCard, 'coverImage' | 'title'>;
  sizes?: string;
  priority?: boolean;
}) {
  if (!card.coverImage) {
    return (
      <div className="trunk-ground-flat grid h-full w-full place-items-center" aria-hidden="true">
        <span className="display text-[40px] text-saffron/70">itinbee</span>
      </div>
    );
  }
  return (
    <Image
      src={card.coverImage.url}
      alt={`${card.title}. Photo by ${card.coverImage.author}, ${card.coverImage.license}`}
      fill
      sizes={sizes}
      priority={priority}
      className="object-cover transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04]"
    />
  );
}

/** One itinerary: photo label on top, details on paper below. */
export function ItineraryCard({ card, priority }: { card: ExploreCard; priority?: boolean }) {
  const places = card.destinations.map((d) => d.name).join(' · ');
  return (
    <Link
      href={`/explore/${card.slug}`}
      className="group on-paper flex h-full flex-col overflow-hidden rounded-[14px] bg-paper text-navy shadow-label transition-[translate,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-[0_20px_30px_rgba(3,18,14,0.55)]"
    >
      <div className="relative aspect-[4/3] overflow-hidden border-b-[1.5px] border-navy bg-trunk-dark">
        <CoverImage card={card} priority={priority} />
        <span className="display absolute left-3 top-3 rounded border border-navy bg-saffron px-2 py-0.5 text-[22px] leading-none text-navy">
          {card.durationDays}D
        </span>
        <span className="absolute bottom-3 right-3 rounded border border-navy bg-paper px-2 py-0.5 text-[12px] font-bold uppercase tracking-[0.08em] text-navy">
          {card.sample ? 'Sample itinerary' : card.origin === 'template' ? 'Itinbee template' : card.authorName ? `By ${card.authorName}` : 'Community'}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="display text-[30px] text-navy">{card.title}</h3>
        <p className="text-[14px] font-semibold text-vermilion-deep">{places}</p>
        <p className="line-clamp-2 text-[15px] leading-snug text-paper-ink">{card.summary}</p>
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
          {card.tripTypes.slice(0, 3).map((t) => (
            <span key={t} className="rounded-full border border-navy/35 bg-[#EFE0BE] px-2.5 py-0.5 text-[12px] font-semibold capitalize">
              {t}
            </span>
          ))}
          <span className="ml-auto inline-flex items-center gap-1 text-[13px] font-semibold text-paper-ink">
            <Layers size={14} strokeWidth={2.25} aria-hidden="true" />
            {card.stopCount} {card.stopCount === 1 ? 'stop' : 'stops'}
          </span>
        </div>
      </div>
    </Link>
  );
}
