'use client';

import React, { useId, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Postmark } from '@/components/world/Postmark';

interface FormatShowcase {
  id: 'sentences' | 'whatsapp' | 'ticket' | 'blog';
  label: string;
  tryQuery: string;
  inputCardTitle: string;
  inputTone: 'paper' | 'whatsapp' | 'ticket' | 'link';
  inputLines: string[];
  inputMeta?: string;
  resultTitle: string;
  resultBadge: string;
  resultDays: Array<{
    n: number;
    day: string;
    title: string;
    note: string;
  }>;
}

const FORMATS: ReadonlyArray<FormatShowcase> = [
  {
    id: 'sentences',
    label: 'Sentences',
    tryQuery:
      '4 days in Varanasi and Sarnath with parents (65+), pure vegetarian meals, sugam darshan and afternoon rest buffers',
    inputCardTitle: 'Plain English or Hinglish note',
    inputTone: 'paper',
    inputLines: [
      '4 days in Varanasi and Sarnath with parents (65+).',
      'Pure vegetarian & satvik meals only, minimal stairs, sugam darshan at Kashi Vishwanath, and an afternoon rest window before evening Ganga aarti.',
    ],
    inputMeta: 'Typed directly into composer',
    resultTitle: 'Varanasi & Sarnath',
    resultBadge: '4D',
    resultDays: [
      {
        n: 1,
        day: 'Day 1',
        title: 'Arrival, afternoon rest & boat Sandhya Aarti',
        note: 'Pure Veg · Step-free jetty access at Dashashwamedh',
      },
      {
        n: 2,
        day: 'Day 2',
        title: 'Lalita Ghat escalator & Sugam Darshan corridor',
        note: '3 stops · 2h afternoon rest buffer enabled',
      },
      {
        n: 3,
        day: 'Day 3',
        title: 'Sarnath Dhamek Stupa & shaded museum walk',
        note: 'Level garden paths · 25m cab transfer',
      },
      {
        n: 4,
        day: 'Day 4',
        title: 'Assi Ghat Subah-e-Banaras & return train',
        note: 'Hindi / English Elder Card ready for WhatsApp',
      },
    ],
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp Chat',
    tryQuery:
      'Rohan: bro Manali then Kasol? 4 days max, mom is veg and cant do long drives. Old Manali cafes, Chalal trail, budget about 25k each',
    inputCardTitle: 'Rohan (Trip group)',
    inputTone: 'whatsapp',
    inputLines: [
      'bro Manali then Kasol? 4 days max, mom is veg and can’t do long drives lol.',
      'Ananya: +1 for Old Manali cafes & Chalal walk! Keep budget ~25k each.',
      'Vikram: Done, overnight bus from Delhi Friday night?',
    ],
    inputMeta: 'Pasted from WhatsApp · 10:42',
    resultTitle: 'Manali + Kasol',
    resultBadge: '4D',
    resultDays: [
      {
        n: 1,
        day: 'Day 1',
        title: 'Delhi to Manali, morning orchard check-in',
        note: 'Pure-veg dhaba stop suggested near Kullu',
      },
      {
        n: 2,
        day: 'Day 2',
        title: 'Old Manali cafes and Hadimba cedar forest',
        note: '4 stops · 6.5 km · relaxed pace',
      },
      {
        n: 3,
        day: 'Day 3',
        title: 'Kasol transfer and riverside Chalal trail',
        note: '2h 40m drive · afternoon rest buffer added',
      },
      {
        n: 4,
        day: 'Day 4',
        title: 'Manikaran hot springs, evening return to Delhi',
        note: 'Group UPI kitty &veg/non-veg splits ready',
      },
    ],
  },
  {
    id: 'ticket',
    label: 'Ticket / PNR',
    tryQuery:
      'IRCTC 12017 Dehradun Shatabdi NDLS 06:45 to Haridwar 11:15 CNF Coach C4, then 3 days in Rishikesh and Landour',
    inputCardTitle: 'RESERVATION · SAMPLE',
    inputTone: 'ticket',
    inputLines: [
      '12017 DEHRADUN SHTBDI · NDLS → HW',
      'DEP 06:45 · ARR 11:15 · CNF · COACH C4',
      'PNR ••••••842 (Aadhaar & full PNR auto-masked)',
    ],
    inputMeta: 'SMS text or PDF ticket attachment',
    resultTitle: 'Rishikesh & Landour',
    resultBadge: '3D',
    resultDays: [
      {
        n: 1,
        day: 'Day 1',
        title: 'Locked 06:45–11:15 Shatabdi anchor → Triveni Ghat',
        note: 'Nothing scheduled across train arrival window',
      },
      {
        n: 2,
        day: 'Day 2',
        title: 'Dehradun ghat climb up to Landour Chaar Dukan',
        note: '76 km hill cab · Lal Tibba sunset walk',
      },
      {
        n: 3,
        day: 'Day 3',
        title: 'Sisters Bazaar bakery walk & evening return',
        note: 'Ticket encrypted offline in AES-256-GCM vault',
      },
    ],
  },
  {
    id: 'blog',
    label: 'Blog Link',
    tryQuery:
      '5 days South Goa quiet beaches — Agonda cliff homestay, Cabo de Rama fort sunset, Palolem kayaking and Fontainhas heritage walk',
    inputCardTitle: 'Travel guide / public Reel caption',
    inputTone: 'link',
    inputLines: [
      'https://en.wikivoyage.org/wiki/South_Goa',
      '“Skip crowded North Goa belts for Agonda’s quiet crescent, Cabo de Rama sea-cliff fort, morning kayaking at Palolem and Panjim’s ochre Fontainhas lanes.”',
    ],
    inputMeta: 'Public web guide + OpenStreetMap pin matching',
    resultTitle: 'Quiet South Goa',
    resultBadge: '5D',
    resultDays: [
      {
        n: 1,
        day: 'Day 1',
        title: 'Madgaon rail arrival & Agonda beach check-in',
        note: '37 km coastal transfer · sunset swim',
      },
      {
        n: 2,
        day: 'Day 2',
        title: 'Palolem morning kayak & Cabo de Rama cliff fort',
        note: '3 verified OpenStreetMap pins · 28 km loop',
      },
      {
        n: 3,
        day: 'Day 3',
        title: 'Fontainhas Latin Quarter & Panjim bakeries',
        note: 'Walkable heritage trail + local cafe stops',
      },
      {
        n: 4,
        day: 'Days 4–5',
        title: 'Butterfly cove boat & unhurried departure',
        note: 'Every extracted place editable on live route map',
      },
    ],
  },
];

/**
 * "Give us anything": interactive accessible tablist showcasing how real-world
 * inputs (Sentences, WhatsApp Chat, Ticket / PNR, Blog Link) become mapped itineraries.
 */
export function GiveAnything() {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const baseId = useId();

  const selectAndFocus = (nextIdx: number) => {
    const wrapped = (nextIdx + FORMATS.length) % FORMATS.length;
    setSelectedIdx(wrapped);
    const btn = tabRefs.current[wrapped];
    btn?.focus();
    btn?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      selectAndFocus(idx + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      selectAndFocus(idx - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      selectAndFocus(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      selectAndFocus(FORMATS.length - 1);
    }
  };

  const active = FORMATS[selectedIdx]!;

  return (
    <section aria-labelledby="give-title" className="on-paper relative overflow-hidden bg-[#F1E4C6] text-navy">
      <div className="mx-auto max-w-[1280px] px-5 py-20 md:px-8 md:py-24">
        <h2 id="give-title" className="display max-w-[16ch] text-[48px] text-navy md:text-[72px]">
          Give us anything. Get a trip.
        </h2>
        <p className="mt-5 max-w-[60ch] text-[19px] text-paper-ink">
          Type a sentence, paste a WhatsApp thread, drop an IRCTC ticket or a guide link. Itinbee reads it, finds
          every place on the open map and lays out the days. You stay in charge of every stop.
        </p>

        {/* Accessible single-row Tablist with 3px border shape indicator */}
        <div
          role="tablist"
          aria-label="Example trip input formats"
          className="mt-9 flex items-center gap-2 overflow-x-auto border-b-2 border-navy/20 pb-0"
        >
          {FORMATS.map((fmt, idx) => {
            const selected = idx === selectedIdx;
            return (
              <button
                key={fmt.id}
                ref={(el) => {
                  tabRefs.current[idx] = el;
                }}
                id={`${baseId}-tab-${fmt.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => setSelectedIdx(idx)}
                onKeyDown={(e) => handleTabKeyDown(e, idx)}
                className={`relative min-h-[46px] flex-none px-4 py-2.5 text-[16px] font-bold transition-colors ${
                  selected
                    ? 'text-vermilion-deep after:absolute after:inset-x-0 after:bottom-0 after:border-b-[3px] after:border-vermilion-deep'
                    : 'text-paper-ink hover:text-navy'
                }`}
              >
                {fmt.label}
              </button>
            );
          })}
        </div>

        {/* Tab panels */}
        {FORMATS.map((fmt, idx) => {
          const isSelected = idx === selectedIdx;
          return (
            <div
              key={fmt.id}
              role="tabpanel"
              aria-labelledby={`${baseId}-tab-${fmt.id}`}
              hidden={!isSelected}
            >
              <div className="mt-10 grid items-center gap-10 lg:grid-cols-[1fr_auto_1.08fr] lg:gap-8">
                {/* Before: Selected Input Example */}
                <div className="mx-auto w-full max-w-[520px] space-y-5">
                  <div
                    className={`relative rounded-[14px] border-2 border-navy p-6 shadow-[0_14px_26px_-10px_rgba(20,33,61,0.38)] ${
                      fmt.inputTone === 'whatsapp'
                        ? 'rounded-tl-[4px] bg-[#DCF8C6] text-[#1B2B1F]'
                        : fmt.inputTone === 'ticket'
                          ? 'bg-[#FBE0DC] text-navy'
                          : 'bg-[#FFFDF8] text-navy'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-navy/15 pb-2.5">
                      <span className="font-mono text-[12px] font-bold uppercase tracking-wider text-navy">
                        {fmt.inputCardTitle}
                      </span>
                      <span className="rounded bg-navy px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-saffron">
                        Example input
                      </span>
                    </div>

                    <div
                      className={`mt-4 space-y-2.5 ${
                        fmt.inputTone === 'ticket'
                          ? 'font-mono text-[14px] leading-relaxed'
                          : 'text-[16.5px] leading-relaxed'
                      }`}
                    >
                      {fmt.inputLines.map((line, lIdx) => (
                        <p key={lIdx}>{line}</p>
                      ))}
                    </div>

                    {fmt.inputTone === 'ticket' && (
                      <div
                        aria-hidden="true"
                        className="mt-4 h-[22px] bg-[repeating-linear-gradient(90deg,#14213D_0_2px,transparent_2px_5px,#14213D_5px_6px,transparent_6px_9px)] opacity-65"
                      />
                    )}

                    {fmt.inputMeta && (
                      <div className="mt-4 text-right text-[12px] font-semibold text-paper-ink">
                        {fmt.inputMeta}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <Link
                      href={`/create?q=${encodeURIComponent(fmt.tryQuery)}`}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border-2 border-navy bg-[#FFFDF8] px-4 py-2 text-[15px] font-bold text-navy transition-colors hover:bg-paper"
                    >
                      <span>Try this input</span>
                      <ArrowRight size={17} strokeWidth={2.25} aria-hidden="true" />
                    </Link>
                  </div>
                </div>

                {/* Stamp between */}
                <div className="relative mx-auto grid place-items-center">
                  <Postmark
                    ring="ITINBEE · READS IT ALL ·"
                    centre="MAPPED"
                    size={128}
                    className="-rotate-6 opacity-85"
                  />
                  <svg
                    className="mt-2 hidden lg:block"
                    width="64"
                    height="24"
                    viewBox="0 0 64 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M2 12H58M48 4l10 8-10 8"
                      stroke="#14213D"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>

                {/* After: Grounded Day-by-Day Result */}
                <div className="relative mx-auto w-full max-w-[560px]">
                  <div className="relative rounded-[14px] border-2 border-navy bg-paper-light p-6 shadow-[0_18px_30px_-12px_rgba(20,33,61,0.45)]">
                    <div className="mb-4 flex items-baseline justify-between gap-3 border-b-2 border-dashed border-navy/30 pb-3">
                      <span className="display text-[34px] text-navy">{active.resultTitle}</span>
                      <span className="display rounded border border-navy bg-saffron px-2 py-0.5 text-[22px] leading-none text-navy">
                        {active.resultBadge}
                      </span>
                    </div>
                    <ol className="space-y-4">
                      {fmt.resultDays.map((s) => (
                        <li key={s.n} className="flex gap-4">
                          <span className="display grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-navy bg-vermilion-deep text-[20px] leading-none text-[#FFFDF8]">
                            {s.n}
                          </span>
                          <div>
                            <div className="text-[13px] font-bold uppercase tracking-[0.08em] text-paper-ink">
                              {s.day}
                            </div>
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
          );
        })}
      </div>
    </section>
  );
}
