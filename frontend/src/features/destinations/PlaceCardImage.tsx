'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { Compass } from 'lucide-react';
import type { DestinationImage } from '@/lib/destinations-client';
import { isNonEmptyImageUrl } from '@/lib/formatters';

interface PlaceCardImageProps {
  image: DestinationImage | null | undefined;
  alt: string;
  category?: string;
}

export function PlaceCardImage({ image, alt, category }: PlaceCardImageProps) {
  const [failed, setFailed] = useState(false);

  if (!isNonEmptyImageUrl(image?.url) || failed) {
    return (
      <div className="flex aspect-[16/8] items-center justify-between border-b border-navy/20 bg-paper/75 px-4 py-3 text-navy">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-navy/25 bg-[#fffdf8] px-2.5 py-1 text-[12px] font-bold capitalize text-navy">
          <Compass size={14} strokeWidth={2} aria-hidden="true" className="text-trunk" />
          <span>{category || 'OpenStreetMap landmark'}</span>
        </span>
        <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-paper-ink">
          Verified Pin
        </span>
      </div>
    );
  }

  return (
    <div className="relative aspect-[16/10] overflow-hidden border-b border-navy/25 bg-trunk-dark">
      <Image
        src={image.url.trim()}
        alt={alt}
        fill
        sizes="(min-width:1024px) 30vw, (min-width:640px) 46vw, 92vw"
        className="object-cover"
        onError={() => setFailed(true)}
      />
      {image.author || image.license ? (
        <span className="agate absolute bottom-1.5 right-1.5 rounded bg-paper/90 px-2 py-0.5 text-navy">
          {image.author ? `Photo: ${image.author}` : 'Commons'}
          {image.license ? ` · ${image.license}` : ''}
        </span>
      ) : null}
    </div>
  );
}
