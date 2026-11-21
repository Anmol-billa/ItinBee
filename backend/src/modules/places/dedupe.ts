import { isMacroGeographicEntity } from './categorize.js';
import { haversineMeters, isValidLatLng } from './util/geo.js';
import { namesSimilar, normalizeName } from './util/text.js';
import type { PlaceCategory } from './types.js';

export type CandidateOrigin = 'wikivoyage' | 'wikipedia' | 'osm';

export interface PlaceCandidate {
  /** Unique within one build, e.g. "osm:node:123", "wv:Jaipur:Hawa Mahal", "wp:Hawa Mahal". */
  key: string;
  origin: CandidateOrigin;
  name: string;
  /** Alternative names (Wikivoyage `alt`, OSM name:en). Used only for matching. */
  altNames: string[];
  nameLocal: Record<string, string>;
  lat: number | null;
  lng: number | null;
  category: PlaceCategory | null;
  subtype: string | null;
  address: string | null;
  website: string | null;
  openingHours: string | null;
  phone: string | null;
  description: string | null;
  wikidataId: string | null;
  wikipediaTitle: string | null;
  imageFile: string | null;
  osmRef: string | null;
  osmTags: Record<string, string> | null;
  wikivoyageType: string | null;
  wikivoyagePage: string | null;
  wikivoyageContentLength: number;
}

export interface MergedCandidate {
  id: string;
  members: PlaceCandidate[];
  lat: number;
  lng: number;
  wikidataId: string | null;
}

export const DEDUPE_RADIUS_M = 150;
/** Larger radius when a point-of-interest from OSM meets an article centroid (Wikipedia/Wikivoyage) of the same name. */
export const DEDUPE_EXACT_NAME_RADIUS_M = 450;

class UnionFind {
  private readonly parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(x: number): number {
    let r = x;
    while (this.parent[r] !== r) r = this.parent[r] as number;
    let c = x;
    while (this.parent[c] !== r) {
      const next = this.parent[c] as number;
      this.parent[c] = r;
      c = next;
    }
    return r;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[rb] = ra;
  }
}

function allNames(c: PlaceCandidate): string[] {
  return [c.name, ...c.altNames].filter((n) => normalizeName(n).length > 0);
}

export function candidatesMatch(a: PlaceCandidate, b: PlaceCandidate): boolean {
  if (a.lat === null || a.lng === null || b.lat === null || b.lng === null) return false;
  if (a.wikidataId && b.wikidataId) return a.wikidataId === b.wikidataId;
  const dist = haversineMeters({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng });
  if (dist > DEDUPE_EXACT_NAME_RADIUS_M) return false;
  const mixedSources = a.origin !== b.origin && (a.origin !== 'osm' || b.origin !== 'osm');
  for (const na of allNames(a)) {
    for (const nb of allNames(b)) {
      if (dist <= DEDUPE_RADIUS_M && namesSimilar(na, nb)) return true;
      if (mixedSources && normalizeName(na) === normalizeName(nb)) return true;
    }
  }
  return false;
}

/** Grid-bucketed matching: groups candidates that share a wikidata id or have similar names within ~150 m. */
export function mergeCandidates(candidates: readonly PlaceCandidate[]): MergedCandidate[] {
  const located = candidates.filter(
    (c): c is PlaceCandidate & { lat: number; lng: number } =>
      c.lat !== null &&
      c.lng !== null &&
      isValidLatLng(c.lat, c.lng) &&
      !isMacroGeographicEntity(c.description, c.name, c.osmTags)
  );
  const uf = new UnionFind(located.length);

  const byWikidata = new Map<string, number>();
  located.forEach((c, i) => {
    if (!c.wikidataId) return;
    const prev = byWikidata.get(c.wikidataId);
    if (prev === undefined) byWikidata.set(c.wikidataId, i);
    else uf.union(prev, i);
  });

  const CELL = 0.005; // ~550 m
  const grid = new Map<string, number[]>();
  const cellOf = (lat: number, lng: number): [number, number] => [
    Math.floor(lat / CELL),
    Math.floor(lng / CELL),
  ];
  located.forEach((c, i) => {
    const [cy, cx] = cellOf(c.lat, c.lng);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        for (const j of grid.get(`${cy + dy}:${cx + dx}`) ?? []) {
          if (uf.find(i) === uf.find(j)) continue;
          if (candidatesMatch(c, located[j] as PlaceCandidate)) uf.union(i, j);
        }
      }
    }
    const key = `${cy}:${cx}`;
    const arr = grid.get(key);
    if (arr) arr.push(i);
    else grid.set(key, [i]);
  });

  const groups = new Map<number, PlaceCandidate[]>();
  located.forEach((c, i) => {
    const r = uf.find(i);
    const arr = groups.get(r);
    if (arr) arr.push(c);
    else groups.set(r, [c]);
  });

  const out: MergedCandidate[] = [];
  for (const members of groups.values()) {
    // precise coordinates: prefer OSM, then Wikipedia/Wikivoyage
    const geo =
      members.find((m) => m.origin === 'osm') ??
      members.find((m) => m.origin === 'wikipedia') ??
      (members[0] as PlaceCandidate);
    out.push({
      id: members.map((m) => m.key).sort()[0] as string,
      members,
      lat: geo.lat as number,
      lng: geo.lng as number,
      wikidataId: members.find((m) => m.wikidataId)?.wikidataId ?? null,
    });
  }
  return out;
}

/**
 * Gives coordinate-less Wikivoyage listings a location by matching the name to exactly one located candidate.
 * Returns the number of listings that stay unlocated (to be dropped).
 */
export function attachMissingCoordinates(candidates: PlaceCandidate[]): {
  attached: number;
  unresolved: PlaceCandidate[];
} {
  const located = candidates.filter((c) => c.lat !== null && c.lng !== null);
  const unresolved: PlaceCandidate[] = [];
  let attached = 0;
  for (const c of candidates) {
    if (c.lat !== null && c.lng !== null) continue;
    if (c.wikidataId) {
      const twin = located.find((l) => l.wikidataId === c.wikidataId);
      if (twin) {
        c.lat = twin.lat;
        c.lng = twin.lng;
        attached += 1;
        continue;
      }
    }
    const matches = located.filter((l) =>
      allNames(c).some((a) => allNames(l).some((b) => namesSimilar(a, b)))
    );
    if (matches.length === 1) {
      const m = matches[0] as PlaceCandidate;
      c.lat = m.lat;
      c.lng = m.lng;
      attached += 1;
    } else {
      unresolved.push(c);
    }
  }
  return { attached, unresolved };
}
