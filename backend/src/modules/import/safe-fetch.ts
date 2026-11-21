import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

/**
 * SSRF-safe HTTP(S) fetcher for user-supplied URLs (Smart Import).
 *
 * Defences:
 *  - http/https only, no URL credentials, ports 80/443 only;
 *  - hostname blocklist (localhost, *.local, *.internal, ...);
 *  - EVERY resolved address must be public. The check runs inside the socket `lookup` callback, so the connection
 *    is made to the exact address that was validated (no TOCTOU / DNS-rebinding window), for the first request and
 *    for every redirect hop (redirects are followed manually, max 4);
 *  - IP-literal hosts (including decimal/hex/octal forms, which WHATWG URL normalises) are validated before connecting;
 *  - response size cap (streamed, aborted), total time cap, content-type allow-list, no automatic decompression
 *    (`accept-encoding: identity`).
 */

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfBlockedError';
  }
}

export class FetchLimitError extends Error {
  constructor(
    public readonly code: 'too_large' | 'timeout' | 'bad_content_type' | 'bad_status' | 'too_many_redirects' | 'network',
    message: string
  ) {
    super(message);
    this.name = 'FetchLimitError';
  }
}

const v4Blocked = new net.BlockList();
for (const [net4, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  v4Blocked.addSubnet(net4, prefix, 'ipv4');
}

const v6Blocked = new net.BlockList();
v6Blocked.addAddress('::', 'ipv6');
v6Blocked.addAddress('::1', 'ipv6');
for (const [net6, prefix] of [
  ['::ffff:0:0', 96], // IPv4-mapped: never a legitimate public DNS answer
  ['64:ff9b::', 96], // NAT64
  ['64:ff9b:1::', 48],
  ['100::', 64], // discard
  ['2001::', 32], // Teredo
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link local
  ['fec0::', 10], // site local (deprecated)
  ['ff00::', 8], // multicast
] as const) {
  v6Blocked.addSubnet(net6, prefix, 'ipv6');
}

/** True when `ip` is a globally routable unicast address. */
export function isPublicIp(ip: string): boolean {
  const clean = ip.replace(/^\[|\]$/g, '').split('%')[0] as string;
  const family = net.isIP(clean);
  if (family === 4) return !v4Blocked.check(clean, 'ipv4');
  if (family === 6) return !v6Blocked.check(clean, 'ipv6');
  return false;
}

const BLOCKED_HOSTNAME = /(^|\.)(localhost|local|localdomain|internal|intranet|lan|home|corp|private|test|invalid|example)$/i;
const BLOCKED_EXACT = new Set(['metadata.google.internal', 'metadata', 'instance-data']);

export function hostnameLooksInternal(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (BLOCKED_EXACT.has(h)) return true;
  return BLOCKED_HOSTNAME.test(h) || !h.includes('.');
}

export type AddressPolicy = (ip: string, hostname: string) => boolean;
export type DnsLookupAll = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

const defaultDnsLookup: DnsLookupAll = (hostname) =>
  dns.promises.lookup(hostname, { all: true, verbatim: true });

export interface SafeFetchOptions {
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  allowedContentTypes?: RegExp;
  userAgent?: string;
  /** Test seams. Production uses the defaults (strict public-only policy, system DNS). */
  addressPolicy?: AddressPolicy;
  dnsLookup?: DnsLookupAll;
  /** Hostname pre-check; tests may relax it to reach a local server (default: `!hostnameLooksInternal`). */
  hostnamePolicy?: (hostname: string) => boolean;
  allowedPorts?: number[];
}

export interface SafeFetchResult {
  finalUrl: string;
  status: number;
  contentType: string;
  body: Buffer;
  redirects: string[];
}

const DEFAULTS = {
  maxBytes: 1_500_000,
  timeoutMs: 10_000,
  maxRedirects: 4,
  allowedContentTypes: /^(text\/(html|plain|xml)|application\/(xhtml\+xml|json|xml|ld\+json))(\s*;.*)?$/i,
  userAgent: 'ItinbeeImportBot/1.0 (+https://itinbee.com; trip planning link import)',
};

export class SafeFetcher {
  private readonly opts: Required<
    Pick<SafeFetchOptions, 'maxBytes' | 'timeoutMs' | 'maxRedirects' | 'allowedContentTypes' | 'userAgent'>
  > &
    SafeFetchOptions;

  constructor(options: SafeFetchOptions = {}) {
    this.opts = { ...DEFAULTS, ...options };
  }

  private policy(): AddressPolicy {
    return this.opts.addressPolicy ?? ((ip) => isPublicIp(ip));
  }

  /** Validates scheme/credentials/port/host and returns the parsed URL. Throws SsrfBlockedError. */
  assertUrlAllowed(raw: string): URL {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new SsrfBlockedError('Invalid URL');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new SsrfBlockedError(`Blocked scheme ${url.protocol}`);
    }
    if (url.username || url.password) throw new SsrfBlockedError('URLs with credentials are not allowed');
    const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
    const allowedPorts = this.opts.allowedPorts ?? [80, 443];
    if (!allowedPorts.includes(port)) throw new SsrfBlockedError(`Blocked port ${port}`);
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(host)) {
      if (!this.policy()(host, host)) throw new SsrfBlockedError('Blocked address');
    } else {
      const hostOk = this.opts.hostnamePolicy ?? ((h: string) => !hostnameLooksInternal(h));
      if (!hostOk(host)) throw new SsrfBlockedError('Blocked hostname');
    }
    return url;
  }

  async fetch(rawUrl: string): Promise<SafeFetchResult> {
    const deadline = Date.now() + this.opts.timeoutMs;
    const redirects: string[] = [];
    let current = rawUrl;
    for (let hop = 0; hop <= this.opts.maxRedirects; hop += 1) {
      const url = this.assertUrlAllowed(current);
      const res = await this.requestOnce(url, deadline);
      if (res.status >= 300 && res.status < 400 && res.location) {
        let next: string;
        try {
          next = new URL(res.location, url).toString();
        } catch {
          throw new FetchLimitError('bad_status', 'Invalid redirect target');
        }
        redirects.push(next);
        current = next;
        continue;
      }
      if (res.status < 200 || res.status >= 300) {
        throw new FetchLimitError('bad_status', `HTTP ${res.status}`);
      }
      return { finalUrl: url.toString(), status: res.status, contentType: res.contentType, body: res.body, redirects };
    }
    throw new FetchLimitError('too_many_redirects', 'Too many redirects');
  }

  private requestOnce(
    url: URL,
    deadline: number
  ): Promise<{ status: number; location?: string; contentType: string; body: Buffer }> {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return Promise.reject(new FetchLimitError('timeout', 'Timed out'));
    const policy = this.policy();
    const dnsLookup = this.opts.dnsLookup ?? defaultDnsLookup;
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const isTls = url.protocol === 'https:';

    // The only place a hostname is resolved for the actual connection: validate every answer, connect to it.
    const lookup = (
      host: string,
      options: dns.LookupOptions | number | undefined,
      cb: (err: NodeJS.ErrnoException | null, address?: string | dns.LookupAddress[], family?: number) => void
    ): void => {
      dnsLookup(host)
        .then((answers) => {
          if (answers.length === 0) throw new SsrfBlockedError('Hostname did not resolve');
          for (const a of answers) {
            if (!policy(a.address, host)) throw new SsrfBlockedError('Hostname resolves to a blocked address');
          }
          const wantAll = typeof options === 'object' && options !== null && options.all;
          if (wantAll) cb(null, answers.map((a) => ({ address: a.address, family: a.family })));
          else cb(null, answers[0]!.address, answers[0]!.family);
        })
        .catch((err: unknown) => cb(err as NodeJS.ErrnoException));
    };

    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };
      const requestFn = isTls ? https.request : http.request;
      const req = requestFn(
        {
          protocol: url.protocol,
          hostname,
          port: url.port || (isTls ? 443 : 80),
          path: `${url.pathname}${url.search}`,
          method: 'GET',
          lookup: lookup as net.LookupFunction,
          servername: net.isIP(hostname) ? undefined : hostname,
          headers: {
            host: url.host,
            'user-agent': this.opts.userAgent,
            accept: 'text/html,application/xhtml+xml,text/plain,application/json;q=0.8,*/*;q=0.1',
            'accept-encoding': 'identity',
          },
        },
        (res) => {
          const status = res.statusCode ?? 0;
          const location = typeof res.headers.location === 'string' ? res.headers.location : undefined;
          const contentType = String(res.headers['content-type'] ?? '').trim();
          if (status >= 300 && status < 400) {
            res.resume();
            done(() => resolve({ status, location, contentType, body: Buffer.alloc(0) }));
            return;
          }
          if (status >= 200 && status < 300 && !this.opts.allowedContentTypes.test(contentType)) {
            res.destroy();
            done(() => reject(new FetchLimitError('bad_content_type', `Unsupported content type "${contentType || 'unknown'}"`)));
            return;
          }
          const declared = Number(res.headers['content-length']);
          if (Number.isFinite(declared) && declared > this.opts.maxBytes) {
            res.destroy();
            done(() => reject(new FetchLimitError('too_large', 'Response too large')));
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > this.opts.maxBytes) {
              res.destroy();
              done(() => reject(new FetchLimitError('too_large', 'Response too large')));
              return;
            }
            chunks.push(chunk);
          });
          res.on('end', () => done(() => resolve({ status, location, contentType, body: Buffer.concat(chunks) })));
          res.on('error', (err) => done(() => reject(new FetchLimitError('network', err.message))));
        }
      );
      const timer = setTimeout(() => {
        req.destroy();
        done(() => reject(new FetchLimitError('timeout', 'Timed out')));
      }, remaining);
      req.on('error', (err) => {
        done(() =>
          reject(err instanceof SsrfBlockedError ? err : unwrapBlocked(err) ?? new FetchLimitError('network', err.message))
        );
      });
      req.end();
    });
  }
}

function unwrapBlocked(err: Error): SsrfBlockedError | null {
  if (err instanceof SsrfBlockedError) return err;
  const cause = (err as { cause?: unknown }).cause;
  if (cause instanceof SsrfBlockedError) return cause;
  return null;
}
