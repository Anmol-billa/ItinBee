import type {
  BudgetTier,
  GeoSuggestion,
  GroupType,
  IntentDestination,
  Pace,
  TripIntent,
} from '@/lib/import-types';

export type DateMode = 'dates' | 'days';

export interface IntentFormState {
  intent: TripIntent;
  answers: Record<string, string>;
  dateMode: DateMode;
}

export function initIntentForm(intent: TripIntent): IntentFormState {
  const sorted = [...intent.destinations].sort((a, b) => a.order - b.order);
  return {
    intent: { ...intent, destinations: renumber(sorted) },
    answers: {},
    dateMode: intent.dates.start && intent.dates.end ? 'dates' : 'days',
  };
}

export type IntentAction =
  | { type: 'title'; value: string }
  | { type: 'destRemove'; index: number }
  | { type: 'destMove'; index: number; dir: -1 | 1 }
  | { type: 'destAdd'; suggestion: GeoSuggestion | { name: string } }
  | { type: 'destFix'; index: number; suggestion: GeoSuggestion | { name: string } }
  | { type: 'destNights'; index: number; nights: number | null }
  | { type: 'dateMode'; mode: DateMode }
  | { type: 'dateStart'; value: string | null }
  | { type: 'dateEnd'; value: string | null }
  | { type: 'length'; value: number | null }
  | { type: 'month'; value: number | null }
  | { type: 'travellerCount'; value: number | null }
  | { type: 'group'; value: GroupType | null }
  | { type: 'children'; value: boolean }
  | { type: 'seniors'; value: boolean }
  | { type: 'budgetTier'; value: BudgetTier | null }
  | { type: 'budgetAmount'; value: number | null }
  | { type: 'interestToggle'; value: string }
  | { type: 'pace'; value: Pace }
  | { type: 'dietToggle'; value: string }
  | { type: 'mustAdd'; name: string }
  | { type: 'mustRemove'; index: number }
  | { type: 'avoidRemove'; index: number }
  | { type: 'assumptionDismiss'; index: number }
  | { type: 'assumptionEdit'; index: number; value: string }
  | { type: 'answer'; id: string; value: string };

function renumber(list: IntentDestination[]): IntentDestination[] {
  return list.map((d, i) => ({ ...d, order: i }));
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function daysBetween(start: string, end: string): number | null {
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.round((b - a) / 86_400_000) + 1;
}

function fromSuggestion(s: GeoSuggestion | { name: string }, order: number, prev?: IntentDestination): IntentDestination {
  if ('lat' in s) {
    return {
      name: s.name,
      country: s.countryCode ?? prev?.country,
      nights: prev?.nights,
      order,
      confidence: 1,
      destinationSlug: s.slug ?? undefined,
      lat: s.lat,
      lng: s.lng,
      resolved: true,
    };
  }
  return { name: s.name.trim(), nights: prev?.nights, order, confidence: 1, resolved: false };
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function intentReducer(state: IntentFormState, action: IntentAction): IntentFormState {
  const { intent } = state;
  const set = (patch: Partial<TripIntent>): IntentFormState => ({ ...state, intent: { ...intent, ...patch } });

  switch (action.type) {
    case 'title':
      return set({ title: action.value });

    case 'destRemove':
      return set({ destinations: renumber(intent.destinations.filter((_, i) => i !== action.index)) });

    case 'destMove': {
      const to = action.index + action.dir;
      if (to < 0 || to >= intent.destinations.length) return state;
      const next = [...intent.destinations];
      [next[action.index], next[to]] = [next[to], next[action.index]];
      return set({ destinations: renumber(next) });
    }

    case 'destAdd': {
      const name = action.suggestion.name.trim();
      if (!name || intent.destinations.some((d) => sameName(d.name, name))) return state;
      return set({
        destinations: [...intent.destinations, fromSuggestion(action.suggestion, intent.destinations.length)],
      });
    }

    case 'destFix': {
      const prev = intent.destinations[action.index];
      if (!prev || !action.suggestion.name.trim()) return state;
      const next = [...intent.destinations];
      next[action.index] = fromSuggestion(action.suggestion, action.index, prev);
      return set({ destinations: next });
    }

    case 'destNights': {
      const next = intent.destinations.map((d, i) =>
        i === action.index
          ? { ...d, nights: action.nights == null ? undefined : clamp(Math.round(action.nights), 0, 60) }
          : d
      );
      return set({ destinations: next });
    }

    case 'dateMode':
      if (action.mode === state.dateMode) return state;
      if (action.mode === 'days') {
        return { ...state, dateMode: 'days', intent: { ...intent, dates: { ...intent.dates, start: null, end: null } } };
      }
      return { ...state, dateMode: 'dates', intent: { ...intent, dates: { ...intent.dates, flexibleMonth: null } } };

    case 'dateStart':
    case 'dateEnd': {
      const dates = { ...intent.dates };
      if (action.type === 'dateStart') dates.start = action.value || null;
      else dates.end = action.value || null;
      if (dates.start && dates.end) {
        const n = daysBetween(dates.start, dates.end);
        if (n) dates.lengthDays = clamp(n, 1, 30);
      }
      dates.flexibleMonth = null;
      return set({ dates });
    }

    case 'length':
      return set({
        dates: { ...intent.dates, lengthDays: action.value == null ? null : clamp(Math.round(action.value), 1, 30) },
      });

    case 'month':
      return set({ dates: { ...intent.dates, flexibleMonth: action.value } });

    case 'travellerCount':
      return set({
        travellers: {
          ...intent.travellers,
          count: action.value == null ? null : clamp(Math.round(action.value), 1, 50),
        },
      });

    case 'group':
      return set({ travellers: { ...intent.travellers, group: action.value } });

    case 'children':
      return set({ travellers: { ...intent.travellers, hasChildren: action.value } });

    case 'seniors':
      return set({ travellers: { ...intent.travellers, hasSeniors: action.value } });

    case 'budgetTier':
      return set({ budget: { ...intent.budget, tier: action.value } });

    case 'budgetAmount':
      return set({
        budget: {
          ...intent.budget,
          amount: action.value == null ? null : Math.max(0, Math.round(action.value)),
          currency: intent.budget.currency ?? 'INR',
        },
      });

    case 'interestToggle': {
      const v = action.value.trim();
      if (!v) return state;
      const has = intent.interests.some((i) => sameName(i, v));
      return set({
        interests: has ? intent.interests.filter((i) => !sameName(i, v)) : [...intent.interests, v],
      });
    }

    case 'pace':
      return set({ pace: action.value });

    case 'dietToggle': {
      const v = action.value.trim();
      if (!v) return state;
      const has = intent.diet.some((i) => sameName(i, v));
      return set({ diet: has ? intent.diet.filter((i) => !sameName(i, v)) : [...intent.diet, v] });
    }

    case 'mustAdd': {
      const name = action.name.trim();
      if (!name || intent.mustInclude.some((m) => sameName(m.name, name))) return state;
      return set({ mustInclude: [...intent.mustInclude, { name, sourceQuote: name, resolved: false }] });
    }

    case 'mustRemove':
      return set({ mustInclude: intent.mustInclude.filter((_, i) => i !== action.index) });

    case 'avoidRemove':
      return set({ avoid: intent.avoid.filter((_, i) => i !== action.index) });

    case 'assumptionDismiss':
      return set({ assumptions: intent.assumptions.filter((_, i) => i !== action.index) });

    case 'assumptionEdit': {
      const v = action.value.trim();
      if (!v) return set({ assumptions: intent.assumptions.filter((_, i) => i !== action.index) });
      return set({ assumptions: intent.assumptions.map((a, i) => (i === action.index ? v : a)) });
    }

    case 'answer':
      return { ...state, answers: { ...state.answers, [action.id]: action.value } };
  }
  return state;
}

export interface IntentIssue {
  field: 'destinations' | 'dates';
  message: string;
}

/** Blocking problems that stop "Build itinerary". Everything else can stay as assumed. */
export function validateIntent(intent: TripIntent): IntentIssue[] {
  const issues: IntentIssue[] = [];
  if (intent.destinations.length < 1) {
    issues.push({ field: 'destinations', message: 'Add at least one destination so we know where to build.' });
  }
  const { start, end } = intent.dates;
  if (start && end && Date.parse(end) < Date.parse(start)) {
    issues.push({ field: 'dates', message: 'The end date is before the start date.' });
  }
  if ((start && !end) || (!start && end)) {
    issues.push({ field: 'dates', message: 'Pick both a start and an end date, or switch to number of days.' });
  }
  return issues;
}

/** The body for POST /confirm: renumbered, trimmed, with only answered questions. */
export function finalizeIntent(state: IntentFormState): { intent: TripIntent; answers: Record<string, string> } {
  const intent: TripIntent = {
    ...state.intent,
    title: state.intent.title.trim() || 'My trip',
    destinations: renumber(state.intent.destinations),
    interests: state.intent.interests.map((s) => s.trim()).filter(Boolean),
    assumptions: state.intent.assumptions.map((s) => s.trim()).filter(Boolean),
  };
  const ids = new Set(intent.clarifyingQuestions.map((q) => q.id));
  const answers = Object.fromEntries(Object.entries(state.answers).filter(([k, v]) => ids.has(k) && v));
  return { intent, answers };
}
