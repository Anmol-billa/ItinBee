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
    void warmBackendQuietly();
    // Periodically ping /health every 8 minutes while frontend is active so backend doesn't idle out mid-session
    const timer = setInterval(() => {
      void warmBackendQuietly();
    }, 8 * 60 * 1000);
    if (typeof timer === 'object' && 'unref' in timer) {
      timer.unref();
    }
  }
}
