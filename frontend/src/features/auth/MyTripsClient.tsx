'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Calendar,
  Cloud,
  Compass,
  HardDrive,
  LogIn,
  MapPin,
  Settings,
  Sparkles,
} from 'lucide-react';
import {
  fetchCurrentSession,
  fetchMyTripsAndOffline,
  type AuthSessionState,
  type MyTripSummary,
} from '@/lib/auth-client';

function formatTripDates(start: string | null, end: string | null): string {
  if (!start && !end) return 'Flexible dates';
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  return start ? `Starts ${fmt(start)}` : `Until ${fmt(end!)}`;
}

export function MyTripsClient() {
  const [session, setSession] = useState<AuthSessionState | null>(null);
  const [trips, setTrips] = useState<MyTripSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchCurrentSession(), fetchMyTripsAndOffline()]).then(([sess, list]) => {
      if (cancelled) return;
      setSession(sess);
      setTrips(list.trips);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const isSignedIn = Boolean(session?.user && !session.guest);

  return (
    <div className="mx-auto max-w-[1160px] px-5 py-12 md:px-8 md:py-16">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="display text-[54px] text-saffron md:text-[78px]">My trips</h1>
          <p className="mt-2 max-w-[60ch] text-[18px] text-paper/90">
            Your cloud-synced itineraries and offline browser drafts, ready to open, share on WhatsApp or settle over
            UPI.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href="/create" className="btn-stamp">
            <Sparkles size={18} strokeWidth={2.25} aria-hidden="true" />
            New itinerary
          </Link>
          {isSignedIn ? (
            <Link href="/account" className="btn-line btn-line-light text-paper">
              <Settings size={17} strokeWidth={2.25} aria-hidden="true" />
              Account settings
            </Link>
          ) : (
            <Link href="/login?next=/trips" className="btn-line btn-line-light text-paper">
              <LogIn size={17} strokeWidth={2.25} aria-hidden="true" />
              Sign in
            </Link>
          )}
        </div>
      </div>

      {/* Account / Guest Status Banner */}
      {!loading ? (
        isSignedIn ? (
          <div className="mt-7 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-saffron/35 bg-trunk-dark/75 px-5 py-3.5 text-[15px] text-paper">
            <span>
              Signed in as <strong>{session?.user?.displayName}</strong>
              {session?.user?.email ? ` (${session.user.email})` : ''}
              {session?.offline ? ' · Viewing cached offline state' : ' · Synced across devices'}
            </span>
            <Link href="/account" className="font-bold text-saffron underline underline-offset-2">
              Edit name, language &amp; UPI VPA
            </Link>
          </div>
        ) : (
          <div className="on-paper mt-7 flex flex-wrap items-center justify-between gap-4 rounded-xl border-2 border-navy bg-paper px-5 py-4 text-navy shadow-label">
            <div>
              <p className="text-[16px] font-bold text-navy">
                Planning as a guest on this browser
              </p>
              <p className="mt-0.5 text-[14px] text-paper-ink">
                Sign in with email or Google to back up your trips across phones and merge any guest drafts
                automatically.
              </p>
            </div>
            <Link href="/login?next=/trips" className="btn-stamp">
              Sign in to save across devices
            </Link>
          </div>
        )
      ) : null}

      {/* Trips Grid or Empty State */}
      {loading ? (
        <div className="mt-12 flex items-center gap-3 text-[17px] font-semibold text-paper">
          <span className="spinner text-saffron" aria-hidden="true" />
          <span>Loading your itineraries…</span>
        </div>
      ) : trips.length > 0 ? (
        <ul role="list" className="mt-10 grid gap-6 md:grid-cols-2">
          {trips.map((trip) => (
            <li
              key={trip.id}
              className="paper-surface on-paper flex flex-col justify-between rounded-[14px] border-2 border-navy p-6 text-navy shadow-label"
            >
              <div>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h2 className="display text-[34px] leading-tight text-navy">{trip.title}</h2>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-bold ${
                      trip.source === 'cloud'
                        ? 'border-[#0F766E]/50 bg-[#F0FDFA] text-[#0F766E]'
                        : 'border-navy/40 bg-[#efe0be] text-navy'
                    }`}
                  >
                    {trip.source === 'cloud' ? (
                      <>
                        <Cloud size={13} strokeWidth={2.25} aria-hidden="true" />
                        Cloud synced
                      </>
                    ) : (
                      <>
                        <HardDrive size={13} strokeWidth={2.25} aria-hidden="true" />
                        Offline draft
                      </>
                    )}
                  </span>
                </div>

                {trip.destinationSummary ? (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-[15px] font-semibold text-vermilion-ink">
                    <MapPin size={15} strokeWidth={2.25} aria-hidden="true" className="shrink-0" />
                    <span>{trip.destinationSummary}</span>
                  </p>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] font-semibold text-paper-ink">
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    <Calendar size={14} strokeWidth={2.25} aria-hidden="true" />
                    {formatTripDates(trip.startDate, trip.endDate)}
                  </span>
                  <span>Currency: {trip.homeCurrency}</span>
                  {trip.elderModeEnabled ? <span>Elder Card ready</span> : null}
                </div>
              </div>

              <div className="perforation mt-6 flex flex-wrap items-center justify-between gap-3 pt-4">
                <span className="text-[13px] tabular-nums text-paper-ink">
                  Updated{' '}
                  {new Date(trip.updatedAt).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
                <Link href={trip.openHref} className="btn-stamp min-h-[44px] px-4 py-2 text-[15px]">
                  Open editor
                  <ArrowRight size={17} strokeWidth={2.25} aria-hidden="true" />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="paper-surface on-paper mt-10 max-w-[640px] rounded-[14px] border-2 border-navy p-8 text-navy shadow-tag sm:p-10">
          <h2 className="display text-[42px] text-navy">No saved itineraries yet</h2>
          <p className="mt-3 text-[17px] leading-relaxed text-paper-ink">
            Start by dropping a sentence, WhatsApp chat or ticket into Smart Import, or clone one of Itinbee&rsquo;s
            ready-made templates.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/create" className="btn-stamp">
              <Sparkles size={18} strokeWidth={2.25} aria-hidden="true" />
              Create an itinerary
            </Link>
            <Link href="/explore" className="btn-line text-navy">
              <Compass size={18} strokeWidth={2.25} aria-hidden="true" />
              Browse templates
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
