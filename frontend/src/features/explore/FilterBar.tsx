'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { SHOWCASE } from '@/data/showcase';
import { browserApiBase } from '@/lib/api-base';
import {
  BUDGETS,
  DURATION_BUCKETS,
  TRIP_TYPES,
  queryToSearchParams,
  type ExploreQuery,
} from '@/lib/explore-client';
import { MONTH_NAMES } from '@/data/showcase';

interface Suggestion {
  slug: string;
  name: string;
  secondary: string;
}

interface FilterBarProps {
  query: ExploreQuery;
  /** Label for the selected destination slug (resolved on the server). */
  destLabel?: string;
  total: number;
  facets: { durations: Record<string, number>; types: Record<string, number> };
}

const LOCAL_REGIONS: Suggestion[] = [
  { slug: 'india', name: 'India', secondary: 'Country · All regions' },
  { slug: 'rajasthan', name: 'Rajasthan', secondary: 'State · India' },
  { slug: 'himachal-pradesh', name: 'Himachal Pradesh', secondary: 'State · India' },
  { slug: 'uttarakhand', name: 'Uttarakhand', secondary: 'State · India' },
  { slug: 'kerala', name: 'Kerala', secondary: 'State · India' },
  { slug: 'uttar-pradesh', name: 'Uttar Pradesh', secondary: 'State · India' },
  { slug: 'vietnam', name: 'Vietnam', secondary: 'Country · Southeast Asia' },
  { slug: 'thailand', name: 'Thailand', secondary: 'Country · Southeast Asia' },
  { slug: 'japan', name: 'Japan', secondary: 'Country · East Asia' },
];

function localSuggestions(q: string): Suggestion[] {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return [];
  const pool: Suggestion[] = [
    ...LOCAL_REGIONS,
    ...SHOWCASE.map((d) => ({ slug: d.slug, name: d.name, secondary: d.region })),
  ];
  const seen = new Set<string>();
  return pool
    .filter((item) => {
      if (seen.has(item.slug)) return false;
      const hay = `${item.name} ${item.secondary}`.toLowerCase();
      if (!hay.includes(needle)) return false;
      seen.add(item.slug);
      return true;
    })
    .sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(needle) ? 0 : 1;
      const bStarts = b.name.toLowerCase().startsWith(needle) ? 0 : 1;
      return aStarts - bStarts;
    })
    .slice(0, 7);
}

/** URL-driven filters: every control writes to the query string so results are shareable. */
export function FilterBar({ query, destLabel, total, facets }: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [destText, setDestText] = useState(destLabel ?? '');
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => setDestText(destLabel ?? ''), [destLabel]);

  const push = useCallback(
    (patch: Partial<ExploreQuery>) => {
      const next: ExploreQuery = { ...query, ...patch, cursor: undefined };
      const sp = queryToSearchParams(next);
      startTransition(() => {
        router.replace(sp.toString() ? `${pathname}?${sp.toString()}` : pathname, { scroll: false });
      });
    },
    [query, pathname, router]
  );

  // Debounced typeahead: instant local matches, then the destinations API.
  useEffect(() => {
    const text = destText.trim();
    if (!open || text.length < 2 || text === destLabel) {
      setSuggestions([]);
      return;
    }
    setSuggestions(localSuggestions(text));
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch(`${browserApiBase()}/v1/geo/autocomplete?q=${encodeURIComponent(text)}&limit=8`, {
          signal: ctrl.signal,
          credentials: 'include',
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          results: Array<{ slug: string | null; name: string; secondary: string }>;
        };
        const api = data.results
          .filter((r): r is { slug: string; name: string; secondary: string } => !!r.slug)
          .map((r) => ({ slug: r.slug, name: r.name, secondary: r.secondary }));
        if (api.length) setSuggestions(api);
      } catch {
        // keep local suggestions
      }
    }, 280);
    return () => clearTimeout(t);
  }, [destText, open, destLabel]);

  const choose = (s: Suggestion) => {
    setDestText(s.name);
    setOpen(false);
    setActive(-1);
    push({ dest: s.slug });
  };

  const activeTypes = useMemo(() => (query.type ? query.type.split(',') : []), [query.type]);
  const anyFilter = !!(query.dest || query.days || query.type || query.budget || query.month || query.q);

  return (
    <div className="on-paper sticky top-0 z-30 border-b-2 border-navy bg-paper text-navy shadow-[0_8px_16px_-8px_rgba(3,18,14,0.5)]" aria-busy={pending}>
      <div className="mx-auto max-w-[1280px] px-5 py-4 md:px-8">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {/* Destination */}
          <div className="relative w-full md:w-[320px]">
            <label htmlFor={`${listId}-dest`} className="sr-only">
              Destination or region
            </label>
            <Search size={18} strokeWidth={2.25} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-paper-ink" aria-hidden="true" />
            <input
              id={`${listId}-dest`}
              role="combobox"
              aria-expanded={open && suggestions.length > 0}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={active >= 0 ? `${listId}-opt-${active}` : undefined}
              value={destText}
              placeholder="Where to? Try Rajasthan or Kyoto"
              autoComplete="off"
              onChange={(e) => {
                setDestText(e.target.value);
                setOpen(true);
                if (!e.target.value && query.dest) push({ dest: undefined });
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 120)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, suggestions.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === 'Enter' && active >= 0 && suggestions[active]) {
                  e.preventDefault();
                  choose(suggestions[active]!);
                } else if (e.key === 'Escape') {
                  setOpen(false);
                }
              }}
              className="h-12 w-full rounded-lg border-2 border-navy bg-[#fffdf8] pl-10 pr-10 text-[16px] text-navy placeholder:text-[#566079]"
            />
            {destText ? (
              <button
                type="button"
                aria-label="Clear destination"
                className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-md text-paper-ink hover:text-navy"
                onClick={() => {
                  setDestText('');
                  push({ dest: undefined });
                }}
              >
                <X size={18} strokeWidth={2.25} aria-hidden="true" />
              </button>
            ) : null}
            {open && suggestions.length > 0 ? (
              <ul
                id={listId}
                role="listbox"
                className="absolute left-0 right-0 top-[52px] z-40 max-h-72 overflow-auto rounded-lg border-2 border-navy bg-paper-light py-1 shadow-label"
              >
                {suggestions.map((s, i) => (
                  <li
                    key={s.slug}
                    id={`${listId}-opt-${i}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      choose(s);
                    }}
                    className={`flex cursor-pointer items-baseline justify-between gap-3 px-3 py-2.5 ${i === active ? 'bg-saffron/40' : 'hover:bg-saffron/25'}`}
                  >
                    <span className="font-bold">{s.name}</span>
                    <span className="truncate text-[13px] text-paper-ink">{s.secondary}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {/* Duration */}
          <fieldset className="flex flex-wrap items-center gap-2">
            <legend className="sr-only">Duration</legend>
            <button
              type="button"
              aria-pressed={!query.days}
              onClick={() => push({ days: undefined })}
              className={`chip-paper ${!query.days ? '!bg-navy !text-paper' : ''}`}
            >
              Any length
            </button>
            {DURATION_BUCKETS.map((b) => (
              <button
                key={b.id}
                type="button"
                aria-pressed={query.days === b.id}
                onClick={() => push({ days: query.days === b.id ? undefined : b.id })}
                className={`chip-paper ${query.days === b.id ? '!bg-navy !text-paper' : ''}`}
              >
                {b.label}
                {facets.durations[b.id] !== undefined ? (
                  <span className="ml-1.5 text-[11px] opacity-70">{facets.durations[b.id]}</span>
                ) : null}
              </button>
            ))}
          </fieldset>

          <div className="ml-auto flex items-center gap-4 text-[14px]">
            <span role="status" aria-live="polite" className="font-semibold text-paper-ink">
              {total} {total === 1 ? 'itinerary' : 'itineraries'}
            </span>
            {anyFilter ? (
              <button
                type="button"
                className="font-bold text-vermilion-deep underline underline-offset-2"
                onClick={() => {
                  setDestText('');
                  startTransition(() => router.replace(pathname, { scroll: false }));
                }}
              >
                Clear all
              </button>
            ) : null}
          </div>
        </div>

        <details className="mt-3 group" open={!!(query.type || query.budget || query.month)}>
          <summary className="inline-flex min-h-[40px] cursor-pointer list-none items-center gap-2 text-[14px] font-bold text-navy [&::-webkit-details-marker]:hidden">
            <span className="grid h-6 w-6 place-items-center rounded-full border-2 border-navy text-[16px] leading-none transition-transform group-open:rotate-45" aria-hidden="true">+</span>
            More filters
          </summary>
          <div className="mt-2 grid gap-4 pb-1 md:grid-cols-[1.4fr_1fr_auto_auto] md:items-end">
            <fieldset>
              <legend className="mb-1.5 text-[13px] font-bold text-paper-ink">Trip type</legend>
              <div className="flex flex-wrap gap-2">
                {TRIP_TYPES.map((t) => {
                  const on = activeTypes.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        const next = on ? activeTypes.filter((x) => x !== t) : [...activeTypes, t];
                        push({ type: next.length ? next.join(',') : undefined });
                      }}
                      className={`chip-paper capitalize ${on ? '!bg-navy !text-paper' : ''}`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-1.5 text-[13px] font-bold text-paper-ink">Budget</legend>
              <div className="flex flex-wrap gap-2">
                {BUDGETS.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    aria-pressed={query.budget === b.id}
                    onClick={() => push({ budget: query.budget === b.id ? undefined : b.id })}
                    className={`chip-paper ${query.budget === b.id ? '!bg-navy !text-paper' : ''}`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor={`${listId}-month`} className="mb-1.5 block text-[13px] font-bold text-paper-ink">
                Best in
              </label>
              <select
                id={`${listId}-month`}
                value={query.month ?? ''}
                onChange={(e) => push({ month: e.target.value || undefined })}
                className="h-10 rounded-lg border-2 border-navy bg-[#fffdf8] px-2.5 text-[15px] font-semibold"
              >
                <option value="">Any month</option>
                {MONTH_NAMES.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${listId}-sort`} className="mb-1.5 block text-[13px] font-bold text-paper-ink">
                Sort
              </label>
              <select
                id={`${listId}-sort`}
                value={query.sort ?? 'popular'}
                onChange={(e) => push({ sort: e.target.value === 'popular' ? undefined : (e.target.value as ExploreQuery['sort']) })}
                className="h-10 rounded-lg border-2 border-navy bg-[#fffdf8] px-2.5 text-[15px] font-semibold"
              >
                <option value="popular">Popular</option>
                <option value="newest">Newest</option>
                <option value="shortest">Shortest first</option>
              </select>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
