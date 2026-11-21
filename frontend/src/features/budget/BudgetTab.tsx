'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, IndianRupee, Plus, QrCode, Save, Trash2 } from 'lucide-react';
import { ModalDialog } from '@/components/ui/ModalDialog';
import {
  createCloudExpense,
  createCloudKittyPool,
  deleteCloudExpense,
  fetchCloudSettlements,
  updateCloudTripMember,
} from '@/lib/api-client';
import { formatDietaryTag } from '@/lib/formatters';
import {
  computeLocalSettlements,
  REFERENCE_FX_TO_INR,
} from '@/lib/offline-db';
import type {
  CurrencyCode,
  ExpenseView,
  KittyPoolView,
  SplitMode,
  TripWorkspace,
  UpiSettlementInstruction,
} from '@/lib/types';

interface BudgetTabProps {
  workspace: TripWorkspace;
  isCloudSynced?: boolean;
  onUpdateWorkspace: (updater: (prev: TripWorkspace) => TripWorkspace) => void;
  onNotify: (msg: string) => void;
}

const CURRENCIES: CurrencyCode[] = ['INR', 'THB', 'VND', 'AED', 'JPY', 'EUR', 'USD'];
const UPI_VPA_RE = /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z0-9]{2,32}$/;

export function BudgetTab({
  workspace,
  isCloudSynced = false,
  onUpdateWorkspace,
  onNotify,
}: BudgetTabProps) {
  const [expTitle, setExpTitle] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expCurrency, setExpCurrency] = useState<CurrencyCode>(
    workspace.trip.homeCurrency || 'INR'
  );
  const [expPaidBy, setExpPaidBy] = useState<string>(
    workspace.members[0]?.userId ?? ''
  );
  const [expSplitMode, setExpSplitMode] = useState<SplitMode>('equal');
  const [expExcludeTag, setExpExcludeTag] = useState<string>('vegetarian');
  const [submittingExp, setSubmittingExp] = useState(false);

  // Kitty creation state
  const [kittyTitle, setKittyTitle] = useState('');
  const [kittyPerMemberInr, setKittyPerMemberInr] = useState('2500');
  const [showKittyForm, setShowKittyForm] = useState(false);

  // Cloud settlements + inline VPA configuration
  const [cloudSettlements, setCloudSettlements] = useState<
    UpiSettlementInstruction[] | null
  >(null);
  const [vpaDraftByUser, setVpaDraftByUser] = useState<Record<string, string>>({});
  const [vpaErrorByUser, setVpaErrorByUser] = useState<Record<string, string>>({});
  const [savingVpaUserId, setSavingVpaUserId] = useState<string | null>(null);

  // Active settlement QR modal
  const [activeSettlement, setActiveSettlement] =
    useState<UpiSettlementInstruction | null>(null);
  const [settlementQrUrl, setSettlementQrUrl] = useState<string | null>(null);
  const [copiedUpi, setCopiedUpi] = useState(false);

  const refreshSettlements = useCallback(async () => {
    if (!isCloudSynced) {
      setCloudSettlements(null);
      return;
    }
    try {
      const res = await fetchCloudSettlements(workspace.trip.id);
      setCloudSettlements(res.settlements);
    } catch {
      // Offline fallback uses computeLocalSettlements
      setCloudSettlements(null);
    }
  }, [isCloudSynced, workspace.trip.id]);

  useEffect(() => {
    void refreshSettlements();
  }, [
    refreshSettlements,
    workspace.expenses.length,
    workspace.kittyPools.length,
    workspace.members,
  ]);

  const localSettlements = useMemo(
    () => computeLocalSettlements(workspace),
    [workspace]
  );

  const settlements = cloudSettlements ?? localSettlements;

  // Keep open modal synced with updated settlement (e.g. right after saving a payee's VPA!)
  useEffect(() => {
    if (!activeSettlement) return;
    const updated = settlements.find(
      (s) =>
        s.fromUserId === activeSettlement.fromUserId &&
        s.toUserId === activeSettlement.toUserId
    );
    if (updated && updated.payeeVpa !== activeSettlement.payeeVpa) {
      setActiveSettlement(updated);
    }
  }, [settlements, activeSettlement]);

  useEffect(() => {
    if (!activeSettlement?.payeeVpa || !activeSettlement?.qrPayload) {
      setSettlementQrUrl(null);
      return;
    }
    QRCode.toDataURL(activeSettlement.qrPayload, {
      margin: 1,
      width: 184,
      color: { dark: '#14213D', light: '#FFFFFF' },
    })
      .then(setSettlementQrUrl)
      .catch(() => setSettlementQrUrl(null));
  }, [activeSettlement]);

  const totalSpentInrMinor = useMemo(
    () =>
      workspace.expenses.reduce(
        (acc, exp) =>
          acc +
          (exp.entryType === 'charge'
            ? exp.inrEquivalentMinor
            : exp.entryType === 'adjustment'
              ? exp.inrEquivalentMinor
              : 0),
        0
      ),
    [workspace.expenses]
  );

  const handleSaveMemberVpa = async (toUserId: string, toName: string) => {
    const candidate = (vpaDraftByUser[toUserId] ?? '').trim().toLowerCase();
    if (!UPI_VPA_RE.test(candidate)) {
      setVpaErrorByUser((prev) => ({
        ...prev,
        [toUserId]: 'Enter a valid UPI ID (e.g. name@okaxis)',
      }));
      return;
    }
    setVpaErrorByUser((prev) => {
      const next = { ...prev };
      delete next[toUserId];
      return next;
    });
    setSavingVpaUserId(toUserId);

    onUpdateWorkspace((prev) => ({
      ...prev,
      members: prev.members.map((m) =>
        m.userId === toUserId ? { ...m, upiVpa: candidate, hasUpiVpa: true } : m
      ),
    }));

    if (isCloudSynced) {
      try {
        await updateCloudTripMember(workspace.trip.id, toUserId, {
          upiVpa: candidate,
        });
        await refreshSettlements();
      } catch {
        // Local member VPA update remains active offline
      }
    }
    setSavingVpaUserId(null);
    onNotify(`Saved verified UPI ID ${candidate} for ${toName}.`);
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const numeric = Number(expAmount);
    if (!expTitle.trim() || !Number.isFinite(numeric) || numeric <= 0) return;

    const amountMinor = Math.round(numeric * 100);
    const fxRate = REFERENCE_FX_TO_INR[expCurrency] ?? 1;
    const inrMinor = Math.round(amountMinor * fxRate);

    const eligibleMembers =
      expSplitMode === 'tag_exclude'
        ? workspace.members.filter((m) => !m.dietaryTags.includes(expExcludeTag))
        : workspace.members;
    const targetMembers =
      eligibleMembers.length > 0 ? eligibleMembers : workspace.members;

    if (targetMembers.length === 0) return;

    const perHead = Math.floor(inrMinor / targetMembers.length);
    let remainder = inrMinor - perHead * targetMembers.length;
    const splitsInrMinor: Record<string, number> = {};
    for (const m of targetMembers) {
      const bump = remainder > 0 ? 1 : 0;
      remainder -= bump;
      splitsInrMinor[m.userId] = perHead + bump;
    }

    const clientOpId = crypto.randomUUID();
    const paidBy = expPaidBy || workspace.members[0]!.userId;
    const category = expSplitMode === 'fuel_fastag' ? 'fuel_fastag' : 'dining';
    const excludedTags = expSplitMode === 'tag_exclude' ? [expExcludeTag] : [];

    setSubmittingExp(true);
    try {
      if (isCloudSynced) {
        const savedExp = await createCloudExpense(workspace.trip.id, {
          clientOpId,
          entryType: 'charge',
          title: expTitle.trim(),
          category,
          paidBy,
          amountMinor,
          currency: expCurrency,
          splitMode: expSplitMode,
          excludedTags,
        });
        onUpdateWorkspace((prev) => ({
          ...prev,
          expenses: [
            savedExp,
            ...prev.expenses.filter((x) => x.id !== savedExp.id),
          ],
        }));
        await refreshSettlements();
      } else {
        const localExp: ExpenseView = {
          id: crypto.randomUUID(),
          tripId: workspace.trip.id,
          clientOpId,
          entryType: 'charge',
          reversesExpenseId: null,
          title: expTitle.trim(),
          category,
          paidBy,
          kittyPoolId: null,
          amountMinor,
          currency: expCurrency,
          inrEquivalentMinor: inrMinor,
          fxRate,
          splitMode: expSplitMode,
          excludedTags,
          splitsInrMinor,
          upiTxnRef: null,
          createdAt: new Date().toISOString(),
        };
        onUpdateWorkspace((prev) => ({
          ...prev,
          expenses: [localExp, ...prev.expenses],
        }));
      }
      setExpTitle('');
      setExpAmount('');
      onNotify('Logged expense and recalculated min-cash-flow UPI settlements.');
    } catch {
      // Offline fallback if cloud POST fails
      const fallbackExp: ExpenseView = {
        id: crypto.randomUUID(),
        tripId: workspace.trip.id,
        clientOpId,
        entryType: 'charge',
        reversesExpenseId: null,
        title: expTitle.trim(),
        category,
        paidBy,
        kittyPoolId: null,
        amountMinor,
        currency: expCurrency,
        inrEquivalentMinor: inrMinor,
        fxRate,
        splitMode: expSplitMode,
        excludedTags,
        splitsInrMinor,
        upiTxnRef: null,
        createdAt: new Date().toISOString(),
      };
      onUpdateWorkspace((prev) => ({
        ...prev,
        expenses: [fallbackExp, ...prev.expenses],
      }));
      setExpTitle('');
      setExpAmount('');
      onNotify('Saved expense offline — settlements updated locally.');
    } finally {
      setSubmittingExp(false);
    }
  };

  const handleDeleteExpense = async (exp: ExpenseView) => {
    if (isCloudSynced) {
      try {
        await deleteCloudExpense(workspace.trip.id, exp.id);
      } catch (err) {
        onNotify(err instanceof Error ? err.message : 'Could not delete expense.');
        return;
      }
    }
    onUpdateWorkspace((prev) => ({
      ...prev,
      expenses: prev.expenses.filter((e) => e.id !== exp.id),
    }));
    if (isCloudSynced) {
      await refreshSettlements();
    }
    onNotify(`Removed "${exp.title}" from ledger.`);
  };

  const handleCreateKitty = async (e: React.FormEvent) => {
    e.preventDefault();
    const perMember = Number(kittyPerMemberInr);
    if (!kittyTitle.trim() || !Number.isFinite(perMember) || perMember <= 0) return;
    const perMinor = Math.round(perMember * 100);
    const memberContribs: Record<string, number> = {};
    for (const m of workspace.members) {
      memberContribs[m.userId] = perMinor;
    }
    const custodianId = workspace.members[0]?.userId ?? crypto.randomUUID();
    const totalMinor = perMinor * Math.max(1, workspace.members.length);

    if (isCloudSynced) {
      try {
        const savedPool = await createCloudKittyPool(workspace.trip.id, {
          title: kittyTitle.trim(),
          custodianId,
          currency: 'INR',
          memberContributionsMinor: memberContribs,
        });
        onUpdateWorkspace((prev) => ({
          ...prev,
          kittyPools: [savedPool, ...prev.kittyPools],
        }));
        setKittyTitle('');
        setShowKittyForm(false);
        await refreshSettlements();
        onNotify(`Created shared kitty "${savedPool.title}".`);
        return;
      } catch {
        // Fall through to local kitty pool if offline
      }
    }

    const newPool: KittyPoolView = {
      id: crypto.randomUUID(),
      tripId: workspace.trip.id,
      title: kittyTitle.trim(),
      custodianId,
      currency: 'INR',
      initialContributionMinor: totalMinor,
      memberContributionsMinor: memberContribs,
      spentMinor: 0,
      remainingMinor: totalMinor,
      status: 'open',
      createdAt: new Date().toISOString(),
    };
    onUpdateWorkspace((prev) => ({
      ...prev,
      kittyPools: [newPool, ...prev.kittyPools],
    }));
    setKittyTitle('');
    setShowKittyForm(false);
    onNotify(`Created shared kitty "${newPool.title}".`);
  };

  const copyUpiPayload = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedUpi(true);
    setTimeout(() => setCopiedUpi(false), 2000);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="display text-[28px] leading-none text-navy">
          Budget, Kitty &amp; UPI Split
        </h2>
        <span className="font-mono text-[13px] font-semibold tabular-nums text-navy">
          Total logged: ₹{(totalSpentInrMinor / 100).toLocaleString('en-IN')}
        </span>
      </div>

      {/* Shared Kitty Pools */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[17px] font-bold text-navy">
            Shared Trip Kitty ({workspace.kittyPools.length})
          </h3>
          <button
            type="button"
            onClick={() => setShowKittyForm((v) => !v)}
            className="inline-flex min-h-[34px] items-center gap-1 rounded-full border border-navy/30 bg-[#FFFDF8] px-3 py-1 text-[12.5px] font-semibold text-navy hover:bg-paper"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
            <span>New kitty pool</span>
          </button>
        </div>

        {showKittyForm && (
          <form
            onSubmit={handleCreateKitty}
            className="flex flex-wrap items-center gap-2 rounded-xl border border-navy/20 bg-[#FFFDF8] p-4 shadow-panel"
          >
            <input
              type="text"
              value={kittyTitle}
              onChange={(e) => setKittyTitle(e.target.value)}
              placeholder="Kitty name (e.g. Cab, Toll & Chai Kitty)"
              aria-label="Kitty pool name"
              className="field min-w-[200px] flex-1 text-[14px]"
            />
            <input
              type="number"
              min="100"
              step="100"
              value={kittyPerMemberInr}
              onChange={(e) => setKittyPerMemberInr(e.target.value)}
              placeholder="Per person ₹"
              aria-label="Contribution per member in INR"
              className="field w-36 font-mono text-[14px] tabular-nums"
            />
            <button
              type="submit"
              className="inline-flex min-h-[44px] items-center rounded-lg border-2 border-navy bg-navy px-4 py-2 text-[13.5px] font-bold text-[#FFFDF8]"
            >
              Start kitty
            </button>
          </form>
        )}

        {workspace.kittyPools.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {workspace.kittyPools.map((kp) => (
              <div
                key={kp.id}
                className="rounded-xl border border-navy/20 bg-[#FFFDF8] p-4 shadow-panel"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[15px] font-bold text-navy">{kp.title}</span>
                  <span className="rounded-full bg-jade-wash px-2.5 py-0.5 font-mono text-[11px] font-bold text-jade">
                    {kp.status === 'open' ? 'KITTY OPEN' : 'SETTLED'}
                  </span>
                </div>
                <div className="mt-2 font-mono text-[20px] font-bold tabular-nums text-navy">
                  ₹{(kp.remainingMinor / 100).toLocaleString('en-IN')} remaining
                </div>
                <div className="font-mono text-[12px] tabular-nums text-paper-ink">
                  of ₹{(kp.initialContributionMinor / 100).toLocaleString('en-IN')} pooled
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Log Expense Form */}
      <section className="space-y-3">
        <h3 className="inline-flex items-center gap-1.5 text-[17px] font-bold text-navy">
          <IndianRupee className="h-4 w-4 text-trunk" strokeWidth={1.9} aria-hidden="true" />
          <span>Log Group Expense (Multi-Currency → INR)</span>
        </h3>

        <form
          onSubmit={handleAddExpense}
          className="space-y-3 rounded-xl border border-navy/20 bg-[#FFFDF8] p-4 shadow-panel sm:p-5"
        >
          <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_220px]">
            <input
              type="text"
              value={expTitle}
              onChange={(e) => setExpTitle(e.target.value)}
              placeholder="Expense description (e.g. Seafood shack dinner, FASTag toll)"
              aria-label="Expense description"
              className="field text-[14px]"
            />
            <div className="flex gap-2">
              <select
                value={expCurrency}
                onChange={(e) => setExpCurrency(e.target.value as CurrencyCode)}
                aria-label="Expense currency"
                className="min-h-[44px] rounded-lg border-2 border-navy/60 bg-[#FFFDF8] px-2.5 font-mono text-[14px] font-semibold text-navy"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.01"
                min="1"
                value={expAmount}
                onChange={(e) => setExpAmount(e.target.value)}
                placeholder="Amount"
                aria-label="Expense amount"
                className="field min-w-0 flex-1 font-mono text-[14px] tabular-nums"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={expPaidBy}
              onChange={(e) => setExpPaidBy(e.target.value)}
              aria-label="Paid by member"
              className="min-h-[44px] min-w-[160px] flex-1 rounded-lg border-2 border-navy/60 bg-[#FFFDF8] px-3 text-[14px] font-semibold text-navy"
            >
              {workspace.members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  Paid by {m.displayName}
                </option>
              ))}
            </select>

            <select
              value={
                expSplitMode === 'tag_exclude'
                  ? `exclude:${expExcludeTag}`
                  : expSplitMode
              }
              onChange={(e) => {
                const val = e.target.value;
                if (val.startsWith('exclude:')) {
                  setExpSplitMode('tag_exclude');
                  setExpExcludeTag(val.replace('exclude:', ''));
                } else {
                  setExpSplitMode(val as SplitMode);
                }
              }}
              aria-label="Split mode"
              className="min-h-[44px] min-w-[180px] flex-1 rounded-lg border-2 border-navy/60 bg-[#FFFDF8] px-3 text-[14px] font-semibold text-navy"
            >
              <option value="equal">Equal split</option>
              <option value="exclude:vegetarian">Exclude vegetarians</option>
              <option value="exclude:non-drinker">Exclude non-drinkers</option>
              <option value="fuel_fastag">Car fuel &amp; FASTag</option>
            </select>

            <button
              type="submit"
              disabled={submittingExp || !expTitle.trim() || !expAmount}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border-2 border-navy bg-navy px-4 py-2 text-[14px] font-bold text-[#FFFDF8] transition-colors hover:bg-trunk disabled:opacity-45"
            >
              <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              <span>{submittingExp ? 'Logging…' : 'Log expense'}</span>
            </button>
          </div>
        </form>
      </section>

      {/* Simplified Min-Cash-Flow UPI Settlements */}
      <section className="space-y-3">
        <h3 className="text-[17px] font-bold text-navy">
          Simplified UPI Settlements ({settlements.length})
        </h3>

        {settlements.length === 0 ? (
          <div className="rounded-xl border border-navy/20 bg-[#FFFDF8] p-4 text-[14px] text-paper-ink">
            All group balances are settled.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {settlements.map((s) => {
              const missingVpa = !s.payeeVpa;
              const draftVpa = vpaDraftByUser[s.toUserId] ?? '';
              const vpaErr = vpaErrorByUser[s.toUserId];

              return (
                <div
                  key={`${s.fromUserId}-${s.toUserId}`}
                  className="space-y-3 rounded-xl border border-navy/20 bg-[#FFFDF8] p-4 shadow-panel"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[15px] font-bold text-navy">
                        {s.fromName} → {s.toName}
                      </div>
                      <div className="font-mono text-[12px] tabular-nums text-paper-ink">
                        {missingVpa
                          ? `No UPI ID set for ${s.toName}`
                          : s.paymentMode === 'UPI_DEEP_LINK'
                            ? `Direct upi://pay ready · ${s.payeeVpa}`
                            : `> ₹2,000 QR / copy mode · ${s.payeeVpa}`}
                      </div>
                    </div>

                    {missingVpa ? (
                      <span className="shrink-0 rounded-lg border border-navy/25 bg-paper px-3 py-1.5 font-mono text-[13.5px] font-bold tabular-nums text-navy">
                        {s.amountInrFormatted}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setActiveSettlement(s)}
                        className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg border-2 border-navy bg-vermilion-deep px-3 py-1.5 font-mono text-[13px] font-bold tabular-nums text-[#FFFDF8] transition-colors hover:bg-[#A82E19]"
                      >
                        <QrCode className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden="true" />
                        <span>Settle {s.amountInrFormatted}</span>
                      </button>
                    )}
                  </div>

                  {missingVpa && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void handleSaveMemberVpa(s.toUserId, s.toName);
                      }}
                      className="space-y-1.5 border-t border-navy/10 pt-2.5"
                    >
                      <label
                        htmlFor={`set-vpa-${s.fromUserId}-${s.toUserId}`}
                        className="block text-[12px] font-semibold text-navy"
                      >
                        Set UPI ID for {s.toName}
                      </label>
                      <div className="flex gap-2">
                        <input
                          id={`set-vpa-${s.fromUserId}-${s.toUserId}`}
                          type="text"
                          spellCheck={false}
                          autoCapitalize="none"
                          value={draftVpa}
                          onChange={(e) =>
                            setVpaDraftByUser((prev) => ({
                              ...prev,
                              [s.toUserId]: e.target.value,
                            }))
                          }
                          placeholder="name@okaxis"
                          aria-invalid={vpaErr ? 'true' : 'false'}
                          className="min-h-[38px] min-w-0 flex-1 rounded-lg border border-navy/40 bg-[#FFFDF8] px-2.5 py-1 font-mono text-[13px] text-navy"
                        />
                        <button
                          type="submit"
                          disabled={savingVpaUserId === s.toUserId || !draftVpa.trim()}
                          className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-navy bg-navy px-3 py-1 text-[12.5px] font-bold text-[#FFFDF8] disabled:opacity-45"
                        >
                          <Save className="h-3.5 w-3.5" strokeWidth={1.9} aria-hidden="true" />
                          <span>Save</span>
                        </button>
                      </div>
                      {vpaErr && (
                        <p role="alert" className="text-[12px] font-semibold text-vermilion-deep">
                          {vpaErr}
                        </p>
                      )}
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Ledger Entries */}
      <section className="space-y-3">
        <h3 className="text-[17px] font-bold text-navy">
          Ledger History ({workspace.expenses.length})
        </h3>

        {workspace.expenses.length === 0 ? (
          <p className="text-[14px] text-paper-ink">No expenses logged yet.</p>
        ) : (
          <ul className="divide-y divide-navy/15 rounded-xl border border-navy/20 bg-[#FFFDF8] shadow-panel">
            {workspace.expenses.map((exp) => {
              const payer =
                workspace.members.find((m) => m.userId === exp.paidBy)?.displayName ??
                'Member';
              return (
                <li
                  key={exp.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[14.5px] font-bold text-navy">{exp.title}</div>
                    <div className="text-[12.5px] text-paper-ink">
                      Paid by {payer} · {exp.splitMode.replace('_', ' ')}
                      {exp.excludedTags.length > 0
                        ? ` (excl. ${exp.excludedTags.map(formatDietaryTag).join(', ')})`
                        : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right font-mono tabular-nums">
                      <div className="text-[14.5px] font-bold text-navy">
                        ₹{(exp.inrEquivalentMinor / 100).toLocaleString('en-IN')}
                      </div>
                      {exp.currency !== 'INR' && (
                        <div className="text-[11.5px] text-paper-ink">
                          {(exp.amountMinor / 100).toLocaleString()} {exp.currency}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDeleteExpense(exp)}
                      aria-label={`Delete expense ${exp.title}`}
                      className="icon-hit inline-grid h-8 w-8 place-items-center rounded-md text-vermilion-deep hover:bg-paper"
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Native <dialog> UPI Settlement & QR Modal */}
      <ModalDialog
        open={Boolean(activeSettlement)}
        onClose={() => setActiveSettlement(null)}
        title="Settle Balance via UPI"
      >
        {activeSettlement && (
          <div className="space-y-4 text-[13.5px] text-navy">
            <div className="flex items-baseline justify-between border-b border-navy/15 pb-3">
              <div>
                <div className="text-[15px] font-bold text-navy">
                  {activeSettlement.fromName} → {activeSettlement.toName}
                </div>
                <div className="font-mono text-[12px] text-paper-ink">
                  {activeSettlement.payeeVpa
                    ? `VPA: ${activeSettlement.payeeVpa}`
                    : `No UPI ID configured for ${activeSettlement.toName}`}
                </div>
              </div>
              <span className="font-mono text-[20px] font-bold tabular-nums text-navy">
                {activeSettlement.amountInrFormatted}
              </span>
            </div>

            <p className="text-[12.5px] text-paper-ink">
              {activeSettlement.thresholdNote}
            </p>

            {activeSettlement.payeeVpa && settlementQrUrl && (
              <div className="flex justify-center py-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={settlementQrUrl}
                  alt={`UPI QR code to pay ${activeSettlement.toName}`}
                  width={176}
                  height={176}
                  className="rounded-lg border border-navy/20 bg-white p-2"
                />
              </div>
            )}

            <div className="flex flex-col gap-2">
              {activeSettlement.payeeVpa && activeSettlement.upiUri && (
                <a
                  href={activeSettlement.upiUri}
                  className="btn-stamp w-full text-center text-[14px]"
                >
                  Open UPI App ({activeSettlement.amountInrFormatted})
                </a>
              )}

              <button
                type="button"
                onClick={() => void copyUpiPayload(activeSettlement.copyText)}
                className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg border border-navy/35 bg-[#FFFDF8] px-3 py-2 font-semibold text-navy hover:bg-paper"
              >
                {copiedUpi ? (
                  <Check className="h-4 w-4 text-jade" strokeWidth={2} aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                )}
                <span>
                  {copiedUpi
                    ? 'Copied settlement details'
                    : activeSettlement.payeeVpa
                      ? 'Copy UPI ID + exact amount'
                      : 'Copy exact amount'}
                </span>
              </button>
              {copiedUpi && (
                <p role="status" className="text-center text-[12px] font-semibold text-jade">
                  Copied to clipboard.
                </p>
              )}
            </div>
          </div>
        )}
      </ModalDialog>
    </div>
  );
}
