/** In-memory sliding-window limiter (per key, e.g. client IP). Fine for a single instance; Redis can replace it later. */
export class SlidingWindowRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = () => Date.now()
  ) {}

  check(key: string): { allowed: boolean; remaining: number; retryAfterSec: number } {
    const t = this.now();
    const cutoff = t - this.windowMs;
    const arr = (this.hits.get(key) ?? []).filter((x) => x > cutoff);
    if (arr.length >= this.limit) {
      this.hits.set(key, arr);
      const oldest = arr[0] ?? t;
      return {
        allowed: false,
        remaining: 0,
        retryAfterSec: Math.max(1, Math.ceil((oldest + this.windowMs - t) / 1000)),
      };
    }
    arr.push(t);
    this.hits.set(key, arr);
    if (this.hits.size > 5000) this.prune(cutoff);
    return { allowed: true, remaining: this.limit - arr.length, retryAfterSec: 0 };
  }

  private prune(cutoff: number): void {
    for (const [k, v] of this.hits) {
      if (v.every((x) => x <= cutoff)) this.hits.delete(k);
    }
  }
}
