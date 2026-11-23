import type {
  ConnectionState,
  DayItem,
  DetectedKind,
  JobEvent,
  JobMode,
  JobState,
  TripIntent,
} from '@/lib/import-types';

export type Step = 'compose' | 'understanding' | 'review' | 'building';

export interface FlowLine {
  id: string;
  text: string;
}

export interface FlowDetected {
  id: string;
  kind: DetectedKind;
  label: string;
  resolved: boolean;
}

export interface FlowDay {
  dayNumber: number;
  title: string;
  items: DayItem[];
}

export type FlowErrorKind = 'quota' | 'failed' | 'network' | 'invalid' | 'expired';

export interface FlowError {
  kind: FlowErrorKind;
  message: string;
  code?: string;
  resetAt?: string;
}

export interface FlowState {
  step: Step;
  jobId: string | null;
  mode: JobMode;
  lines: FlowLine[];
  detected: FlowDetected[];
  intent: TripIntent | null;
  days: FlowDay[];
  tripId: string | null;
  connection: ConnectionState;
  error: FlowError | null;
  /** One-off message shown on the review step (e.g. after Stop). */
  notice: string | null;
  submitting: boolean;
}

export const initialFlowState: FlowState = {
  step: 'compose',
  jobId: null,
  mode: 'ai',
  lines: [],
  detected: [],
  intent: null,
  days: [],
  tripId: null,
  connection: 'live',
  error: null,
  notice: null,
  submitting: false,
};

export type FlowAction =
  | { type: 'submitting' }
  | { type: 'starting' }
  | { type: 'submitted'; jobId: string }
  | { type: 'event'; event: JobEvent }
  | { type: 'connection'; state: ConnectionState }
  | { type: 'resume'; job: JobState }
  | { type: 'error'; error: FlowError }
  | { type: 'clearError' }
  | { type: 'confirmed' }
  | { type: 'stopped' }
  | { type: 'reset' };

const DETECT_VERB: Record<DetectedKind, string> = {
  destination: 'Found',
  place: 'Spotted',
  dates: 'Dates:',
  travellers: 'Travellers:',
  booking: 'Checking your booking:',
  budget: 'Budget:',
  interest: 'You like',
};

export function detectLine(kind: DetectedKind, label: string): string {
  return `${DETECT_VERB[kind]} ${label}`;
}

const STATUS_LINE: Record<string, string> = {
  queued: 'Waiting for a free slot…',
  understanding: 'Reading your notes…',
  needs_review: 'Done reading. Have a look at what we understood.',
  building: 'Building your day-by-day plan…',
};

function pushLine(lines: FlowLine[], line: FlowLine): FlowLine[] {
  if (lines.some((l) => l.id === line.id)) return lines;
  return [...lines, line].slice(-60);
}

export function errorFromEvent(code: string, message: string, resetAt?: string): FlowError {
  if (code === 'quota_exceeded') return { kind: 'quota', code, message, resetAt };
  if (code === 'not_found') return { kind: 'expired', code, message };
  return { kind: 'failed', code, message };
}

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case 'submitting':
      return { ...state, submitting: true, error: null };
    case 'starting':
      return {
        ...initialFlowState,
        step: 'understanding',
        jobId: null,
        lines: [{ id: 'status:starting', text: 'Starting trip planner & reading your notes…' }],
      };
    case 'submitted':
      return {
        ...initialFlowState,
        step: 'understanding',
        jobId: action.jobId,
        lines: [{ id: 'status:queued', text: STATUS_LINE.queued }],
      };
    case 'connection':
      return state.connection === action.state ? state : { ...state, connection: action.state };
    case 'error':
      if (!state.jobId && action.error.kind === 'invalid') {
        return { ...state, step: 'compose', submitting: false, error: action.error };
      }
      return { ...state, submitting: false, error: action.error };
    case 'clearError':
      return { ...state, error: null };
    case 'reset':
      return { ...initialFlowState };
    case 'confirmed':
      return { ...state, step: 'building', days: [], tripId: null, error: null, notice: null, submitting: false, connection: 'live' };
    case 'stopped':
      return {
        ...state,
        step: 'review',
        submitting: false,
        notice: 'Stopped. Change anything you like and build again.',
      };
    case 'resume': {
      const { job } = action;
      const base: FlowState = {
        ...initialFlowState,
        jobId: job.id,
        mode: job.mode,
        intent: job.intent ?? null,
        tripId: job.tripId ?? null,
      };
      switch (job.status) {
        case 'queued':
        case 'understanding':
          return { ...base, step: 'understanding', lines: [{ id: `status:${job.status}`, text: STATUS_LINE[job.status] }] };
        case 'needs_review':
          return job.intent ? { ...base, step: 'review' } : { ...base, step: 'understanding' };
        case 'building':
          return { ...base, step: 'building' };
        case 'done':
          return { ...base, step: 'building' };
        case 'failed':
          return {
            ...base,
            step: 'understanding',
            error: errorFromEvent(job.error?.code ?? 'failed', job.error?.message ?? 'We could not finish this trip.'),
          };
      }
      return base;
    }
    case 'event': {
      const e = action.event;
      switch (e.type) {
        case 'status': {
          const text = STATUS_LINE[e.data.status];
          return {
            ...state,
            mode: e.data.mode,
            lines: text && e.data.status !== 'needs_review' ? pushLine(state.lines, { id: `status:${e.data.status}`, text }) : state.lines,
          };
        }
        case 'detected': {
          const id = `${e.data.kind}:${e.data.label}`;
          if (state.detected.some((d) => d.id === id)) return state;
          return {
            ...state,
            detected: [...state.detected, { id, kind: e.data.kind, label: e.data.label, resolved: e.data.resolved ?? true }],
            lines: pushLine(state.lines, { id: `detected:${id}`, text: detectLine(e.data.kind, e.data.label) }),
          };
        }
        case 'intent':
          if (state.step === 'understanding') {
            return { ...state, step: 'review', intent: e.data.intent, error: null };
          }
          return state.intent ? state : { ...state, intent: e.data.intent };
        case 'day': {
          const day: FlowDay = { dayNumber: e.data.dayNumber, title: e.data.title, items: e.data.items };
          const rest = state.days.filter((d) => d.dayNumber !== day.dayNumber);
          return { ...state, days: [...rest, day].sort((a, b) => a.dayNumber - b.dayNumber) };
        }
        case 'done':
          return { ...state, tripId: e.data.tripId };
        case 'error':
          return { ...state, error: errorFromEvent(e.data.code, e.data.message) };
      }
      return state;
    }
  }
  return state;
}

/** Which step a given job state belongs to (used when resuming from ?job=). */
export function stepForJob(job: JobState): Step {
  return flowReducer(initialFlowState, { type: 'resume', job }).step;
}
