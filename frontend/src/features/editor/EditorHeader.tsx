'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Check,
  Cloud,
  Compass,
  FolderLock,
  IndianRupee,
  LogIn,
  Pencil,
  Share2,
  UserCheck,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { BrandMark } from '@/components/world/PublicNav';
import {
  AUTH_CHANGE_EVENT,
  fetchCurrentUser,
  readCachedUser,
  type AuthUser,
} from '@/lib/auth-client';
import type { TripMeta } from '@/lib/types';

export type EditorMode = 'plan' | 'bookings' | 'budget' | 'group' | 'share';

interface EditorHeaderProps {
  trip: TripMeta;
  dayCount: number;
  bookingCount: number;
  expenseCount: number;
  pollCount: number;
  activeMode: EditorMode;
  isOnline: boolean;
  wsConnected: boolean;
  isCloudTrip: boolean;
  onSelectMode: (mode: EditorMode) => void;
  onUpdateTitle: (newTitle: string) => void;
  onOpenQuickShare: () => void;
}

export function EditorHeader({
  trip,
  dayCount,
  bookingCount,
  expenseCount,
  pollCount,
  activeMode,
  isOnline,
  wsConnected,
  isCloudTrip,
  onSelectMode,
  onUpdateTitle,
  onOpenQuickShare,
}: EditorHeaderProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(trip.title);
  const [signedInUser, setSignedInUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setDraftTitle(trip.title);
  }, [trip.title]);

  useEffect(() => {
    let cancelled = false;
    const syncCached = () => {
      const cached = readCachedUser();
      if (!cancelled) {
        setSignedInUser(cached && !cached.guest ? cached : null);
      }
    };
    syncCached();
    void fetchCurrentUser().then((u) => {
      if (!cancelled) {
        setSignedInUser(u);
      }
    });

    window.addEventListener(AUTH_CHANGE_EVENT, syncCached);
    window.addEventListener('storage', syncCached);
    return () => {
      cancelled = true;
      window.removeEventListener(AUTH_CHANGE_EVENT, syncCached);
      window.removeEventListener('storage', syncCached);
    };
  }, []);

  const commitTitle = () => {
    const trimmed = draftTitle.trim();
    if (trimmed && trimmed !== trip.title) {
      onUpdateTitle(trimmed);
    } else {
      setDraftTitle(trip.title);
    }
    setEditingTitle(false);
  };

  const modes: ReadonlyArray<{
    id: EditorMode;
    label: string;
    Icon: React.ElementType;
    badge?: number;
  }> = [
    { id: 'plan', label: 'Plan', Icon: Compass },
    { id: 'bookings', label: 'Bookings', Icon: FolderLock, badge: bookingCount },
    { id: 'budget', label: 'Budget & UPI', Icon: IndianRupee, badge: expenseCount },
    { id: 'group', label: 'Group & Polls', Icon: Users, badge: pollCount },
    { id: 'share', label: 'Share & Publish', Icon: Share2 },
  ];

  const shortDestSummary = trip.destinationSummary
    ? trip.destinationSummary.replace(/\(\d+D\)/gi, '').trim()
    : 'Custom route';

  const accountFirstName =
    signedInUser?.displayName.trim().split(/\s+/)[0] || 'Account';

  return (
    <header className="z-30 shrink-0 border-b border-saffron/30 bg-trunk-dark text-paper">
      {/* Top Row: Brand, Nav, Editable Trip Title, Status, Account/Sign in, Share CTA */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:flex-nowrap">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 sm:gap-4 lg:flex-nowrap">
          <Link
            href="/"
            className="inline-flex shrink-0 items-center gap-2 text-saffron"
            aria-label="Itinbee home"
          >
            <BrandMark size={28} />
            <span className="display text-[26px] leading-none">itinbee</span>
          </Link>

          <nav
            aria-label="Site navigation"
            className="hidden shrink-0 items-center gap-1 border-l border-paper/20 pl-3 md:flex"
          >
            <Link
              href="/explore"
              className="rounded-md px-2.5 py-1.5 text-[14px] font-semibold text-paper/85 transition-colors hover:bg-paper/10 hover:text-paper"
            >
              Explore
            </Link>
            <Link
              href="/trips"
              className="rounded-md px-2.5 py-1.5 text-[14px] font-semibold text-paper/85 transition-colors hover:bg-paper/10 hover:text-paper"
            >
              My Trips
            </Link>
          </nav>

          {/* Editable Trip Title & Saffron Day Chip */}
          <div className="flex min-w-0 items-center gap-2 border-l border-paper/20 pl-3 lg:flex-1">
            {editingTitle ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  commitTitle();
                }}
                className="flex items-center gap-1.5"
              >
                <label htmlFor="trip-title-edit-input" className="sr-only">
                  Edit trip title
                </label>
                <input
                  id="trip-title-edit-input"
                  type="text"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  onBlur={commitTitle}
                  autoFocus
                  className="min-h-[36px] w-48 rounded-md border border-saffron bg-[#FFFDF8] px-2.5 py-1 text-[15px] font-bold text-navy sm:w-64"
                />
                <button
                  type="submit"
                  aria-label="Save trip title"
                  className="inline-grid h-9 w-9 place-items-center rounded-md bg-saffron text-navy"
                >
                  <Check className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setEditingTitle(true)}
                aria-label={`Edit trip title: ${trip.title}`}
                className="group inline-flex min-h-[36px] min-w-0 max-w-[240px] shrink items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left transition-colors hover:bg-paper/10 sm:max-w-[380px] lg:max-w-[420px] xl:max-w-[500px]"
              >
                <h1 className="display truncate text-[24px] leading-none text-paper sm:text-[26px]">
                  {trip.title}
                </h1>
                <Pencil
                  className="h-3.5 w-3.5 shrink-0 text-paper/65 group-hover:text-saffron"
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
              </button>
            )}

            <span className="inline-flex shrink-0 items-center rounded-full bg-saffron px-2.5 py-0.5 text-[12px] font-bold text-navy">
              {dayCount} {dayCount === 1 ? 'day' : 'days'}
            </span>

            <span className="hidden min-w-0 max-w-[180px] shrink truncate text-[13px] text-paper/80 xl:inline">
              {shortDestSummary}
            </span>
          </div>
        </div>

        {/* Right Controls: Honest 3-State Sync Pill, Account/Sign in, Stamped Share Button */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
          <span
            role="status"
            data-testid="sync-status-pill"
            className="hidden items-center gap-1.5 rounded-full border border-paper/25 bg-trunk-deep px-3 py-1 text-[12px] font-semibold text-paper sm:inline-flex"
          >
            {isOnline && wsConnected ? (
              <>
                <Wifi className="h-3.5 w-3.5 text-saffron" strokeWidth={1.9} aria-hidden="true" />
                <span>Live synced</span>
              </>
            ) : isOnline && isCloudTrip ? (
              <>
                <Cloud className="h-3.5 w-3.5 text-saffron" strokeWidth={1.9} aria-hidden="true" />
                <span>Saved to cloud</span>
              </>
            ) : (
              <>
                <WifiOff
                  className="h-3.5 w-3.5 text-saffron"
                  strokeWidth={1.9}
                  aria-hidden="true"
                />
                <span>Saved offline</span>
              </>
            )}
          </span>

          {signedInUser ? (
            <Link
              href="/account"
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-paper/35 px-3 py-1.5 text-[13.5px] font-semibold text-paper transition-colors hover:bg-paper/10"
            >
              <UserCheck className="h-3.5 w-3.5 text-saffron" strokeWidth={2} aria-hidden="true" />
              <span className="max-w-[120px] truncate">{accountFirstName}</span>
            </Link>
          ) : (
            <Link
              href={`/login?next=${encodeURIComponent(`/trip/${trip.id}`)}`}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-paper/35 px-3 py-1.5 text-[13.5px] font-semibold text-paper transition-colors hover:bg-paper/10"
            >
              <LogIn className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
              <span className="hidden sm:inline">Save / Sign in</span>
              <span className="sm:hidden">Sign in</span>
            </Link>
          )}

          <button
            type="button"
            data-primary-action
            onClick={onOpenQuickShare}
            className="btn-stamp min-h-[40px] px-4 py-1.5 text-[14px]"
          >
            <Share2 className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />
            <span>Share</span>
          </button>
        </div>
      </div>

      {/* Bottom Row: Primary Mode Switch */}
      <div className="border-t border-paper/15 bg-trunk px-4 sm:px-6">
        <div
          role="tablist"
          aria-label="Trip workspace modes"
          className="flex items-center gap-1 overflow-x-auto"
        >
          {modes.map((m) => {
            const Icon = m.Icon;
            const selected = activeMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                role="tab"
                id={`editor-tab-${m.id}`}
                aria-selected={selected}
                onClick={() => onSelectMode(m.id)}
                className={`relative inline-flex min-h-[44px] shrink-0 items-center gap-1.5 px-3.5 py-2 text-[14px] font-semibold transition-colors ${
                  selected
                    ? 'text-saffron after:absolute after:inset-x-1 after:bottom-0 after:border-b-[3px] after:border-saffron'
                    : 'text-paper/85 hover:bg-paper/10 hover:text-paper'
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                <span>{m.label}</span>
                {typeof m.badge === 'number' && m.badge > 0 && (
                  <span className="rounded-full bg-trunk-dark px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums text-paper">
                    {m.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}
