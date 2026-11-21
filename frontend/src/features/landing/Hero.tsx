import React from 'react';
import Link from 'next/link';
import { DieCutLabel } from '@/components/world/DieCutLabel';
import { Postmark } from '@/components/world/Postmark';
import { Composer } from '@/components/world/Composer';
import { TrunkCorners } from '@/components/world/TrunkCorners';

/**
 * First viewport: a lacquered trunk lid filling the viewport below the 64px nav
 * and closing with the open-data agate credits strip. A single responsive luggage
 * tag carries the one <h1> and composer across desktop and mobile.
 */
export function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="trunk-ground trunk-frame relative isolate flex min-h-[calc(100dvh-64px)] flex-col justify-between overflow-hidden"
    >
      <TrunkCorners />

      {/* Stage container: absolute composition at >=1024px (804px tall + 32px agate = 836px + 64px nav = 900px), stacked below 1024px */}
      <div className="hero-stage relative mx-auto w-full max-w-[640px] px-5 pb-10 pt-9 lg:h-[804px] lg:max-w-none lg:w-[1280px] lg:p-0">
        {/* Desktop string & numbered leader lines */}
        <svg
          className="pointer-events-none absolute inset-0 z-[19] hidden lg:block"
          width="1280"
          height="804"
          viewBox="0 0 1280 804"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="640" cy="12" r="5" fill="#D59E3A" stroke="#14213D" strokeWidth="1.5" />
          <path
            d="M638 14 C634 34 637 52 639 70 M642 14 C646 34 643 52 641 70"
            stroke="#E8D7B0"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <g className="anim-fade" style={{ ['--delay' as string]: '900ms' }}>
            {/* Leader 01: starts cleanly below Hampi's pin badge 1 and meets the left rim of inset pin 1 */}
            <path
              d="M242 642 L296 716 L1044 716"
              stroke="#14213D"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M242 642 L296 716 L1044 716"
              stroke="#F2A71B"
              strokeWidth="1.5"
              strokeDasharray="5 4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Leader 02: starts below Alleppey's pin badge 2 and meets the top rim of inset pin 2 */}
            <path
              d="M1224 550 L1190 584 L1164 584 L1164 672"
              stroke="#14213D"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M1224 550 L1190 584 L1164 584 L1164 672"
              stroke="#F2A71B"
              strokeWidth="1.5"
              strokeDasharray="5 4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <rect x="618" y="706" width="26" height="19" rx="4" fill="#14213D" stroke="#F2A71B" strokeWidth="1.2" />
            <text
              x="631"
              y="720"
              textAnchor="middle"
              fill="#F2A71B"
              fontSize="11"
              fontWeight="700"
              fontFamily="Source Sans 3, sans-serif"
            >
              01
            </text>
            <rect x="1177" y="574" width="26" height="19" rx="4" fill="#14213D" stroke="#F2A71B" strokeWidth="1.2" />
            <text
              x="1190"
              y="588"
              textAnchor="middle"
              fill="#F2A71B"
              fontSize="11"
              fontWeight="700"
              fontFamily="Source Sans 3, sans-serif"
            >
              02
            </text>
          </g>
        </svg>

        {/* Desktop surrounding die-cut destination labels */}
        <DieCutLabel
          slug="spiti-valley"
          name="Spiti"
          days={7}
          shape="arch"
          priority
          sizes="240px"
          className="anim-land absolute left-[26px] top-[46px] z-[14] hidden h-[250px] w-[236px] -rotate-[4deg] lg:block"
          style={{ ['--delay' as string]: '120ms' }}
          href="/explore?dest=spiti"
        />
        <DieCutLabel
          slug="hampi"
          name="Hampi"
          days={3}
          shape="notch"
          pin={1}
          priority
          sizes="240px"
          className="anim-land absolute left-[28px] top-[406px] z-[14] hidden h-[222px] w-[242px] rotate-[3deg] lg:block"
          style={{ ['--delay' as string]: '260ms' }}
          href="/explore?dest=hampi"
        />
        <DieCutLabel
          slug="kyoto"
          name="Kyoto"
          days={5}
          shape="oval"
          priority
          sizes="250px"
          className="anim-land absolute right-[22px] top-[38px] z-[14] hidden h-[204px] w-[246px] rotate-[4deg] lg:block"
          style={{ ['--delay' as string]: '200ms' }}
          href="/explore?dest=kyoto"
        />
        <DieCutLabel
          slug="alleppey"
          name="Alleppey"
          days={4}
          shape="round"
          pin={2}
          priority
          sizes="250px"
          className="anim-land absolute right-[32px] top-[320px] z-[14] hidden h-[214px] w-[244px] -rotate-[3deg] lg:block"
          style={{ ['--delay' as string]: '340ms' }}
          href="/explore?dest=alleppey"
        />

        {/* Single responsive Luggage Tag Composer + single <h1> */}
        <div className="anim-settle relative z-20 drop-shadow-[0_18px_18px_rgba(3,18,14,0.5)] lg:absolute lg:left-[360px] lg:top-[52px] lg:w-[560px] lg:drop-shadow-[0_22px_22px_rgba(3,18,14,0.55)]">
          <div className="tag-cut paper-surface relative border-b-4 border-paper-edge px-6 pb-7 pt-[58px] sm:px-[42px]">
            <span className="tag-hole" aria-hidden="true" />
            <h1
              id="hero-title"
              className="display mb-5 text-[38px] text-navy min-[420px]:text-[44px] sm:text-[52px] lg:text-[60px]"
            >
              Tell us where.
              <br />
              <span className="text-vermilion-deep">We&rsquo;ll build the trip.</span>
            </h1>
            <Composer />
          </div>
        </div>

        {/* Desktop postmarks */}
        <Postmark
          ring="ITINBEE · TEMPLATE · READY ·"
          centre="MAPPED"
          size={110}
          className="anim-stamp absolute left-[806px] top-[398px] z-[22] hidden -rotate-[11deg] opacity-80 lg:block"
          style={{ ['--delay' as string]: '760ms' }}
        />
        <Postmark
          ring="DAY BY DAY · ITINBEE ·"
          centre="PLANNED"
          size={96}
          className="anim-stamp absolute left-[222px] top-[322px] z-[22] hidden rotate-[8deg] opacity-80 lg:block"
          style={{ ['--delay' as string]: '860ms' }}
        />

        {/* Desktop route inset */}
        <aside
          className="anim-land on-paper absolute bottom-[26px] right-[12px] z-[15] hidden h-[160px] w-[280px] overflow-hidden rounded-[10px] border-2 border-navy bg-paper shadow-label lg:block"
          style={{ ['--delay' as string]: '480ms' }}
          aria-label="Illustration: stops tied to pins on a route"
        >
          <svg className="block h-full w-full" viewBox="0 0 276 156" aria-hidden="true">
            <rect width="276" height="156" fill="#EFE2C4" />
            <path d="M0 39H276M0 78H276M0 117H276M69 0V156M138 0V156M207 0V156" stroke="#14213D" strokeOpacity=".1" />
            <path
              d="M20 12 C62 38 60 88 82 136 L126 148 C160 110 196 70 244 36 L260 12 Z"
              fill="#E3CFA4"
              stroke="#14213D"
              strokeOpacity=".35"
              strokeWidth="1.4"
            />
            <path d="M66 96 Q120 102 174 64" fill="none" stroke="#C7361F" strokeWidth="2" strokeDasharray="4 3" />
            <circle cx="66" cy="96" r="11" fill="#C7361F" stroke="#14213D" strokeWidth="2" />
            <text
              x="66"
              y="100"
              textAnchor="middle"
              fill="#FFFDF8"
              fontSize="11"
              fontWeight="700"
              fontFamily="Source Sans 3, sans-serif"
            >
              1
            </text>
            <circle cx="174" cy="64" r="11" fill="#C7361F" stroke="#14213D" strokeWidth="2" />
            <text
              x="174"
              y="68"
              textAnchor="middle"
              fill="#FFFDF8"
              fontSize="11"
              fontWeight="700"
              fontFamily="Source Sans 3, sans-serif"
            >
              2
            </text>
          </svg>
          <span className="absolute left-2 top-2 rounded border border-navy/25 bg-paper/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-navy">
            Example route
          </span>
        </aside>

        {/* Stacked destination labels below 1024px */}
        <ul role="list" className="mt-9 grid grid-cols-2 gap-4 lg:hidden" aria-label="Popular destinations">
          {[
            { slug: 'spiti-valley', name: 'Spiti', days: 7, shape: 'arch' as const, rot: '-rotate-2' },
            { slug: 'kyoto', name: 'Kyoto', days: 5, shape: 'oval' as const, rot: 'rotate-2' },
            { slug: 'hampi', name: 'Hampi', days: 3, shape: 'notch' as const, rot: 'rotate-1' },
            { slug: 'alleppey', name: 'Alleppey', days: 4, shape: 'round' as const, rot: '-rotate-1' },
          ].map((l) => (
            <li key={l.slug}>
              <DieCutLabel
                slug={l.slug}
                name={l.name}
                days={l.days}
                shape={l.shape}
                sizes="45vw"
                className={`aspect-[1/1.05] ${l.rot}`}
                href={`/explore?dest=${l.slug}`}
              />
            </li>
          ))}
        </ul>
      </div>

      {/* Agate open-data credits strip closing the first viewport */}
      <div className="agate relative z-20 flex min-h-[32px] items-center justify-center border-t border-saffron/20 bg-[#051c16]/90 px-4 py-1.5 text-center text-paper/80">
        <span>
          Map data © OpenStreetMap contributors · Text from Wikivoyage &amp; Wikipedia, CC BY-SA · Photos from{' '}
          <Link href="/credits" className="underline underline-offset-2 hover:text-paper">
            Wikimedia Commons
          </Link>
        </span>
      </div>
    </section>
  );
}
