import { CACHE_TTL, cached, type GeoCache } from '../geo-cache.js';
import { clean } from '../util/text.js';
import { mapLimit, type HttpClient } from '../util/http.js';
import type {
  WikivoyageListing,
  WikivoyageProvider,
  WikivoyageResult,
} from './types.js';

const LISTING_TEMPLATES = new Set(['see', 'do', 'eat', 'drink', 'sleep', 'buy', 'listing']);
const MAX_SUBPAGES = 12;
const API = 'https://en.wikivoyage.org/w/api.php';

/** Removes wiki markup so field text is plain. */
export function stripWikiMarkup(input: string): string {
  let s = input;
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<ref[^>/]*\/>/gi, ' ').replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, ' ');
  // drop nested templates from the innermost out
  for (let i = 0; i < 6 && /\{\{[^{}]*\}\}/.test(s); i += 1) {
    s = s.replace(/\{\{[^{}]*\}\}/g, ' ');
  }
  s = s.replace(/\[\[(?:File|Image|Category):[^\]]*\]\]/gi, ' ');
  s = s.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2').replace(/\[\[([^\]]*)\]\]/g, '$1');
  s = s.replace(/\[(?:https?:)?\/\/\S+\s+([^\]]+)\]/g, '$1').replace(/\[(?:https?:)?\/\/\S+\]/g, ' ');
  s = s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ');
  s = s.replace(/'{2,}/g, '');
  s = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—');
  return s.replace(/\s+/g, ' ').trim();
}

interface RawTemplate {
  name: string;
  params: Map<string, string>;
  start: number;
}

/** Finds every `{{...}}` at top level and splits it into name + named params, respecting nested `{{}}`/`[[]]`. */
export function extractTemplates(wikitext: string): RawTemplate[] {
  const out: RawTemplate[] = [];
  let i = 0;
  while (i < wikitext.length - 1) {
    if (wikitext[i] === '{' && wikitext[i + 1] === '{') {
      let depth = 0;
      let j = i;
      let end = -1;
      while (j < wikitext.length - 1) {
        const two = wikitext.slice(j, j + 2);
        if (two === '{{') {
          depth += 1;
          j += 2;
        } else if (two === '}}') {
          depth -= 1;
          j += 2;
          if (depth === 0) {
            end = j;
            break;
          }
        } else {
          j += 1;
        }
      }
      if (end === -1) break;
      const body = wikitext.slice(i + 2, end - 2);
      out.push(parseTemplateBody(body, i));
      i = end;
    } else {
      i += 1;
    }
  }
  return out;
}

function parseTemplateBody(body: string, start: number): RawTemplate {
  const segments: string[] = [];
  let depthBrace = 0;
  let depthBracket = 0;
  let cur = '';
  for (let k = 0; k < body.length; k += 1) {
    const c = body[k] as string;
    const two = body.slice(k, k + 2);
    if (two === '{{') {
      depthBrace += 1;
      cur += two;
      k += 1;
    } else if (two === '}}') {
      depthBrace -= 1;
      cur += two;
      k += 1;
    } else if (two === '[[') {
      depthBracket += 1;
      cur += two;
      k += 1;
    } else if (two === ']]') {
      depthBracket -= 1;
      cur += two;
      k += 1;
    } else if (c === '|' && depthBrace === 0 && depthBracket === 0) {
      segments.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  segments.push(cur);
  const name = (segments[0] ?? '').trim().toLowerCase();
  const params = new Map<string, string>();
  for (const seg of segments.slice(1)) {
    const eq = seg.indexOf('=');
    if (eq <= 0) continue;
    const key = seg.slice(0, eq).trim().toLowerCase();
    if (!/^[a-z0-9_ -]+$/.test(key)) continue;
    params.set(key, seg.slice(eq + 1).trim());
  }
  return { name, params, start };
}

function parseCoord(value: string | undefined, min: number, max: number): number | null {
  if (!value) return null;
  const n = Number(value.replace(/[^\d.+-]/g, ''));
  return Number.isFinite(n) && n >= min && n <= max && value.trim() !== '' ? n : null;
}

function headings(wikitext: string): Array<{ index: number; title: string }> {
  const out: Array<{ index: number; title: string }> = [];
  const re = /^(={2,6})\s*([^=\n]+?)\s*\1\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(wikitext)) !== null) {
    out.push({ index: m.index, title: stripWikiMarkup(m[2] ?? '') });
  }
  return out;
}

function toListingType(templateName: string, typeParam: string | undefined): WikivoyageListing['type'] {
  const raw = templateName === 'listing' ? (typeParam ?? 'other').trim().toLowerCase() : templateName;
  if (
    raw === 'see' ||
    raw === 'do' ||
    raw === 'eat' ||
    raw === 'drink' ||
    raw === 'sleep' ||
    raw === 'buy'
  )
    return raw;
  return templateName === 'listing' ? 'listing' : 'other';
}

function normalizeWikidata(v: string | undefined): string | null {
  const m = v?.match(/Q\d+/i);
  return m ? m[0].toUpperCase() : null;
}

/** Parses `{{see}} {{do}} {{eat}} {{drink}} {{sleep}} {{buy}} {{listing}}` templates out of Wikivoyage wikitext. */
export function parseWikivoyageListings(wikitext: string, pageTitle: string): WikivoyageListing[] {
  const heads = headings(wikitext);
  const listings: WikivoyageListing[] = [];
  for (const t of extractTemplates(wikitext)) {
    if (!LISTING_TEMPLATES.has(t.name)) continue;
    const name = clean(stripWikiMarkup(t.params.get('name') ?? ''));
    if (!name) continue;
    let section: string | null = null;
    for (const h of heads) {
      if (h.index < t.start) section = h.title;
      else break;
    }
    const url = clean(t.params.get('url'));
    listings.push({
      type: toListingType(t.name, t.params.get('type')),
      name,
      alt: clean(stripWikiMarkup(t.params.get('alt') ?? '')),
      lat: parseCoord(t.params.get('lat') ?? t.params.get('latitude'), -90, 90),
      lng: parseCoord(t.params.get('long') ?? t.params.get('lon') ?? t.params.get('longitude'), -180, 180),
      address: clean(stripWikiMarkup(t.params.get('address') ?? '')),
      url: url && /^https?:\/\//i.test(url) ? url : null,
      hours: clean(stripWikiMarkup(t.params.get('hours') ?? '')),
      price: clean(stripWikiMarkup(t.params.get('price') ?? '')),
      phone: clean(stripWikiMarkup(t.params.get('phone') ?? '')),
      content: clean(stripWikiMarkup(t.params.get('content') ?? '')),
      wikidata: normalizeWikidata(t.params.get('wikidata')),
      wikipedia: clean(t.params.get('wikipedia')),
      image: clean(t.params.get('image')),
      section,
      pageTitle,
    });
  }
  return listings;
}

/** District sub-pages (e.g. "Kyoto/Central Kyoto") referenced from a city's main page. */
export function findSubpageTitles(wikitext: string, pageTitle: string): string[] {
  const out = new Set<string>();
  const escaped = pageTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\[\\[(${escaped}/[^\\]|#]+)`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(wikitext)) !== null) {
    const t = (m[1] ?? '').trim();
    if (t && !/\/(Understand|Get in|Get around|See|Do|Eat|Drink|Sleep|Buy|Talk)$/i.test(t)) out.add(t);
  }
  return [...out].slice(0, MAX_SUBPAGES);
}

interface RevisionsResponse {
  query?: {
    pages?: Array<{
      title: string;
      missing?: boolean;
      revisions?: Array<{ slots?: { main?: { content?: string } } }>;
    }>;
  };
}

export class WikivoyageClient implements WikivoyageProvider {
  constructor(
    private readonly http: HttpClient,
    private readonly cache: GeoCache
  ) {}

  private async fetchWikitext(titles: string[]): Promise<Record<string, string>> {
    const url = new URL(API);
    url.searchParams.set('action', 'query');
    url.searchParams.set('prop', 'revisions');
    url.searchParams.set('rvprop', 'content');
    url.searchParams.set('rvslots', 'main');
    url.searchParams.set('redirects', '1');
    url.searchParams.set('format', 'json');
    url.searchParams.set('formatversion', '2');
    url.searchParams.set('titles', titles.join('|'));
    const json = await this.http.getJson<RevisionsResponse>(url.toString(), { timeoutMs: 20_000 });
    const out: Record<string, string> = {};
    for (const page of json.query?.pages ?? []) {
      const content = page.revisions?.[0]?.slots?.main?.content;
      if (!page.missing && content) out[page.title] = content;
    }
    return out;
  }

  async fetchListings(
    title: string,
    options: { refresh?: boolean } = {}
  ): Promise<WikivoyageResult> {
    const { value } = await cached(
      this.cache,
      `wikivoyage:v1:${title.toLowerCase()}`,
      'wikivoyage',
      CACHE_TTL.wikivoyage,
      async (): Promise<WikivoyageResult> => {
        const main = await this.fetchWikitext([title]);
        const mainTitle = Object.keys(main)[0];
        if (!mainTitle) return { pageTitle: null, pages: [], listings: [] };
        const mainText = main[mainTitle] as string;
        const listings = parseWikivoyageListings(mainText, mainTitle);
        const pages = [mainTitle];

        // Large destinations keep their listings on district sub-pages.
        const subTitles = findSubpageTitles(mainText, mainTitle);
        if (subTitles.length > 0) {
          const batches = [subTitles.slice(0, 6), subTitles.slice(6)].filter((b) => b.length > 0);
          const fetched = await mapLimit(batches, 2, (b) => this.fetchWikitext(b).catch(() => ({})));
          for (const group of fetched) {
            for (const [t, text] of Object.entries(group)) {
              pages.push(t);
              listings.push(...parseWikivoyageListings(text, t));
            }
          }
        }
        return { pageTitle: mainTitle, pages, listings };
      },
      { refresh: options.refresh }
    );
    return value;
  }
}
