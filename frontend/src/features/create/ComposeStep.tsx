'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  Compass,
  FileText,
  Image as ImageIcon,
  Link2,
  Mic,
  MicOff,
  Paperclip,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import { DieCutLabel } from '@/components/world/DieCutLabel';
import { Postmark } from '@/components/world/Postmark';
import {
  ACCEPT,
  checkNewFiles,
  classifyUrl,
  extractUrls,
  formatBytes,
  urlLabel,
  validateDraft,
  type AttachedFile,
} from '@/features/create/compose-utils';
import type { FlowError } from '@/features/create/flow-reducer';
import { LIMITS } from '@/lib/import-types';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

const PRESETS: Array<{ id: string; label: string; prompt: string }> = [
  {
    id: 'weekend',
    label: 'Weekend getaway',
    prompt:
      '3 days in Rishikesh and Landour from Delhi next month — Ganga aarti, riverside cafes, easy ridge walks, mid-range stays',
  },
  {
    id: 'honeymoon',
    label: 'Honeymoon',
    prompt:
      '6 days Kerala honeymoon in Munnar tea hills and an Alleppey backwater houseboat, relaxed pace, boutique stays, around ₹75,000',
  },
  {
    id: 'yatra',
    label: 'Family & elders yatra',
    prompt:
      '4 days Varanasi and Sarnath with parents (65+), pure vegetarian meals, sugam darshan slots, minimal stairs and afternoon rest buffers',
  },
  {
    id: 'friends',
    label: 'Friends road trip',
    prompt:
      '5 days South Goa with 5 friends in December — Agonda, Cabo de Rama cliff sunset, Fontainhas walk and beach shacks',
  },
  {
    id: 'international',
    label: 'International',
    prompt:
      '7 days Vietnam from Bengaluru — Hanoi Old Quarter street food, Ha Long Bay overnight boat and Hoi An lantern town, budget ₹90,000',
  },
];

export interface ComposeDraft {
  text: string;
  files: AttachedFile<File>[];
  baseTripSlug?: string;
}

interface ComposeStepProps {
  draft: ComposeDraft;
  onDraftChange: (next: ComposeDraft) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: FlowError | null;
  onClearError: () => void;
  localPreview: boolean;
  onSwitchToLocalPreview: () => void;
  onDisableLocalPreview: () => void;
  focusAttachOnMount?: boolean;
}

export function ComposeStep({
  draft,
  onDraftChange,
  onSubmit,
  submitting,
  error,
  onClearError,
  localPreview,
  onSwitchToLocalPreview,
  onDisableLocalPreview,
  focusAttachOnMount = false,
}: ComposeStepProps) {
  const formId = useId();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const attachBtnRef = useRef<HTMLButtonElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [dragActive, setDragActive] = useState(false);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [triedSubmit, setTriedSubmit] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const w = window as unknown as Record<string, unknown>;
    if (w.SpeechRecognition || w.webkitSpeechRecognition) {
      setSpeechSupported(true);
    }
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (focusAttachOnMount) {
      attachBtnRef.current?.focus();
    }
  }, [focusAttachOnMount]);

  const detectedUrls = useMemo(() => extractUrls(draft.text), [draft.text]);
  const hasSocialUrl = useMemo(
    () => detectedUrls.some((u) => classifyUrl(u) === 'instagram' || classifyUrl(u) === 'youtube'),
    [detectedUrls]
  );

  const draftValidation = useMemo(
    () =>
      validateDraft({
        text: draft.text,
        urls: detectedUrls,
        fileCount: draft.files.length,
      }),
    [draft.text, detectedUrls, draft.files.length]
  );

  const validationMsg = triedSubmit
    ? draftValidation.empty || draftValidation.text || draftValidation.urls || null
    : draftValidation.text || draftValidation.urls || null;

  const totalBytes = useMemo(
    () => draft.files.reduce((sum, item) => sum + item.file.size, 0),
    [draft.files]
  );

  const handleIncomingFiles = (incomingList: FileList | File[]) => {
    const incoming = Array.from(incomingList);
    if (incoming.length === 0) return;
    const existingFiles = draft.files.map((item) => item.file);
    const { accepted, errors } = checkNewFiles(existingFiles, incoming);
    setFileErrors(errors);
    if (accepted.length > 0) {
      const additions: AttachedFile<File>[] = accepted.map((file) => ({
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`,
        file,
      }));
      onDraftChange({ ...draft, files: [...draft.files, ...additions] });
      if (error) onClearError();
    }
  };

  const removeFile = (id: string) => {
    setFileErrors([]);
    onDraftChange({
      ...draft,
      files: draft.files.filter((item) => item.id !== id),
    });
  };

  const removeDetectedUrl = (urlToRemove: string) => {
    const nextText = draft.text.replace(urlToRemove, '').replace(/[ \t]{2,}/g, ' ').trim();
    onDraftChange({ ...draft, text: nextText });
  };

  const toggleVoice = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = 'en-IN';
    rec.onresult = (ev) => {
      let chunk = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        if (res?.isFinal && res[0]?.transcript) {
          chunk += `${res[0].transcript} `;
        }
      }
      const trimmed = chunk.trim();
      if (trimmed) {
        onDraftChange({
          ...draft,
          text: draft.text.trim() ? `${draft.text.trim()} ${trimmed}` : trimmed,
        });
      }
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTriedSubmit(true);
    if (draftValidation.empty || draftValidation.text || draftValidation.urls) {
      textareaRef.current?.focus();
      return;
    }
    onSubmit();
  };

  const baseLabel = draft.baseTripSlug
    ? draft.baseTripSlug
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
    : null;

  return (
    <div className="relative mx-auto max-w-[1220px] px-5 pb-16 pt-6 md:px-8">
      {/* Decorative Trunk Labels flanking on wide viewports */}
      <DieCutLabel
        slug="spiti-valley"
        name="Spiti"
        days={7}
        shape="arch"
        sizes="210px"
        className="pointer-events-none absolute left-3 top-16 hidden h-[220px] w-[204px] -rotate-[3deg] xl:block"
      />
      <DieCutLabel
        slug="udaipur"
        name="Udaipur"
        days={3}
        shape="notch"
        sizes="210px"
        className="pointer-events-none absolute right-3 top-28 hidden h-[196px] w-[212px] rotate-[3deg] xl:block"
      />

      <div className="mx-auto max-w-[720px] drop-shadow-[0_22px_24px_rgba(3,18,14,0.55)]">
        <div className="tag-cut paper-surface on-paper relative border-b-4 border-paper-edge px-6 pb-8 pt-[58px] sm:px-10">
          <span className="tag-hole" aria-hidden="true" />

          <Postmark
            ring="SMART IMPORT · ITINBEE ·"
            centre="MAPPED"
            size={92}
            className="pointer-events-none absolute right-6 top-11 hidden rotate-[9deg] opacity-75 sm:block"
          />

          <h1 className="display text-[44px] text-navy sm:text-[58px]">
            Tell us where.{' '}
            <span className="text-vermilion-deep">Drop anything in.</span>
          </h1>
          <p className="mt-3 max-w-[60ch] text-[17px] leading-relaxed text-paper-ink">
            Type a sentence, paste a messy WhatsApp group chat in English, Hinglish or Hindi, drop a blog or Reel link,
            or attach an IRCTC, flight or bus ticket.
          </p>

          {localPreview ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border-[1.5px] border-navy/40 bg-[#efe0be] px-4 py-2.5 text-[14px] text-navy">
              <span className="font-semibold">
                Offline preview mode active — using local deterministic parser while the backend server is offline.
              </span>
              <button
                type="button"
                onClick={onDisableLocalPreview}
                className="min-h-[36px] font-bold text-vermilion-ink underline underline-offset-2"
              >
                Reconnect to live server
              </button>
            </div>
          ) : null}

          {baseLabel ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border-[1.5px] border-navy/35 bg-[#efe0be] px-3.5 py-2 text-[14px] text-navy">
              <span>
                Customising template: <strong>{baseLabel}</strong>
              </span>
              <button
                type="button"
                onClick={() => onDraftChange({ ...draft, baseTripSlug: undefined })}
                className="inline-flex min-h-[36px] items-center gap-1 rounded px-2 font-bold text-navy hover:bg-navy/10"
              >
                <X size={15} strokeWidth={2.25} aria-hidden="true" />
                Remove base
              </button>
            </div>
          ) : null}

          <form onSubmit={handleFormSubmit} noValidate className="mt-6">
            <label htmlFor={`${formId}-notes`} className="mb-1.5 block text-[15px] font-bold text-navy">
              Your trip notes, links or chat
            </label>
            <p id={`${formId}-hint`} className="mb-2 text-[14px] text-paper-ink">
              Paste text, drag &amp; drop up to {LIMITS.files} PDF/image tickets (max {formatBytes(LIMITS.totalBytes)}),
              or paste a screenshot directly from your clipboard.
            </p>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                handleIncomingFiles(e.dataTransfer.files);
              }}
              className={`rounded-[10px] border-2 bg-[#fffdf8] px-4 pb-3 pt-3.5 shadow-[inset_0_2px_5px_rgba(20,33,61,0.08)] transition-colors focus-within:outline focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-navy ${
                dragActive
                  ? 'border-vermilion-deep bg-[#fff7e4]'
                  : validationMsg
                    ? 'border-[#a82e19]'
                    : 'border-navy'
              }`}
            >
              <textarea
                id={`${formId}-notes`}
                ref={textareaRef}
                name="notes"
                rows={5}
                value={draft.text}
                aria-invalid={validationMsg ? 'true' : 'false'}
                aria-describedby={validationMsg ? `${formId}-hint ${formId}-err` : `${formId}-hint`}
                onChange={(e) => {
                  onDraftChange({ ...draft, text: e.target.value });
                  if (error) onClearError();
                }}
                onPaste={(e) => {
                  const clipboardFiles = e.clipboardData?.files;
                  if (clipboardFiles && clipboardFiles.length > 0) {
                    e.preventDefault();
                    handleIncomingFiles(clipboardFiles);
                  }
                }}
                placeholder="e.g. 5 days in Manali & Kasol in June with 4 friends, overnight Volvo from Delhi booked for 12 June, we want riverside cafes and a day hike…"
                className="block w-full resize-y border-0 bg-transparent p-0 text-[17px] leading-[1.5] text-navy outline-none placeholder:text-[#566079]"
              />

              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT}
                multiple
                className="sr-only"
                tabIndex={-1}
                onChange={(e) => {
                  if (e.target.files) {
                    handleIncomingFiles(e.target.files);
                    e.target.value = '';
                  }
                }}
              />

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-navy/15 pt-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    ref={attachBtnRef}
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border-[1.5px] border-navy/45 bg-paper px-3.5 py-2 text-[14px] font-bold text-navy transition-colors hover:bg-[#efe0be]"
                  >
                    <Paperclip size={16} strokeWidth={2.25} aria-hidden="true" />
                    Attach ticket or screenshot
                  </button>

                  {speechSupported ? (
                    <button
                      type="button"
                      aria-pressed={listening}
                      onClick={toggleVoice}
                      className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg border-[1.5px] px-3.5 py-2 text-[14px] font-bold transition-colors ${
                        listening
                          ? 'border-vermilion-deep bg-vermilion-deep text-[#fffdf8]'
                          : 'border-navy/45 bg-paper text-navy hover:bg-[#efe0be]'
                      }`}
                    >
                      {listening ? (
                        <MicOff size={16} strokeWidth={2.25} aria-hidden="true" />
                      ) : (
                        <Mic size={16} strokeWidth={2.25} aria-hidden="true" />
                      )}
                      {listening ? 'Stop dictation' : 'Voice input'}
                    </button>
                  ) : null}
                </div>

                <span className="text-[13px] font-semibold tabular-nums text-paper-ink">
                  {draft.files.length > 0
                    ? `${draft.files.length}/${LIMITS.files} files · ${formatBytes(totalBytes)}`
                    : draft.text.length > 12_000
                      ? `${draft.text.length.toLocaleString('en-IN')}/${LIMITS.textChars.toLocaleString('en-IN')} chars`
                      : 'English · Hinglish · हिन्दी'}
                </span>
              </div>
            </div>

            {/* Attached files */}
            {draft.files.length > 0 ? (
              <ul role="list" className="mt-3 flex flex-wrap gap-2" aria-label="Attached files">
                {draft.files.map((item) => {
                  const isPdf = item.file.type === 'application/pdf' || /\.pdf$/i.test(item.file.name);
                  return (
                    <li
                      key={item.id}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-full border-[1.5px] border-navy/50 bg-[#efe0be] pl-3.5 pr-1.5 text-[14px] font-semibold text-navy"
                    >
                      {isPdf ? (
                        <FileText size={15} strokeWidth={2.25} aria-hidden="true" className="shrink-0" />
                      ) : (
                        <ImageIcon size={15} strokeWidth={2.25} aria-hidden="true" className="shrink-0" />
                      )}
                      <span className="max-w-[200px] truncate">{item.file.name}</span>
                      <span className="text-[12px] tabular-nums text-paper-ink">
                        ({formatBytes(item.file.size)})
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${item.file.name}`}
                        onClick={() => removeFile(item.id)}
                        className="grid h-9 w-9 place-items-center rounded-full text-navy hover:bg-navy/10"
                      >
                        <X size={15} strokeWidth={2.25} aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {/* Detected URLs */}
            {detectedUrls.length > 0 ? (
              <div className="mt-3 space-y-2">
                <ul role="list" className="flex flex-wrap gap-2" aria-label="Detected links">
                  {detectedUrls.map((u) => {
                    const kind = classifyUrl(u);
                    return (
                      <li
                        key={u}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border-[1.5px] border-navy/40 bg-[#fffdf8] pl-3 pr-1.5 text-[13px] font-semibold text-navy"
                      >
                        <Link2 size={14} strokeWidth={2.25} aria-hidden="true" className="shrink-0 text-[#0F766E]" />
                        <span>{urlLabel(u)}</span>
                        {kind !== 'other' ? (
                          <span className="rounded bg-[#efe0be] px-1.5 py-0.5 text-[11px] font-bold capitalize text-navy">
                            {kind}
                          </span>
                        ) : null}
                        <button
                          type="button"
                          aria-label={`Remove link ${urlLabel(u)}`}
                          onClick={() => removeDetectedUrl(u)}
                          className="grid h-8 w-8 place-items-center rounded-full text-paper-ink hover:bg-navy/10 hover:text-navy"
                        >
                          <X size={14} strokeWidth={2.25} aria-hidden="true" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {hasSocialUrl ? (
                  <p className="rounded-lg border border-navy/30 bg-[#efe0be] px-3.5 py-2.5 text-[14px] text-navy">
                    <strong>Note on Instagram &amp; YouTube links:</strong> Itinbee reads public captions and titles
                    only (no video scraping). If the caption skips place names, mention them in a few words above.
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* File or validation errors */}
            {fileErrors.length > 0 ? (
              <div role="alert" className="mt-3 rounded-lg border-2 border-[#a82e19] bg-[#fffdf8] px-4 py-3 text-[14px] text-vermilion-ink">
                <ul className="space-y-1">
                  {fileErrors.map((msg) => (
                    <li key={msg} className="flex items-start gap-2 font-semibold">
                      <AlertCircle size={16} strokeWidth={2.25} aria-hidden="true" className="mt-0.5 shrink-0" />
                      <span>{msg}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {validationMsg ? (
              <p
                id={`${formId}-err`}
                role="alert"
                className="mt-3 flex items-center gap-2 text-[14px] font-bold text-vermilion-ink"
              >
                <AlertCircle size={16} strokeWidth={2.25} aria-hidden="true" className="shrink-0" />
                <span>{validationMsg}</span>
              </p>
            ) : null}

            {/* API / Network / Quota errors */}
            {error ? (
              <div
                role="alert"
                className="mt-4 rounded-lg border-2 border-[#a82e19] bg-[#fffdf8] p-4 text-navy"
              >
                <p className="flex items-start gap-2 text-[15px] font-bold text-vermilion-ink">
                  <AlertCircle size={18} strokeWidth={2.25} aria-hidden="true" className="mt-0.5 shrink-0" />
                  <span>{error.message}</span>
                </p>
                {error.kind === 'quota' && error.resetAt ? (
                  <p className="mt-1.5 text-[14px] text-paper-ink">
                    Quota resets around {new Date(error.resetAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}.
                    You can also build manually right now.
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2.5">
                  <button
                    type="submit"
                    className="btn-line min-h-[44px] px-4 py-2 text-[14px] text-navy"
                  >
                    Retry connection
                  </button>
                  {error.kind === 'network' ? (
                    <button
                      type="button"
                      onClick={onSwitchToLocalPreview}
                      className="btn-stamp min-h-[44px] px-4 py-2 text-[14px]"
                    >
                      Continue in offline preview mode
                    </button>
                  ) : null}
                  <Link href="/create/manual" className="btn-line min-h-[44px] px-4 py-2 text-[14px] text-navy">
                    Build manually
                  </Link>
                </div>
              </div>
            ) : null}

            {/* Primary & secondary CTAs */}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button type="submit" disabled={submitting} className="btn-stamp">
                {submitting ? <span className="spinner" aria-hidden="true" /> : <Sparkles size={18} strokeWidth={2.25} aria-hidden="true" />}
                {submitting ? 'Starting…' : 'Read & plan my trip'}
              </button>

              <Link href="/create/manual" className="btn-line text-navy">
                <Wrench size={17} strokeWidth={2.25} aria-hidden="true" />
                Build it myself
              </Link>

              <Link href="/explore" className="btn-line text-navy">
                <Compass size={17} strokeWidth={2.25} aria-hidden="true" />
                Start from a template
              </Link>
            </div>

            {/* Quick-start presets on perforated tear-strip */}
            <div className="perforation -mx-6 mt-6 px-6 pt-5 sm:-mx-10 sm:px-10">
              <fieldset>
                <legend className="mb-2.5 text-[14px] font-bold text-paper-ink">
                  Need a starting point? Pick a trip shape:
                </legend>
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        onDraftChange({ ...draft, text: preset.prompt });
                        if (error) onClearError();
                        textareaRef.current?.focus();
                      }}
                      className="chip-paper min-h-[44px] px-3.5 text-[14px]"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
