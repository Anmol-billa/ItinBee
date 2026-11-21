'use client';

import React, { useState } from 'react';
import { Check, Plus, UserPlus, Users, Vote } from 'lucide-react';
import { castGuestPollVote } from '@/lib/api-client';
import type { PollView, TripMember, TripWorkspace } from '@/lib/types';

interface GroupTabProps {
  workspace: TripWorkspace;
  onUpdateWorkspace: (updater: (prev: TripWorkspace) => TripWorkspace) => void;
  onNotify: (msg: string) => void;
}

const DIETARY_TAG_OPTIONS = ['vegetarian', 'jain', 'non-drinker', 'vegan'] as const;

export function GroupTab({
  workspace,
  onUpdateWorkspace,
  onNotify,
}: GroupTabProps) {
  // Member form
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberTags, setNewMemberTags] = useState<string[]>([]);

  // Poll form & voting
  const [voterName, setVoterName] = useState(
    workspace.members[0]?.displayName ?? 'Traveller'
  );
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptA, setPollOptA] = useState('');
  const [pollOptB, setPollOptB] = useState('');
  const [pollOptC, setPollOptC] = useState('');

  const handleToggleMemberTag = (userId: string, tag: string) => {
    onUpdateWorkspace((prev) => ({
      ...prev,
      members: prev.members.map((m) => {
        if (m.userId !== userId) return m;
        const has = m.dietaryTags.includes(tag);
        return {
          ...m,
          dietaryTags: has
            ? m.dietaryTags.filter((t) => t !== tag)
            : [...m.dietaryTags, tag],
        };
      }),
    }));
  };

  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim()) return;
    const added: TripMember = {
      userId: crypto.randomUUID(),
      displayName: newMemberName.trim(),
      role: 'contributor',
      vaultAccess: false,
      dietaryTags: newMemberTags,
      joinedAt: new Date().toISOString(),
    };
    onUpdateWorkspace((prev) => ({
      ...prev,
      members: [...prev.members, added],
    }));
    setNewMemberName('');
    setNewMemberTags([]);
    onNotify(`Added ${added.displayName} to group.`);
  };

  const handleCreatePoll = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pollQuestion.trim() || !pollOptA.trim() || !pollOptB.trim()) return;

    const options = [pollOptA.trim(), pollOptB.trim(), pollOptC.trim()]
      .filter(Boolean)
      .map((label) => ({
        id: crypto.randomUUID(),
        label,
        voteCount: 0,
        voterNames: [],
      }));

    const created: PollView = {
      id: crypto.randomUUID(),
      tripId: workspace.trip.id,
      question: pollQuestion.trim(),
      options,
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
          onClick={() =>
            onUpdateWorkspace((prev) => ({
              ...prev,
              trip: {
                ...prev.trip,
                elderModeEnabled: !prev.trip.elderModeEnabled,
              },
            }))
          }
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
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-bold text-navy">
                    {member.displayName}
                  </span>
                  <span className="rounded-full bg-paper px-2 py-0.5 text-[11px] font-semibold capitalize text-navy">
                    {member.role}
                  </span>
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
                      <span>{tag}</span>
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
            className="field min-w-[180px] flex-1 text-[14px]"
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
                  {tag}
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
