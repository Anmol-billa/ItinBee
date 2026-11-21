/**
 * Minimal SSE over fetch-streams: a chunk parser plus a reconnecting runner.
 * fetch (not EventSource) so credentials and Authorization headers work, and so
 * reconnect/skip behaviour is testable without a browser.
 *
 * The server replays the whole event history on every connect (see contract),
 * so after a reconnect the runner skips the messages it already delivered.
 */

export interface SseMessage {
  event: string;
  data: string;
  id?: string;
}

export interface SseParser {
  push(chunk: string): void;
  /** Dispatch any trailing complete-but-unterminated message. */
  flush(): void;
}

/** Parses the text/event-stream wire format. Comment lines (": ping") are ignored. */
export function createSseParser(onMessage: (m: SseMessage) => void): SseParser {
  let buffer = '';
  let event = '';
  let data: string[] = [];
  let id: string | undefined;

  const dispatch = () => {
    if (data.length > 0) {
      onMessage({ event: event || 'message', data: data.join('\n'), id });
    }
    event = '';
    data = [];
    id = undefined;
  };

  const handleLine = (line: string) => {
    if (line === '') return dispatch();
    if (line.startsWith(':')) return;
    const idx = line.indexOf(':');
    const field = idx === -1 ? line : line.slice(0, idx);
    let value = idx === -1 ? '' : line.slice(idx + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
    else if (field === 'id') id = value;
  };

  return {
    push(chunk: string) {
      buffer += chunk;
      let nl: number;
      // Accept \n, \r\n and lone \r as line terminators.
      while ((nl = buffer.search(/\r\n|\n|\r/)) !== -1) {
        const termLen = buffer.startsWith('\r\n', nl) ? 2 : 1;
        // A lone \r at the very end might be the first half of \r\n: wait.
        if (buffer[nl] === '\r' && termLen === 1 && nl === buffer.length - 1) break;
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + termLen);
        handleLine(line);
      }
    },
    flush() {
      if (buffer.length > 0) {
        handleLine(buffer);
        buffer = '';
      }
      dispatch();
    },
  };
}

export type SseRunResult = 'terminal' | 'stopped' | 'exhausted' | 'aborted';

export interface SseRunOptions {
  /** Opens one connection. Must honour `signal`. */
  open: (signal: AbortSignal) => Promise<Response>;
  onMessage: (m: SseMessage) => void;
  /** Called with 'live' on first bytes and 'reconnecting' between attempts. */
  onState?: (s: 'live' | 'reconnecting') => void;
  /** Return true once a message ends the run (done/error/intent...). */
  isTerminal: (m: SseMessage) => boolean;
  signal?: AbortSignal;
  /** Consecutive failed attempts before giving up (caller then polls). Default 4. */
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Abort a connection that produced no bytes (even heartbeats) for this long. Default 30s. */
  stallMs?: number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** 0..1, injectable for tests. */
  random?: () => number;
}

export function backoffDelay(attempt: number, base = 500, max = 8000, rand = 0.5): number {
  const exp = Math.min(max, base * 2 ** Math.max(0, attempt - 1));
  // +-25% jitter
  return Math.round(exp * (0.75 + rand * 0.5));
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true }
    );
  });
}

export async function runSse(opts: SseRunOptions): Promise<SseRunResult> {
  const {
    open,
    onMessage,
    onState,
    isTerminal,
    signal,
    maxRetries = 4,
    baseDelayMs = 500,
    maxDelayMs = 8000,
    stallMs = 30_000,
    sleep = defaultSleep,
    random = Math.random,
  } = opts;

  let delivered = 0; // messages handed to the caller across all connections
  let failures = 0;

  while (true) {
    if (signal?.aborted) return 'aborted';
    const conn = new AbortController();
    const onAbort = () => conn.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    let stall: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      if (stall) clearTimeout(stall);
      stall = setTimeout(() => conn.abort(), stallMs);
    };

    const deliveredAtStart = delivered;
    let seenOnThisConn = 0;
    let gotBytes = false;
    let result: SseRunResult | null = null;

    try {
      arm();
      const res = await open(conn.signal);
      if (!res.ok || !res.body) {
        // 4xx other than 408/429 will not get better by retrying.
        if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
          throw Object.assign(new Error(`stream_http_${res.status}`), { fatal: true });
        }
        throw new Error(`stream_http_${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let stop = false;
      const parser = createSseParser((m) => {
        if (stop) return;
        seenOnThisConn += 1;
        if (seenOnThisConn <= delivered) return; // replayed history
        delivered += 1;
        onMessage(m);
        if (isTerminal(m)) {
          stop = true;
          result = 'terminal';
        }
      });
      while (!stop) {
        const { done, value } = await reader.read();
        if (done) break;
        arm();
        if (!gotBytes) {
          gotBytes = true;
          onState?.('live');
        }
        parser.push(decoder.decode(value, { stream: true }));
      }
      if (!stop) parser.flush();
      if (stop) {
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      if (signal?.aborted) result = 'aborted';
      else if ((err as { fatal?: boolean }).fatal) {
        result = 'exhausted';
      }
    } finally {
      if (stall) clearTimeout(stall);
      signal?.removeEventListener('abort', onAbort);
      conn.abort();
    }

    if (result) return result;
    // Connection ended without a terminal message: reconnect with backoff.
    failures = delivered > deliveredAtStart ? 0 : failures + 1;
    if (failures > maxRetries) return 'exhausted';
    onState?.('reconnecting');
    await sleep(backoffDelay(Math.max(1, failures), baseDelayMs, maxDelayMs, random()), signal);
  }
}
