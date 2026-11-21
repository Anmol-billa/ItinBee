import React from 'react';
import type { Metadata } from 'next';
import { allPhotoCredits } from '@/lib/photos';

export const metadata: Metadata = {
  title: 'Data and photo credits',
  description: 'Where Itinbee map data, place text and photographs come from, with licences.',
};

export default function CreditsPage() {
  const photos = allPhotoCredits();
  return (
    <div className="trunk-ground-flat">
      <div className="mx-auto max-w-[860px] px-5 py-14 md:px-8">
        <h1 className="display text-[56px] text-saffron">Data and photo credits</h1>
        <p className="mt-4 max-w-[65ch] text-[18px] text-paper/90">
          Itinbee is built on open data. Thank you to the volunteers behind all of it.
        </p>
        <ul className="mt-8 space-y-3 text-[16px] text-paper/90">
          <li>
            <strong className="text-paper">Maps and places:</strong> © OpenStreetMap contributors (ODbL).
          </li>
          <li>
            <strong className="text-paper">Place descriptions:</strong> Wikivoyage and Wikipedia contributors,
            CC BY-SA.
          </li>
          <li>
            <strong className="text-paper">Photographs:</strong> Wikimedia Commons, each under its own licence, listed below.
          </li>
        </ul>

        <h2 className="display mt-12 text-[36px] text-saffron">Photographs</h2>
        <ul className="mt-4 divide-y divide-paper/15 border-y border-paper/15">
          {photos.map((p) => (
            <li key={p.slug} className="py-3 text-[15px]">
              <a className="font-semibold text-paper underline underline-offset-2" href={p.sourceUrl} rel="noopener noreferrer">
                {p.title}
              </a>
              <span className="text-paper/80">
                {' '}
                by {p.author} · {p.license}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
