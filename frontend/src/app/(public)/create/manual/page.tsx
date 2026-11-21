import React from 'react';
import type { Metadata } from 'next';
import { TrunkCorners } from '@/components/world/TrunkCorners';
import { ManualWizardForm } from '@/features/create/ManualWizardForm';

export const metadata: Metadata = {
  title: 'Build itinerary from scratch',
  description:
    'Set your destinations, dates, home currency and Family/Elder Card preferences to start a blank Itinbee workspace.',
};

export default function ManualCreatePage() {
  return (
    <section className="trunk-ground trunk-frame relative isolate min-h-[calc(100dvh-64px)] overflow-x-hidden py-10 md:py-14">
      <TrunkCorners />
      <div className="relative z-10 mx-auto max-w-[820px] px-5 md:px-8">
        <ManualWizardForm />
      </div>
    </section>
  );
}
