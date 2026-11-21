'use client';

import React, { useId, useMemo, useReducer, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  CheckCircle2,
  Lock,
  Minus,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { MONTH_NAMES } from '@/data/showcase';
import { DestinationCombobox } from '@/features/create/DestinationCombobox';
import type { FlowError } from '@/features/create/flow-reducer';
import {
  daysBetween,
  finalizeIntent,
  initIntentForm,
  intentReducer,
  validateIntent,
} from '@/features/create/intent-reducer';
import type {
  BudgetTier,
  ConfirmBody,
  GroupType,
  JobMode,
  Pace,
  TripIntent,
} from '@/lib/import-types';

const GROUP_OPTIONS: Array<{ id: GroupType; label: string }> = [
  { id: 'solo', label: 'Solo' },
  { id: 'couple', label: 'Couple' },
  { id: 'family', label: 'Family' },
  { id: 'friends', label: 'Friends' },
  { id: 'seniors', label: 'Seniors' },
  { id: 'mixed', label: 'Mixed group' },
];

const PACE_OPTIONS: Array<{ id: Pace; label: string; detail: string }> = [
  { id: 'relaxed', label: 'Relaxed', detail: '1–2 anchors/day' },
  { id: 'moderate', label: 'Moderate', detail: '3 stops/day' },
  { id: 'packed', label: 'Packed', detail: 'Full days' },
];

const BUDGET_OPTIONS: Array<{ id: BudgetTier; label: string }> = [
  { id: 'budget', label: 'Budget' },
  { id: 'mid', label: 'Mid-range' },
  { id: 'premium', label: 'Premium' },
];

const DIET_OPTIONS = ['Vegetarian', 'Jain', 'Vegan', 'Halal'] as const;

const SUGGESTED_INTERESTS = [
  'Food',
  'Heritage',
  'Mountains',
  'Beaches',
  'Cafes',
  'Trekking',
  'Spiritual',
  'Wildlife',
  'Local markets',
  'Nightlife',
] as const;

interface ReviewStepProps {
  intent: TripIntent;
  mode: JobMode;
  notice: string | null;
  error: FlowError | null;
  submitting: boolean;
  onConfirm: (payload: ConfirmBody) => void;
  onBackToEdit: () => void;
}

export function ReviewStep({
  intent,
  mode,
  notice,
  error,
  submitting,
  onConfirm,
  onBackToEdit,
}: ReviewStepProps) {
  const [form, dispatch] = useReducer(intentReducer, intent, initIntentForm);
  const [fixingDestIdx, setFixingDestIdx] = useState<number | null>(null);
  const [mustInput, setMustInput] = useState('');
  const [customInterest, setCustomInterest] = useState('');
  const [editingAssumptionIdx, setEditingAssumptionIdx] = useState<number | null>(null);
  const [editingAssumptionText, setEditingAssumptionText] = useState('');
  const [triedConfirm, setTriedConfirm] = useState(false);

  const uid = useId();
  const issues = useMemo(() => validateIntent(form.intent), [form.intent]);

  const interestPool = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const item of [...form.intent.interests, ...SUGGESTED_INTERESTS]) {
      const key = item.trim().toLowerCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        list.push(item.trim());
      }
    }
    return list;
  }, [form.intent.interests]);

  const computedRangeDays =
    form.dateMode === 'dates' && form.intent.dates.start && form.intent.dates.end
      ? daysBetween(form.intent.dates.start, form.intent.dates.end)
      : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTriedConfirm(true);
    if (issues.length > 0) return;
    onConfirm(finalizeIntent(form));
  };

  return (
    <div className="mx-auto max-w-[880px] px-5 pb-16 pt-6 md:px-8">
      <form
        onSubmit={handleSubmit}
        noValidate
        className="paper-surface on-paper rounded-[14px] border-2 border-navy p-6 text-navy shadow-tag sm:p-10"
      >
        <h1 className="display text-[44px] text-navy sm:text-[56px]">
          Here&rsquo;s what we understood
        </h1>
        <p className="mt-2 max-w-[65ch] text-[17px] text-paper-ink">
          Review the plan brief before we build your day-by-day route. Every inferred detail is marked{' '}
          <strong>Assumed</strong> so you stay in control.
        </p>

        {mode === 'basic' ? (
          <p className="mt-4 rounded-lg border-[1.5px] border-navy/45 bg-[#efe0be] px-4 py-3 text-[15px] font-semibold text-navy">
            Building in Basic mode — deterministic parser + open map places.
          </p>
        ) : null}

        {notice ? (
          <p
            role="status"
            className="mt-4 rounded-lg border-[1.5px] border-[#0F766E] bg-[#F0FDFA] px-4 py-3 text-[15px] font-semibold text-navy"
          >
            {notice}
          </p>
        ) : null}

        {/* 1. Trip Title */}
        <div className="perforation mt-6 pt-6">
          <label htmlFor={`${uid}-title`} className="mb-1.5 block text-[16px] font-bold text-navy">
            Trip title
          </label>
          <input
            id={`${uid}-title`}
            name="title"
            type="text"
            value={form.intent.title}
            onChange={(e) => dispatch({ type: 'title', value: e.target.value })}
            placeholder="My trip"
            className="field max-w-[520px] text-[18px] font-bold"
          />
        </div>

        {/* 2. Destinations */}
        <div className="perforation mt-6 pt-6">
          <h2 className="display text-[32px] text-navy">Destinations &amp; route order</h2>
          <p className="mt-1 text-[15px] text-paper-ink">
            Reorder stops, set nights per place, or resolve any unlocated pin on the open map.
          </p>

          {form.intent.destinations.length > 0 ? (
            <ol role="list" className="mt-4 divide-y divide-navy/20 rounded-xl border-[1.5px] border-navy/40 bg-[#fffdf8]">
              {form.intent.destinations.map((dest, index) => {
                const isFixing = fixingDestIdx === index;
                return (
                  <li key={`${dest.name}-${index}`} className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="display grid h-8 w-8 shrink-0 place-items-center rounded-full border-[1.5px] border-navy bg-saffron text-[18px] leading-none text-navy">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[18px] font-bold text-navy">{dest.name}</span>
                            {dest.country ? (
                              <span className="text-[14px] font-semibold text-paper-ink">{dest.country}</span>
                            ) : null}
                            {dest.resolved ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-[#0F766E]/50 bg-[#F0FDFA] px-2.5 py-0.5 text-[12px] font-bold text-[#0F766E]">
                                <CheckCircle2 size={13} strokeWidth={2.5} aria-hidden="true" />
                                Mapped
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setFixingDestIdx(isFixing ? null : index)}
                                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border-[1.5px] border-[#a82e19] bg-[#fff7e4] px-3 py-1 text-[13px] font-bold text-vermilion-ink hover:bg-[#efe0be]"
                              >
                                <AlertTriangle size={14} strokeWidth={2.25} aria-hidden="true" />
                                Couldn&rsquo;t locate — fix pin
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Nights + Reorder + Remove controls */}
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1.5 rounded-lg border border-navy/30 bg-paper px-2 py-0.5">
                          <button
                            type="button"
                            className="icon-btn !h-9 !w-9 border-0"
                            aria-label={`Decrease nights in ${dest.name}`}
                            disabled={(dest.nights ?? 0) <= 0}
                            onClick={() =>
                              dispatch({
                                type: 'destNights',
                                index,
                                nights: dest.nights && dest.nights > 1 ? dest.nights - 1 : null,
                              })
                            }
                          >
                            <Minus size={15} strokeWidth={2.25} aria-hidden="true" />
                          </button>
                          <span className="min-w-[68px] text-center text-[14px] font-bold tabular-nums text-navy">
                            {dest.nights != null ? `${dest.nights} ${dest.nights === 1 ? 'night' : 'nights'}` : 'Auto nights'}
                          </span>
                          <button
                            type="button"
                            className="icon-btn !h-9 !w-9 border-0"
                            aria-label={`Increase nights in ${dest.name}`}
                            onClick={() =>
                              dispatch({
                                type: 'destNights',
                                index,
                                nights: (dest.nights ?? 0) + 1,
                              })
                            }
                          >
                            <Plus size={15} strokeWidth={2.25} aria-hidden="true" />
                          </button>
                        </div>

                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`Move ${dest.name} up`}
                          disabled={index === 0}
                          onClick={() => dispatch({ type: 'destMove', index, dir: -1 })}
                        >
                          <ArrowUp size={17} strokeWidth={2.25} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`Move ${dest.name} down`}
                          disabled={index === form.intent.destinations.length - 1}
                          onClick={() => dispatch({ type: 'destMove', index, dir: 1 })}
                        >
                          <ArrowDown size={17} strokeWidth={2.25} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="icon-btn text-vermilion-ink"
                          aria-label={`Remove ${dest.name}`}
                          onClick={() => {
                            if (fixingDestIdx === index) setFixingDestIdx(null);
                            dispatch({ type: 'destRemove', index });
                          }}
                        >
                          <Trash2 size={17} strokeWidth={2.25} aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    {isFixing ? (
                      <div className="mt-3 border-t border-navy/15 pt-3">
                        <DestinationCombobox
                          label={`Search map match for "${dest.name}"`}
                          initialValue={dest.name}
                          submitButtonLabel="Use place"
                          autoFocus
                          onSelect={(choice) => {
                            dispatch({ type: 'destFix', index, suggestion: choice });
                            setFixingDestIdx(null);
                          }}
                          onCancel={() => setFixingDestIdx(null)}
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="mt-3 rounded-lg border-2 border-dashed border-[#a82e19] bg-[#fffdf8] px-4 py-3 text-[15px] font-semibold text-vermilion-ink">
              No destinations selected yet. Add at least one destination below.
            </p>
          )}

          <div className="mt-4">
            <DestinationCombobox
              label="Add a destination"
              placeholder="Search city or region (e.g. Jaipur, Kasol, Kyoto)…"
              submitButtonLabel="Add stop"
              onSelect={(choice) => dispatch({ type: 'destAdd', suggestion: choice })}
            />
          </div>
        </div>

        {/* 3. Dates or Trip Length */}
        <div className="perforation mt-6 pt-6">
          <h2 className="display text-[32px] text-navy">Dates or trip length</h2>
          <fieldset className="mt-3">
            <legend className="sr-only">How would you like to set dates?</legend>
            <div className="flex flex-wrap gap-2.5">
              <label>
                <input
                  type="radio"
                  name={`${uid}-datemode`}
                  className="peer sr-only"
                  checked={form.dateMode === 'days'}
                  onChange={() => dispatch({ type: 'dateMode', mode: 'days' })}
                />
                <span className="chip-toggle">Number of days</span>
              </label>
              <label>
                <input
                  type="radio"
                  name={`${uid}-datemode`}
                  className="peer sr-only"
                  checked={form.dateMode === 'dates'}
                  onChange={() => dispatch({ type: 'dateMode', mode: 'dates' })}
                />
                <span className="chip-toggle">Exact start &amp; end dates</span>
              </label>
            </div>
          </fieldset>

          {form.dateMode === 'dates' ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={`${uid}-start`} className="mb-1.5 block text-[15px] font-bold text-navy">
                  Start date
                </label>
                <input
                  id={`${uid}-start`}
                  type="date"
                  value={form.intent.dates.start ?? ''}
                  onChange={(e) => dispatch({ type: 'dateStart', value: e.target.value || null })}
                  className="field tabular-nums"
                />
              </div>
              <div>
                <label htmlFor={`${uid}-end`} className="mb-1.5 block text-[15px] font-bold text-navy">
                  End date
                </label>
                <input
                  id={`${uid}-end`}
                  type="date"
                  min={form.intent.dates.start ?? undefined}
                  value={form.intent.dates.end ?? ''}
                  onChange={(e) => dispatch({ type: 'dateEnd', value: e.target.value || null })}
                  className="field tabular-nums"
                />
              </div>
              {computedRangeDays ? (
                <p className="text-[14px] font-semibold text-paper-ink sm:col-span-2">
                  Trip length: <strong className="tabular-nums text-navy">{computedRangeDays} days</strong>
                </p>
              ) : null}
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <span className="mb-1.5 block text-[15px] font-bold text-navy">How many days?</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="icon-btn bg-[#fffdf8]"
                    aria-label="One fewer day"
                    disabled={(form.intent.dates.lengthDays ?? 1) <= 1}
                    onClick={() =>
                      dispatch({
                        type: 'length',
                        value: Math.max(1, (form.intent.dates.lengthDays ?? 4) - 1),
                      })
                    }
                  >
                    <Minus size={17} strokeWidth={2.25} aria-hidden="true" />
                  </button>
                  <input
                    id={`${uid}-days`}
                    aria-label="Number of days"
                    type="text"
                    inputMode="numeric"
                    value={form.intent.dates.lengthDays ?? ''}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, '');
                      dispatch({ type: 'length', value: raw ? Number(raw) : null });
                    }}
                    placeholder="4"
                    className="field w-24 text-center font-bold tabular-nums"
                  />
                  <button
                    type="button"
                    className="icon-btn bg-[#fffdf8]"
                    aria-label="One more day"
                    disabled={(form.intent.dates.lengthDays ?? 4) >= 30}
                    onClick={() =>
                      dispatch({
                        type: 'length',
                        value: Math.min(30, (form.intent.dates.lengthDays ?? 4) + 1),
                      })
                    }
                  >
                    <Plus size={17} strokeWidth={2.25} aria-hidden="true" />
                  </button>
                  <span className="text-[15px] font-semibold text-paper-ink">days (1–30)</span>
                </div>
              </div>

              <div>
                <label htmlFor={`${uid}-month`} className="mb-1.5 block text-[15px] font-bold text-navy">
                  Best month (optional)
                </label>
                <select
                  id={`${uid}-month`}
                  value={form.intent.dates.flexibleMonth ?? ''}
                  onChange={(e) =>
                    dispatch({
                      type: 'month',
                      value: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className="field"
                >
                  <option value="">Any month / flexible</option>
                  {MONTH_NAMES.map((name, idx) => (
                    <option key={name} value={idx + 1}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* 4. Travellers */}
        <div className="perforation mt-6 pt-6">
          <h2 className="display text-[32px] text-navy">Travellers</h2>
          <div className="mt-4 grid gap-5 md:grid-cols-[auto_1fr]">
            <div>
              <span className="mb-1.5 block text-[15px] font-bold text-navy">Group size</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="icon-btn bg-[#fffdf8]"
                  aria-label="Decrease traveller count"
                  onClick={() => {
                    const cur = form.intent.travellers.count ?? 2;
                    dispatch({ type: 'travellerCount', value: cur > 1 ? cur - 1 : null });
                  }}
                >
                  <Minus size={17} strokeWidth={2.25} aria-hidden="true" />
                </button>
                <span className="min-w-[88px] rounded-lg border-2 border-navy/60 bg-[#fffdf8] px-3 py-2 text-center text-[16px] font-bold tabular-nums text-navy">
                  {form.intent.travellers.count != null
                    ? `${form.intent.travellers.count} ${form.intent.travellers.count === 1 ? 'person' : 'people'}`
                    : 'Not set'}
                </span>
                <button
                  type="button"
                  className="icon-btn bg-[#fffdf8]"
                  aria-label="Increase traveller count"
                  onClick={() =>
                    dispatch({
                      type: 'travellerCount',
                      value: (form.intent.travellers.count ?? 1) + 1,
                    })
                  }
                >
                  <Plus size={17} strokeWidth={2.25} aria-hidden="true" />
                </button>
              </div>
            </div>

            <fieldset>
              <legend className="mb-1.5 text-[15px] font-bold text-navy">Who is going?</legend>
              <div className="flex flex-wrap gap-2">
                {GROUP_OPTIONS.map((opt) => (
                  <label key={opt.id}>
                    <input
                      type="radio"
                      name={`${uid}-group`}
                      className="peer sr-only"
                      checked={form.intent.travellers.group === opt.id}
                      onChange={() => dispatch({ type: 'group', value: opt.id })}
                    />
                    <span className="chip-toggle">{opt.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="mt-4 flex flex-wrap gap-2.5">
            <label>
              <input
                type="checkbox"
                className="peer sr-only"
                checked={Boolean(form.intent.travellers.hasChildren)}
                onChange={(e) => dispatch({ type: 'children', value: e.target.checked })}
              />
              <span className="chip-toggle">Travelling with children</span>
            </label>
            <label>
              <input
                type="checkbox"
                className="peer sr-only"
                checked={Boolean(form.intent.travellers.hasSeniors)}
                onChange={(e) => dispatch({ type: 'seniors', value: e.target.checked })}
              />
              <span className="chip-toggle">Travelling with seniors (adds rest buffers)</span>
            </label>
          </div>
        </div>

        {/* 5. Pace & Budget */}
        <div className="perforation mt-6 grid gap-6 pt-6 md:grid-cols-2">
          <fieldset>
            <legend className="display text-[32px] text-navy">Daily pace</legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {PACE_OPTIONS.map((p) => (
                <label key={p.id}>
                  <input
                    type="radio"
                    name={`${uid}-pace`}
                    className="peer sr-only"
                    checked={form.intent.pace === p.id}
                    onChange={() => dispatch({ type: 'pace', value: p.id })}
                  />
                  <span className="chip-toggle">
                    <span>{p.label}</span>
                    <span className="text-[12px] opacity-80">· {p.detail}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <fieldset>
              <legend className="display text-[32px] text-navy">Budget</legend>
              <div className="mt-3 flex flex-wrap gap-2">
                {BUDGET_OPTIONS.map((b) => (
                  <label key={b.id}>
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={form.intent.budget.tier === b.id}
                      onChange={() =>
                        dispatch({
                          type: 'budgetTier',
                          value: form.intent.budget.tier === b.id ? null : b.id,
                        })
                      }
                    />
                    <span className="chip-toggle">{b.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="mt-3">
              <label htmlFor={`${uid}-budget-amt`} className="mb-1 block text-[14px] font-bold text-navy">
                Optional target budget (INR ₹)
              </label>
              <input
                id={`${uid}-budget-amt`}
                type="text"
                inputMode="numeric"
                value={form.intent.budget.amount ?? ''}
                onChange={(e) => {
                  const clean = e.target.value.replace(/\D/g, '');
                  dispatch({ type: 'budgetAmount', value: clean ? Number(clean) : null });
                }}
                placeholder="e.g. 60000"
                className="field max-w-[220px] tabular-nums"
              />
            </div>
          </div>
        </div>

        {/* 6. Diet & Interests */}
        <div className="perforation mt-6 pt-6">
          <h2 className="display text-[32px] text-navy">Dietary notes &amp; interests</h2>

          <fieldset className="mt-3">
            <legend className="mb-2 text-[15px] font-bold text-navy">Dietary preferences</legend>
            <div className="flex flex-wrap gap-2">
              {DIET_OPTIONS.map((d) => {
                const checked = form.intent.diet.some((item) => item.toLowerCase() === d.toLowerCase());
                return (
                  <label key={d}>
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={checked}
                      onChange={() => dispatch({ type: 'dietToggle', value: d })}
                    />
                    <span className="chip-toggle">{d}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="mt-5">
            <legend className="mb-2 text-[15px] font-bold text-navy">Interests</legend>
            <div className="flex flex-wrap gap-2">
              {interestPool.map((item) => {
                const active = form.intent.interests.some((i) => i.toLowerCase() === item.toLowerCase());
                return (
                  <label key={item}>
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={active}
                      onChange={() => dispatch({ type: 'interestToggle', value: item })}
                    />
                    <span className="chip-toggle">{item}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="mt-3 flex max-w-[420px] gap-2">
            <label htmlFor={`${uid}-interest-add`} className="sr-only">
              Add custom interest
            </label>
            <input
              id={`${uid}-interest-add`}
              type="text"
              value={customInterest}
              onChange={(e) => setCustomInterest(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing && customInterest.trim()) {
                  e.preventDefault();
                  dispatch({ type: 'interestToggle', value: customInterest.trim() });
                  setCustomInterest('');
                }
              }}
              placeholder="Add another interest (e.g. Pottery, Birding)…"
              className="field"
            />
            <button
              type="button"
              disabled={!customInterest.trim()}
              onClick={() => {
                if (!customInterest.trim()) return;
                dispatch({ type: 'interestToggle', value: customInterest.trim() });
                setCustomInterest('');
              }}
              className="btn-line min-h-[44px] shrink-0 px-4 py-2 text-[14px] text-navy"
            >
              Add
            </button>
          </div>
        </div>

        {/* 7. Must-include places */}
        <div className="perforation mt-6 pt-6">
          <h2 className="display text-[32px] text-navy">Must-include places</h2>
          <p className="mt-1 text-[15px] text-paper-ink">
            Specific temples, cafes, viewpoints or homestays we should anchor into the days.
          </p>

          {form.intent.mustInclude.length > 0 ? (
            <ul role="list" className="mt-3 flex flex-wrap gap-2">
              {form.intent.mustInclude.map((m, idx) => (
                <li
                  key={`${m.name}-${idx}`}
                  className="inline-flex min-h-[42px] items-center gap-2 rounded-full border-[1.5px] border-navy/45 bg-[#fffdf8] pl-3.5 pr-1.5 text-[14px] font-semibold text-navy"
                >
                  <span>{m.name}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${m.name}`}
                    onClick={() => dispatch({ type: 'mustRemove', index: idx })}
                    className="grid h-8 w-8 place-items-center rounded-full text-paper-ink hover:bg-navy/10 hover:text-navy"
                  >
                    <X size={14} strokeWidth={2.25} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-3 flex max-w-[460px] gap-2">
            <label htmlFor={`${uid}-must`} className="sr-only">
              Add a must-include place
            </label>
            <input
              id={`${uid}-must`}
              type="text"
              value={mustInput}
              onChange={(e) => setMustInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing && mustInput.trim()) {
                  e.preventDefault();
                  dispatch({ type: 'mustAdd', name: mustInput });
                  setMustInput('');
                }
              }}
              placeholder="Add a must-visit spot (e.g. Hadimba Temple)…"
              className="field"
            />
            <button
              type="button"
              disabled={!mustInput.trim()}
              onClick={() => {
                if (!mustInput.trim()) return;
                dispatch({ type: 'mustAdd', name: mustInput });
                setMustInput('');
              }}
              className="btn-line min-h-[44px] shrink-0 px-4 py-2 text-[14px] text-navy"
            >
              <Plus size={16} strokeWidth={2.25} aria-hidden="true" />
              Add spot
            </button>
          </div>
        </div>

        {/* 8. Locked Bookings */}
        {form.intent.bookings.length > 0 ? (
          <div className="perforation mt-6 pt-6">
            <h2 className="display text-[32px] text-navy">Locked ticket anchors</h2>
            <p className="mt-1 text-[15px] text-paper-ink">
              Parsed from your tickets. Nothing will be scheduled across these departure or check-in windows.
            </p>
            <ul role="list" className="mt-3 space-y-2.5">
              {form.intent.bookings.map((b, idx) => (
                <li
                  key={`${b.title}-${idx}`}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-xl border-[1.5px] border-navy/40 bg-[#fffdf8] p-4"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Lock size={15} strokeWidth={2.25} aria-hidden="true" className="text-[#0F766E]" />
                      <span className="text-[16px] font-bold text-navy">{b.title}</span>
                      <span className="rounded bg-[#efe0be] px-2 py-0.5 text-[12px] font-bold text-navy">
                        {b.provider}
                      </span>
                    </div>
                    <p className="text-[14px] text-paper-ink">{b.summary}</p>
                    {b.lowConfidenceFields.length > 0 ? (
                      <p className="text-[13px] font-semibold text-vermilion-ink">
                        Please verify in editor: {b.lowConfidenceFields.join(', ')}
                      </p>
                    ) : null}
                  </div>
                  {b.startIso ? (
                    <span className="rounded border border-navy/25 bg-paper px-2.5 py-1 font-mono text-[13px] font-semibold tabular-nums text-navy">
                      {new Date(b.startIso).toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* 9. Transparent Assumptions */}
        {form.intent.assumptions.length > 0 ? (
          <div className="perforation mt-6 pt-6">
            <h2 className="display text-[32px] text-navy">Assumptions we made</h2>
            <p className="mt-1 text-[15px] text-paper-ink">
              Tap an assumption to rewrite it, or remove any that do not fit your trip.
            </p>
            <ul role="list" className="mt-3 flex flex-wrap gap-2.5">
              {form.intent.assumptions.map((item, idx) => {
                const isEditing = editingAssumptionIdx === idx;
                if (isEditing) {
                  return (
                    <li key={idx} className="flex w-full max-w-[520px] items-center gap-2">
                      <label htmlFor={`${uid}-assume-${idx}`} className="sr-only">
                        Edit assumption
                      </label>
                      <input
                        id={`${uid}-assume-${idx}`}
                        type="text"
                        autoFocus
                        value={editingAssumptionText}
                        onChange={(e) => setEditingAssumptionText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            dispatch({ type: 'assumptionEdit', index: idx, value: editingAssumptionText });
                            setEditingAssumptionIdx(null);
                          } else if (e.key === 'Escape') {
                            setEditingAssumptionIdx(null);
                          }
                        }}
                        className="field"
                      />
                      <button
                        type="button"
                        aria-label="Save assumption"
                        onClick={() => {
                          dispatch({ type: 'assumptionEdit', index: idx, value: editingAssumptionText });
                          setEditingAssumptionIdx(null);
                        }}
                        className="icon-btn bg-[#fffdf8]"
                      >
                        <Check size={17} strokeWidth={2.25} aria-hidden="true" />
                      </button>
                    </li>
                  );
                }
                return (
                  <li
                    key={`${item}-${idx}`}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-full border-[1.5px] border-dashed border-navy/55 bg-[#efe0be] pl-3.5 pr-1.5 text-[14px] text-navy"
                  >
                    <span className="rounded bg-navy px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-paper">
                      Assumed
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingAssumptionIdx(idx);
                        setEditingAssumptionText(item);
                      }}
                      className="inline-flex min-h-[36px] items-center gap-1.5 text-left font-semibold text-navy hover:underline"
                    >
                      <span>{item}</span>
                      <Pencil size={13} strokeWidth={2.25} aria-hidden="true" className="shrink-0 opacity-75" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Dismiss assumption: ${item}`}
                      onClick={() => dispatch({ type: 'assumptionDismiss', index: idx })}
                      className="grid h-8 w-8 place-items-center rounded-full text-navy hover:bg-navy/10"
                    >
                      <X size={14} strokeWidth={2.25} aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {/* 10. Clarifying Questions (max 3) */}
        {form.intent.clarifyingQuestions.length > 0 ? (
          <div className="perforation mt-6 pt-6">
            <h2 className="display text-[32px] text-navy">Quick questions (optional)</h2>
            <div className="mt-4 space-y-5">
              {form.intent.clarifyingQuestions.slice(0, 3).map((q) => {
                const currentAns = form.answers[q.id] ?? '';
                return (
                  <div key={q.id} className="space-y-2">
                    <label htmlFor={`${uid}-q-${q.id}`} className="block text-[16px] font-bold text-navy">
                      {q.question}
                    </label>
                    {q.options && q.options.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {q.options.map((opt) => {
                          const selected = currentAns === opt;
                          return (
                            <button
                              key={opt}
                              type="button"
                              aria-pressed={selected}
                              onClick={() =>
                                dispatch({
                                  type: 'answer',
                                  id: q.id,
                                  value: selected ? '' : opt,
                                })
                              }
                              className={`chip-paper min-h-[44px] px-3.5 text-[14px] ${
                                selected ? '!bg-navy !text-paper' : ''
                              }`}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                    <input
                      id={`${uid}-q-${q.id}`}
                      type="text"
                      value={currentAns}
                      onChange={(e) => dispatch({ type: 'answer', id: q.id, value: e.target.value })}
                      placeholder="Or type your own answer…"
                      className="field max-w-[460px]"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Blocking validation issues */}
        {(triedConfirm || issues.length > 0) && issues.length > 0 ? (
          <div
            role="alert"
            className="mt-6 rounded-lg border-2 border-[#a82e19] bg-[#fffdf8] px-4 py-3 text-[15px] text-vermilion-ink"
          >
            <ul className="space-y-1">
              {issues.map((iss) => (
                <li key={iss.message} className="flex items-center gap-2 font-bold">
                  <AlertCircle size={17} strokeWidth={2.25} aria-hidden="true" className="shrink-0" />
                  <span>{iss.message}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {error ? (
          <div
            role="alert"
            className="mt-6 rounded-lg border-2 border-[#a82e19] bg-[#fffdf8] px-4 py-3 text-[15px] font-bold text-vermilion-ink"
          >
            {error.message}
          </div>
        ) : null}

        {/* Primary & Back Actions */}
        <div className="perforation mt-8 flex flex-wrap items-center justify-between gap-3 pt-6">
          <button type="button" onClick={onBackToEdit} className="btn-line text-navy">
            <ArrowLeft size={17} strokeWidth={2.25} aria-hidden="true" />
            Back to edit input
          </button>

          <button type="submit" disabled={submitting} className="btn-stamp">
            {submitting ? (
              <span className="spinner" aria-hidden="true" />
            ) : (
              <Sparkles size={18} strokeWidth={2.25} aria-hidden="true" />
            )}
            {submitting ? 'Starting builder…' : 'Build day-by-day itinerary'}
          </button>
        </div>
      </form>
    </div>
  );
}
