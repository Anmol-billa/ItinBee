import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FetchLike } from '../../src/modules/places/util/http.js';

const FIXTURE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/places');

export function fixturePath(name: string): string {
  return path.join(FIXTURE_DIR, name);
}

export function readFixture(name: string): string {
  return fs.readFileSync(fixturePath(name), 'utf8');
}

export function readJsonFixture<T = unknown>(name: string): T {
  return JSON.parse(readFixture(name)) as T;
}

interface WikiPageFixture {
  pageid: number;
  title: string;
  description?: string;
  pageimage?: string | null;
  thumbnail?: { source: string };
  pageprops?: { wikibase_item?: string };
  coordinates?: Array<{ lat: number; lon: number }>;
  pageviews?: Record<string, number | null>;
  extract?: string;
}

export interface FixtureFetch {
  fetch: FetchLike;
  /** Every request that reached the "network", as `METHOD host action-or-path`. */
  calls: string[];
  count(match: string): number;
  /** Make the next N calls whose label contains `match` fail with the given status. */
  failNext(match: string, status: number, times?: number): void;
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/**
 * A fake `fetch` that serves recorded-shape provider responses from test/fixtures/places.
 * Nothing in the test-suite ever touches the real network.
 */
export function createFixtureFetch(): FixtureFetch {
  const wikiPages = readJsonFixture<Record<string, WikiPageFixture>>('wikipedia-pages.json');
  const entities = readJsonFixture<Record<string, unknown>>('wikidata-entities.json');
  const commons = readJsonFixture<Record<string, unknown>>('commons-files.json');
  const calls: string[] = [];
  const failures: Array<{ match: string; status: number; left: number }> = [];

  const fetchImpl: FetchLike = async (input, init) => {
    const url = new URL(input);
    const p = url.searchParams;
    const method = (init?.method ?? 'GET').toUpperCase();
    const action = p.get('action') ?? p.get('list') ?? url.pathname;
    const label = `${method} ${url.host} ${action}${p.get('prop') ? `:${p.get('prop')}` : ''}${p.get('list') ? `:${p.get('list')}` : ''}`;
    calls.push(label);

    const failure = failures.find((f) => label.includes(f.match) && f.left > 0);
    if (failure) {
      failure.left -= 1;
      return new Response('upstream error', { status: failure.status });
    }

    switch (url.host) {
      case 'photon.komoot.io':
        return json(readJsonFixture('photon-jaip.json'));
      case 'api.openrouteservice.org':
        return json(readJsonFixture('ors-directions.json'));
      case 'en.wikivoyage.org': {
        const title = p.get('titles') ?? '';
        if (title.toLowerCase() !== 'jaipur') {
          return json({ query: { pages: [{ title, missing: true }] } });
        }
        return json({
          query: {
            pages: [
              {
                title: 'Jaipur',
                revisions: [{ slots: { main: { content: readFixture('wikivoyage-mini.wikitext') } } }],
              },
            ],
          },
        });
      }
      case 'en.wikipedia.org': {
        if (p.get('list') === 'geosearch') return json(readJsonFixture('wikipedia-geosearch.json'));
        const titles = (p.get('titles') ?? '').split('|').filter(Boolean);
        const prop = p.get('prop') ?? '';
        const pages = titles.map((t) => {
          const page = wikiPages[t];
          if (!page) return { title: t, missing: true };
          if (prop.includes('pageprops')) {
            return {
              pageid: page.pageid,
              title: page.title,
              description: page.description,
              pageimage: page.pageimage ?? undefined,
              thumbnail: page.thumbnail,
              pageprops: page.pageprops,
              coordinates: page.coordinates,
            };
          }
          if (prop.includes('pageviews')) return { title: page.title, pageviews: page.pageviews };
          if (prop.includes('extracts')) return { title: page.title, extract: page.extract };
          return { title: page.title };
        });
        return json({ query: { pages } });
      }
      case 'www.wikidata.org': {
        const ids = (p.get('ids') ?? '').split('|').filter(Boolean);
        const out: Record<string, unknown> = {};
        for (const id of ids) out[id] = entities[id] ?? { id, missing: '' };
        return json({ entities: out });
      }
      case 'commons.wikimedia.org': {
        const titles = (p.get('titles') ?? '').split('|').filter(Boolean);
        return json({
          query: {
            pages: titles.map((t) => {
              const f = commons[t] as { imageinfo?: unknown[] } | undefined;
              return f ? { title: t, ...f } : { title: t, missing: true };
            }),
          },
        });
      }
      case 'overpass-api.de':
      case 'overpass.private.coffee':
      case 'overpass.kumi.systems':
        return json(readJsonFixture('overpass-mini.json'));
      default:
        return new Response(`unexpected host in test: ${url.host}`, { status: 599 });
    }
  };

  return {
    fetch: fetchImpl,
    calls,
    count: (match) => calls.filter((c) => c.includes(match)).length,
    failNext: (match, status, times = 1) => {
      failures.push({ match, status, left: times });
    },
  };
}
