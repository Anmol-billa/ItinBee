import React from 'react';
import { Hero } from '@/features/landing/Hero';
import { GiveAnything } from '@/features/landing/GiveAnything';
import { HowItWorks } from '@/features/landing/HowItWorks';
import { FeaturedItineraries } from '@/features/landing/FeaturedItineraries';
import { SeasonWall } from '@/features/landing/SeasonWall';
import { PlannerPreview } from '@/features/landing/PlannerPreview';
import { TravelTogether } from '@/features/landing/TravelTogether';
import { Faq, FinalCta } from '@/features/landing/FaqAndCta';

/** Regenerated hourly so featured itineraries and seasonal destinations stay fresh. */
export const revalidate = 3600;

export default function LandingPage() {
  const month = new Date().getUTCMonth() + 1;
  return (
    <>
      <Hero />
      <GiveAnything />
      <HowItWorks />
      <FeaturedItineraries />
      <SeasonWall month={month} />
      <PlannerPreview />
      <TravelTogether />
      <Faq />
      <FinalCta />
    </>
  );
}
