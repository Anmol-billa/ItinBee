import Dexie, { type EntityTable } from 'dexie';
import type { CurrencyCode, TripWorkspace, UpiSettlementInstruction } from '@/lib/types';

export interface LocalSandboxRecord {
  key: string;
  workspace: TripWorkspace;
  updatedAt: string;
}

export interface PendingSyncOp {
  clientOpId: string;
  tripId: string;
  hlcTimestamp: string;
  baseSeq: number;
  entityType: 'trip_day' | 'itinerary_item';
  entityId: string;
  action: 'upsert' | 'delete';
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface EncryptedOfflineTicket {
  id: string;
  tripId: string;
  fileName: string;
  ivBase64: string;
  saltBase64: string;
  ciphertextBase64: string;
  byteLength: number;
  savedAt: string;
}

class ItinbeeLocalDb extends Dexie {
  sandboxes!: EntityTable<LocalSandboxRecord, 'key'>;
  outbox!: EntityTable<PendingSyncOp, 'clientOpId'>;
  encryptedVault!: EntityTable<EncryptedOfflineTicket, 'id'>;

  constructor() {
    super('itinbee_pwa_v1');
    this.version(1).stores({
      sandboxes: 'key, updatedAt',
      outbox: 'clientOpId, tripId, createdAt',
      encryptedVault: 'id, tripId, savedAt',
    });
  }
}

export const localDb = typeof window !== 'undefined' ? new ItinbeeLocalDb() : null;

let hlcCounter = 0;
export function nextClientHlc(): string {
  hlcCounter = (hlcCounter + 1) % 9999;
  return `${new Date().toISOString()}-${String(hlcCounter).padStart(4, '0')}-web`;
}

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export function midpointSortKey(prev: string | null, next: string | null): string {
  if (!prev && !next) return 'a0';
  if (!prev && next) {
    const firstCode = ALPHABET.indexOf(next[0] ?? 'a');
    if (firstCode > 1) return ALPHABET[Math.floor(firstCode / 2)] + '0';
    return '0' + next;
  }
  if (prev && !next) {
    const lastChar = prev[prev.length - 1] ?? '0';
    const idx = ALPHABET.indexOf(lastChar);
    if (idx >= 0 && idx < ALPHABET.length - 2) {
      return prev.slice(0, -1) + ALPHABET[idx + 1];
    }
    return prev + 'V';
  }
  return `${prev}M`;
}

export async function saveLocalWorkspace(key: string, workspace: TripWorkspace): Promise<void> {
  if (!localDb) return;
  await localDb.sandboxes.put({
    key,
    workspace,
    updatedAt: new Date().toISOString(),
  });
}

export async function loadLocalWorkspace(key: string): Promise<TripWorkspace | null> {
  if (!localDb) return null;
  const row = await localDb.sandboxes.get(key);
  return row?.workspace ?? null;
}

/**
 * Wraps a ticket document in WebCrypto AES-GCM (256-bit) using PBKDF2-derived key
 * so raw unencrypted ticket bytes are never persisted in browser IndexedDB.
 */
export async function encryptAndCacheTicketOffline(params: {
  tripId: string;
  fileName: string;
  plainBytes: Uint8Array;
  passphrase: string;
}): Promise<EncryptedOfflineTicket> {
  if (params.plainBytes.byteLength > 10 * 1024 * 1024) {
    throw new Error('Files over 10 MB must be compressed before offline vault caching.');
  }
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(params.passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    params.plainBytes as BufferSource
  );
  const toB64 = (u8: Uint8Array) => btoa(String.fromCharCode(...u8));
  const record: EncryptedOfflineTicket = {
    id: crypto.randomUUID(),
    tripId: params.tripId,
    fileName: params.fileName,
    ivBase64: toB64(iv),
    saltBase64: toB64(salt),
    ciphertextBase64: toB64(new Uint8Array(cipherBuf)),
    byteLength: params.plainBytes.byteLength,
    savedAt: new Date().toISOString(),
  };
  if (localDb) {
    await localDb.encryptedVault.put(record);
  }
  return record;
}

export const REFERENCE_FX_TO_INR: Record<CurrencyCode, number> = {
  INR: 1,
  THB: 2.52,
  VND: 0.0034,
  AED: 23.15,
  JPY: 0.56,
  EUR: 91.4,
  USD: 85.1,
};

/**
 * Pure client-side min-cash-flow & NPCI <= ₹2,000 vs > ₹2,000 settlement builder
 * so zero-signup local sandboxes compute identical settlements offline.
 */
export function computeLocalSettlements(
  workspace: TripWorkspace
): UpiSettlementInstruction[] {
  const balances: Record<string, number> = {};
  for (const m of workspace.members) balances[m.userId] = 0;

  for (const exp of workspace.expenses) {
    if (exp.kittyPoolId) continue;
    balances[exp.paidBy] = (balances[exp.paidBy] ?? 0) + exp.inrEquivalentMinor;
    for (const [uid, share] of Object.entries(exp.splitsInrMinor)) {
      balances[uid] = (balances[uid] ?? 0) - share;
    }
  }

  const debtors: Array<{ uid: string; amt: number }> = [];
  const creditors: Array<{ uid: string; amt: number }> = [];
  for (const [uid, net] of Object.entries(balances)) {
    if (net < -1) debtors.push({ uid, amt: -net });
    else if (net > 1) creditors.push({ uid, amt: net });
  }
  debtors.sort((a, b) => b.amt - a.amt);
  creditors.sort((a, b) => b.amt - a.amt);

  const nameOf = (uid: string) =>
    workspace.members.find((m) => m.userId === uid)?.displayName ?? 'Member';
  const vpaOf = (uid: string) =>
    `${nameOf(uid).toLowerCase().replace(/[^a-z0-9]/g, '')}@okicici`;

  const out: UpiSettlementInstruction[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i]!;
    const c = creditors[j]!;
    const settleMinor = Math.min(d.amt, c.amt);
    if (settleMinor > 0) {
      const rupees = (settleMinor / 100).toFixed(2);
      const payeeName = nameOf(c.uid);
      const payeeVpa = vpaOf(c.uid);
      const note = `Itinbee ${workspace.trip.shortId}`;
      const qs = new URLSearchParams({
        pa: payeeVpa,
        pn: payeeName,
        am: rupees,
        cu: 'INR',
        tn: note,
      });
      const uri = `upi://pay?${qs.toString()}`;
      const under2k = settleMinor <= 200_000;
      out.push({
        fromUserId: d.uid,
        fromName: nameOf(d.uid),
        toUserId: c.uid,
        toName: payeeName,
        payeeVpa,
        amountInrMinor: settleMinor,
        amountInrFormatted: `₹${Number(rupees).toLocaleString('en-IN', {
          minimumFractionDigits: settleMinor % 100 === 0 ? 0 : 2,
          maximumFractionDigits: 2,
        })}`,
        paymentMode: under2k ? 'UPI_DEEP_LINK' : 'COPY_VPA_FALLBACK',
        upiUri: under2k ? uri : null,
        qrPayload: uri,
        copyText: `${payeeVpa} · ₹${rupees} (${note})`,
        thresholdNote: under2k
          ? 'Direct UPI intent & scannable QR ready (<= ₹2,000).'
          : 'Over ₹2,000 P2P intent cap on iOS/gallery — copy VPA + exact amount or scan QR.',
      });
    }
    d.amt -= settleMinor;
    c.amt -= settleMinor;
    if (d.amt <= 1) i++;
    if (c.amt <= 1) j++;
  }
  return out;
}
