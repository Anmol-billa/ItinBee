import { LIMITS } from '@/lib/import-types';

export interface FileLike {
  name: string;
  size: number;
  type: string;
}

export interface AttachedFile<F extends FileLike = File> {
  id: string;
  file: F;
}

export const ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp,image/heic,image/heif';
const OK_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']);
const OK_EXT = /\.(pdf|png|jpe?g|webp|heic|heif)$/i;

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function isSupportedFile(f: FileLike): boolean {
  return OK_TYPES.has(f.type) || (f.type === '' && OK_EXT.test(f.name));
}

export interface AddFilesResult<F extends FileLike> {
  accepted: F[];
  errors: string[];
}

/** Applies the file limits (type, count, total size) and explains each rejection. */
export function checkNewFiles<F extends FileLike>(existing: F[], incoming: F[]): AddFilesResult<F> {
  const accepted: F[] = [];
  const errors: string[] = [];
  let count = existing.length;
  let bytes = existing.reduce((n, f) => n + f.size, 0);
  for (const f of incoming) {
    if (!isSupportedFile(f)) {
      errors.push(`"${f.name}" isn't supported. Use a PDF, PNG, JPG or WebP file.`);
      continue;
    }
    if (f.size === 0) {
      errors.push(`"${f.name}" is empty.`);
      continue;
    }
    if (count >= LIMITS.files) {
      errors.push(`You can attach up to ${LIMITS.files} files. "${f.name}" was left out.`);
      continue;
    }
    if (bytes + f.size > LIMITS.totalBytes) {
      errors.push(
        `"${f.name}" (${formatBytes(f.size)}) would go over the ${formatBytes(LIMITS.totalBytes)} total limit. Remove a file or use a smaller one.`
      );
      continue;
    }
    accepted.push(f);
    count += 1;
    bytes += f.size;
  }
  return { accepted, errors };
}

const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+/gi;

export function extractUrls(text: string): string[] {
  const found = text.match(URL_RE) ?? [];
  return [...new Set(found.map((u) => u.replace(/[.,;!?]+$/, '')))];
}

/** True when the whole pasted text is made of URLs only (one per line / space separated). */
export function isUrlsOnly(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const rest = t.replace(URL_RE, '').replace(/[\s,]+/g, '');
  return rest === '' && extractUrls(t).length > 0;
}

export type UrlKind = 'instagram' | 'youtube' | 'other';

export function classifyUrl(raw: string): UrlKind {
  try {
    const host = new URL(raw).hostname.replace(/^www\.|^m\./, '').toLowerCase();
    if (host === 'instagram.com' || host.endsWith('.instagram.com') || host === 'instagr.am') return 'instagram';
    if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be') return 'youtube';
  } catch {
    /* not a URL */
  }
  return 'other';
}

export function urlLabel(raw: string): string {
  try {
    const u = new URL(raw);
    const path = u.pathname === '/' ? '' : u.pathname;
    const s = `${u.hostname.replace(/^www\./, '')}${path}`;
    return s.length > 38 ? `${s.slice(0, 37)}…` : s;
  } catch {
    return raw.slice(0, 38);
  }
}

export interface DraftErrors {
  text?: string;
  urls?: string;
  empty?: string;
}

export function validateDraft(draft: { text: string; urls: string[]; fileCount: number }): DraftErrors {
  const errors: DraftErrors = {};
  const text = draft.text.trim();
  if (text.length > LIMITS.textChars) {
    errors.text = `That's ${text.length.toLocaleString('en-IN')} characters and the limit is ${LIMITS.textChars.toLocaleString('en-IN')}. Trim it, or attach the long part as a PDF.`;
  }
  const urls = new Set([...draft.urls, ...extractUrls(text)]);
  if (urls.size > LIMITS.urls) {
    errors.urls = `You've added ${urls.size} links and the limit is ${LIMITS.urls}. Remove a few.`;
  }
  if (!text && draft.urls.length === 0 && draft.fileCount === 0) {
    errors.empty = 'Add a few words about your trip, paste a link, or attach a ticket to begin.';
  }
  return errors;
}

export function toBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('Could not read the file'));
    r.onload = () => {
      const s = String(r.result);
      resolve(s.slice(s.indexOf(',') + 1));
    };
    r.readAsDataURL(file);
  });
}
