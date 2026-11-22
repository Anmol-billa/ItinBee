'use client';

import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { TrunkCorners } from '@/components/world/TrunkCorners';
import { BuildingStep } from '@/features/create/BuildingStep';
import { ComposeStep, type ComposeDraft } from '@/features/create/ComposeStep';
import { extractUrls, isUrlsOnly, toBase64 } from '@/features/create/compose-utils';
import {
  errorFromEvent,
  flowReducer,
  initialFlowState,
  type FlowError,
  type Step,
} from '@/features/create/flow-reducer';
import { ReviewStep } from '@/features/create/ReviewStep';
import { UnderstandingStep } from '@/features/create/UnderstandingStep';
import {
  confirmJob,
  createImportJob,
  getJob,
  IMPORT_MOCK,
  ImportApiError,
  isLocalPreviewEnabled,
  setLocalPreviewEnabled,
  streamJob,
  type ConfirmBody,
  type CreateJobBody,
  type ImportFilePayload,
} from '@/lib/import-client';

const STEPS: Array<{ id: Step; label: string }> = [
  { id: 'compose', label: 'Describe' },
  { id: 'understanding', label: 'Understand' },
  { id: 'review', label: 'Review' },
  { id: 'building', label: 'Build' },
];

function toFlowError(err: unknown): FlowError {
  if (err instanceof ImportApiError) {
    if (
      err.status === 0 ||
      err.status === 502 ||
      err.status === 503 ||
      err.status === 504 ||
      err.code === 'network' ||
      err.code === 'backend_unreachable'
    ) {
      return {
        kind: 'network',
        code: err.code || 'network',
        message:
          err.message && err.message !== 'fetch failed'
            ? err.message
            : 'Could not reach the Itinbee backend service (it may be waking up or redeploying). Wait a few seconds and click Retry connection.',
      };
    }
    if (err.status === 429 || err.code === 'quota_exceeded') {
      return { kind: 'quota', code: err.code, message: err.message, resetAt: err.resetAt };
    }
    if (err.status === 400 || err.code === 'invalid_input') {
      return { kind: 'invalid', code: err.code, message: err.message };
    }
    if (err.status === 404 || err.code === 'not_found') {
      return { kind: 'expired', code: 'not_found', message: 'This trip request has expired. Start a fresh one below.' };
    }
    return errorFromEvent(err.code, err.message, err.resetAt);
  }
  return {
    kind: 'failed',
    message: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
  };
}

interface CreateFlowClientProps {
  initialQuery?: string;
  initialBaseSlug?: string;
  initialAttach?: boolean;
  initialJobId?: string;
}

export function CreateFlowClient({
  initialQuery = '',
  initialBaseSlug,
  initialAttach = false,
  initialJobId,
}: CreateFlowClientProps) {
  const router = useRouter();
  const [state, dispatch] = useReducer(flowReducer, initialFlowState);
  const [draft, setDraft] = useState<ComposeDraft>({
    text: initialQuery,
    files: [],
    baseTripSlug: initialBaseSlug,
  });
  const [localPreview, setLocalPreview] = useState(false);
  const stopStreamRef = useRef<(() => void) | null>(null);
  const resumedJobRef = useRef<string | null>(null);

  useEffect(() => {
    const preview = isLocalPreviewEnabled();
    setLocalPreview(preview);
    // Proactively wake the Render backend while the traveller composes their prompt
    if (!IMPORT_MOCK && !preview) {
      void fetch('/api/proxy/health', { cache: 'no-store' }).catch(() => {});
    }
    return () => {
      stopStreamRef.current?.();
    };
  }, []);

  const syncJobInUrl = useCallback(
    (jobId: string | null) => {
      if (jobId) {
        router.replace(`/create?job=${encodeURIComponent(jobId)}`, { scroll: false });
      } else {
        router.replace('/create', { scroll: false });
      }
    },
    [router]
  );

  const openUnderstandingStream = useCallback((jobId: string) => {
    stopStreamRef.current?.();
    stopStreamRef.current = streamJob(
      jobId,
      {
        onEvent: (event) => dispatch({ type: 'event', event }),
        onConnection: (c) => dispatch({ type: 'connection', state: c }),
      },
      {
        stopAfter: (e) => e.type === 'intent' || e.type === 'done' || e.type === 'error',
      }
    );
  }, []);

  const openBuildingStream = useCallback((jobId: string) => {
    stopStreamRef.current?.();
    stopStreamRef.current = streamJob(
      jobId,
      {
        onEvent: (event) => dispatch({ type: 'event', event }),
        onConnection: (c) => dispatch({ type: 'connection', state: c }),
      },
      {
        stopAfter: (e) => e.type === 'done' || e.type === 'error',
      }
    );
  }, []);

  // Resume from ?job=<id> on refresh or direct link
  useEffect(() => {
    if (!initialJobId || resumedJobRef.current === initialJobId) return;
    resumedJobRef.current = initialJobId;

    let cancelled = false;
    void (async () => {
      try {
        const job = await getJob(initialJobId);
        if (cancelled) return;
        dispatch({ type: 'resume', job });
        if (job.status === 'queued' || job.status === 'understanding') {
          openUnderstandingStream(job.id);
        } else if (job.status === 'building') {
          openBuildingStream(job.id);
        }
      } catch (err) {
        if (cancelled) return;
        dispatch({ type: 'error', error: toFlowError(err) });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialJobId, openUnderstandingStream, openBuildingStream]);

  const startImportWithMode = useCallback(
    async (forceLocalPreview = false) => {
      if (forceLocalPreview) {
        setLocalPreviewEnabled(true);
        setLocalPreview(true);
      }

      dispatch({ type: 'submitting' });
      try {
        const urls = extractUrls(draft.text);
        const filesPayload: ImportFilePayload[] = await Promise.all(
          draft.files.map(async (item) => ({
            name: item.file.name,
            mimeType: item.file.type || 'application/octet-stream',
            dataBase64: await toBase64(item.file),
          }))
        );

        const body: CreateJobBody = {
          ...(draft.text.trim() && !isUrlsOnly(draft.text) ? { text: draft.text.trim() } : {}),
          ...(urls.length > 0 ? { urls } : {}),
          ...(filesPayload.length > 0 ? { files: filesPayload } : {}),
          ...(draft.baseTripSlug ? { baseTripSlug: draft.baseTripSlug } : {}),
          locale: 'en',
        };
        if (!body.text && !body.urls && !body.files && draft.text.trim()) {
          body.text = draft.text.trim();
        }

        const res = await createImportJob(body);
        dispatch({ type: 'submitted', jobId: res.jobId });
        syncJobInUrl(res.jobId);
        openUnderstandingStream(res.jobId);
      } catch (err) {
        dispatch({ type: 'error', error: toFlowError(err) });
      }
    },
    [draft, openUnderstandingStream, syncJobInUrl]
  );

  const handleConfirm = useCallback(
    async (payload: ConfirmBody) => {
      if (!state.jobId) return;
      dispatch({ type: 'submitting' });
      try {
        await confirmJob(state.jobId, payload);
        dispatch({ type: 'confirmed' });
        openBuildingStream(state.jobId);
      } catch (err) {
        dispatch({ type: 'error', error: toFlowError(err) });
      }
    },
    [state.jobId, openBuildingStream]
  );

  const handleStopBuilding = useCallback(() => {
    stopStreamRef.current?.();
    stopStreamRef.current = null;
    dispatch({ type: 'stopped' });
  }, []);

  const handleBackToCompose = useCallback(() => {
    stopStreamRef.current?.();
    stopStreamRef.current = null;
    dispatch({ type: 'reset' });
    syncJobInUrl(null);
  }, [syncJobInUrl]);

  const currentIdx = STEPS.findIndex((s) => s.id === state.step);

  return (
    <section className="trunk-ground trunk-frame relative isolate min-h-[calc(100dvh-64px)] overflow-x-hidden">
      <TrunkCorners />

      {/* 4-Step Trunk Pin Progress Tracker */}
      <nav
        aria-label="Trip creation steps"
        className="relative z-10 mx-auto max-w-[720px] px-5 pt-7 md:px-8"
      >
        <ol role="list" className="flex items-center justify-between gap-2">
          {STEPS.map((step, idx) => {
            const done = idx < currentIdx;
            const active = idx === currentIdx;
            return (
              <React.Fragment key={step.id}>
                <li
                  aria-current={active ? 'step' : undefined}
                  className="flex items-center gap-2"
                >
                  <span
                    className={`display grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 text-[17px] leading-none ${
                      active
                        ? 'border-paper bg-saffron text-navy'
                        : done
                          ? 'border-saffron bg-trunk-dark text-saffron'
                          : 'border-paper/45 bg-trunk-dark/70 text-paper/80'
                    }`}
                  >
                    {done ? <Check size={16} strokeWidth={2.75} aria-hidden="true" /> : idx + 1}
                  </span>
                  <span
                    className={`text-[14px] font-bold sm:text-[15px] ${
                      active ? 'text-saffron' : done ? 'text-paper' : 'text-paper/75'
                    }`}
                  >
                    {step.label}
                  </span>
                </li>
                {idx < STEPS.length - 1 ? (
                  <li
                    aria-hidden="true"
                    className={`h-0 flex-1 border-t-2 border-dashed ${
                      done ? 'border-saffron/80' : 'border-paper/30'
                    }`}
                  />
                ) : null}
              </React.Fragment>
            );
          })}
        </ol>
      </nav>

      {/* Active step */}
      <div className="relative z-10">
        {state.step === 'compose' ? (
          <ComposeStep
            draft={draft}
            onDraftChange={setDraft}
            onSubmit={() => void startImportWithMode(false)}
            submitting={state.submitting}
            error={state.error}
            onClearError={() => dispatch({ type: 'clearError' })}
            localPreview={localPreview}
            onSwitchToLocalPreview={() => void startImportWithMode(true)}
            onDisableLocalPreview={() => {
              setLocalPreviewEnabled(false);
              setLocalPreview(false);
            }}
            focusAttachOnMount={initialAttach}
          />
        ) : null}

        {state.step === 'understanding' ? (
          <UnderstandingStep
            mode={state.mode}
            connection={state.connection}
            lines={state.lines}
            detected={state.detected}
            error={state.error}
            onBackToEdit={handleBackToCompose}
            onRetry={() => void startImportWithMode(false)}
            onSwitchToLocalPreview={() => void startImportWithMode(true)}
          />
        ) : null}

        {state.step === 'review' && state.intent ? (
          <ReviewStep
            intent={state.intent}
            mode={state.mode}
            notice={state.notice}
            error={state.error}
            submitting={state.submitting}
            onConfirm={(payload) => void handleConfirm(payload)}
            onBackToEdit={handleBackToCompose}
          />
        ) : null}

        {state.step === 'building' ? (
          <BuildingStep
            days={state.days}
            intent={state.intent}
            tripId={state.tripId}
            mode={state.mode}
            connection={state.connection}
            error={state.error}
            onStop={handleStopBuilding}
          />
        ) : null}
      </div>
    </section>
  );
}
