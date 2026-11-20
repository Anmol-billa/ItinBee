export interface ParsedHlc {
  wallMs: number;
  logical: number;
  nodeId: string;
}

export function formatHlc(hlc: ParsedHlc): string {
  const wallStr = String(Math.max(0, Math.floor(hlc.wallMs))).padStart(15, '0');
  const logicalStr = Math.max(0, Math.floor(hlc.logical))
    .toString(16)
    .padStart(4, '0');
  return `${wallStr}:${logicalStr}:${hlc.nodeId || 'client'}`;
}

export function parseHlc(raw: string | undefined | null): ParsedHlc {
  if (!raw) {
    return { wallMs: 0, logical: 0, nodeId: '0000' };
  }
  const parts = raw.split(':');
  if (parts.length === 3 && /^\d+$/.test(parts[0]!)) {
    const wallMs = Number.parseInt(parts[0]!, 10);
    const logical = Number.parseInt(parts[1]!, 16) || 0;
    const nodeId = parts[2] || 'client';
    return { wallMs, logical, nodeId };
  }

  // Graceful fallback if client sent an ISO-8601 timestamp or numeric ms string
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) {
    return { wallMs: Math.floor(numeric), logical: 0, nodeId: 'client' };
  }
  const parsedDate = Date.parse(raw);
  if (!Number.isNaN(parsedDate)) {
    return { wallMs: parsedDate, logical: 0, nodeId: 'client' };
  }
  return { wallMs: 0, logical: 0, nodeId: raw.slice(0, 12) || 'client' };
}

export function compareHlc(aRaw: string, bRaw: string): number {
  const a = parseHlc(aRaw);
  const b = parseHlc(bRaw);
  if (a.wallMs !== b.wallMs) {
    return a.wallMs - b.wallMs;
  }
  if (a.logical !== b.logical) {
    return a.logical - b.logical;
  }
  if (a.nodeId < b.nodeId) return -1;
  if (a.nodeId > b.nodeId) return 1;
  return 0;
}

export function advanceServerHlc(
  lastHlcRaw: string,
  clientHlcRaw: string,
  nodeId = 'srv-sg1',
  nowMs = Date.now()
): string {
  const last = parseHlc(lastHlcRaw);
  const remote = parseHlc(clientHlcRaw);
  const maxWall = Math.max(nowMs, last.wallMs, remote.wallMs);

  let logical = 0;
  if (maxWall === last.wallMs && maxWall === remote.wallMs) {
    logical = Math.max(last.logical, remote.logical) + 1;
  } else if (maxWall === last.wallMs) {
    logical = last.logical + 1;
  } else if (maxWall === remote.wallMs) {
    logical = remote.logical + 1;
  }

  return formatHlc({ wallMs: maxWall, logical, nodeId });
}
