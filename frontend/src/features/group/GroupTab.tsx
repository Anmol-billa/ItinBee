'use client';

import React, { useState } from 'react';
import {
  Check,
  Copy,
  Link2,
  Plus,
  UserPlus,
  Users,
  Vote,
} from 'lucide-react';
import { TurnstileWidget } from '@/components/security/TurnstileWidget';
import {
  addCloudTripMember,
  castGuestPollVote,
  createCloudPoll,
  createTripInvite,
  updateCloudTripMember,
  updateTripMeta,
} from '@/lib/api-client';
import { formatDietaryTag } from '@/lib/formatters';
import type { PollView, TripMember, TripWorkspace } from '@/lib/types';

interface GroupTabProps {
  workspace: TripWorkspace;
  isCloudSynced?: boolean;
  onUpdateWorkspace: (updater: (prev: TripWorkspace) => TripWorkspace) => void;
  onNotify: (msg: string) => void;
}

const DIETARY_TAG_OPTIONS = ['vegetarian', 'jain', 'non-drinker', 'vegan'] as const;

export function GroupTab({
  workspace,
  isCloudSynced = false,
  onUpdateWorkspace,
  onNotify,
}: GroupTabProps) {
  // Member form
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberVpa, setNewMemberVpa] = useState('');
  const [newMemberTags, setNewMemberTags] = useState<string[]>([]);

  // Invite Co-Editor state
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);

  // Poll form & voting
  const [voterName, setVoterName] = useState(
    workspace.members[0]?.displayName ?? 'Traveller'
  );
  const [turnstileToken, setTurnstileToken] = useState('');
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptA, setPollOptA] = useState('');
  const [pollOptB, setPollOptB] = useState('');
  const [pollOptC, setPollOptC] = useState('');

  const handleToggleElderMode = () => {
    const nextVal = !workspace.trip.elderModeEnabled;
    onUpdateWorkspace((prev) => ({
      ...prev,
      trip: {
        ...prev.trip,
        elderModeEnabled: nextVal,
      },
    }));
    if (isCloudSynced) {
      void updateTripMeta(workspace.trip.id, { elderModeEnabled: nextVal });
    }
    onNotify(
      nextVal
        ? 'Enabled Elder comfort pacing (max 4 stops/day).'
        : 'Switched to standard daily pacing.'
    );
  };

  const handleToggleMemberTag = (userId: string, tag: string) => {
    const target = workspace.members.find((m) => m.userId === userId);
    if (!target) return;
    const has = target.dietaryTags.includes(tag);
    const nextTags = has
      ? target.dietaryTags.filter((t) => t !== tag)
      : [...target.dietaryTags, tag];

    onUpdateWorkspace((prev) => ({
      ...prev,
      members: prev.members.map((m) =>
        m.userId === userId ? { ...m, dietaryTags: nextTags } : m
      ),
    }));

    if (isCloudSynced) {
      void updateCloudTripMember(workspace.trip.id, userId, {
        dietaryTags: nextTags,
      }).catch(() => {});
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim()) return;
    const cleanVpa = newMemberVpa.trim().toLowerCase() || null;
    const localMember: TripMember = {
      userId: crypto.randomUUID(),
      displayName: newMemberName.trim(),
      role: 'contributor',
      vaultAccess: false,
      dietaryTags: newMemberTags,
      upiVpa: cleanVpa,
      hasUpiVpa: Boolean(cleanVpa),
      joinedAt: new Date().toISOString(),
    };

    if (isCloudSynced) {
      try {
        const saved = await addCloudTripMember(workspace.trip.id, {
          userId: localMember.userId,
          displayName: localMember.displayName,
          dietaryTags: localMember.dietaryTags,
          upiVpa: cleanVpa,
        });
        const finalMember: TripMember = saved
          ? {
              ...saved,
              upiVpa: saved.upiVpa ?? cleanVpa,
              hasUpiVpa: saved.hasUpiVpa ?? Boolean(cleanVpa),
            }
          : localMember;
        onUpdateWorkspace((prev) => ({
          ...prev,
          members: [
            ...prev.members.filter((m) => m.userId !== finalMember.userId),
            finalMember,
          ],
        }));
      } catch {
        onUpdateWorkspace((prev) => ({
          ...prev,
          members: [...prev.members, localMember],
        }));
      }
    } else {
      onUpdateWorkspace((prev) => ({
        ...prev,
        members: [...prev.members, localMember],
      }));
    }

    setNewMemberName('');
    setNewMemberVpa('');
    setNewMemberTags([]);
    onNotify(`Added ${localMember.displayName} to group.`);
  };

  const handleGenerateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isCloudSynced) {
      onNotify('Open Share & Publish to save this local draft to cloud before inviting co-editors.');
      return;
    }
    setInviteBusy(true);
    try {
      const res = await createTripInvite(workspace.trip.id, {
        role: inviteRole,
        email: inviteEmail.trim() || undefined,
      });
      const origin =
        typeof window !== 'undefined'
          ? window.location.origin
          : 'https://itinbee.com';
      const link = res.token
        ? `${origin}/invite/${encodeURIComponent(res.token)}`
        : res.inviteUrl || `${origin}/t/${workspace.trip.shortId}`;
      setInviteUrl(link);
      setInviteEmail('');
      onNotify(`Created ${inviteRole} invite link.`);
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Could not generate invite link.'
      );
    } finally {
      setInviteBusy(false);
    }
  };

  const handleCopyInvite = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2200);
  };

  const handleCreatePoll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pollQuestion.trim() || !pollOptA.trim() || !pollOptB.trim()) return;

    const optionLabels = [pollOptA.trim(), pollOptB.trim(), pollOptC.trim()].filter(
      Boolean
    );

    if (isCloudSynced) {
      try {
        const savedPoll = await createCloudPoll(workspace.trip.id, {
          question: pollQuestion.trim(),
          options: optionLabels.map((label) => ({ label })),
        });
        onUpdateWorkspace((prev) => ({
          ...prev,
          polls: [savedPoll, ...prev.polls.filter((p) => p.id !== savedPoll.id)],
        }));
        setPollQuestion('');
        setPollOptA('');
        setPollOptB('');
        setPollOptC('');
        onNotify('Published live group poll.');
        return;
      } catch {
        // Offline fallback below
      }
    }

    const created: PollView = {
      id: crypto.randomUUID(),
      tripId: workspace.trip.id,
      question: pollQuestion.trim(),
      options: optionLabels.map((label) => ({
        id: crypto.randomUUID(),
        label,
        voteCount: 0,
        voterNames: [],
      })),
      closesAt: null,
      totalVotes: 0,
      createdAt: new Date().toISOString(),
    };

    onUpdateWorkspace((prev) => ({
      ...prev,
      polls: [created, ...prev.polls],
    }));
    setPollQuestion('');
    setPollOptA('');
    setPollOptB('');
    setPollOptC('');
    onNotify('Created group poll.');
  };

  const handleVote = async (pollId: string, optionId: string) => {
    const display = voterName.trim() || 'Guest';
    try {
      const updated = await castGuestPollVote({
        shortId: workspace.trip.shortId,
        pollId,
        optionId,
        guestDisplayName: display,
        turnstileToken: turnstileToken || undefined,
      });
      onUpdateWorkspace((prev) => ({
        ...prev,
        polls: prev.polls.map((p) => (p.id === pollId ? updated : p)),
      }));
    } catch {
      // Optimistic local vote fallback
      onUpdateWorkspace((prev) => ({
        ...prev,
        polls: prev.polls.map((p) => {
          if (p.id !== pollId) return p;
          const opts = p.options.map((o) => {
            const cleaned = o.voterNames.filter((n) => n !== display);
            if (o.id === optionId) {
              return {
                ...o,
                voterNames: [...cleaned, display],
                voteCount: cleaned.length + 1,
              };
            }
            return { ...o, voterNames: cleaned, voteCount: cleaned.length };
          });
          return {
            ...p,
            options: opts,
            totalVotes: opts.reduce((acc, o) => acc + o.voteCount, 0),
          };
        }),
      }));
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="display text-[28px] leading-none text-navy">
          Group Members &amp; Live Polls
        </h2>

        <button
          type="button"
          onClick={handleToggleElderMode}
          aria-pressed={workspace.trip.elderModeEnabled}
          className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-full border px-3.5 py-1 text-[13px] font-bold transition-colors ${
            workspace.trip.elderModeEnabled
              ? 'border-2 border-navy bg-saffron text-navy'
              : 'border-navy/30 bg-[#FFFDF8] text-navy hover:bg-paper'
          }`}
        >
          {workspace.trip.elderModeEnabled && (
            <Check className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
          )}
          <span>Elder comfort pacing (max 4 stops/day)</span>
        </button>
      </div>

      {/* Invite Co-Editor Section */}
      <section className="space-y-3 rounded-xl border border-navy/20 bg-[#FFFDF8] p-4 shadow-panel sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="inline-flex items-center gap-2 text-[17px] font-bold text-navy">
            <Link2 className="h-4 w-4 text-trunk" strokeWidth={1.9} aria-hidden="true" />
            <span>Invite Co-Editor</span>
          </h3>
          <span className="text-[12.5px] text-paper-ink">
            Real-time timeline, budget &amp; poll collaboration
          </span>
        </div>

        <form
          onSubmit={handleGenerateInvite}
          className="flex flex-wrap items-center gap-2.5"
        >
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as 'editor' | 'viewer')}
            aria-label="Invite permission role"
            className="min-h-[42px] rounded-lg border-2 border-navy/60 bg-[#FFFDF8] px-3 text-[14px] font-semibold text-navy"
          >
            <option value="editor">Co-Editor (can edit plan &amp; expenses)</option>
            <option value="viewer">Viewer (read-only)</option>
          </select>

          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="Optional email (e.g. friend@example.com)"
            aria-label="Optional recipient email"
            className="field min-w-[200px] flex-1 text-[14px]"
          />

          <button
            type="submit"
            disabled={inviteBusy}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border-2 border-navy bg-trunk px-4 py-1.5 text-[13.5px] font-bold text-[#FFFDF8] hover:bg-trunk-deep disabled:opacity-45"
          >
            <UserPlus className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />
            <span>{inviteBusy ? 'Creating…' : 'Create invite link'}</span>
          </button>
        </form>

        {inviteUrl && (
          <div className="space-y-2 border-t border-navy/15 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="coeditor-invite-link" className="sr-only">
                Co-editor invite link
              </label>
              <input
                id="coeditor-invite-link"
                type="text"
                readOnly
                value={inviteUrl}
                className="field min-w-[220px] flex-1 font-mono text-[12.5px]"
              />
              <button
                type="button"
                onClick={() => void handleCopyInvite()}
                className="btn-stamp min-h-[42px] px-4 py-1.5 text-[13.5px]"
              >
                {copiedInvite ? (
                  <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                )}
                <span>{copiedInvite ? 'Copied' : 'Copy Invite Link'}</span>
              </button>
            </div>
            <div role="status" aria-live="polite" className="min-h-[18px] text-[12.5px] font-semibold text-jade">
              {copiedInvite ? 'Invite link copied to clipboard — share on WhatsApp or email.' : ''}
            </div>
          </div>
        )}
      </section>

      {/* Group Members & Dietary Tags */}
      <section className="space-y-3">
        <h3 className="inline-flex items-center gap-2 text-[17px] font-bold text-navy">
          <Users className="h-4 w-4 text-trunk" strokeWidth={1.8} aria-hidden="true" />
          <span>Travellers &amp; Dietary Preferences ({workspace.members.length})</span>
        </h3>

        <ul className="divide-y divide-navy/15 rounded-xl border border-navy/20 bg-[#FFFDF8] shadow-panel">
          {workspace.members.map((member) => (
            <li
              key={member.userId}
              className="flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-bold text-navy">
                    {member.displayName}
                  </span>
                  <span className="rounded-full bg-paper px-2 py-0.5 text-[11px] font-semibold capitalize text-navy">
                    {member.role}
                  </span>
                  {member.upiVpa && (
                    <span className="rounded bg-jade-wash px-2 py-0.5 font-mono text-[11px] font-semibold text-jade">
                      {member.upiVpa}
                    </span>
                  )}
                </div>
                <p className="text-[12.5px] text-paper-ink">
                  Used for fair UPI expense splits (veg vs non-veg, alcohol exclusions)
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {DIETARY_TAG_OPTIONS.map((tag) => {
                  const active = member.dietaryTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleToggleMemberTag(member.userId, tag)}
                      aria-pressed={active}
                      className={`inline-flex min-h-[32px] items-center gap-1 rounded-full border px-2.5 py-0.5 text-[12px] font-semibold transition-colors ${
                        active
                          ? 'border-jade bg-jade-wash text-jade'
                          : 'border-navy/25 bg-[#FFFDF8] text-paper-ink hover:bg-paper hover:text-navy'
                      }`}
                    >
                      {active && (
                        <Check className="h-3 w-3" strokeWidth={2.2} aria-hidden="true" />
                      )}
                      <span>{formatDietaryTag(tag)}</span>
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>

        {/* Add Member Form */}
        <form
          onSubmit={handleAddMember}
          className="flex flex-wrap items-center gap-2.5 rounded-xl border border-navy/20 bg-[#FFFDF8] p-4 shadow-panel"
        >
          <UserPlus
            className="h-4 w-4 shrink-0 text-paper-ink"
            strokeWidth={1.8}
            aria-hidden="true"
          />
          <input
            type="text"
            value={newMemberName}
            onChange={(e) => setNewMemberName(e.target.value)}
            placeholder="Co-traveller name (e.g. Vikram, Dadi)"
            aria-label="New co-traveller name"
            className="field min-w-[170px] flex-1 text-[14px]"
          />
          <input
            type="text"
            spellCheck={false}
            autoCapitalize="none"
            value={newMemberVpa}
            onChange={(e) => setNewMemberVpa(e.target.value)}
            placeholder="Optional UPI ID (name@okaxis)"
            aria-label="Optional co-traveller UPI ID"
            className="field w-52 font-mono text-[13.5px]"
          />

          <div className="flex flex-wrap items-center gap-1.5">
            {(['vegetarian', 'non-drinker'] as const).map((tag) => {
              const checked = newMemberTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() =>
                    setNewMemberTags((prev) =>
                      prev.includes(tag)
                        ? prev.filter((t) => t !== tag)
                        : [...prev, tag]
                    )
                  }
                  aria-pressed={checked}
                  className={`inline-flex min-h-[36px] items-center rounded-full border px-3 py-1 text-[12.5px] font-semibold ${
                    checked
                      ? 'border-navy bg-paper text-navy'
                      : 'border-navy/25 bg-[#FFFDF8] text-paper-ink'
                  }`}
                >
                  {formatDietaryTag(tag)}
                </button>
              );
            })}
          </div>

          <button
            type="submit"
            disabled={!newMemberName.trim()}
            className="inline-flex min-h-[42px] items-center gap-1 rounded-lg border-2 border-navy bg-navy px-4 py-1.5 text-[13.5px] font-bold text-[#FFFDF8] disabled:opacity-45"
          >
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            <span>Add traveller</span>
          </button>
        </form>
      </section>

      {/* Zero-OTP Group Polls */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="inline-flex items-center gap-2 text-[17px] font-bold text-navy">
            <Vote className="h-4 w-4 text-trunk" strokeWidth={1.8} aria-hidden="true" />
            <span>Zero-OTP Group Polls ({workspace.polls.length})</span>
          </h3>

          <label className="inline-flex items-center gap-2 text-[13px] font-semibold text-navy">
            <span>Voting as:</span>
            <input
              type="text"
              value={voterName}
              onChange={(e) => setVoterName(e.target.value)}
              className="min-h-[36px] w-32 rounded-lg border border-navy/35 bg-[#FFFDF8] px-2.5 py-1 text-[13px] text-navy"
            />
          </label>
        </div>

        <TurnstileWidget onToken={setTurnstileToken} />

        <div className="space-y-3">
          {workspace.polls.map((poll) => (
            <div
              key={poll.id}
              className="rounded-xl border border-navy/20 bg-[#FFFDF8] p-4 shadow-panel"
            >
              <div className="flex items-baseline justify-between gap-2 pb-3">
                <h4 className="text-[15.5px] font-bold text-navy">{poll.question}</h4>
                <span className="font-mono text-[12px] tabular-nums text-paper-ink">
                  {poll.totalVotes} {poll.totalVotes === 1 ? 'vote' : 'votes'}
                </span>
              </div>

              <div className="divide-y divide-navy/10 border-t border-navy/15">
                {poll.options.map((opt) => {
                  const pct =
                    poll.totalVotes > 0
                      ? Math.round((opt.voteCount / poll.totalVotes) * 100)
                      : 0;
                  const votedByMe = opt.voterNames.includes(voterName.trim());

                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => void handleVote(poll.id, opt.id)}
                      className="flex w-full items-center justify-between gap-3 whitespace-normal py-3 text-left transition-colors hover:bg-paper/45"
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[14px] font-bold text-navy">
                            {opt.label}
                          </span>
                          {votedByMe && (
                            <span className="rounded-full bg-saffron/45 px-2 py-0.5 text-[11px] font-bold text-navy">
                              Your vote
                            </span>
                          )}
                        </div>
                        {opt.subtitle && (
                          <div className="text-[12.5px] text-paper-ink">
                            {opt.subtitle}
                          </div>
                        )}
                        {opt.voterNames.length > 0 && (
                          <div className="mt-0.5 text-[12px] text-paper-ink">
                            Voted: {opt.voterNames.join(', ')}
                          </div>
                        )}
                      </div>

                      <span className="shrink-0 font-mono text-[13px] font-bold tabular-nums text-navy">
                        {opt.voteCount} ({pct}%)
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Create Poll Form */}
        <form
          onSubmit={handleCreatePoll}
          className="space-y-3 rounded-xl border border-navy/20 bg-[#FFFDF8] p-4 shadow-panel"
        >
          <input
            type="text"
            value={pollQuestion}
            onChange={(e) => setPollQuestion(e.target.value)}
            placeholder="Ask the group (e.g. Stay in Agonda or Palolem?)"
            aria-label="Poll question"
            className="field text-[14px]"
          />
          <div className="grid gap-2 sm:grid-cols-3">
            <input
              type="text"
              value={pollOptA}
              onChange={(e) => setPollOptA(e.target.value)}
              placeholder="Option 1"
              aria-label="Poll option 1"
              className="field text-[14px]"
            />
            <input
              type="text"
              value={pollOptB}
              onChange={(e) => setPollOptB(e.target.value)}
              placeholder="Option 2"
              aria-label="Poll option 2"
              className="field text-[14px]"
            />
            <input
              type="text"
              value={pollOptC}
              onChange={(e) => setPollOptC(e.target.value)}
              placeholder="Option 3 (optional)"
              aria-label="Poll option 3"
              className="field text-[14px]"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!pollQuestion.trim() || !pollOptA.trim() || !pollOptB.trim()}
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border-2 border-navy bg-navy px-4 py-1.5 text-[13.5px] font-bold text-[#FFFDF8] disabled:opacity-45"
            >
              <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              <span>Post poll</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
