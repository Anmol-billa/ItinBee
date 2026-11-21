import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { getPhoto } from '@/lib/photos';

export type LabelShape = 'arch' | 'oval' | 'round' | 'notch';

interface DieCutLabelProps {
  slug: string;
  name: string;
  days?: number;
  shape?: LabelShape;
  /** Numbered pin shown on the label corner (ties to a map leader line). */
  pin?: number;
  href?: string;
  className?: string;
  style?: React.CSSProperties;
  priority?: boolean;
  sizes?: string;
  /** Extra line under the name (e.g. region). */
  caption?: string;
}

/**
 * A die-cut gloss luggage label carrying a real destination photograph.
 * Drop shadow lives on a wrapper because the notch silhouette is masked.
 */
export function DieCutLabel({
  slug,
  name,
  days,
  shape = 'round',
  pin,
  href,
  className = '',
  style,
  priority,
  sizes = '260px',
  caption,
}: DieCutLabelProps) {
  const photo = getPhoto(slug);
  const isArch = shape === 'arch';
  const body = (
    <div className="relative h-full w-full">
    <div
      className={`shape-${shape} relative h-full w-full bg-paper p-[7px]`}
    >
      <div className="label-inner label-gloss relative h-full w-full overflow-hidden border border-navy/25 bg-paper">
        <Image
          src={photo.src}
          alt={`${name}. Photo by ${photo.author}, ${photo.license}`}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
        />
        <div
          className={`absolute inset-x-0 bottom-0 z-[2] border-t-[1.5px] border-navy bg-paper px-3 pt-1.5 ${
            isArch
              ? 'flex flex-col items-center gap-1 pb-4 text-center'
              : shape === 'oval'
                ? 'flex items-baseline justify-center gap-2 pb-3'
                : 'flex items-baseline justify-between gap-2 pb-1.5'
          }`}
        >
          <span className="min-w-0">
            <span className={`display block text-[22px] uppercase leading-none text-navy ${isArch ? '' : 'truncate'}`}>
              {name}
            </span>
            {caption && shape !== 'oval' ? (
              <span className="block truncate text-[12px] font-semibold leading-tight text-paper-ink">
                {caption}
              </span>
            ) : null}
          </span>
          {days ? (
            <span className="display shrink-0 rounded border border-navy bg-saffron px-1.5 py-px text-[18px] leading-none text-navy">
              {days}D
            </span>
          ) : null}
        </div>
      </div>
    </div>
      {pin ? (
        <span
          aria-hidden="true"
          className="display absolute -bottom-2 right-4 z-[3] grid h-[26px] w-[26px] place-items-center rounded-full border-2 border-paper bg-navy text-[15px] leading-none text-saffron"
        >
          {pin}
        </span>
      ) : null}
    </div>
  );

  const wrapperClass = `on-paper block drop-shadow-[0_14px_14px_rgba(3,18,14,0.45)] ${className}`;
  if (href) {
    return (
      <Link href={href} className={`${wrapperClass} transition-[translate,filter] duration-200 hover:-translate-y-1`} style={style}>
        {body}
      </Link>
    );
  }
  return (
    <div className={wrapperClass} style={style}>
      {body}
    </div>
  );
}
