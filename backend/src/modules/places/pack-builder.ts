import {
  categorizeOsm,
  categorizeWikipedia,
  categorizeWikivoyage,
} from './categorize.js';
import {
  attachMissingCoordinates,
  mergeCandidates,
  type MergedCandidate,
  type PlaceCandidate,
} from './dedupe.js';
import type {
  CommonsFileInfo,
  PackProviders,
  WikiPageDetail,
  WikivoyageListing,
} from './providers/types.js';
import {
  computePopularity,
  rankWithDiversity,
  tagCompleteness,
  wikivoyageProminence,
} from './scoring.js';
import type {
  DestinationKind,
  DestinationRecord,
  ImageInfo,
  PackStats,
  PlaceCategory,
  PlaceInput,
  PlaceSource,
  SourceProvider,
} from './types.js';
import { haversineMeters } from './util/geo.js';
import { clean, normalizeName, sanitizeImageObject, slugify, toTitleCasePlaceName } from './util/text.js';

/** Pack radius around the destination centre (metres). State/country are aggregates and never get their own pack. */
export function packRadiusM(kind: DestinationKind): number | null {
  switch (kind) {
    case 'city':
      return 12_000;
    case 'area':
      return 18_000;
    case 'region':
      return 40_000;
    default:
      return null;
  }
}

export function isPackBuildable(kind: DestinationKind): boolean {
  return packRadiusM(kind) !== null;
}

export const DEFAULT_MAX_PER_CATEGORY: Record<PlaceCategory, number> = {
  sights: 80,
  culture: 50,
  nature: 50,
  food: 100,
  cafe: 50,
  nightlife: 40,
  stay: 80,
  activity: 50,
  spiritual: 50,
  transport: 15,
};

export interface EnrichContext {
  destination: DestinationRecord;
}

/**
 * PHASE 3 HOOK: AI curation (category polish, why_visit, durations, best time, dietary hints) will plug in here.
 * It must only use fetched source text and leave unsupported fields null. Intentionally a no-op in Phase 1.
 */
export async function enrichPlaces(
  places: PlaceInput[],
  _ctx: EnrichContext
): Promise<PlaceInput[]> {
  return places;
}

export interface PackBuildOptions {
  now?: () => Date;
  /** Bypass provider caches (forced refresh). */
  refresh?: boolean;
  maxPerCategory?: Partial<Record<PlaceCategory, number>>;
  enrich?: typeof enrichPlaces;
  log?: (message: string) => void;
}

export interface PackBuildResult {
  places: PlaceInput[];
  profile: {
    summary: string | null;
    heroImage: ImageInfo | null;
    wikidataId: string | null;
    wikipediaTitle: string | null;
  };
  stats: PackStats;
  /** True when a provider failed: the pack is saved but flagged `stale` so it is retried later. */
  degraded: boolean;
}

const LICENSES = {
  wikivoyage: 'CC BY-SA 4.0',
  wikipedia: 'CC BY-SA 4.0',
  wikidata: 'CC0 1.0',
  osm: 'ODbL 1.0 (© OpenStreetMap contributors)',
} as const;

function wikiUrl(host: string, title: string): string {
  return `https://${host}/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

/** "en:Hawa Mahal" / "Hawa_Mahal" / "https://en.wikipedia.org/wiki/Hawa_Mahal" -> "Hawa Mahal"; non-English refs -> null. */
export function normalizeWikipediaRef(ref: string | null | undefined): string | null {
  const v = clean(ref);
  if (!v) return null;
  const urlMatch = v.match(/^https?:\/\/en\.wikipedia\.org\/wiki\/([^#?]+)/i);
  if (urlMatch) return decodeURIComponent(urlMatch[1] as string).replace(/_/g, ' ');
  if (/^https?:\/\//i.test(v)) return null;
  const prefixed = v.match(/^([a-z-]{2,10}):(.+)$/i);
  if (prefixed) return (prefixed[1] as string).toLowerCase() === 'en' ? (prefixed[2] as string).trim() : null;
  return v.replace(/_/g, ' ');
}

function normalizeCommonsFile(ref: string | null | undefined): string | null {
  const v = clean(ref);
  if (!v) return null;
  if (/^category:/i.test(v)) return null;
  const bare = v.replace(/^(File|Image):/i, '').replace(/_/g, ' ').trim();
  return /\.(jpe?g|png|webp|gif|tiff?)$/i.test(bare) ? bare : null;
}

function ensureHttp(url: string | undefined): string | null {
  const v = clean(url);
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : `http://${v}`;
}

function osmAddress(tags: Record<string, string>): string | null {
  if (tags['addr:full']) return clean(tags['addr:full']);
  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
  const parts = [
    street,
    tags['addr:suburb'] ?? tags['addr:neighbourhood'],
    tags['addr:city'],
    tags['addr:postcode'],
  ]
    .map((p) => clean(p))
    .filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(', ') : null;
}

function osmDietary(tags: Record<string, string>): string[] {
  const out: string[] = [];
  const yes = (k: string) => tags[k] === 'yes' || tags[k] === 'only';
  if (yes('diet:vegetarian') || tags.cuisine === 'vegetarian') out.push('vegetarian');
  if (yes('diet:vegan') || tags.cuisine === 'vegan') out.push('vegan');
  if (yes('diet:halal')) out.push('halal');
  if (yes('diet:kosher')) out.push('kosher');
  if (yes('diet:gluten_free')) out.push('gluten_free');
  return out;
}

const PREFERRED_LOCAL_KEYS = ['hi', 'ja', 'ko', 'zh', 'th', 'ar', 'ru', 'vi', 'fr', 'de', 'es', 'pt', 'it', 'tr'];

function osmNameLocal(tags: Record<string, string>, displayName: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (tags.name && tags.name !== displayName) out.local = tags.name;
  for (const lang of PREFERRED_LOCAL_KEYS) {
    const v = tags[`name:${lang}`];
    if (v && v !== displayName && Object.keys(out).length < 5) out[lang] = v;
  }
  return out;
}

export function candidatesFromOsm(
  elements: ReadonlyArray<{ type: string; id: number; lat: number; lng: number; tags: Record<string, string> }>
): { candidates: PlaceCandidate[]; dropped: number } {
  const candidates: PlaceCandidate[] = [];
  let dropped = 0;
  for (const el of elements) {
    const cat = categorizeOsm(el.tags);
    if (!cat) {
      dropped += 1;
      continue;
    }
    const name = clean(el.tags['name:en'] ?? el.tags.name);
    if (!name) {
      dropped += 1;
      continue;
    }
    candidates.push({
      key: `osm:${el.type}:${el.id}`,
      origin: 'osm',
      name,
      altNames: [el.tags.name, el.tags['name:en']].filter((n): n is string => Boolean(n) && n !== name),
      nameLocal: osmNameLocal(el.tags, name),
      lat: el.lat,
      lng: el.lng,
      category: cat.category,
      subtype: cat.subtype,
      address: osmAddress(el.tags),
      website: ensureHttp(el.tags.website ?? el.tags['contact:website'] ?? el.tags.url),
      openingHours: clean(el.tags.opening_hours),
      phone: clean(el.tags.phone ?? el.tags['contact:phone']),
      description: clean(el.tags.description),
      wikidataId: /^Q\d+$/.test(el.tags.wikidata ?? '') ? (el.tags.wikidata as string) : null,
      wikipediaTitle: normalizeWikipediaRef(el.tags.wikipedia),
      imageFile: normalizeCommonsFile(el.tags.wikimedia_commons),
      osmRef: `osm:${el.type}:${el.id}`,
      osmTags: el.tags,
      wikivoyageType: null,
      wikivoyagePage: null,
      wikivoyageContentLength: 0,
    });
  }
  return { candidates, dropped };
}

export function candidatesFromWikivoyage(listings: readonly WikivoyageListing[]): {
  candidates: PlaceCandidate[];
  dropped: number;
} {
  const candidates: PlaceCandidate[] = [];
  let dropped = 0;
  const seen = new Set<string>();
  for (const l of listings) {
    const cat = categorizeWikivoyage(l);
    if (!cat) {
      dropped += 1;
      continue;
    }
    const key = `wv:${l.pageTitle}:${slugify(l.name)}:${l.lat ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      key,
      origin: 'wikivoyage',
      name: l.name,
      altNames: l.alt ? l.alt.split(/[,;/]/).map((a) => a.trim()).filter(Boolean) : [],
      nameLocal: {},
      lat: l.lat,
      lng: l.lng,
      category: cat.category,
      subtype: cat.subtype,
      address: l.address,
      website: l.url,
      openingHours: l.hours,
      phone: l.phone,
      description: l.content,
      wikidataId: l.wikidata,
      wikipediaTitle: normalizeWikipediaRef(l.wikipedia),
      imageFile: normalizeCommonsFile(l.image),
      osmRef: null,
      osmTags: null,
      wikivoyageType: l.type,
      wikivoyagePage: l.pageTitle,
      wikivoyageContentLength: l.content?.length ?? 0,
    });
  }
  return { candidates, dropped };
}

function wikivoyageTitleFor(dest: DestinationRecord): string {
  if (dest.wikivoyageTitle) return dest.wikivoyageTitle;
  const base = dest.wikipediaTitle?.split(',')[0]?.trim();
  return base || dest.name;
}

const WV_EXPLICIT = new Set(['eat', 'drink', 'sleep', 'do', 'buy']);

function firstNonNull<T>(values: ReadonlyArray<T | null | undefined>): T | null {
  for (const v of values) if (v !== null && v !== undefined) return v;
  return null;
}

interface FieldTracker {
  fields: Map<SourceProvider, Set<string>>;
  add(provider: SourceProvider, field: string): void;
}

function newTracker(): FieldTracker {
  const fields = new Map<SourceProvider, Set<string>>();
  return {
    fields,
    add(provider, field) {
      const set = fields.get(provider) ?? new Set<string>();
      set.add(field);
      fields.set(provider, set);
    },
  };
}

/** The whole pipeline. Pure apart from the injected providers (no I/O of its own). */
export async function buildDestinationPack(
  dest: DestinationRecord,
  providers: PackProviders,
  options: PackBuildOptions = {}
): Promise<PackBuildResult> {
  const started = Date.now();
  const log = options.log ?? (() => undefined);
  const now = (options.now ?? (() => new Date()))().toISOString();
  const radiusM = packRadiusM(dest.kind);
  if (radiusM === null) {
    throw new Error(`Destination kind "${dest.kind}" is an aggregate and cannot have its own pack`);
  }
  const refresh = options.refresh ?? false;
  const warnings: string[] = [];
  const center = { lat: dest.lat, lng: dest.lng };
  const caps = { ...DEFAULT_MAX_PER_CATEGORY, ...options.maxPerCategory };

  // 1. one fetch per provider, in parallel
  const [wvRes, geoRes, osmRes] = await Promise.allSettled([
    providers.wikivoyage.fetchListings(wikivoyageTitleFor(dest), { refresh }),
    providers.wikipedia.geosearch(center, Math.min(radiusM, 10_000), 500, { refresh }),
    providers.overpass.fetchPois(center, radiusM, { refresh }),
  ]);
  const failed = [wvRes, geoRes, osmRes].filter((r) => r.status === 'rejected');
  const describe = (name: string, r: PromiseSettledResult<unknown>) =>
    r.status === 'rejected'
      ? `${name} failed: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`
      : null;
  for (const w of [describe('wikivoyage', wvRes), describe('wikipedia-geosearch', geoRes), describe('overpass', osmRes)]) {
    if (w) warnings.push(w);
  }
  if (failed.length === 3) throw new Error(`All providers failed: ${warnings.join(' | ')}`);

  const wv = wvRes.status === 'fulfilled' ? wvRes.value : { pageTitle: null, pages: [], listings: [] };
  if (wvRes.status === 'fulfilled' && wv.pageTitle === null) {
    warnings.push(`wikivoyage page "${wikivoyageTitleFor(dest)}" not found`);
  }
  const geoHits = geoRes.status === 'fulfilled' ? geoRes.value : [];
  const osmElements = osmRes.status === 'fulfilled' ? osmRes.value : [];

  const wvBuilt = candidatesFromWikivoyage(wv.listings);
  const osmBuilt = candidatesFromOsm(osmElements);
  let droppedJunk = wvBuilt.dropped + osmBuilt.dropped;
  log(`fetched: wikivoyage=${wv.listings.length} geosearch=${geoHits.length} osm=${osmElements.length}`);

  // 2. Wikipedia article details for geosearch hits + every referenced title
  const titles = new Set<string>();
  for (const h of geoHits) titles.add(h.title);
  for (const c of [...wvBuilt.candidates, ...osmBuilt.candidates]) {
    if (c.wikipediaTitle) titles.add(c.wikipediaTitle);
  }
  if (dest.wikipediaTitle) titles.add(dest.wikipediaTitle);

  const details = new Map<string, WikiPageDetail>();
  const loadDetails = async (list: string[]): Promise<void> => {
    if (list.length === 0) return;
    try {
      const got = await providers.wikipedia.pageDetails(list, { refresh });
      for (const [requested, d] of Object.entries(got)) {
        details.set(requested, d);
        details.set(d.title, d);
      }
    } catch (err) {
      warnings.push(`wikipedia-details failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  await loadDetails([...titles]);

  const wpCandidates: PlaceCandidate[] = [];
  for (const h of geoHits) {
    if (dest.wikipediaTitle && h.title === dest.wikipediaTitle) {
      droppedJunk += 1;
      continue;
    }
    const d = details.get(h.title);
    const cat = categorizeWikipedia(d?.description ?? null, h.title);
    if (!cat) {
      droppedJunk += 1;
      continue;
    }
    const strippedTitle = h.title.replace(/\s+\([^)]*\)$/, '');
    if (normalizeName(strippedTitle) === normalizeName(dest.name)) {
      droppedJunk += 1;
      continue;
    }
    wpCandidates.push({
      key: `wp:${h.pageId}`,
      origin: 'wikipedia',
      name: toTitleCasePlaceName(strippedTitle),
      altNames: [h.title],
      nameLocal: {},
      lat: h.lat,
      lng: h.lng,
      category: cat.category,
      subtype: cat.subtype,
      address: null,
      website: null,
      openingHours: null,
      phone: null,
      description: null,
      wikidataId: d?.wikidataId ?? null,
      wikipediaTitle: d?.title ?? h.title,
      imageFile: normalizeCommonsFile(d?.imageFile),
      osmRef: null,
      osmTags: null,
      wikivoyageType: null,
      wikivoyagePage: null,
      wikivoyageContentLength: 0,
    });
  }

  const all: PlaceCandidate[] = [...wvBuilt.candidates, ...wpCandidates, ...osmBuilt.candidates];
  const coordsFromWikipedia = new Set<string>();

  const applyDetails = (): void => {
    for (const c of all) {
      const d = c.wikipediaTitle ? details.get(c.wikipediaTitle) : undefined;
      if (!d) continue;
      c.wikidataId ??= d.wikidataId;
      c.imageFile ??= normalizeCommonsFile(d.imageFile);
      c.wikipediaTitle = d.title;
      if ((c.lat === null || c.lng === null) && d.lat !== null && d.lng !== null) {
        c.lat = d.lat;
        c.lng = d.lng;
        coordsFromWikipedia.add(c.key);
      }
    }
  };
  applyDetails();

  // 3. Wikidata sitelinks (popularity) + enwiki titles for entries that only carry a QID
  const siteInfo = new Map<string, { sitelinkCount: number; enwikiTitle: string | null }>();
  const loadSitelinks = async (): Promise<void> => {
    const ids = [...new Set(all.map((c) => c.wikidataId).filter((x): x is string => Boolean(x)))].filter(
      (id) => !siteInfo.has(id)
    );
    if (ids.length === 0) return;
    try {
      const got = await providers.wikidata.sitelinks(ids, { refresh });
      for (const [id, info] of Object.entries(got)) siteInfo.set(id, info);
    } catch (err) {
      warnings.push(`wikidata failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  await loadSitelinks();
  const extraTitles: string[] = [];
  for (const c of all) {
    if (!c.wikipediaTitle && c.wikidataId) {
      const t = siteInfo.get(c.wikidataId)?.enwikiTitle;
      if (t) {
        c.wikipediaTitle = t;
        if (!details.has(t)) extraTitles.push(t);
      }
    }
  }
  if (extraTitles.length > 0) {
    await loadDetails([...new Set(extraTitles)]);
    applyDetails();
    await loadSitelinks();
  }

  // 4. coordinates for Wikivoyage listings that carry none
  const missing = attachMissingCoordinates(all);
  const droppedNoCoords = missing.unresolved.length;
  const attachedByName = missing.attached;
  if (droppedNoCoords > 0) log(`dropped ${droppedNoCoords} unlocated listings`);

  // 5. dedupe / merge
  const merged = mergeCandidates(all);
  const mergedDuplicates = all.length - droppedNoCoords - merged.length;

  // distance sanity: Wikivoyage/Wikipedia entries far outside the pack area are day-trips, not part of this pack
  const inArea = merged.filter(
    (m) => haversineMeters(center, { lat: m.lat, lng: m.lng }) <= radiusM * 1.6
  );

  // 6. pageviews for every article we know about
  const articleTitles = [
    ...new Set(inArea.flatMap((m) => m.members.map((x) => x.wikipediaTitle)).filter((t): t is string => Boolean(t))),
  ];
  let views: Record<string, number> = {};
  try {
    views = await providers.wikipedia.pageviews(articleTitles, { refresh });
  } catch (err) {
    warnings.push(`pageviews failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 7. classify merged groups
  interface Draft {
    merged: MergedCandidate;
    category: PlaceCategory;
    subtype: string | null;
    wikipediaTitle: string | null;
    pageviews: number;
    sitelinks: number;
    wvListed: boolean;
    wvContentLength: number;
    popularity: number;
    refId: string;
  }
  const drafts: Draft[] = [];
  for (const m of inArea) {
    const wvMember = m.members.find((x) => x.origin === 'wikivoyage');
    const osmMember = m.members.find((x) => x.origin === 'osm');
    const wpMember = m.members.find((x) => x.origin === 'wikipedia');
    const picked =
      wvMember && wvMember.wikivoyageType && WV_EXPLICIT.has(wvMember.wikivoyageType)
        ? wvMember
        : (osmMember ?? wvMember ?? wpMember);
    if (!picked?.category) continue;
    const wikipediaTitle = firstNonNull(m.members.map((x) => x.wikipediaTitle));
    const wikidataId = m.wikidataId;
    drafts.push({
      merged: m,
      category: picked.category,
      subtype: picked.subtype,
      wikipediaTitle,
      pageviews: wikipediaTitle ? (views[wikipediaTitle] ?? 0) : 0,
      sitelinks: wikidataId ? (siteInfo.get(wikidataId)?.sitelinkCount ?? 0) : 0,
      wvListed: Boolean(wvMember),
      wvContentLength: Math.max(0, ...m.members.map((x) => x.wikivoyageContentLength)),
      popularity: 0,
      refId: '',
    });
  }

  // 8. preliminary popularity (without image/description) to apply per-category caps before fetching text/images
  const prelim = computePopularity(
    drafts.map((d) => {
      const members = d.merged.members;
      return {
        pageviews: d.pageviews,
        sitelinks: d.sitelinks,
        tagCompleteness: tagCompleteness({
          hasWikipedia: Boolean(d.wikipediaTitle),
          hasWikidata: Boolean(d.merged.wikidataId),
          hasWebsite: members.some((x) => x.website),
          hasOpeningHours: members.some((x) => x.openingHours),
          hasPhone: members.some((x) => x.phone),
          hasAddress: members.some((x) => x.address),
          hasDescription: members.some((x) => x.description),
          hasImage: members.some((x) => x.imageFile),
        }),
        wikivoyageProminence: wikivoyageProminence(d.wvListed, d.wvContentLength),
      };
    })
  );
  drafts.forEach((d, i) => {
    d.popularity = prelim[i] as number;
  });
  const kept: Draft[] = [];
  for (const category of Object.keys(caps) as PlaceCategory[]) {
    const inCat = drafts
      .filter((d) => d.category === category)
      .sort((a, b) => b.popularity - a.popularity || a.merged.id.localeCompare(b.merged.id));
    kept.push(...inCat.slice(0, caps[category]));
  }

  // 9. text + images only for kept places
  const keptTitles = [...new Set(kept.map((d) => d.wikipediaTitle).filter((t): t is string => Boolean(t)))];
  let extracts: Record<string, string> = {};
  try {
    extracts = keptTitles.length > 0 ? await providers.wikipedia.summaries(keptTitles, { refresh }) : {};
  } catch (err) {
    warnings.push(`wikipedia-extracts failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const filesFor = (d: Draft): string[] => {
    const order: Record<string, number> = { wikipedia: 0, wikivoyage: 1, osm: 2 };
    const files = [...d.merged.members]
      .sort((x, y) => (order[x.origin] ?? 3) - (order[y.origin] ?? 3))
      .map((x) => x.imageFile);
    return [...new Set(files.filter((f): f is string => Boolean(f)))].slice(0, 3);
  };
  const destFile = dest.wikipediaTitle
    ? normalizeCommonsFile(details.get(dest.wikipediaTitle)?.imageFile)
    : null;
  const allFiles = [...new Set([...kept.flatMap(filesFor), ...(destFile ? [destFile] : [])])];
  let fileInfo: Record<string, CommonsFileInfo> = {};
  try {
    fileInfo = allFiles.length > 0 ? await providers.commons.fileInfo(allFiles, { refresh }) : {};
  } catch (err) {
    warnings.push(`commons failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  const toImage = (file: string | null | undefined): ImageInfo | null => {
    const info = file ? fileInfo[file] : undefined;
    if (!info) return null;
    return sanitizeImageObject({
      url: info.thumbUrl,
      author: info.author,
      license: info.license,
      licenseUrl: info.licenseUrl,
      sourceUrl: info.sourceUrl || null,
    });
  };

  // 10. final popularity (with image/description known), ranking, assembly
  const withText = kept.map((d) => {
    const members = d.merged.members;
    const extract = d.wikipediaTitle ? (extracts[d.wikipediaTitle] ?? null) : null;
    const image = firstNonNull(filesFor(d).map((f) => toImage(f)));
    return { d, extract, image };
  });
  const finalPop = computePopularity(
    withText.map(({ d, extract, image }) => {
      const members = d.merged.members;
      return {
        pageviews: d.pageviews,
        sitelinks: d.sitelinks,
        tagCompleteness: tagCompleteness({
          hasWikipedia: Boolean(d.wikipediaTitle),
          hasWikidata: Boolean(d.merged.wikidataId),
          hasWebsite: members.some((x) => x.website),
          hasOpeningHours: members.some((x) => x.openingHours),
          hasPhone: members.some((x) => x.phone),
          hasAddress: members.some((x) => x.address),
          hasDescription: Boolean(extract) || members.some((x) => x.description),
          hasImage: Boolean(image),
        }),
        wikivoyageProminence: wikivoyageProminence(d.wvListed, d.wvContentLength),
      };
    })
  );

  const usedRefs = new Set<string>();
  const places: PlaceInput[] = withText.map(({ d, extract, image }, i) => {
    const m = d.merged;
    const members = m.members;
    const wvM = members.find((x) => x.origin === 'wikivoyage');
    const osmM = members.find((x) => x.origin === 'osm');
    const wpM = members.find((x) => x.origin === 'wikipedia');
    const tracker = newTracker();

    // name
    const wikiTitleName = d.wikipediaTitle?.replace(/\s+\([^)]*\)$/, '') ?? null;
    let name = wvM?.name;
    if (name) tracker.add('wikivoyage', 'name');
    else if (wikiTitleName && (wpM || osmM?.wikipediaTitle)) {
      name = wikiTitleName;
      tracker.add('wikipedia', 'name');
    } else if (osmM) {
      name = osmM.name;
      tracker.add('osm', 'name');
    } else {
      name = (wpM ?? (members[0] as PlaceCandidate)).name;
      tracker.add('wikipedia', 'name');
    }

    // location
    const coordSource: SourceProvider = osmM
      ? 'osm'
      : wvM && !coordsFromWikipedia.has(wvM.key) && wvM.lat !== null
        ? 'wikivoyage'
        : 'wikipedia';
    tracker.add(coordSource, 'location');

    const pickField = <K extends 'address' | 'website' | 'openingHours'>(
      field: K,
      label: string
    ): string | null => {
      if (osmM?.[field]) {
        tracker.add('osm', label);
        return osmM[field];
      }
      if (wvM?.[field]) {
        tracker.add('wikivoyage', label);
        return wvM[field];
      }
      return null;
    };
    const address = pickField('address', 'address');
    const website = pickField('website', 'website');
    const openingHours = pickField('openingHours', 'opening_hours');

    // description: Wikipedia extract > Wikivoyage write-up > OSM description > Wikipedia short description
    let description: string | null = null;
    const shortDesc = d.wikipediaTitle ? (details.get(d.wikipediaTitle)?.description ?? null) : null;
    if (extract) {
      description = extract;
      tracker.add('wikipedia', 'description');
    } else if (wvM?.description) {
      description = wvM.description;
      tracker.add('wikivoyage', 'description');
    } else if (osmM?.description) {
      description = osmM.description;
      tracker.add('osm', 'description');
    } else if (shortDesc) {
      description = shortDesc;
      tracker.add('wikipedia', 'description');
    }

    const dietaryHints = osmM?.osmTags ? osmDietary(osmM.osmTags) : [];
    if (dietaryHints.length > 0) tracker.add('osm', 'dietary_hints');
    if (d.pageviews > 0) tracker.add('wikipedia', 'popularity');
    if (d.sitelinks > 0) tracker.add('wikidata', 'popularity');
    if (image) tracker.add('commons', 'image');
    tracker.add(osmM ? 'osm' : wvM ? 'wikivoyage' : 'wikipedia', 'category');

    // refId
    let refId = m.wikidataId
      ? `wd:${m.wikidataId}`
      : osmM?.osmRef
        ? (osmM.osmRef as string)
        : wvM
          ? `wv:${dest.slug}:${slugify(wvM.name)}`
          : `wp:${d.wikipediaTitle ? slugify(d.wikipediaTitle) : slugify(name)}`;
    if (usedRefs.has(refId)) refId = `${refId}~${i}`;
    usedRefs.add(refId);

    const sources: PlaceSource[] = [];
    for (const [provider, fieldSet] of tracker.fields) {
      let url: string | null = null;
      let ref: string | null = null;
      let license: string = LICENSES.wikipedia;
      if (provider === 'wikivoyage') {
        license = LICENSES.wikivoyage;
        url = wvM?.wikivoyagePage ? wikiUrl('en.wikivoyage.org', wvM.wikivoyagePage) : null;
      } else if (provider === 'wikipedia') {
        url = d.wikipediaTitle ? wikiUrl('en.wikipedia.org', d.wikipediaTitle) : null;
      } else if (provider === 'wikidata') {
        license = LICENSES.wikidata;
        ref = m.wikidataId;
        url = m.wikidataId ? `https://www.wikidata.org/wiki/${m.wikidataId}` : null;
      } else if (provider === 'osm') {
        license = LICENSES.osm;
        ref = osmM?.osmRef ?? null;
        const [, type, id] = (osmM?.osmRef ?? '').split(':');
        url = type && id ? `https://www.openstreetmap.org/${type}/${id}` : null;
      } else if (provider === 'commons') {
        license = image?.license ?? 'Wikimedia Commons';
        url = image?.sourceUrl ?? null;
      }
      sources.push({
        provider,
        fields: [...fieldSet].sort(),
        license,
        url,
        ref,
        retrievedAt: now,
      });
    }

    return {
      refId,
      destinationId: dest.id,
      name: toTitleCasePlaceName(name),
      nameLocal: osmM?.nameLocal ?? {},
      category: d.category,
      subtype: d.subtype,
      lat: m.lat,
      lng: m.lng,
      address,
      website,
      openingHours,
      description,
      whyVisit: null,
      typicalDurationMins: null,
      bestTime: null,
      dietaryHints,
      image,
      popularity: finalPop[i] as number,
      rankScore: 0,
      wikidataId: m.wikidataId,
      wikipediaTitle: d.wikipediaTitle,
      sources,
      fetchedAt: now,
    };
  });

  // diversity-aware ranking
  const ranked = rankWithDiversity(
    places.map((p) => ({ id: p.refId, category: p.category, subtype: p.subtype, popularity: p.popularity }))
  );
  const rankById = new Map(ranked.map((r) => [r.id, r.rankScore]));
  for (const p of places) p.rankScore = rankById.get(p.refId) ?? 0;
  places.sort((a, b) => b.rankScore - a.rankScore);

  // Phase 3 hook (no-op today)
  const enriched = await (options.enrich ?? enrichPlaces)(places, { destination: dest });

  // 11. destination profile (summary + hero image)
  let summary: string | null = null;
  let heroImage: ImageInfo | null = null;
  let wikidataId: string | null = dest.wikidataId;
  let wikipediaTitle: string | null = dest.wikipediaTitle;
  if (dest.wikipediaTitle) {
    const d = details.get(dest.wikipediaTitle);
    wikidataId = d?.wikidataId ?? wikidataId;
    wikipediaTitle = d?.title ?? wikipediaTitle;
    heroImage = toImage(destFile);
    try {
      const s = await providers.wikipedia.summaries([dest.wikipediaTitle], { refresh });
      summary = s[dest.wikipediaTitle] ?? null;
    } catch (err) {
      warnings.push(`destination summary failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const perCategory: Record<string, number> = {};
  for (const p of enriched) perCategory[p.category] = (perCategory[p.category] ?? 0) + 1;

  return {
    places: enriched,
    profile: { summary, heroImage, wikidataId, wikipediaTitle },
    stats: {
      total: enriched.length,
      perCategory,
      withImage: enriched.filter((p) => p.image).length,
      withDescription: enriched.filter((p) => p.description).length,
      droppedNoCoords,
      droppedJunk,
      mergedDuplicates,
      durationMs: Date.now() - started,
      providers: {
        wikivoyageListings: wv.listings.length,
        wikivoyagePages: wv.pages.length,
        wikipediaGeosearch: geoHits.length,
        overpassElements: osmElements.length,
        coordsAttachedByName: attachedByName,
      },
      warnings,
    },
    degraded: osmRes.status === 'rejected' || geoRes.status === 'rejected' || wvRes.status === 'rejected',
  };
}
