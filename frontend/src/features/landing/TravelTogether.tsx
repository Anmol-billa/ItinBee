import React from 'react';

const TAGS = [
  { title: 'WhatsApp link', text: 'One tap to share. Friends open it without signing up.', w: 'max-w-[300px]', rot: '-rotate-[2deg]' },
  { title: 'Elder card A / अ', text: 'Big print, Hindi or English, veg and rest notes, no jargon.', w: 'max-w-[340px]', rot: 'rotate-[1.5deg]' },
  { title: 'Group polls', text: 'Vote on stays and dates in one tap, no login.', w: 'max-w-[280px]', rot: '-rotate-[1deg]' },
  { title: 'UPI split', text: 'Unequal bills, a shared kitty and settle-up links.', w: 'max-w-[310px]', rot: 'rotate-[2.5deg]' },
  { title: 'Works offline', text: 'Tickets and plans stay readable in the hills.', w: 'max-w-[290px]', rot: '-rotate-[2.5deg]' },
] as const;

/** Hanging luggage tags of different sizes, not a row of identical cards. */
export function TravelTogether() {
  return (
    <section aria-labelledby="together-title" className="trunk-ground relative overflow-hidden">
      <div className="mx-auto max-w-[1280px] px-5 py-20 md:px-8 md:py-24">
        <h2 id="together-title" className="display max-w-[15ch] text-[48px] text-saffron md:text-[72px]">
          Built for the whole group chat
        </h2>
        <p className="mt-5 max-w-[58ch] text-[19px] text-paper/90">
          Planning is a team sport in India: parents, cousins, friends. Everything you need to travel together hangs
          off the same trip.
        </p>

        <ul className="mt-16 flex flex-wrap items-start gap-x-8 gap-y-14">
          {TAGS.map((t, i) => (
            <li
              key={t.title}
              className={`on-paper relative w-full ${t.w} ${t.rot} ${i % 2 ? 'mt-6' : ''} drop-shadow-[0_16px_14px_rgba(3,18,14,0.5)]`}
            >
              <svg className="absolute -top-9 left-1/2 -translate-x-1/2" width="14" height="44" viewBox="0 0 14 44" fill="none" aria-hidden="true">
                <path d="M6 0C4 14 8 28 7 44M8 0C10 14 6 28 7 44" stroke="#E8D7B0" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
              <div className="tag-cut paper-surface relative border-b-4 border-paper-edge px-6 pb-6 pt-[52px]">
                <span className="tag-hole" aria-hidden="true" />
                <h3 className="display text-[34px] text-navy">{t.title}</h3>
                <p className="mt-1.5 text-[17px] leading-snug text-paper-ink">{t.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
