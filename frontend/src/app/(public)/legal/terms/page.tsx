import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Use',
  description: 'Terms governing use of Itinbee itinerary planning, shared links, and open-data content.',
};

export default function TermsPage() {
  return (
    <div className="trunk-ground-flat">
      <div className="mx-auto max-w-[860px] px-5 py-16 md:px-8">
        <h1 className="display text-[56px] text-saffron md:text-[72px]">Terms of use</h1>
        <div className="on-paper mt-8 space-y-6 rounded-[14px] border-2 border-navy bg-paper p-7 text-[17px] text-navy shadow-label md:p-9">
          <section>
            <h2 className="display text-[32px]">1. Planning tool, not a booking agency</h2>
            <p className="mt-2 text-paper-ink">
              Itinbee helps you organize trips, discover places, estimate transit times and split group expenses. We are
              not a travel agent, carrier or payment processor; always verify live train, flight, road, weather and visa
              advisories with official operators before travelling.
            </p>
          </section>

          <section>
            <h2 className="display text-[32px]">2. User-published itineraries</h2>
            <p className="mt-2 text-paper-ink">
              When you choose to publish a trip to Explore, you confirm that it does not contain private personal data
              of others and allow other travellers to view and clone the route structure. Private trips and unshared
              drafts never appear in Explore.
            </p>
          </section>

          <section>
            <h2 className="display text-[32px]">3. Open-data &amp; Creative Commons attribution</h2>
            <p className="mt-2 text-paper-ink">
              Map data, place summaries and destination photographs derive from OpenStreetMap (ODbL), Wikivoyage /
              Wikipedia (CC BY-SA) and Wikimedia Commons. Full attribution is maintained on our{' '}
              <Link href="/credits" className="font-bold underline underline-offset-2">
                credits page
              </Link>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
