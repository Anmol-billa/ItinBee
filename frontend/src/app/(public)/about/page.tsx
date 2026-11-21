import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About Itinbee',
  description:
    'Why Itinbee exists: OTA-neutral, WhatsApp-native, offline-ready trip planning built for Indian multi-modal travel and global adventures.',
};

export default function AboutPage() {
  return (
    <div className="trunk-ground-flat">
      <div className="mx-auto max-w-[880px] px-5 py-16 md:px-8 md:py-20">
        <h1 className="display text-[56px] text-saffron md:text-[80px]">Built for how real groups plan trips</h1>
        <p className="mt-5 max-w-[66ch] text-[19px] text-paper/90">
          Most travel apps assume you book everything inside one cart or spend weekends formatting a spreadsheet. In
          reality, trips start in a messy WhatsApp group — an IRCTC train ticket here, a flight PDF there, a friend’s
          saved Reel, and parents asking what time to reach the station.
        </p>

        <div className="on-paper mt-10 rounded-[14px] border-2 border-navy bg-paper p-7 text-navy shadow-label md:p-9">
          <h2 className="display text-[40px] text-navy">Our product commitments</h2>
          <dl className="mt-6 space-y-5 text-[17px]">
            <div>
              <dt className="font-bold text-navy">Value before account</dt>
              <dd className="mt-1 text-paper-ink">
                Start drafting an itinerary or open a shared WhatsApp link immediately without hitting a signup wall.
                Sign in only when you want to sync trips across devices.
              </dd>
            </div>
            <div>
              <dt className="font-bold text-navy">Real map data, never hallucinated coordinates</dt>
              <dd className="mt-1 text-paper-ink">
                AI helps read messy notes and structure days, while every destination, attraction, restaurant and stay
                is grounded against open geographic datasets (OpenStreetMap, Wikivoyage, Wikipedia and Wikidata).
              </dd>
            </div>
            <div>
              <dt className="font-bold text-navy">OTA-neutral &amp; offline-honest</dt>
              <dd className="mt-1 text-paper-ink">
                Bring bookings from IRCTC, IndiGo, Air India, redBus, homestays or international rails. Critical
                schedules, masked PNRs and group expenses remain readable offline in hill-station dead zones.
              </dd>
            </div>
            <div>
              <dt className="font-bold text-navy">Built for every generation in the group</dt>
              <dd className="mt-1 text-paper-ink">
                Every shared itinerary includes a one-tap Family &amp; Elder Card mode with generous daylight-legible
                type, English / हिन्दी support, dietary flags and rest buffers.
              </dd>
            </div>
          </dl>

          <div className="mt-8 flex flex-wrap gap-3 border-t-2 border-dashed border-navy/25 pt-6">
            <Link href="/create" className="btn-stamp">
              Build a trip
            </Link>
            <Link href="/explore" className="btn-line text-navy">
              Browse itineraries
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
