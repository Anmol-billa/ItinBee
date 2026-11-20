import type {
  ExpenseView,
  KittyPoolView,
  SplitMode,
  UpiSettlementInstruction,
} from '../../types/domain.js';
import { formatInrMinor } from './fx-rates.js';

export const NPCI_UPI_INTENT_LIMIT_MINOR = 200_000; // ₹2,000.00 in paise

export interface LedgerMemberContext {
  userId: string;
  displayName: string;
  dietaryTags: string[];
  upiVpa: string | null;
}

export interface ComputeSplitsInput {
  inrEquivalentMinor: number;
  splitMode: SplitMode;
  members: LedgerMemberContext[];
  participantIds?: string[];
  excludedTags?: string[];
  exactSplitsInrMinor?: Record<string, number>;
  shareWeights?: Record<string, number>;
}

/**
 * Computes exact-paisa splits across members such that `sum(Object.values(splits)) === inrEquivalentMinor`.
 */
export function computeExpenseSplitsInrMinor(
  input: ComputeSplitsInput
): Record<string, number> {
  const {
    inrEquivalentMinor,
    splitMode,
    members,
    participantIds,
    excludedTags = [],
    exactSplitsInrMinor,
    shareWeights,
  } = input;

  if (members.length === 0) {
    throw new Error('Cannot split expense on a trip with zero members');
  }

  const sign = inrEquivalentMinor < 0 ? -1 : 1;
  const absTotal = Math.abs(Math.round(inrEquivalentMinor));

  if (absTotal === 0) {
    return Object.fromEntries(members.map((m) => [m.userId, 0]));
  }

  if (splitMode === 'exact') {
    if (!exactSplitsInrMinor || Object.keys(exactSplitsInrMinor).length === 0) {
      throw new Error('exactSplitsInrMinor is required when splitMode is exact');
    }
    const providedSum = Object.values(exactSplitsInrMinor).reduce(
      (acc, val) => acc + val,
      0
    );
    if (providedSum !== inrEquivalentMinor) {
      throw new Error(
        `Exact splits sum (${providedSum}) must equal inrEquivalentMinor (${inrEquivalentMinor})`
      );
    }
    return { ...exactSplitsInrMinor };
  }

  // Filter eligible members by participantIds and/or excludedTags
  const normalizedExcluded = new Set(
    excludedTags.map((t) => t.trim().toLowerCase()).filter(Boolean)
  );
  const participantSet =
    participantIds && participantIds.length > 0 ? new Set(participantIds) : null;

  const eligibleMembers = members.filter((m) => {
    if (participantSet && !participantSet.has(m.userId)) {
      return false;
    }
    if (splitMode === 'tag_exclude' && normalizedExcluded.size > 0) {
      const hasExcludedTag = m.dietaryTags.some((tag) =>
        normalizedExcluded.has(tag.trim().toLowerCase())
      );
      if (hasExcludedTag) return false;
    }
    return true;
  });

  if (eligibleMembers.length === 0) {
    throw new Error(
      'All trip members were excluded from this split; at least one participant is required'
    );
  }

  // Weighted split (`shares` or `fuel_fastag` with weights)
  if (
    (splitMode === 'shares' || splitMode === 'fuel_fastag') &&
    shareWeights &&
    Object.keys(shareWeights).length > 0
  ) {
    const weights = eligibleMembers
      .map((m) => ({
        userId: m.userId,
        weight: Math.max(0, shareWeights[m.userId] ?? 0),
      }))
      .filter((w) => w.weight > 0);

    const totalWeight = weights.reduce((acc, w) => acc + w.weight, 0);
    if (totalWeight <= 0) {
      throw new Error('Total positive shareWeights must be greater than zero');
    }

    // Hamilton Largest-Remainder method for exact paisa conservation
    const rawQuotas = weights.map((w) => {
      const exact = (absTotal * w.weight) / totalWeight;
      const floor = Math.floor(exact);
      return {
        userId: w.userId,
        floor,
        remainder: exact - floor,
      };
    });

    let allocated = rawQuotas.reduce((acc, q) => acc + q.floor, 0);
    let leftover = absTotal - allocated;

    rawQuotas.sort(
      (a, b) => b.remainder - a.remainder || a.userId.localeCompare(b.userId)
    );
    for (let i = 0; i < leftover; i++) {
      rawQuotas[i % rawQuotas.length]!.floor += 1;
    }

    const result: Record<string, number> = {};
    for (const q of rawQuotas) {
      result[q.userId] = q.floor * sign;
    }
    return result;
  }

  // Equal split across eligible members (`equal`, `tag_exclude`, default `fuel_fastag`)
  const sortedEligible = [...eligibleMembers].sort((a, b) =>
    a.userId.localeCompare(b.userId)
  );
  const count = sortedEligible.length;
  const baseShare = Math.floor(absTotal / count);
  const remainder = absTotal - baseShare * count;

  const result: Record<string, number> = {};
  sortedEligible.forEach((m, idx) => {
    const share = baseShare + (idx < remainder ? 1 : 0);
    result[m.userId] = share * sign;
  });

  return result;
}

/**
 * Computes net INR minor balances (+ve = owed money, -ve = owes money) across
 * upfront Kitty Pools and the immutable append-only expenses ledger, then simplifies
 * debts using min-cash-flow and emits NPCI-compliant UPI settlement instructions.
 */
export function computeSimplifiedSettlements(params: {
  tripShortId: string;
  members: LedgerMemberContext[];
  kittyPools: KittyPoolView[];
  expenses: ExpenseView[];
}): {
  netBalancesInrMinor: Record<string, number>;
  settlements: UpiSettlementInstruction[];
} {
  const { tripShortId, members, kittyPools, expenses } = params;
  const memberMap = new Map<string, LedgerMemberContext>();
  const net: Record<string, number> = {};

  for (const m of members) {
    memberMap.set(m.userId, m);
    net[m.userId] = 0;
  }

  const addBalance = (userId: string, deltaMinor: number) => {
    net[userId] = (net[userId] ?? 0) + deltaMinor;
  };

  // 1. Account for upfront Kitty Pool contributions:
  // Each contributor gets credit (+contribution), and the custodian holding the cash pool
  // assumes liability (-totalContributed) which shrinks as kitty expenses are paid by custodian.
  for (const pool of kittyPools) {
    let totalContributed = 0;
    for (const [uid, contribMinor] of Object.entries(
      pool.memberContributionsMinor
    )) {
      if (contribMinor > 0) {
        addBalance(uid, contribMinor);
        totalContributed += contribMinor;
      }
    }
    if (totalContributed > 0) {
      addBalance(pool.custodianId, -totalContributed);
    }
  }

  // 2. Replay immutable append-only ledger entries (`charge`, `adjustment`, `settlement`)
  for (const exp of expenses) {
    // Payer (or kitty custodian when paid from kitty) receives credit for total paid
    addBalance(exp.paidBy, exp.inrEquivalentMinor);

    // Participants (or settlement recipient) are debited their split amounts
    for (const [uid, splitMinor] of Object.entries(exp.splitsInrMinor)) {
      addBalance(uid, -splitMinor);
    }
  }

  // 3. Min-Cash-Flow Debt Simplification
  const creditors: Array<{ userId: string; amount: number }> = [];
  const debtors: Array<{ userId: string; amount: number }> = [];

  for (const [userId, bal] of Object.entries(net)) {
    const rounded = Math.round(bal);
    net[userId] = rounded;
    if (rounded > 0) {
      creditors.push({ userId, amount: rounded });
    } else if (rounded < 0) {
      debtors.push({ userId, amount: Math.abs(rounded) });
    }
  }

  const transfers: Array<{
    fromUserId: string;
    toUserId: string;
    amountInrMinor: number;
  }> = [];

  while (creditors.length > 0 && debtors.length > 0) {
    creditors.sort(
      (a, b) => b.amount - a.amount || a.userId.localeCompare(b.userId)
    );
    debtors.sort(
      (a, b) => b.amount - a.amount || a.userId.localeCompare(b.userId)
    );

    const maxCreditor = creditors[0]!;
    const maxDebtor = debtors[0]!;
    const settleMinor = Math.min(maxCreditor.amount, maxDebtor.amount);

    if (settleMinor > 0) {
      transfers.push({
        fromUserId: maxDebtor.userId,
        toUserId: maxCreditor.userId,
        amountInrMinor: settleMinor,
      });
    }

    maxCreditor.amount -= settleMinor;
    maxDebtor.amount -= settleMinor;

    if (maxCreditor.amount === 0) creditors.shift();
    if (maxDebtor.amount === 0) debtors.shift();
  }

  // 4. Generate NPCI-aware UPI settlement instructions (`<= ₹2,000` vs `> ₹2,000`)
  const settlements: UpiSettlementInstruction[] = transfers.map((tx) => {
    const fromMember = memberMap.get(tx.fromUserId);
    const toMember = memberMap.get(tx.toUserId);
    const fromName = fromMember?.displayName ?? 'Member';
    const toName = toMember?.displayName ?? 'Member';
    const payeeVpa = toMember?.upiVpa ?? null;

    const amountMajorStr = (tx.amountInrMinor / 100).toFixed(2);
    const amountInrFormatted = formatInrMinor(tx.amountInrMinor);
    const note = `Itinbee ${tripShortId}`;

    const rawUpiString = payeeVpa
      ? `upi://pay?pa=${encodeURIComponent(payeeVpa)}&pn=${encodeURIComponent(toName)}&am=${amountMajorStr}&cu=INR&tn=${encodeURIComponent(note)}`
      : null;

    const withinIntentLimit =
      tx.amountInrMinor <= NPCI_UPI_INTENT_LIMIT_MINOR && Boolean(payeeVpa);

    if (withinIntentLimit && rawUpiString) {
      return {
        fromUserId: tx.fromUserId,
        fromName,
        toUserId: tx.toUserId,
        toName,
        payeeVpa,
        amountInrMinor: tx.amountInrMinor,
        amountInrFormatted,
        paymentMode: 'UPI_DEEP_LINK',
        upiUri: rawUpiString,
        qrPayload: rawUpiString,
        copyText: `UPI ID: ${payeeVpa} | Amount: ₹${amountMajorStr} | Note: ${note}`,
        thresholdNote: 'Within ₹2,000 NPCI P2P intent threshold—1-tap UPI deep link enabled.',
      };
    }

    return {
      fromUserId: tx.fromUserId,
      fromName,
      toUserId: tx.toUserId,
      toName,
      payeeVpa,
      amountInrMinor: tx.amountInrMinor,
      amountInrFormatted,
      paymentMode: 'COPY_VPA_FALLBACK',
      upiUri: null,
      qrPayload: rawUpiString,
      copyText: payeeVpa
        ? `UPI ID: ${payeeVpa} | Amount: ₹${amountMajorStr} | Note: ${note}`
        : `Pay ${toName} | Amount: ₹${amountMajorStr} | Note: ${note}`,
      thresholdNote:
        tx.amountInrMinor > NPCI_UPI_INTENT_LIMIT_MINOR
          ? 'Exceeds ₹2,000 NPCI P2P web/gallery intent limit—use 1-tap Copy UPI ID + Exact Amount or live camera QR scan.'
          : 'Payee UPI VPA not yet linked—copy exact amount and settle manually.',
    };
  });

  return {
    netBalancesInrMinor: net,
    settlements,
  };
}
