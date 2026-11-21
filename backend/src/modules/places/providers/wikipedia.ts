import crypto from 'node:crypto';
import { CACHE_TTL, cached, type GeoCache } from '../geo-cache.js';
import { chunk, mapLimit, type HttpClient } from '../util/http.js';
import { clean, truncate } from '../util/text.js';
import { stripWikiMarkup } from './wikivoyage.js';
import type {
  CommonsFileInfo,
  CommonsProvider,
  WikiGeoHit,
  WikiPageDetail,
  WikidataEntityInfo,
  WikidataProvider,
  WikipediaProvider,
} from './types.js';
import type { LatLng } from '../types.js';

export const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
export const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
export const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
/** MediaWiki `prop=pageviews` returns at most 60 days. */
export const PAGEVIEW_DAYS = 60;

function hashKey(parts: string[]): string {
  return crypto.createHash('sha1').update([...parts].sort().join('\n')).digest('hex').slice(0, 20);
}

function buildUrl(base: string, params: Record<string, string | number>): string {
  const url = new URL(base);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  return url.toString();
}

interface TitleMapEntry {
  from: string;
  to: string;
}

/** Resolves requested titles through MediaWiki `normalized` + `redirects` arrays. */
function buildTitleResolver(
  query: { normalized?: TitleMapEntry[]; redirects?: TitleMapEntry[] } | undefined
): (requested: string) => string {
  const norm = new Map((query?.normalized ?? []).map((e) => [e.from, e.to]));
  const redir = new Map((query?.redirects ?? []).map((e) => [e.from, e.to]));
  return (requested: string) => {
    let t = norm.get(requested) ?? requested;
    t = redir.get(t) ?? t;
    return t;
  };
}

interface DetailsResponse {
  query?: {
    normalized?: TitleMapEntry[];
    redirects?: TitleMapEntry[];
    pages?: Array<{
      pageid?: number;
      title: string;
      missing?: boolean;
      description?: string;
      pageimage?: string;
      thumbnail?: { source: string };
      pageprops?: { wikibase_item?: string };
      coordinates?: Array<{ lat: number; lon: number }>;
    }>;
  };
}

export class WikipediaClient implements WikipediaProvider {
  constructor(
    private readonly http: HttpClient,
    private readonly cache: GeoCache,
    private readonly concurrency = 3
  ) {}

  async geosearch(
    center: LatLng,
    radiusM: number,
    limit: number,
    options: { refresh?: boolean } = {}
  ): Promise<WikiGeoHit[]> {
    const radius = Math.min(Math.max(Math.round(radiusM), 10), 10_000);
    const key = `wikipedia:geosearch:v1:${center.lat.toFixed(4)},${center.lng.toFixed(4)}:${radius}:${limit}`;
    const { value } = await cached(
      this.cache,
      key,
      'wikipedia',
      CACHE_TTL.wikipedia,
      async () => {
        const json = await this.http.getJson<{
          query?: {
            geosearch?: Array<{ pageid: number; title: string; lat: number; lon: number; dist: number }>;
          };
        }>(
          buildUrl(WIKIPEDIA_API, {
            action: 'query',
            list: 'geosearch',
            gscoord: `${center.lat}|${center.lng}`,
            gsradius: radius,
            gslimit: Math.min(limit, 500),
            gsnamespace: 0,
          })
        );
        return (json.query?.geosearch ?? []).map(
          (g): WikiGeoHit => ({
            pageId: g.pageid,
            title: g.title,
            lat: g.lat,
            lng: g.lon,
            distM: g.dist,
          })
        );
      },
      { refresh: options.refresh }
    );
    return value;
  }

  async pageDetails(
    titles: string[],
    options: { refresh?: boolean } = {}
  ): Promise<Record<string, WikiPageDetail>> {
    const unique = [...new Set(titles.filter(Boolean))];
    const batches = chunk(unique, 50);
    const parts = await mapLimit(batches, this.concurrency, async (batch) => {
      const { value } = await cached(
        this.cache,
        `wikipedia:details:v1:${hashKey(batch)}`,
        'wikipedia',
        CACHE_TTL.wikipedia,
        async () => {
          const json = await this.http.getJson<DetailsResponse>(
            buildUrl(WIKIPEDIA_API, {
              action: 'query',
              titles: batch.join('|'),
              redirects: 1,
              prop: 'pageprops|description|pageimages|coordinates',
              ppprop: 'wikibase_item',
              piprop: 'thumbnail|name',
              pithumbsize: 800,
              pilimit: 50,
              colimit: 50,
              coprimary: 'primary',
            }),
            { timeoutMs: 20_000 }
          );
          const resolve = buildTitleResolver(json.query);
          const byTitle = new Map((json.query?.pages ?? []).map((p) => [p.title, p]));
          const out: Record<string, WikiPageDetail> = {};
          for (const requested of batch) {
            const page = byTitle.get(resolve(requested));
            if (!page || page.missing) continue;
            const coord = page.coordinates?.[0];
            out[requested] = {
              title: page.title,
              pageId: page.pageid ?? null,
              wikidataId: page.pageprops?.wikibase_item ?? null,
              description: clean(page.description),
              thumbnailUrl: page.thumbnail?.source ?? null,
              imageFile: page.pageimage ?? null,
              lat: coord?.lat ?? null,
              lng: coord?.lon ?? null,
            };
          }
          return out;
        },
        { refresh: options.refresh }
      );
      return value;
    });
    return Object.assign({}, ...parts) as Record<string, WikiPageDetail>;
  }

  async summaries(
    titles: string[],
    options: { refresh?: boolean } = {}
  ): Promise<Record<string, string>> {
    const unique = [...new Set(titles.filter(Boolean))];
    const batches = chunk(unique, 20);
    const parts = await mapLimit(batches, this.concurrency, async (batch) => {
      const { value } = await cached(
        this.cache,
        `wikipedia:extracts:v1:${hashKey(batch)}`,
        'wikipedia',
        CACHE_TTL.wikipedia,
        async () => {
          const json = await this.http.getJson<{
            query?: {
              normalized?: TitleMapEntry[];
              redirects?: TitleMapEntry[];
              pages?: Array<{ title: string; missing?: boolean; extract?: string }>;
            };
          }>(
            buildUrl(WIKIPEDIA_API, {
              action: 'query',
              titles: batch.join('|'),
              redirects: 1,
              prop: 'extracts',
              exintro: 1,
              explaintext: 1,
              exsentences: 3,
              exlimit: 20,
            }),
            { timeoutMs: 20_000 }
          );
          const resolve = buildTitleResolver(json.query);
          const byTitle = new Map((json.query?.pages ?? []).map((p) => [p.title, p]));
          const out: Record<string, string> = {};
          for (const requested of batch) {
            const text = clean(byTitle.get(resolve(requested))?.extract);
            if (text) out[requested] = truncate(text, 420);
          }
          return out;
        },
        { refresh: options.refresh }
      );
      return value;
    });
    return Object.assign({}, ...parts) as Record<string, string>;
  }

  async pageviews(
    titles: string[],
    options: { refresh?: boolean } = {}
  ): Promise<Record<string, number>> {
    const unique = [...new Set(titles.filter(Boolean))];
    const batches = chunk(unique, 50);
    const parts = await mapLimit(batches, this.concurrency, async (batch) => {
      const { value } = await cached(
        this.cache,
        `wikipedia:pageviews:v1:${hashKey(batch)}`,
        'wikipedia',
        CACHE_TTL.pageviews,
        async () => {
          const json = await this.http.getJson<{
            query?: {
              normalized?: TitleMapEntry[];
              redirects?: TitleMapEntry[];
              pages?: Array<{ title: string; pageviews?: Record<string, number | null> }>;
            };
          }>(
            buildUrl(WIKIPEDIA_API, {
              action: 'query',
              titles: batch.join('|'),
              redirects: 1,
              prop: 'pageviews',
              pvipdays: PAGEVIEW_DAYS,
            }),
            { timeoutMs: 20_000 }
          );
          const resolve = buildTitleResolver(json.query);
          const byTitle = new Map((json.query?.pages ?? []).map((p) => [p.title, p]));
          const out: Record<string, number> = {};
          for (const requested of batch) {
            const views = byTitle.get(resolve(requested))?.pageviews;
            if (!views) continue;
            out[requested] = Object.values(views).reduce<number>((s, v) => s + (v ?? 0), 0);
          }
          return out;
        },
        { refresh: options.refresh }
      );
      return value;
    });
    return Object.assign({}, ...parts) as Record<string, number>;
  }
}

export class WikidataClient implements WikidataProvider {
  constructor(
    private readonly http: HttpClient,
    private readonly cache: GeoCache,
    private readonly concurrency = 3
  ) {}

  async sitelinks(
    ids: string[],
    options: { refresh?: boolean } = {}
  ): Promise<Record<string, WikidataEntityInfo>> {
    const unique = [...new Set(ids.filter((i) => /^Q\d+$/.test(i)))];
    const batches = chunk(unique, 50);
    const parts = await mapLimit(batches, this.concurrency, async (batch) => {
      const { value } = await cached(
        this.cache,
        `wikidata:sitelinks:v1:${hashKey(batch)}`,
        'wikidata',
        CACHE_TTL.wikidata,
        async () => {
          const json = await this.http.getJson<{
            entities?: Record<
              string,
              { missing?: string; sitelinks?: Record<string, { title: string }> }
            >;
          }>(
            buildUrl(WIKIDATA_API, {
              action: 'wbgetentities',
              ids: batch.join('|'),
              props: 'sitelinks',
            }),
            { timeoutMs: 25_000 }
          );
          const out: Record<string, WikidataEntityInfo> = {};
          for (const [id, entity] of Object.entries(json.entities ?? {})) {
            if (entity.missing !== undefined) continue;
            const links = entity.sitelinks ?? {};
            out[id] = {
              sitelinkCount: Object.keys(links).length,
              enwikiTitle: links.enwiki?.title ?? null,
            };
          }
          return out;
        },
        { refresh: options.refresh }
      );
      return value;
    });
    return Object.assign({}, ...parts) as Record<string, WikidataEntityInfo>;
  }
}

interface CommonsResponse {
  query?: {
    normalized?: TitleMapEntry[];
    redirects?: TitleMapEntry[];
    pages?: Array<{
      title: string;
      missing?: boolean;
      imageinfo?: Array<{
        thumburl?: string;
        url?: string;
        descriptionurl?: string;
        extmetadata?: Record<string, { value?: string }>;
      }>;
    }>;
  };
}

function fileTitle(file: string): string {
  const bare = file.replace(/^(File|Image):/i, '').replace(/_/g, ' ').trim();
  return `File:${bare}`;
}

export class CommonsClient implements CommonsProvider {
  constructor(
    private readonly http: HttpClient,
    private readonly cache: GeoCache,
    private readonly concurrency = 3
  ) {}

  async fileInfo(
    files: string[],
    options: { refresh?: boolean } = {}
  ): Promise<Record<string, CommonsFileInfo>> {
    const unique = [...new Set(files.filter(Boolean))];
    const batches = chunk(unique, 40);
    const parts = await mapLimit(batches, this.concurrency, async (batch) => {
      const { value } = await cached(
        this.cache,
        `commons:fileinfo:v1:${hashKey(batch)}`,
        'commons',
        CACHE_TTL.commons,
        async () => {
          const json = await this.http.getJson<CommonsResponse>(
            buildUrl(COMMONS_API, {
              action: 'query',
              titles: batch.map(fileTitle).join('|'),
              redirects: 1,
              prop: 'imageinfo',
              iiprop: 'url|extmetadata',
              iiurlwidth: 800,
              iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl|UsageTerms',
            }),
            { timeoutMs: 25_000 }
          );
          const resolve = buildTitleResolver(json.query);
          const byTitle = new Map((json.query?.pages ?? []).map((p) => [p.title, p]));
          const out: Record<string, CommonsFileInfo> = {};
          for (const requested of batch) {
            const page = byTitle.get(resolve(fileTitle(requested)));
            const info = page?.imageinfo?.[0];
            if (!page || page.missing || !info) continue;
            const meta = info.extmetadata ?? {};
            const artist = meta.Artist?.value ? clean(stripWikiMarkup(meta.Artist.value)) : null;
            out[requested] = {
              file: page.title,
              thumbUrl: info.thumburl ?? info.url ?? '',
              sourceUrl: info.descriptionurl ?? '',
              author: artist ? truncate(artist, 140) : null,
              license: clean(meta.LicenseShortName?.value ?? meta.UsageTerms?.value),
              licenseUrl: clean(meta.LicenseUrl?.value),
            };
            if (!out[requested]?.thumbUrl) delete out[requested];
          }
          return out;
        },
        { refresh: options.refresh }
      );
      return value;
    });
    return Object.assign({}, ...parts) as Record<string, CommonsFileInfo>;
  }
}
