'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Mail,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import { Postmark } from '@/components/world/Postmark';
import {
  activateLocalDevAccount,
  AuthApiError,
  requestMagicCode,
  verifyGoogleSignIn,
  verifyMagicCode,
} from '@/lib/auth-client';

interface GoogleAccountsId {
  initialize(config: {
    client_id: string;
    callback: (response: { credential?: string }) => void;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: { theme?: string; size?: string; width?: number; text?: string }
  ): void;
}

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
const IS_DEV = process.env.NODE_ENV !== 'production';

function safeNextPath(nextPath?: string): string {
  if (!nextPath || !nextPath.startsWith('/') || nextPath.startsWith('//')) {
    return '/trips';
  }
  return nextPath;
}

export function LoginClient({
  nextPath,
  initialEmail = '',
  initialCode = '',
}: {
  nextPath?: string;
  initialEmail?: string;
  initialCode?: string;
}) {
  const router = useRouter();
  const uid = useId();
  const destination = safeNextPath(nextPath);

  const [step, setStep] = useState<'email' | 'code'>(
    initialEmail && initialCode ? 'code' : 'email'
  );
  const [email, setEmail] = useState(initialEmail);
  const [emailBlurred, setEmailBlurred] = useState(false);
  const [code, setCode] = useState(initialCode);
  const [codeBlurred, setCodeBlurred] = useState(false);
  const [devMagicCode, setDevMagicCode] = useState<string | null>(null);
  const autoVerifiedRef = useRef(false);

  const [triedSubmit, setTriedSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ message: string; isNetwork: boolean } | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const codeInputRef = useRef<HTMLInputElement | null>(null);
  const codeFormRef = useRef<HTMLFormElement | null>(null);
  const googleBtnRef = useRef<HTMLDivElement | null>(null);
  const otpAbortRef = useRef<AbortController | null>(null);

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const showEmailError = (emailBlurred || triedSubmit) && !isEmailValid;
  const isCodeValid = /^\d{6}$/.test(code.trim());
  const showCodeError = (codeBlurred || triedSubmit) && step === 'code' && !isCodeValid;

  // Google Identity Services setup when NEXT_PUBLIC_GOOGLE_CLIENT_ID is configured
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !googleBtnRef.current) return;
    let cancelled = false;

    const mountButton = () => {
      if (cancelled || !googleBtnRef.current) return;
      const g = (window as unknown as { google?: { accounts?: { id?: GoogleAccountsId } } }).google;
      if (!g?.accounts?.id) return;
      g.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (res) => {
          if (!res.credential) return;
          setSubmitting(true);
          setError(null);
          void verifyGoogleSignIn({ idToken: res.credential })
            .then(() => router.push(destination))
            .catch((err: unknown) => {
              setSubmitting(false);
              setError({
                message: err instanceof Error ? err.message : 'Google sign-in could not complete.',
                isNetwork: err instanceof AuthApiError && err.status === 0,
              });
            });
        },
      });
      g.accounts.id.renderButton(googleBtnRef.current, {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
      });
    };

    const existing = document.querySelector('script[data-itinbee-gis="1"]');
    if (existing) {
      mountButton();
    } else {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.dataset.itinbeeGis = '1';
      script.onload = mountButton;
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
    };
  }, [destination, router]);

  // Progressive enhancement: WebOTP listener on the 6-digit code step
  useEffect(() => {
    if (step !== 'code' || typeof window === 'undefined' || !('OTPCredential' in window)) {
      return;
    }
    otpAbortRef.current?.abort();
    const ac = new AbortController();
    otpAbortRef.current = ac;

    const nav = navigator.credentials as CredentialsContainer & {
      get(options?: CredentialRequestOptions & { otp?: { transport: string[] } }): Promise<(Credential & { code?: string }) | null>;
    };

    void nav
      .get({ otp: { transport: ['sms'] }, signal: ac.signal })
      .then((cred) => {
        if (cred?.code) {
          setCode(cred.code);
          setTimeout(() => codeFormRef.current?.requestSubmit(), 30);
        }
      })
      .catch(() => {
        /* expected when aborted or unsupported */
      });

    return () => {
      ac.abort();
    };
  }, [step]);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTriedSubmit(true);
    setError(null);
    if (!isEmailValid) {
      emailInputRef.current?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const res = await requestMagicCode(email);
      setDevMagicCode(res.devMagicCode ?? null);
      setStep('code');
      setTriedSubmit(false);
      setCodeBlurred(false);
      setStatusNote(`Sent a 6-digit sign-in code to ${email.trim().toLowerCase()}.`);
      setTimeout(() => codeInputRef.current?.focus(), 40);
    } catch (err) {
      setError({
        message: err instanceof Error ? err.message : 'Could not send sign-in code.',
        isNetwork: err instanceof AuthApiError && err.status === 0,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    otpAbortRef.current?.abort();
    setTriedSubmit(true);
    setError(null);
    if (!isCodeValid) {
      codeInputRef.current?.focus();
      return;
    }
    setSubmitting(true);
    try {
      await verifyMagicCode({ email, code });
      router.push(destination);
    } catch (err) {
      setSubmitting(false);
      setError({
        message: err instanceof Error ? err.message : 'Invalid or expired verification code.',
        isNetwork: err instanceof AuthApiError && err.status === 0,
      });
    }
  };

  // Auto-verify when arriving directly from an email magic link (/login?email=...&code=...)
  useEffect(() => {
    if (!initialEmail || !initialCode || autoVerifiedRef.current) return;
    autoVerifiedRef.current = true;
    setSubmitting(true);
    void verifyMagicCode({ email: initialEmail, code: initialCode })
      .then(() => router.push(destination))
      .catch((err: unknown) => {
        setSubmitting(false);
        setError({
          message: err instanceof Error ? err.message : 'Magic link expired. Request a fresh code below.',
          isNetwork: err instanceof AuthApiError && err.status === 0,
        });
      });
  }, [initialEmail, initialCode, destination, router]);

  const handleDevGoogleSignIn = async () => {
    setSubmitting(true);
    setError(null);
    const devEmail = email.trim() && isEmailValid ? email.trim() : 'traveller@itinbee.local';
    const devName = devEmail.split('@')[0]!.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    try {
      await verifyGoogleSignIn({
        devEmail,
        devName,
      });
      router.push(destination);
    } catch (err) {
      if (IS_DEV && err instanceof AuthApiError && (err.status === 0 || err.status === 404 || err.status >= 500)) {
        activateLocalDevAccount({ email: devEmail, displayName: devName });
        router.push(destination);
        return;
      }
      setSubmitting(false);
      setError({
        message: err instanceof Error ? err.message : 'Could not complete dev Google sign-in.',
        isNetwork: err instanceof AuthApiError && err.status === 0,
      });
    }
  };

  return (
    <div className="mx-auto max-w-[580px] drop-shadow-[0_22px_24px_rgba(3,18,14,0.55)]">
      <div className="tag-cut paper-surface on-paper relative border-b-4 border-paper-edge px-6 pb-9 pt-[58px] text-navy sm:px-10">
        <span className="tag-hole" aria-hidden="true" />
        <Postmark
          ring="GUEST MERGE · ITINBEE ·"
          centre="SYNCED"
          size={88}
          className="pointer-events-none absolute right-6 top-11 hidden rotate-[8deg] opacity-75 sm:block"
        />

        <h1 className="display text-[44px] text-navy sm:text-[54px]">
          Sign in to Itinbee
        </h1>

        <p className="mt-3 flex items-start gap-2.5 rounded-lg border-[1.5px] border-[#0F766E]/45 bg-[#F0FDFA] px-4 py-3 text-[15px] font-semibold text-navy">
          <ShieldCheck size={19} strokeWidth={2.25} aria-hidden="true" className="mt-0.5 shrink-0 text-[#0F766E]" />
          <span>
            Value before account: your guest drafts merge automatically when you sign in.
          </span>
        </p>

        {statusNote ? (
          <p
            role="status"
            className="mt-4 flex items-center gap-2 text-[15px] font-semibold text-[#0F766E]"
          >
            <CheckCircle2 size={17} strokeWidth={2.25} aria-hidden="true" className="shrink-0" />
            <span>{statusNote}</span>
          </p>
        ) : null}

        {/* Email Magic Code Step 1 */}
        {step === 'email' ? (
          <form onSubmit={handleEmailSubmit} method="post" noValidate className="mt-6">
            <label htmlFor={`${uid}-email`} className="mb-1 block text-[15px] font-bold text-navy">
              Email address <span aria-hidden="true">*</span>
            </label>
            <p id={`${uid}-email-hint`} className="mb-2 text-[14px] text-paper-ink">
              We&rsquo;ll send a 6-digit code — no password to remember.
            </p>
            <input
              id={`${uid}-email`}
              ref={emailInputRef}
              name="email"
              type="email"
              required
              autoComplete="username"
              spellCheck={false}
              enterKeyHint="next"
              value={email}
              aria-invalid={showEmailError ? 'true' : 'false'}
              aria-describedby={
                showEmailError ? `${uid}-email-hint ${uid}-email-err` : `${uid}-email-hint`
              }
              onBlur={() => setEmailBlurred(true)}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
              placeholder="you@example.com"
              className="field"
            />
            {showEmailError ? (
              <p
                id={`${uid}-email-err`}
                role="alert"
                className="mt-2 flex items-center gap-1.5 text-[14px] font-bold text-vermilion-ink"
              >
                <AlertCircle size={16} strokeWidth={2.25} aria-hidden="true" />
                <span>Enter an email address in the format you@example.com.</span>
              </p>
            ) : null}

            <button type="submit" disabled={submitting} className="btn-stamp mt-5 w-full">
              {submitting ? <span className="spinner" aria-hidden="true" /> : <Mail size={18} strokeWidth={2.25} aria-hidden="true" />}
              {submitting ? 'Sending code…' : 'Send 6-digit sign-in code'}
            </button>
          </form>
        ) : (
          /* Step 2: Enter 6-digit Magic Code */
          <form ref={codeFormRef} onSubmit={handleCodeSubmit} method="post" noValidate className="mt-6">
            <label htmlFor={`${uid}-code`} className="mb-1 block text-[15px] font-bold text-navy">
              6-digit verification code <span aria-hidden="true">*</span>
            </label>
            <p id={`${uid}-code-hint`} className="mb-2 text-[14px] text-paper-ink">
              Enter the 6-digit code sent to <strong>{email}</strong>.
            </p>

            {devMagicCode ? (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border-[1.5px] border-dashed border-navy/55 bg-[#efe0be] px-3.5 py-2.5">
                <span className="inline-flex items-center gap-1.5 text-[14px] font-bold text-navy">
                  <Terminal size={15} strokeWidth={2.25} aria-hidden="true" />
                  Local dev code: <code className="font-mono text-[15px]">{devMagicCode}</code>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setCode(devMagicCode);
                    setError(null);
                    codeInputRef.current?.focus();
                  }}
                  className="chip-paper min-h-[38px] !bg-navy !text-paper"
                >
                  Fill local dev code
                </button>
              </div>
            ) : null}

            <input
              id={`${uid}-code`}
              ref={codeInputRef}
              name="otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              spellCheck={false}
              autoCapitalize="none"
              enterKeyHint="done"
              value={code}
              aria-invalid={showCodeError ? 'true' : 'false'}
              aria-describedby={
                showCodeError ? `${uid}-code-hint ${uid}-code-err` : `${uid}-code-hint`
              }
              onBlur={() => setCodeBlurred(true)}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                if (error) setError(null);
              }}
              placeholder="000000"
              className="field font-mono text-[22px] font-bold tracking-[0.3em] tabular-nums"
            />
            {showCodeError ? (
              <p
                id={`${uid}-code-err`}
                role="alert"
                className="mt-2 flex items-center gap-1.5 text-[14px] font-bold text-vermilion-ink"
              >
                <AlertCircle size={16} strokeWidth={2.25} aria-hidden="true" />
                <span>Enter all 6 digits from your email.</span>
              </p>
            ) : null}

            <button type="submit" disabled={submitting} className="btn-stamp mt-5 w-full">
              {submitting ? <span className="spinner" aria-hidden="true" /> : <KeyRound size={18} strokeWidth={2.25} aria-hidden="true" />}
              {submitting ? 'Verifying…' : 'Verify & sign in'}
            </button>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[14px]">
              <button
                type="button"
                onClick={() => {
                  setStep('email');
                  setCode('');
                  setError(null);
                  setStatusNote(null);
                }}
                className="inline-flex min-h-[44px] items-center gap-1 font-bold text-navy underline underline-offset-2"
              >
                <ArrowLeft size={15} strokeWidth={2.25} aria-hidden="true" />
                Use a different email
              </button>

              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleEmailSubmit({ preventDefault: () => {} } as React.FormEvent)}
                className="min-h-[44px] font-bold text-vermilion-ink underline underline-offset-2"
              >
                Resend code
              </button>
            </div>
          </form>
        )}

        {error ? (
          <div
            role="alert"
            className="mt-4 rounded-lg border-2 border-[#a82e19] bg-[#fffdf8] p-4 text-[14px] text-navy"
          >
            <p className="flex items-start gap-2 font-bold text-vermilion-ink">
              <AlertCircle size={17} strokeWidth={2.25} aria-hidden="true" className="mt-0.5 shrink-0" />
              <span>{error.message}</span>
            </p>
            {IS_DEV && error.isNetwork ? (
              <button
                type="button"
                onClick={() => {
                  const targetEmail = email.trim() || 'traveller@itinbee.local';
                  activateLocalDevAccount({
                    email: targetEmail,
                    displayName: targetEmail.split('@')[0] || 'Dev Traveller',
                  });
                  router.push(destination);
                }}
                className="btn-line mt-3 min-h-[44px] w-full text-[14px] text-navy"
              >
                <Terminal size={16} strokeWidth={2.25} aria-hidden="true" />
                Sign in locally (offline dev mode)
              </button>
            ) : null}
          </div>
        ) : null}

        {/* Google Sign-In Section */}
        <div className="perforation -mx-6 mt-7 px-6 pt-6 sm:-mx-10 sm:px-10">
          <h2 className="display text-[28px] text-navy">Or sign in with Google</h2>

          {GOOGLE_CLIENT_ID ? (
            <div ref={googleBtnRef} className="mt-3 min-h-[44px]" />
          ) : IS_DEV ? (
            <div className="mt-3 space-y-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleDevGoogleSignIn()}
                className="btn-line w-full text-navy"
              >
                <Terminal size={17} strokeWidth={2.25} aria-hidden="true" />
                Local dev Google sign-in
              </button>
              <p className="text-[13px] text-paper-ink">
                Set <code>NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> to render the live Google Identity Services button.
              </p>
            </div>
          ) : (
            <p className="mt-2 text-[14px] text-paper-ink">
              Google Sign-In is temporarily unavailable — use the 6-digit email code above.
            </p>
          )}

          <p className="mt-5 text-[14px] text-paper-ink">
            Not ready to sign in?{' '}
            <Link href="/create" className="font-bold text-navy underline underline-offset-2">
              Keep planning as a guest
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
