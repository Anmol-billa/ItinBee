'use client';

import React, { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  LogIn,
  LogOut,
  Save,
} from 'lucide-react';
import {
  fetchCurrentSession,
  signOutAccount,
  updateAccountProfile,
  type AuthSessionState,
} from '@/lib/auth-client';

const UPI_VPA_RE = /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z0-9]{2,32}$/;

export function AccountClient() {
  const router = useRouter();
  const uid = useId();

  const [session, setSession] = useState<AuthSessionState | null>(null);
  const [loading, setLoading] = useState(true);

  const [displayName, setDisplayName] = useState('');
  const [nameBlurred, setNameBlurred] = useState(false);
  const [preferredLang, setPreferredLang] = useState<'en' | 'hi'>('en');
  const [upiVpa, setUpiVpa] = useState('');
  const [upiBlurred, setUpiBlurred] = useState(false);

  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchCurrentSession().then((sess) => {
      if (cancelled) return;
      setSession(sess);
      if (sess.user) {
        setDisplayName(sess.user.displayName);
        setPreferredLang(sess.user.preferredLang);
        setUpiVpa(sess.user.upiVpa ?? '');
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const nameInvalid = nameBlurred && !displayName.trim();
  const upiInvalid = upiBlurred && upiVpa.trim().length > 0 && !UPI_VPA_RE.test(upiVpa.trim());

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameBlurred(true);
    setUpiBlurred(true);
    setSavedMsg(null);
    setErrorMsg(null);

    if (!displayName.trim()) return;
    if (upiVpa.trim() && !UPI_VPA_RE.test(upiVpa.trim())) return;

    setSaving(true);
    try {
      const updated = await updateAccountProfile({
        displayName: displayName.trim(),
        preferredLang,
        upiVpa: upiVpa.trim() || null,
      });
      setSession((prev) => (prev ? { ...prev, user: updated } : { user: updated, guest: updated.guest, offline: false }));
      setSavedMsg('Account preferences saved.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not update profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    await signOutAccount();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-[680px] px-5 py-16 text-paper md:px-8">
        <div className="flex items-center gap-3 text-[17px] font-semibold">
          <span className="spinner text-saffron" aria-hidden="true" />
          <span>Loading your account…</span>
        </div>
      </div>
    );
  }

  const isSignedIn = Boolean(session?.user && !session.guest);

  if (!isSignedIn) {
    return (
      <div className="mx-auto max-w-[640px] px-5 py-14 md:px-8">
        <div className="paper-surface on-paper rounded-[14px] border-2 border-navy p-8 text-navy shadow-tag sm:p-10">
          <h1 className="display text-[44px] text-navy sm:text-[54px]">Account &amp; preferences</h1>
          <p className="mt-3 text-[17px] leading-relaxed text-paper-ink">
            You are currently planning as a guest. Sign in to set your display name, preferred Elder Card language and
            default UPI ID across all shared trips.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/login?next=/account" className="btn-stamp">
              <LogIn size={18} strokeWidth={2.25} aria-hidden="true" />
              Sign in to Itinbee
            </Link>
            <Link href="/trips" className="btn-line text-navy">
              Back to My trips
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[700px] px-5 py-12 md:px-8 md:py-16">
      <form
        onSubmit={handleSave}
        noValidate
        className="paper-surface on-paper rounded-[14px] border-2 border-navy p-6 text-navy shadow-tag sm:p-10"
      >
        <h1 className="display text-[44px] text-navy sm:text-[54px]">Account settings</h1>
        <p className="mt-2 text-[16px] text-paper-ink">
          {session?.user?.email ? `Signed in as ${session.user.email}. ` : ''}
          Used on shared itineraries, polls and group UPI settlements.
        </p>

        {/* Display Name */}
        <div className="perforation mt-6 pt-6">
          <label htmlFor={`${uid}-name`} className="mb-1.5 block text-[15px] font-bold text-navy">
            Display name <span aria-hidden="true">*</span>
          </label>
          <p id={`${uid}-name-hint`} className="mb-2 text-[14px] text-paper-ink">
            Shown to co-travellers on polls and expense splits (English or हिन्दी).
          </p>
          <input
            id={`${uid}-name`}
            name="name"
            type="text"
            required
            autoComplete="name"
            value={displayName}
            aria-invalid={nameInvalid ? 'true' : 'false'}
            aria-describedby={nameInvalid ? `${uid}-name-hint ${uid}-name-err` : `${uid}-name-hint`}
            onBlur={() => setNameBlurred(true)}
            onChange={(e) => {
              setDisplayName(e.target.value);
              setSavedMsg(null);
            }}
            className="field max-w-[440px]"
          />
          {nameInvalid ? (
            <p
              id={`${uid}-name-err`}
              role="alert"
              className="mt-2 flex items-center gap-1.5 text-[14px] font-bold text-vermilion-ink"
            >
              <AlertCircle size={16} strokeWidth={2.25} aria-hidden="true" />
              <span>Display name cannot be empty.</span>
            </p>
          ) : null}
        </div>

        {/* Preferred Language */}
        <div className="perforation mt-6 pt-6">
          <fieldset>
            <legend className="mb-1.5 text-[15px] font-bold text-navy">Preferred language</legend>
            <p className="mb-3 text-[14px] text-paper-ink">
              Default script for Family &amp; Elder Cards and bilingual trip summaries.
            </p>
            <div className="flex flex-wrap gap-2.5">
              <label>
                <input
                  type="radio"
                  name={`${uid}-lang`}
                  className="peer sr-only"
                  checked={preferredLang === 'en'}
                  onChange={() => {
                    setPreferredLang('en');
                    setSavedMsg(null);
                  }}
                />
                <span className="chip-toggle">English</span>
              </label>
              <label>
                <input
                  type="radio"
                  name={`${uid}-lang`}
                  className="peer sr-only"
                  checked={preferredLang === 'hi'}
                  onChange={() => {
                    setPreferredLang('hi');
                    setSavedMsg(null);
                  }}
                />
                <span className="chip-toggle font-devanagari">हिन्दी (Hindi)</span>
              </label>
            </div>
          </fieldset>
        </div>

        {/* Default UPI VPA */}
        <div className="perforation mt-6 pt-6">
          <label htmlFor={`${uid}-upi`} className="mb-1.5 block text-[15px] font-bold text-navy">
            Default UPI ID (VPA) for group splits
          </label>
          <p id={`${uid}-upi-hint`} className="mb-2 text-[14px] text-paper-ink">
            Pre-fills one-tap <code>upi://pay</code> links and QR codes when friends owe you on a trip (e.g.{' '}
            <code>name@okicici</code>).
          </p>
          <input
            id={`${uid}-upi`}
            name="upiVpa"
            type="text"
            spellCheck={false}
            autoCapitalize="none"
            value={upiVpa}
            aria-invalid={upiInvalid ? 'true' : 'false'}
            aria-describedby={upiInvalid ? `${uid}-upi-hint ${uid}-upi-err` : `${uid}-upi-hint`}
            onBlur={() => setUpiBlurred(true)}
            onChange={(e) => {
              setUpiVpa(e.target.value);
              setSavedMsg(null);
            }}
            placeholder="yourname@okhdfcbank"
            className="field max-w-[440px] font-mono text-[15px]"
          />
          {upiInvalid ? (
            <p
              id={`${uid}-upi-err`}
              role="alert"
              className="mt-2 flex items-center gap-1.5 text-[14px] font-bold text-vermilion-ink"
            >
              <AlertCircle size={16} strokeWidth={2.25} aria-hidden="true" />
              <span>Enter a valid UPI ID in the format handle@bank (or leave blank).</span>
            </p>
          ) : null}
        </div>

        {savedMsg ? (
          <p
            role="status"
            className="mt-5 flex items-center gap-2 rounded-lg border border-[#0F766E]/45 bg-[#F0FDFA] px-4 py-3 text-[15px] font-bold text-[#0F766E]"
          >
            <CheckCircle2 size={18} strokeWidth={2.25} aria-hidden="true" />
            <span>{savedMsg}</span>
          </p>
        ) : null}

        {errorMsg ? (
          <p
            role="alert"
            className="mt-5 flex items-center gap-2 rounded-lg border-2 border-[#a82e19] bg-[#fffdf8] px-4 py-3 text-[15px] font-bold text-vermilion-ink"
          >
            <AlertCircle size={18} strokeWidth={2.25} aria-hidden="true" />
            <span>{errorMsg}</span>
          </p>
        ) : null}

        {/* Save & Sign out */}
        <div className="perforation mt-8 flex flex-wrap items-center justify-between gap-3 pt-6">
          <button type="submit" disabled={saving} className="btn-stamp">
            {saving ? <span className="spinner" aria-hidden="true" /> : <Save size={18} strokeWidth={2.25} aria-hidden="true" />}
            {saving ? 'Saving…' : 'Save changes'}
          </button>

          <button type="button" onClick={() => void handleSignOut()} className="btn-line text-vermilion-ink">
            <LogOut size={17} strokeWidth={2.25} aria-hidden="true" />
            Sign out
          </button>
        </div>
      </form>
    </div>
  );
}
