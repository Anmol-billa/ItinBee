import { warmBackendQuietly } from '@/lib/backend-origin';

let keepWarmStarted = false;

export async function register(): Promise<void> {
  if (
    process.env.NEXT_RUNTIME === 'nodejs' &&
    process.env.NODE_ENV === 'production' &&
    !keepWarmStarted
  ) {
    keepWarmStarted = true;
    // Warm backend immediately when frontend server boots
    void warmBackendQuietly(45_000);
    // Ping /health every 5 minutes (well inside Render's 15-minute idle spin-down window)
    const timer = setInterval(() => {
      void warmBackendQuietly(45_000);
    }, 5 * 60 * 1000);
    if (typeof timer === 'object' && 'unref' in timer) {
      timer.unref();
    }
  }
}
