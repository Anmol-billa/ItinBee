/** Browser-side API base URL (same resolution as lib/api-client.ts, kept separate for client components). */
export function browserApiBase(): string {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, '');
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:4000';
  }
  return '/api/proxy';
}
