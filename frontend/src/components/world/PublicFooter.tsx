import React from 'react';
import Link from 'next/link';
import { BrandMark } from './PublicNav';

/** Closing page foot: links plus the agate billing strip carrying real data credits. */
export function PublicFooter() {
  return (
    <footer className="relative z-10 mt-auto bg-trunk-dark text-paper">
      <div className="mx-auto grid max-w-[1280px] gap-8 px-5 py-10 md:grid-cols-[1.4fr_1fr_1fr] md:px-8">
        <div>
          <div className="flex items-center gap-2 text-saffron">
            <BrandMark size={30} />
            <span className="display text-[28px] leading-none">itinbee</span>
          </div>
          <p className="mt-3 max-w-sm text-[15px] text-paper/80">
            Tell us where. Itinbee turns notes, chats and tickets into a mapped, day-by-day trip you can share on
            WhatsApp and carry offline.
          </p>
        </div>
        <nav aria-label="Product" className="flex flex-col gap-2 text-[15px]">
          <span className="display text-[20px] text-saffron">Plan</span>
          <Link className="hover:underline" href="/create">Create an itinerary</Link>
          <Link className="hover:underline" href="/explore">Browse itineraries</Link>
          <Link className="hover:underline" href="/destinations">Destinations</Link>
          <Link className="hover:underline" href="/trips">My trips</Link>
        </nav>
        <nav aria-label="About and legal" className="flex flex-col gap-2 text-[15px]">
          <span className="display text-[20px] text-saffron">Itinbee</span>
          <Link className="hover:underline" href="/about">About Itinbee</Link>
          <Link className="hover:underline" href="/credits">Data and photo credits</Link>
          <Link className="hover:underline" href="/legal/privacy">Privacy policy</Link>
          <Link className="hover:underline" href="/legal/terms">Terms of use</Link>
        </nav>
      </div>
      <div className="agate border-t border-saffron/20 bg-[#04180f] px-5 py-3 text-center text-paper/75 md:px-8">
        Map data © OpenStreetMap contributors · Place text from Wikivoyage and Wikipedia, CC BY-SA ·
        Photographs from Wikimedia Commons under their individual licences, see{' '}
        <Link href="/credits" className="underline underline-offset-2">credits</Link>.
      </div>
    </footer>
  );
}
