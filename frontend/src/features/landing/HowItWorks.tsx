import React from 'react';

const STEPS = [
  { n: 1, title: 'Describe it', text: 'A sentence, a chat, a ticket. Any language, any format.' },
  { n: 2, title: 'We map it', text: 'Every place is found on a real map. Nothing is guessed.' },
  { n: 3, title: 'Tweak it', text: 'Drag stops between days, add suggested places, see travel times.' },
  { n: 4, title: 'Share it', text: 'One link for WhatsApp. Elders get a big-print Hindi or English card.' },
] as const;

/** Four stops on a route: the sequence itself carries information, so numerals earn their place. */
export function HowItWorks() {
  return (
    <section aria-labelledby="how-title" className="trunk-ground-flat relative overflow-hidden">
      <div className="mx-auto max-w-[1280px] px-5 py-20 md:px-8 md:py-24">
        <h2 id="how-title" className="display max-w-[18ch] text-[48px] text-saffron md:text-[72px]">
          From a thought to a plan in four stops
        </h2>

        <ol className="relative mt-16 grid gap-10 md:grid-cols-4 md:gap-6">
          <div
            aria-hidden="true"
            className="absolute left-[22px] top-3 hidden h-[calc(100%-24px)] border-l-2 border-dashed border-saffron/60 md:left-6 md:top-[22px] md:block md:h-0 md:w-[calc(100%-48px)] md:border-l-0 md:border-t-2"
          />
          {STEPS.map((s) => (
            <li key={s.n} className="relative flex gap-5 md:block">
              <span className="display relative z-[1] grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-paper bg-vermilion-deep text-[28px] leading-none text-[#FFFDF8] shadow-[0_6px_10px_-2px_rgba(0,0,0,0.5)]">
                {s.n}
              </span>
              <div className="md:mt-5">
                <h3 className="display text-[34px] text-paper">{s.title}</h3>
                <p className="mt-1.5 max-w-[30ch] text-[17px] text-paper/85">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
