'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { MapPin, Plus, Search } from 'lucide-react';
import {
  geoAutocomplete,
  localGeoSuggestions,
  type GeoSuggestion,
} from '@/lib/import-client';

interface DestinationComboboxProps {
  label: string;
  labelSrOnly?: boolean;
  placeholder?: string;
  initialValue?: string;
  allowCustom?: boolean;
  submitButtonLabel?: string;
  onSelect: (choice: GeoSuggestion | { name: string }) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}

export function DestinationCombobox({
  label,
  labelSrOnly = false,
  placeholder = 'Search a city, state or country…',
  initialValue = '',
  allowCustom = true,
  submitButtonLabel = 'Add',
  onSelect,
  onCancel,
  autoFocus = false,
}: DestinationComboboxProps) {
  const [query, setQuery] = useState(initialValue);
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<GeoSuggestion[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [loading, setLoading] = useState(false);
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listboxId = `${baseId}-listbox`;
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (!open || trimmed.length < 2) {
      setSuggestions([]);
      setActiveIdx(-1);
      setLoading(false);
      return;
    }

    const local = localGeoSuggestions(trimmed);
    setSuggestions(local);
    setLoading(true);

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const remote = await geoAutocomplete(trimmed, ctrl.signal);
        if (!ctrl.signal.aborted) {
          setSuggestions(remote.length > 0 ? remote : local);
          setActiveIdx(remote.length > 0 ? 0 : local.length > 0 ? 0 : -1);
          setLoading(false);
        }
      } catch {
        if (!ctrl.signal.aborted) {
          setLoading(false);
        }
      }
    }, 260);

    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [query, open]);

  const commitChoice = (choice: GeoSuggestion | { name: string }) => {
    onSelect(choice);
    setQuery('');
    setSuggestions([]);
    setActiveIdx(-1);
    setOpen(false);
  };

  const handleManualAdd = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    if (activeIdx >= 0 && suggestions[activeIdx]) {
      commitChoice(suggestions[activeIdx]!);
      return;
    }
    const exact = suggestions.find((s) => s.name.toLowerCase() === trimmed.toLowerCase());
    if (exact) {
      commitChoice(exact);
      return;
    }
    if (allowCustom) {
      commitChoice({ name: trimmed });
    }
  };

  const showListbox = open && suggestions.length > 0;

  return (
    <div className="relative w-full">
      <label
        htmlFor={inputId}
        className={labelSrOnly ? 'sr-only' : 'mb-1.5 block text-[15px] font-bold text-navy'}
      >
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
        <div className="relative min-w-0 flex-1">
          <Search
            size={17}
            strokeWidth={2.25}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-paper-ink"
          />
          <input
            id={inputId}
            type="text"
            role="combobox"
            aria-expanded={showListbox}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={activeIdx >= 0 && showListbox ? `${listboxId}-opt-${activeIdx}` : undefined}
            autoComplete="off"
            spellCheck={false}
            autoFocus={autoFocus}
            value={query}
            placeholder={placeholder}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 140)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setOpen(true);
                setActiveIdx((idx) => Math.min(idx + 1, suggestions.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIdx((idx) => Math.max(idx - 1, 0));
              } else if (e.key === 'Enter') {
                if (query.trim()) {
                  e.preventDefault();
                  handleManualAdd();
                }
              } else if (e.key === 'Escape') {
                setOpen(false);
                onCancel?.();
              }
            }}
            className="field pl-9 pr-3"
          />
        </div>

        <button
          type="button"
          onClick={handleManualAdd}
          disabled={!query.trim()}
          className="btn-line min-h-[44px] shrink-0 px-4 py-2 text-[15px] text-navy disabled:opacity-45"
        >
          <Plus size={17} strokeWidth={2.25} aria-hidden="true" />
          {submitButtonLabel}
        </button>

        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] rounded-lg px-3 text-[14px] font-bold text-paper-ink underline underline-offset-2 hover:text-navy"
          >
            Cancel
          </button>
        ) : null}
      </div>

      {showListbox ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-40 mt-1.5 max-h-64 overflow-auto rounded-lg border-2 border-navy bg-[#fffdf8] py-1 text-navy shadow-label"
        >
          {suggestions.map((s, idx) => (
            <li
              key={s.id}
              id={`${listboxId}-opt-${idx}`}
              role="option"
              aria-selected={idx === activeIdx}
              onMouseDown={(e) => {
                e.preventDefault();
                commitChoice(s);
              }}
              className={`flex min-h-[44px] cursor-pointer items-center justify-between gap-3 px-3.5 py-2 ${
                idx === activeIdx ? 'bg-saffron/40' : 'hover:bg-saffron/20'
              }`}
            >
              <span className="inline-flex items-center gap-2 font-bold text-navy">
                <MapPin size={15} strokeWidth={2.25} aria-hidden="true" className="shrink-0 text-[#0F766E]" />
                {s.name}
              </span>
              <span className="truncate text-[13px] font-semibold text-paper-ink">
                {s.secondary || s.kind}
              </span>
            </li>
          ))}
          {loading ? (
            <li className="px-3.5 py-1.5 text-[12px] font-semibold text-paper-ink" aria-hidden="true">
              Searching open map places…
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
