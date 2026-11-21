import React from 'react';
import { Postmark } from '@/components/world/Postmark';

/**
 * "Give us anything": a pile of real-world scraps on the left becomes a tidy,
 * mapped itinerary on the right. All content is a labelled EXAMPLE.
 */
export function GiveAnything() {
  return (
    <section aria-labelledby="give-title" className="on-paper relative overflow-hidden bg-[#F1E4C6] text-navy">
      <div className="mx-auto max-w-[1280px] px-5 py-20 md:px-8 md:py-24">
        <h2 id="give-title" className="display max-w-[16ch] text-[48px] text-navy md:text-[72px]">
          Give us anything. Get a trip.
        </h2>
        <p className="mt-5 max-w-[60ch] text-[19px] text-paper-ink">
          Type a sentence, paste a WhatsApp thread, drop an IRCTC ticket or a screenshot. Itinbee reads it, finds
          every place on the map and lays out the days. You stay in charge of every stop.
        </p>

        <div className="mt-14 grid items-center gap-12 lg:grid-cols-[1fr_auto_1.05fr] lg:gap-8">
          {/* Scraps */}
          <div className="relative mx-auto flex w-full max-w-[520px] flex-col gap-5 pb-8 md:block md:h-[430px] md:pb-0" role="img" aria-label="Example inputs: a WhatsApp message, a train ticket, a reel link and handwritten notes">
            <div className="relative w-full max-w-[300px] -rotate-[2deg] md:absolute md:left-0 md:top-2 md:w-[300px] md:-rotate-[3deg] rounded-[14px] rounded-tl-[3px] bg-[#DCF8C6] px-4 py-3 text-[15px] leading-snug text-[#1B2B1F] shadow-[0_10px_18px_-6px_rgba(20,33,61,0.35)]">
              <span className="block text-[12px] font-bold text-[#0B6B4F]">Rohan (Trip group)</span>
              bro Manali then Kasol? 4 days max, mom is veg and can&rsquo;t do long drives lol. Train ticket in the pdf
              <span className="mt-1 block text-right text-[11px] text-[#4D6B56]">10:42</span>
            </div>

            <div className="relative w-full max-w-[270px] self-end rotate-[2deg] md:absolute md:right-0 md:top-[88px] md:w-[270px] md:rotate-[2.5deg] border border-navy/30 bg-[#FBE0DC] px-4 py-3 shadow-[0_10px_18px_-6px_rgba(20,33,61,0.35)]">
              <div className="font-mono text-[11px] font-semibold tracking-wide text-navy/80">
                RESERVATION · SAMPLE
              </div>
              <div className="mt-1 font-mono text-[13px] leading-[1.5] text-navy">
                12017 NDLS → DDN
                <br />
                06:45 · CNF · COACH C2
                <br />
                PNR 82•••••09
              </div>
              <div className="mt-2 h-[22px] bg-[repeating-linear-gradient(90deg,#14213D_0_2px,transparent_2px_5px,#14213D_5px_6px,transparent_6px_9px)] opacity-70" />
            </div>

            <div className="relative w-full max-w-[250px] -rotate-[1.5deg] md:absolute md:left-[18px] md:top-[196px] md:w-[250px] rounded-md border-[1.5px] border-navy bg-white px-3.5 py-2.5 text-[14px] shadow-[0_10px_18px_-6px_rgba(20,33,61,0.35)]">
              <span className="font-bold text-vermilion-deep">Reel link</span>
              <span className="block truncate text-paper-ink">kasol cafes you must try + hidden waterfall</span>
            </div>

            <div className="relative w-full max-w-[300px] self-end rotate-[2deg] md:absolute md:bottom-0 md:right-3 md:w-[300px] md:rotate-[3deg] bg-[#FFFDF2] px-5 py-4 text-[16px] leading-[1.7] text-navy shadow-[0_10px_18px_-6px_rgba(20,33,61,0.35)] [background-image:repeating-linear-gradient(transparent_0_26px,rgba(20,33,61,0.13)_26px_27px)]">
              <ul className="list-disc pl-5">
                <li>Old Manali cafes</li>
                <li>Tosh or Kheerganga?</li>
                <li>pure veg dinner spots (Mom!)</li>
                <li>budget about 25k each</li>
              </ul>
            </div>
            <span className="absolute bottom-0 left-2 rounded bg-navy md:-bottom-3 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-saffron">
              Example input
            </span>
          </div>

          {/* Stamp between */}
          <div className="relative mx-auto grid place-items-center">
            <Postmark ring="ITINBEE · READS IT ALL ·" centre="MAPPED" size={132} className="opacity-85 -rotate-6" />
            <svg className="mt-2 hidden lg:block" width="64" height="24" viewBox="0 0 64 24" fill="none" aria-hidden="true">
              <path d="M2 12H58M48 4l10 8-10 8" stroke="#14213D" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {/* Result */}
          <div className="relative mx-auto w-full max-w-[560px]">
            <div className="relative border-2 border-navy bg-paper-light p-6 shadow-[0_18px_30px_-12px_rgba(20,33,61,0.45)]">
              <div className="mb-4 flex items-baseline justify-between gap-3 border-b-2 border-dashed border-navy/30 pb-3">
                <span className="display text-[34px] text-navy">Manali + Kasol</span>
                <span className="display rounded border border-navy bg-saffron px-2 py-0.5 text-[22px] leading-none text-navy">4D</span>
              </div>
              <ol className="space-y-4">
                {[
                  { n: 1, day: 'Day 1', title: 'Delhi to Manali, overnight bus', note: 'Veg dhaba stop suggested at Kullu' },
                  { n: 2, day: 'Day 2', title: 'Old Manali cafes and Hadimba Temple', note: '4 stops · 6.5 km · relaxed pace' },
                  { n: 3, day: 'Day 3', title: 'Kasol and the Chalal trail', note: '2h 40m drive · rest buffer added for Mom' },
                  { n: 4, day: 'Day 4', title: 'Kasol sunrise, bus back to Delhi', note: 'Leaves 17:30 · reaches 05:20' },
                ].map((s) => (
                  <li key={s.n} className="flex gap-4">
                    <span className="display grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-navy bg-vermilion-deep text-[20px] leading-none text-[#FFFDF8]">
                      {s.n}
                    </span>
                    <div>
                      <div className="text-[13px] font-bold uppercase tracking-[0.08em] text-paper-ink">{s.day}</div>
                      <div className="text-[18px] font-bold leading-snug">{s.title}</div>
                      <div className="text-[15px] text-paper-ink">{s.note}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <span className="absolute -bottom-3 right-3 rounded bg-navy px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-saffron">
              Example result
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
