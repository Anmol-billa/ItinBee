import React from 'react';
import Link from 'next/link';

const FAQ = [
  {
    q: 'Do I need an account to start?',
    a: 'No. Describe your trip and build it first. You will only need to sign in when you want to keep a trip across devices.',
  },
  {
    q: 'What can I give Itinbee?',
    a: 'A sentence, bullet notes, a pasted WhatsApp conversation, a link to an article, or a ticket or screenshot. It works in English, Hindi and Hinglish.',
  },
  {
    q: 'Is the itinerary made by AI?',
    a: 'AI reads your input and drafts the plan, but every place comes from real map data, so nothing is invented. Every stop and every day stays editable.',
  },
  {
    q: 'Where do the places and photos come from?',
    a: 'OpenStreetMap, Wikivoyage, Wikipedia and Wikimedia Commons. They are open projects, credited on every page foot and on the credits page.',
  },
  {
    q: 'Can my family see the plan without installing anything?',
    a: 'Yes. Share a link on WhatsApp. It opens in the browser, with a big-print card in Hindi or English for elders.',
  },
] as const;

export function Faq() {
  return (
    <section aria-labelledby="faq-title" className="on-paper bg-[#F1E4C6] text-navy">
      <div className="mx-auto grid max-w-[1280px] gap-12 px-5 py-20 md:px-8 md:py-24 lg:grid-cols-[0.8fr_1.2fr]">
        <h2 id="faq-title" className="display text-[48px] text-navy md:text-[64px]">
          Questions, answered
        </h2>
        <div className="divide-y-2 divide-dashed divide-navy/25 border-y-2 border-dashed border-navy/25">
          {FAQ.map((f) => (
            <details key={f.q} className="group py-5">
              <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-6 text-[20px] font-bold marker:content-none [&::-webkit-details-marker]:hidden">
                <span>{f.q}</span>
                <span
                  aria-hidden="true"
                  className="display grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-navy text-[22px] leading-none motion-safe:transition-transform motion-safe:duration-200 group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <div className="mt-2.5 max-w-[60ch] text-[18px] leading-relaxed text-paper-ink">
                <p>{f.a}</p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="trunk-ground relative overflow-hidden">
      <div className="mx-auto flex max-w-[1280px] flex-col items-start gap-8 px-5 py-20 md:flex-row md:items-center md:justify-between md:px-8 md:py-24">
        <h2 id="cta-title" className="display text-[56px] text-paper md:text-[96px]">
          Where to?
        </h2>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/create" className="btn-stamp text-[18px]">
            Build my trip
          </Link>
          <Link href="/explore" className="btn-line btn-line-light text-paper">
            Browse itineraries
          </Link>
        </div>
      </div>
    </section>
  );
}
