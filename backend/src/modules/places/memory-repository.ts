import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { haversineMeters } from './util/geo.js';
import type {
  DestinationProfilePatch,
  PackFinishInput,
  PlacesRepository,
} from './repository.js';
import type {
  DestinationFilter,
  DestinationRecord,
  DestinationSeed,
  PlaceInput,
  PlaceQuery,
  PlaceQueryResult,
  PlaceRecord,
} from './types.js';

interface PersistedShape {
  version: 1;
  destinations: DestinationRecord[];
  places: PlaceRecord[];
}

export interface InMemoryPlacesOptions {
  persistFilePath?: string;
  now?: () => Date;
}

export function placeSortComparator(a: PlaceRecord, b: PlaceRecord): number {
  return (
    b.rankScore - a.rankScore ||
    b.popularity - a.popularity ||
    a.name.localeCompare(b.name) ||
    a.id.localeCompare(b.id)
  );
}

export class InMemoryPlacesRepository implements PlacesRepository {
  readonly kind = 'memory' as const;
  private destinations = new Map<string, DestinationRecord>();
  private slugIndex = new Map<string, string>();
  /** key: `${destinationId}\u0000${refId}` */
  private places = new Map<string, PlaceRecord>();
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(private readonly options: InMemoryPlacesOptions = {}) {
    const file = options.persistFilePath;
    if (file && fs.existsSync(file)) {
      try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8')) as PersistedShape;
        for (const d of data.destinations) {
          this.destinations.set(d.id, d);
          this.slugIndex.set(d.slug, d.id);
        }
        for (const p of data.places) this.places.set(this.placeKey(p.destinationId, p.refId), p);
      } catch {
        // unreadable persistence file: start empty
      }
    }
  }

  private now(): Date {
    return this.options.now ? this.options.now() : new Date();
  }

  private placeKey(destinationId: string, refId: string): string {
    return `${destinationId}\u0000${refId}`;
  }

  private scheduleFlush(): void {
    if (!this.options.persistFilePath || this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushNow();
    }, 300);
    this.flushTimer.unref();
  }

  private flushNow(): void {
    const file = this.options.persistFilePath;
    if (!file) return;
    const data: PersistedShape = {
      version: 1,
      destinations: [...this.destinations.values()],
      places: [...this.places.values()],
    };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(data));
    fs.renameSync(`${file}.tmp`, file);
  }

  async upsertDestinations(seeds: readonly DestinationSeed[]): Promise<void> {
    // two passes so that parents may appear after children in the seed list
    for (const s of seeds) {
      const existingId = this.slugIndex.get(s.slug);
      const existing = existingId ? this.destinations.get(existingId) : undefined;
      if (existing) {
        existing.name = s.name;
        existing.kind = s.kind;
        existing.countryCode = s.countryCode;
        existing.lat = s.lat;
        existing.lng = s.lng;
        existing.aliases = s.aliases ?? existing.aliases;
        existing.wikipediaTitle = s.wikipediaTitle ?? existing.wikipediaTitle;
        existing.wikivoyageTitle = s.wikivoyageTitle ?? existing.wikivoyageTitle;
        existing.wikidataId = s.wikidataId ?? existing.wikidataId;
        existing.bestMonths = s.bestMonths ?? existing.bestMonths;
      } else {
        const id = crypto.randomUUID();
        const rec: DestinationRecord = {
          id,
          slug: s.slug,
          name: s.name,
          kind: s.kind,
          parentId: null,
          countryCode: s.countryCode,
          lat: s.lat,
          lng: s.lng,
          aliases: s.aliases ?? [],
          wikidataId: s.wikidataId ?? null,
          wikipediaTitle: s.wikipediaTitle ?? null,
          wikivoyageTitle: s.wikivoyageTitle ?? null,
          summary: null,
          bestMonths: s.bestMonths ?? [],
          heroImage: null,
          packStatus: 'none',
          packBuiltAt: null,
          packStartedAt: null,
          packAttemptedAt: null,
          packError: null,
          packStats: {},
        };
        this.destinations.set(id, rec);
        this.slugIndex.set(s.slug, id);
      }
    }
    for (const s of seeds) {
      const id = this.slugIndex.get(s.slug);
      const rec = id ? this.destinations.get(id) : undefined;
      if (!rec) continue;
      const parentId = s.parentSlug ? (this.slugIndex.get(s.parentSlug) ?? null) : null;
      rec.parentId = parentId;
    }
    this.scheduleFlush();
  }

  async listDestinations(filter: DestinationFilter = {}): Promise<DestinationRecord[]> {
    const q = filter.q?.trim().toLowerCase();
    const parentId =
      filter.parentSlug === undefined
        ? undefined
        : filter.parentSlug === null
          ? null
          : (this.slugIndex.get(filter.parentSlug) ?? '__missing__');
    const out = [...this.destinations.values()].filter((d) => {
      if (filter.kind && d.kind !== filter.kind) return false;
      if (filter.countryCode && d.countryCode !== filter.countryCode.toUpperCase()) return false;
      if (parentId !== undefined && d.parentId !== parentId) return false;
      if (q) {
        const hay = [d.name, d.slug, ...d.aliases].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return out.sort((a, b) => a.name.localeCompare(b.name)).map((d) => ({ ...d }));
  }

  async getDestinationBySlug(slug: string): Promise<DestinationRecord | null> {
    const id = this.slugIndex.get(slug);
    const d = id ? this.destinations.get(id) : undefined;
    return d ? { ...d } : null;
  }

  async getDestinationById(id: string): Promise<DestinationRecord | null> {
    const d = this.destinations.get(id);
    return d ? { ...d } : null;
  }

  async listChildren(parentId: string): Promise<DestinationRecord[]> {
    return [...this.destinations.values()]
      .filter((d) => d.parentId === parentId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((d) => ({ ...d }));
  }

  async updateDestinationProfile(id: string, patch: DestinationProfilePatch): Promise<void> {
    const d = this.destinations.get(id);
    if (!d) return;
    if (patch.summary !== undefined) d.summary = patch.summary;
    if (patch.heroImage !== undefined) d.heroImage = patch.heroImage;
    if (patch.wikidataId !== undefined) d.wikidataId = patch.wikidataId;
    if (patch.wikipediaTitle !== undefined) d.wikipediaTitle = patch.wikipediaTitle;
    this.scheduleFlush();
  }

  async tryBeginPackBuild(
    id: string,
    options: { force: boolean; lockTimeoutMs: number; now?: Date }
  ): Promise<boolean> {
    const d = this.destinations.get(id);
    if (!d) return false;
    const now = options.now ?? this.now();
    if (d.packStatus === 'building') {
      const started = d.packStartedAt ? Date.parse(d.packStartedAt) : 0;
      if (now.getTime() - started < options.lockTimeoutMs) return false;
    } else if (d.packStatus === 'ready' && !options.force) {
      return false;
    }
    d.packStatus = 'building';
    d.packStartedAt = now.toISOString();
    d.packAttemptedAt = now.toISOString();
    d.packError = null;
    this.scheduleFlush();
    return true;
  }

  async finishPackBuild(id: string, input: PackFinishInput): Promise<void> {
    const d = this.destinations.get(id);
    if (!d) return;
    d.packStatus = input.status;
    d.packStartedAt = null;
    d.packError = input.error ?? null;
    if (input.builtAt !== undefined) d.packBuiltAt = input.builtAt;
    if (input.stats) d.packStats = input.stats;
    this.scheduleFlush();
  }

  async upsertPlaces(
    destinationId: string,
    places: readonly PlaceInput[],
    options: { pruneMissing?: boolean; removeRefIds?: readonly string[] } = {}
  ): Promise<number> {
    const fetchedAt = this.now().toISOString();
    const keep = new Set<string>();
    for (const p of places) {
      const key = this.placeKey(destinationId, p.refId);
      keep.add(key);
      const prev = this.places.get(key);
      const rec: PlaceRecord = {
        ...p,
        id: prev?.id ?? crypto.randomUUID(),
        destinationId,
        whyVisit: p.whyVisit ?? prev?.whyVisit ?? null,
        typicalDurationMins: p.typicalDurationMins ?? prev?.typicalDurationMins ?? null,
        bestTime: p.bestTime ?? prev?.bestTime ?? null,
        dietaryHints: p.dietaryHints.length > 0 ? p.dietaryHints : (prev?.dietaryHints ?? []),
        fetchedAt: p.fetchedAt ?? fetchedAt,
      };
      this.places.set(key, rec);
    }
    for (const refId of options.removeRefIds ?? []) {
      this.places.delete(this.placeKey(destinationId, refId));
    }
    if (options.pruneMissing) {
      for (const [key, rec] of this.places) {
        if (rec.destinationId !== destinationId || keep.has(key)) continue;
        if (rec.sources.some((s) => s.provider === 'curated')) continue;
        this.places.delete(key);
      }
    }
    this.scheduleFlush();
    return places.length;
  }

  async queryPlaces(query: PlaceQuery): Promise<PlaceQueryResult> {
    const ids = new Set(query.destinationIds);
    const q = query.q?.trim().toLowerCase();
    const rows: Array<{ place: PlaceRecord; distanceM: number | null }> = [];
    for (const p of this.places.values()) {
      if (!ids.has(p.destinationId)) continue;
      if (query.category && p.category !== query.category) continue;
      if (q && !p.name.toLowerCase().includes(q)) continue;
      if (query.bbox) {
        const b = query.bbox;
        if (p.lat < b.minLat || p.lat > b.maxLat || p.lng < b.minLng || p.lng > b.maxLng) continue;
      }
      let distanceM: number | null = null;
      if (query.near) {
        distanceM = haversineMeters(query.near, p);
        if (distanceM > query.near.radiusM) continue;
      }
      rows.push({ place: p, distanceM });
    }
    rows.sort((a, b) => placeSortComparator(a.place, b.place));
    return {
      total: rows.length,
      rows: rows.slice(query.offset, query.offset + query.limit).map((r) => ({
        place: { ...r.place },
        distanceM: r.distanceM,
      })),
    };
  }

  async countPlacesByCategory(destinationIds: string[]): Promise<Record<string, number>> {
    const ids = new Set(destinationIds);
    const out: Record<string, number> = {};
    for (const p of this.places.values()) {
      if (!ids.has(p.destinationId)) continue;
      out[p.category] = (out[p.category] ?? 0) + 1;
    }
    return out;
  }

  async getPlaceByRef(destinationId: string, refId: string): Promise<PlaceRecord | null> {
    const p = this.places.get(this.placeKey(destinationId, refId));
    return p ? { ...p } : null;
  }

  async close(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flushNow();
  }
}
