'use client';

import React, { useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  MapPin,
  Minus,
  Plus,
  Sparkles,
  X,
} from 'lucide-react';
import { DestinationCombobox } from '@/features/create/DestinationCombobox';
import { daysBetween } from '@/features/create/intent-reducer';
import {
  createManualTrip,
  ImportApiError,
  setLocalPreviewEnabled,
  type GeoSuggestion,
} from '@/lib/import-client';
import type { CurrencyCode } from '@/lib/types';

const CURRENCIES: Array<{ code: CurrencyCode; label: string }> = [
  { code: 'INR', label: 'INR (₹) — Indian Rupee' },
  { code: 'USD', label: 'USD ($) — US Dollar' },
  { code: 'EUR', label: 'EUR (€) — Euro' },
  { code: 'THB', label: 'THB (฿) — Thai Baht' },
  { code: 'VND', label: 'VND (₫) — Vietnamese Dong' },
  { code: 'AED', label: 'AED (د.إ) — UAE Dirham' },
  { code: 'JPY', label: 'JPY (¥) — Japanese Yen' },
];

export function ManualWizardForm() {
  const router = useRouter();
  const uid = useId();
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [destinations, setDestinations] = useState<Array<{ name: string; secondary?: string }>>([]);
  const [dateMode, setDateMode] = useState<'days' | 'dates'>('days');
  const [daysCount, setDaysCount] = useState(4);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [homeCurrency, setHomeCurrency] = useState<CurrencyCode>('INR');
  const [elderModeEnabled, setElderModeEnabled] = useState(true);

  const [triedSubmit, setTriedSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<{ message: string; isNetwork: boolean } | null>(null);

  const computedDays = useMemo(() => {
    if (dateMode === 'dates' && startDate && endDate) {
      return daysBetween(startDate, endDate);
    }
    return daysCount;
  }, [dateMode, startDate, endDate, daysCount]);

  const effectiveTitle = useMemo(() => {
    if (title.trim()) return title.trim();
    if (destinations.length > 0) {
      return destinations.length === 1
        ? `${destinations[0]!.name} trip`
        : `${destinations[0]!.name} & ${destinations[1]!.name}`;
    }
    return '';
  }, [title, destinations]);

  const titleMissing = (triedSubmit || titleTouched) && !effectiveTitle;
  const dateRangeInvalid =
    dateMode === 'dates' && startDate && endDate && Date.parse(endDate) < Date.parse(startDate);
  const dateIncomplete =
    triedSubmit && dateMode === 'dates' && ((startDate && !endDate) || (!startDate && endDate));

  const addDestination = (choice: GeoSuggestion | { name: string }) => {
    const clean = choice.name.trim();
    if (!clean) return;
    if (destinations.some((d) => d.name.toLowerCase() === clean.toLowerCase())) return;
    const secondary = 'secondary' in choice ? choice.secondary : undefined;
    setDestinations((prev) => [...prev, { name: clean, secondary }]);
    setApiError(null);
  };

  const removeDestination = (idx: number) => {
    setDestinations((prev) => prev.filter((_, i) => i !== idx));
  };

  const submitTrip = async (useOfflinePreview = false) => {
    setTriedSubmit(true);
    setApiError(null);

    if (!effectiveTitle) {
      titleInputRef.current?.focus();
      return;
    }
    if (dateRangeInvalid || dateIncomplete) return;

    if (useOfflinePreview) {
      setLocalPreviewEnabled(true);
    }

    const totalDays = Math.min(30, Math.max(1, computedDays ?? daysCount));
    const destSummary =
      destinations.length > 0
        ? `${destinations.map((d) => d.name).join(' · ')} (${totalDays}D)`
        : `${effectiveTitle} (${totalDays}D)`;

    setSubmitting(true);
    try {
      const res = await createManualTrip({
        title: effectiveTitle,
        destinationSummary: destSummary,
        startDate: dateMode === 'dates' && startDate ? startDate : null,
        endDate: dateMode === 'dates' && endDate ? endDate : null,
        daysCount: totalDays,
        homeCurrency,
        elderModeEnabled,
      });
      router.push(`/trip/${encodeURIComponent(res.tripId)}`);
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ImportApiError) {
        setApiError({
          message: err.message,
          isNetwork: err.status === 0 || err.code === 'network',
        });
      } else {
        setApiError({
          message: err instanceof Error ? err.message : 'Could not create trip right now.',
          isNetwork: false,
        });
      }
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submitTrip(false);
      }}
      noValidate
      className="paper-surface on-paper rounded-[14px] border-2 border-navy p-6 text-navy shadow-tag sm:p-10"
    >
      <h1 className="display text-[44px] text-navy sm:text-[56px]">
        Build an itinerary from scratch
      </h1>
      <p className="mt-2 max-w-[62ch] text-[17px] text-paper-ink">
        Pick your destinations, trip length and currency to open a clean day-by-day workspace — no account needed.
      </p>

      {/* Destinations */}
      <div className="perforation mt-6 pt-6">
        <DestinationCombobox
          label="Destination(s)"
          placeholder="Search any city, state or country (e.g. Jaipur, Munnar, Kyoto)…"
          submitButtonLabel="Add place"
          onSelect={addDestination}
        />

        {destinations.length > 0 ? (
          <ul role="list" className="mt-3 flex flex-wrap gap-2" aria-label="Selected destinations">
            {destinations.map((d, idx) => (
              <li
                key={`${d.name}-${idx}`}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-full border-[1.5px] border-navy/50 bg-[#efe0be] pl-3.5 pr-1.5 text-[14px] font-bold text-navy"
              >
                <MapPin size={14} strokeWidth={2.25} aria-hidden="true" className="text-[#0F766E]" />
                <span>{d.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${d.name}`}
                  onClick={() => removeDestination(idx)}
                  className="grid h-8 w-8 place-items-center rounded-full text-navy hover:bg-navy/10"
                >
                  <X size={14} strokeWidth={2.25} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* Trip Title */}
      <div className="perforation mt-6 pt-6">
        <label htmlFor={`${uid}-title`} className="mb-1.5 block text-[15px] font-bold text-navy">
          Trip title <span aria-hidden="true">*</span>
        </label>
        <p id={`${uid}-title-hint`} className="mb-2 text-[14px] text-paper-ink">
          Give your trip a clear name for your WhatsApp group, or add a destination above to fill it automatically.
        </p>
        <input
          id={`${uid}-title`}
          ref={titleInputRef}
          name="title"
          type="text"
          required={!destinations.length}
          value={title}
          aria-invalid={titleMissing ? 'true' : 'false'}
          aria-describedby={titleMissing ? `${uid}-title-hint ${uid}-title-err` : `${uid}-title-hint`}
          onBlur={() => setTitleTouched(true)}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={effectiveTitle || 'e.g. Winter in Rajasthan'}
          className="field max-w-[520px]"
        />
        {titleMissing ? (
          <p
            id={`${uid}-title-err`}
            role="alert"
            className="mt-2 flex items-center gap-1.5 text-[14px] font-bold text-vermilion-ink"
          >
            <AlertCircle size={16} strokeWidth={2.25} aria-hidden="true" />
            <span>Enter a trip title or add at least one destination above.</span>
          </p>
        ) : null}
      </div>

      {/* Dates or Days */}
      <div className="perforation mt-6 pt-6">
        <fieldset>
          <legend className="mb-2 text-[15px] font-bold text-navy">Dates or duration</legend>
          <div className="flex flex-wrap gap-2.5">
            <label>
              <input
                type="radio"
                name={`${uid}-mode`}
                className="peer sr-only"
                checked={dateMode === 'days'}
                onChange={() => setDateMode('days')}
              />
              <span className="chip-toggle">Number of days</span>
            </label>
            <label>
              <input
                type="radio"
                name={`${uid}-mode`}
                className="peer sr-only"
                checked={dateMode === 'dates'}
                onChange={() => setDateMode('dates')}
              />
              <span className="chip-toggle">Exact start &amp; end dates</span>
            </label>
          </div>
        </fieldset>

        {dateMode === 'days' ? (
          <div className="mt-4 flex items-center gap-2.5">
            <button
              type="button"
              className="icon-btn bg-[#fffdf8]"
              aria-label="Decrease days"
              disabled={daysCount <= 1}
              onClick={() => setDaysCount((d) => Math.max(1, d - 1))}
            >
              <Minus size={17} strokeWidth={2.25} aria-hidden="true" />
            </button>
            <input
              id={`${uid}-days`}
              aria-label="Number of days (1 to 30)"
              type="text"
              inputMode="numeric"
              value={daysCount}
              onChange={(e) => {
                const n = Number(e.target.value.replace(/\D/g, ''));
                if (n >= 1) setDaysCount(Math.min(30, n));
              }}
              className="field w-24 text-center font-bold tabular-nums"
            />
            <button
              type="button"
              className="icon-btn bg-[#fffdf8]"
              aria-label="Increase days"
              disabled={daysCount >= 30}
              onClick={() => setDaysCount((d) => Math.min(30, d + 1))}
            >
              <Plus size={17} strokeWidth={2.25} aria-hidden="true" />
            </button>
            <span className="text-[15px] font-semibold text-paper-ink">days (1–30)</span>
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${uid}-start`} className="mb-1.5 block text-[15px] font-bold text-navy">
                Start date
              </label>
              <input
                id={`${uid}-start`}
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
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
                min={startDate || undefined}
                value={endDate}
                aria-invalid={dateRangeInvalid || dateIncomplete ? 'true' : 'false'}
                onChange={(e) => setEndDate(e.target.value)}
                className="field tabular-nums"
              />
            </div>
            {dateRangeInvalid ? (
              <p role="alert" className="text-[14px] font-bold text-vermilion-ink sm:col-span-2">
                End date must be on or after the start date.
              </p>
            ) : dateIncomplete ? (
              <p role="alert" className="text-[14px] font-bold text-vermilion-ink sm:col-span-2">
                Pick both start and end dates, or switch to number of days.
              </p>
            ) : computedDays ? (
              <p className="text-[14px] font-semibold text-paper-ink sm:col-span-2">
                Duration: <strong className="tabular-nums text-navy">{Math.min(30, computedDays)} days</strong>
              </p>
            ) : null}
          </div>
        )}
      </div>

      {/* Home Currency & Elder Mode */}
      <div className="perforation mt-6 grid gap-6 pt-6 sm:grid-cols-2">
        <div>
          <label htmlFor={`${uid}-currency`} className="mb-1.5 block text-[15px] font-bold text-navy">
            Home budget currency
          </label>
          <select
            id={`${uid}-currency`}
            name="homeCurrency"
            value={homeCurrency}
            onChange={(e) => setHomeCurrency(e.target.value as CurrencyCode)}
            className="field"
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col justify-end">
          <label className="inline-flex cursor-pointer items-start gap-3 rounded-xl border-[1.5px] border-navy/45 bg-[#fffdf8] p-3.5">
            <input
              type="checkbox"
              checked={elderModeEnabled}
              onChange={(e) => setElderModeEnabled(e.target.checked)}
              className="mt-1 h-5 w-5 shrink-0 accent-[#14213d]"
            />
            <span>
              <span className="block text-[15px] font-bold text-navy">
                Enable Family &amp; Elder Card view
              </span>
              <span className="mt-0.5 block text-[13px] text-paper-ink">
                High-legibility 18px share view with English / हिन्दी toggle and PNR redaction.
              </span>
            </span>
          </label>
        </div>
      </div>

      {apiError ? (
        <div
          role="alert"
          className="mt-6 rounded-lg border-2 border-[#a82e19] bg-[#fffdf8] p-4 text-navy"
        >
          <p className="flex items-start gap-2 text-[15px] font-bold text-vermilion-ink">
            <AlertCircle size={18} strokeWidth={2.25} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>{apiError.message}</span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2.5">
            <button
              type="submit"
              className="btn-line min-h-[44px] px-4 py-2 text-[14px] text-navy"
            >
              Retry
            </button>
            {apiError.isNetwork ? (
              <button
                type="button"
                onClick={() => void submitTrip(true)}
                className="btn-stamp min-h-[44px] px-4 py-2 text-[14px]"
              >
                Create offline draft on this device
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Actions */}
      <div className="perforation mt-8 flex flex-wrap items-center justify-between gap-3 pt-6">
        <Link href="/create" className="btn-line text-navy">
          <ArrowLeft size={17} strokeWidth={2.25} aria-hidden="true" />
          <Sparkles size={16} strokeWidth={2.25} aria-hidden="true" />
          Use Smart Import instead
        </Link>

        <button type="submit" disabled={submitting} className="btn-stamp">
          {submitting ? <span className="spinner" aria-hidden="true" /> : null}
          {submitting ? 'Creating workspace…' : 'Create & open editor'}
          {!submitting ? <ArrowRight size={18} strokeWidth={2.25} aria-hidden="true" /> : null}
        </button>
      </div>
    </form>
  );
}
