'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, LogIn, MapPin, Users } from 'lucide-react';
import { Postmark } from '@/components/world/Postmark';
import {
  acceptTripInvite,
  fetchInvitePreview,
  type InvitePreview,
} from '@/lib/api-client';

interface InviteAcceptClientProps {
  token: string;
  initialInvite: InvitePreview | null;
}

export function InviteAcceptClient({
  token,
  initialInvite,
}: InviteAcceptClientProps) {
  const router = useRouter();
  const [invite, setInvite] = useState<InvitePreview | null>(initialInvite);
  const [loading, setLoading] = useState<boolean>(!initialInvite);
  const [joining, setJoining] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (initialInvite) return;
    let cancelled = false;
    void fetchInvitePreview(token).then((res) => {
      if (cancelled) return;
      setInvite(res);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [initialInvite, token]);

  const handleJoinTrip = async () => {
    setJoining(true);
    setErrorMsg(null);
    try {
      const res = await acceptTripInvite(token);
      const targetId = res.tripId || invite?.tripId;
      if (targetId) {
        router.push(`/trip/${targetId}`);
        return;
      }
      setErrorMsg('Invite accepted, please open My Trips to view the workspace.');
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'This invite link has expired or could not be accepted.'
      );
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-[600px] px-5 py-16 text-paper">
        <div className="flex items-center gap-3 text-[17px] font-semibold">
          <span className="spinner text-saffron" aria-hidden="true" />
          <span>Opening trip invitation…</span>
        </div>
      </div>
    );
  }

  if (!invite) {
    return (
      <div className="mx-auto max-w-[600px] px-5 py-16">
        <div className="paper-surface on-paper rounded-[14px] border-2 border-navy p-8 text-navy shadow-tag">
          <h1 className="display text-[42px] text-navy">Invitation not found</h1>
          <p className="mt-3 text-[16px] text-paper-ink">
            This co-editor invite link may have expired or already been revoked by the trip owner.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/trips" className="btn-stamp">
              Go to My Trips
            </Link>
            <Link href="/explore" className="btn-line text-navy">
              Browse itineraries
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const nextUrl = `/invite/${encodeURIComponent(token)}`;

  return (
    <div className="mx-auto max-w-[620px] px-5 py-12 md:py-16">
      <div className="tag-cut paper-surface on-paper relative border-b-4 border-paper-edge px-6 pb-9 pt-[58px] text-navy shadow-tag sm:px-10">
        <span className="tag-hole" aria-hidden="true" />
        <Postmark
          ring="CO-EDITOR · ITINBEE ·"
          centre={invite.role === 'viewer' ? 'VIEWER' : 'EDITOR'}
          size={88}
          className="pointer-events-none absolute right-6 top-11 hidden rotate-[8deg] opacity-75 sm:block"
        />

        <span className="inline-flex items-center gap-1.5 rounded-full border border-navy bg-saffron px-3 py-0.5 text-[12.5px] font-bold uppercase tracking-wider text-navy">
          <Users size={13} strokeWidth={2.2} aria-hidden="true" />
          <span>{invite.role === 'viewer' ? 'Viewer Invite' : 'Co-Editor Invite'}</span>
        </span>

        <h1 className="display mt-3 text-[44px] leading-tight text-navy sm:text-[54px]">
          {invite.tripTitle}
        </h1>

        {invite.destinationSummary ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-[16px] font-semibold text-vermilion-ink">
            <MapPin size={16} strokeWidth={2.2} aria-hidden="true" className="shrink-0" />
            <span>{invite.destinationSummary}</span>
          </p>
        ) : null}

        <p className="mt-4 text-[16px] leading-relaxed text-paper-ink">
          {invite.inviterName
            ? `${invite.inviterName} invited you to collaborate on this trip as ${invite.role === 'viewer' ? 'a viewer' : 'a co-editor'}.`
            : `You have been invited to join this trip workspace as ${invite.role === 'viewer' ? 'a viewer' : 'a co-editor'}.`}
        </p>

        {errorMsg ? (
          <p
            role="alert"
            className="mt-4 flex items-center gap-2 rounded-lg border-2 border-[#a82e19] bg-[#fffdf8] px-4 py-3 text-[14.5px] font-bold text-vermilion-ink"
          >
            <AlertCircle size={17} strokeWidth={2.25} aria-hidden="true" />
            <span>{errorMsg}</span>
          </p>
        ) : null}

        <div className="perforation mt-7 flex flex-wrap items-center gap-3 pt-6">
          <button
            type="button"
            disabled={joining}
            onClick={() => void handleJoinTrip()}
            className="btn-stamp text-[16px]"
          >
            {joining ? (
              <span className="spinner" aria-hidden="true" />
            ) : (
              <ArrowRight size={18} strokeWidth={2.25} aria-hidden="true" />
            )}
            <span>{joining ? 'Joining trip…' : 'Join Trip'}</span>
          </button>

          <Link href={`/login?next=${encodeURIComponent(nextUrl)}`} className="btn-line text-navy">
            <LogIn size={16} strokeWidth={2.2} aria-hidden="true" />
            <span>Sign in first</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
