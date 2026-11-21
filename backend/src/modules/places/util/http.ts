export type FetchLike = (
  input: string,
  init?: RequestInit
) => Promise<Response>;

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly url: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export interface HttpClientOptions {
  userAgent: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  retries?: number;
  /** Base delay for exponential backoff (ms). Tests inject a tiny value. */
  backoffMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface RequestOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  retries?: number;
  signal?: AbortSignal;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function parseRetryAfterMs(res: Response): number | null {
  const header = res.headers.get('retry-after');
  if (!header) return null;
  const secs = Number(header);
  if (Number.isFinite(secs)) return Math.min(secs * 1000, 30_000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.min(Math.max(date - Date.now(), 0), 30_000);
}

/**
 * Small typed HTTP client: AbortSignal timeouts, descriptive User-Agent,
 * retries with exponential backoff + jitter on network errors / 429 / 5xx.
 */
export class HttpClient {
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: HttpClientOptions) {
    this.fetchImpl = options.fetchImpl ?? ((i, init) => fetch(i, init));
    this.sleep = options.sleep ?? defaultSleep;
  }

  get userAgent(): string {
    return this.options.userAgent;
  }

  async request(url: string, opts: RequestOptions = {}): Promise<Response> {
    const retries = opts.retries ?? this.options.retries ?? 2;
    const timeoutMs = opts.timeoutMs ?? this.options.timeoutMs ?? 15_000;
    const backoff = this.options.backoffMs ?? 600;
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const signal = opts.signal
        ? AbortSignal.any([opts.signal, timeoutSignal])
        : timeoutSignal;
      try {
        const res = await this.fetchImpl(url, {
          method: opts.method ?? 'GET',
          headers: {
            'User-Agent': this.options.userAgent,
            'Api-User-Agent': this.options.userAgent,
            Accept: 'application/json',
            ...opts.headers,
          },
          body: opts.body,
          signal,
        });
        if (res.ok) return res;
        if (!isRetryableStatus(res.status) || attempt === retries) {
          throw new HttpError(
            `HTTP ${res.status} from ${new URL(url).host}`,
            res.status,
            url
          );
        }
        const wait =
          parseRetryAfterMs(res) ?? backoff * 2 ** attempt * (0.75 + Math.random() * 0.5);
        lastError = new HttpError(`HTTP ${res.status}`, res.status, url);
        await this.sleep(wait);
      } catch (err) {
        if (err instanceof HttpError && !isRetryableStatus(err.status)) throw err;
        if (opts.signal?.aborted) throw err;
        lastError = err;
        if (attempt === retries) break;
        await this.sleep(backoff * 2 ** attempt * (0.75 + Math.random() * 0.5));
      }
    }
    if (lastError instanceof Error) throw lastError;
    throw new Error(`Request to ${url} failed`);
  }

  async getJson<T>(url: string, opts: RequestOptions = {}): Promise<T> {
    const res = await this.request(url, opts);
    return (await res.json()) as T;
  }

  async postJson<T>(
    url: string,
    body: unknown,
    opts: Omit<RequestOptions, 'method' | 'body'> = {}
  ): Promise<T> {
    const res = await this.request(url, {
      ...opts,
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', ...opts.headers },
    });
    return (await res.json()) as T;
  }
}

/** Runs `fn` over items with bounded concurrency, preserving order. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        results[i] = await fn(items[i] as T, i);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
