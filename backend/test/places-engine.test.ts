import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import {
  categorizeOsm,
  categorizeWikipedia,
  categorizeWikivoyage,
} from '../src/modules/places/categorize.js';
import {
  attachMissingCoordinates,
  mergeCandidates,
  type PlaceCandidate,
} from '../src/modules/places/dedupe.js';
import { estimateRoute } from '../src/modules/places/providers/openrouteservice.js';
import {
  computePopularity,
  rankWithDiversity,
  tagCompleteness,
  wikivoyageProminence,
  type RankInput,
} from '../src/modules/places/scoring.js';
import type { WikivoyageListing } from '../src/modules/places/providers/types.js';
import {
  namesSimilar,
  normalizeName,
  sanitizeImageObject,
  toTitleCasePlaceName,
} from '../src/modules/places/util/text.js';
import { decodePolyline, encodePolyline, haversineMeters } from '../src/modules/places/util/geo.js';
import { createSeededTestPlaces } from './helpers/places-env.js';

function cand(over: Partial<PlaceCandidate> & { key: string; name: string }): PlaceCandidate {
  return {
    origin: 'osm',
    altNames: [],
    nameLocal: {},
    lat: 26.92,
    lng: 75.82,
    category: 'sights',
    subtype: null,
    address: null,
    website: null,
    openingHours: null,
    phone: null,
    description: null,
    wikidataId: null,
    wikipediaTitle: null,
    imageFile: null,
    osmRef: null,
    osmTags: null,
    wikivoyageType: null,
    wikivoyagePage: null,
    wikivoyageContentLength: 0,
    ...over,
  };
}

describe('categorisation', () => {
  it('maps OSM tags to the ten categories and drops notability-free minor objects', () => {
    expect(categorizeOsm({ amenity: 'restaurant', name: 'x' })).toEqual({ category: 'food', subtype: 'restaurant' });
    expect(categorizeOsm({ amenity: 'cafe' })?.category).toBe('cafe');
    expect(categorizeOsm({ amenity: 'pub' })?.category).toBe('nightlife');
    expect(categorizeOsm({ tourism: 'hostel' })?.category).toBe('stay');
    expect(categorizeOsm({ tourism: 'museum' })?.category).toBe('culture');
    expect(categorizeOsm({ tourism: 'zoo' })?.category).toBe('activity');
    expect(categorizeOsm({ historic: 'fort' })?.category).toBe('sights');
    expect(categorizeOsm({ natural: 'waterfall' })?.category).toBe('nature');
    expect(categorizeOsm({ amenity: 'place_of_worship', wikidata: 'Q1' })?.category).toBe('spiritual');
    // junk: roadside shrine, plaque, tiny park without any signal
    expect(categorizeOsm({ amenity: 'place_of_worship' })).toBeNull();
    expect(categorizeOsm({ historic: 'memorial' })).toBeNull();
    expect(categorizeOsm({ leisure: 'park' })).toBeNull();
    expect(categorizeOsm({ leisure: 'park', website: 'https://park.example' })?.category).toBe('nature');
    expect(categorizeOsm({ highway: 'bus_stop' })).toBeNull();
  });

  it('classifies Wikipedia short descriptions by head noun and rejects non-places', () => {
    expect(categorizeWikipedia('Hill fort in Rajasthan, India', 'Nahargarh Fort')?.category).toBe('sights');
    expect(categorizeWikipedia('Hindu temple in Kyoto, Japan', 'Kinkaku-ji')?.category).toBe('spiritual');
    expect(categorizeWikipedia('Museum in Paris', 'Louvre')?.category).toBe('culture');
    expect(categorizeWikipedia('Public park in Lisbon', 'Eduardo VII Park')?.category).toBe('nature');
    expect(categorizeWikipedia('Railway station in Lisbon', 'Santa Apolónia')?.category).toBe('transport');
    expect(categorizeWikipedia('Theme park in Dubai', 'Motiongate')?.category).toBe('activity');
    expect(categorizeWikipedia('School in Jaipur, India', 'St. Xavier')).toBeNull();
    expect(categorizeWikipedia('Indian politician', 'Someone')).toBeNull();
    expect(categorizeWikipedia('Municipal corporation in Rajasthan', 'JMC')).toBeNull();
    expect(categorizeWikipedia(null, 'No description')).toBeNull();
  });

  it('classifies Wikivoyage listings by template type with keyword refinement', () => {
    const base: WikivoyageListing = {
      type: 'see',
      name: 'X',
      alt: null,
      lat: 1,
      lng: 1,
      address: null,
      url: null,
      hours: null,
      price: null,
      phone: null,
      content: null,
      wikidata: null,
      wikipedia: null,
      image: null,
      section: null,
      pageTitle: 'P',
    };
    expect(categorizeWikivoyage({ ...base, type: 'eat', name: 'Spice Kitchen' })?.category).toBe('food');
    expect(categorizeWikivoyage({ ...base, type: 'eat', name: 'Blue Tokai Coffee' })?.category).toBe('cafe');
    expect(categorizeWikivoyage({ ...base, type: 'drink', name: 'The Bar' })?.category).toBe('nightlife');
    expect(categorizeWikivoyage({ ...base, type: 'drink', name: 'Chai Point' })?.category).toBe('cafe');
    expect(categorizeWikivoyage({ ...base, type: 'sleep', name: 'Zostel Hostel' })).toEqual({ category: 'stay', subtype: 'hostel' });
    expect(categorizeWikivoyage({ ...base, type: 'buy', name: 'Johari Bazaar' })).toEqual({ category: 'activity', subtype: 'shopping' });
    expect(categorizeWikivoyage({ ...base, type: 'see', name: 'Jagdish Temple' })?.category).toBe('spiritual');
    expect(categorizeWikivoyage({ ...base, type: 'see', name: 'Albert Hall Museum' })?.category).toBe('culture');
    expect(categorizeWikivoyage({ ...base, type: 'see', name: 'Some Place' })?.category).toBe('sights');
    expect(categorizeWikivoyage({ ...base, type: 'do', name: 'Balloon ride' })?.category).toBe('activity');
    expect(categorizeWikivoyage({ ...base, type: 'listing', name: 'Unknown' })).toBeNull();
  });
});

describe('name matching and de-duplication', () => {
  it('normalises names and compares token sets', () => {
    expect(normalizeName('The Hawa Mahal (Palace of Winds)')).toBe('hawa mahal');
    expect(namesSimilar('Hotel Samode Haveli', 'Samode Haveli')).toBe(true);
    expect(namesSimilar('Albert Hall Museum', 'Albert Hall')).toBe(true);
    expect(namesSimilar('Jal Mahal', 'Hawa Mahal')).toBe(false);
    expect(namesSimilar('Café Zoe', 'Cafe Zoe')).toBe(true);
  });

  it('merges by wikidata id even when coordinates differ', () => {
    const merged = mergeCandidates([
      cand({ key: 'a', name: 'City Palace', origin: 'wikivoyage', lat: 26.925, lng: 75.823, wikidataId: 'Q5' }),
      cand({ key: 'b', name: 'Chandra Mahal Complex', origin: 'wikipedia', lat: 26.9258, lng: 75.8237, wikidataId: 'Q5' }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.members).toHaveLength(2);
    expect(merged[0]?.wikidataId).toBe('Q5');
  });

  it('merges similar names within 150 m but not beyond, and keeps different wikidata ids apart', () => {
    const near = mergeCandidates([
      cand({ key: 'a', name: 'Samode Haveli', origin: 'wikivoyage', lat: 26.9262, lng: 75.8279 }),
      cand({ key: 'b', name: 'Hotel Samode Haveli', origin: 'osm', lat: 26.92625, lng: 75.82795 }),
    ]);
    expect(near).toHaveLength(1);
    // OSM precision wins for coordinates
    expect(near[0]?.lat).toBeCloseTo(26.92625, 5);

    const far = mergeCandidates([
      cand({ key: 'a', name: 'Samode Haveli', origin: 'osm', lat: 26.9262, lng: 75.8279 }),
      cand({ key: 'b', name: 'Samode Haveli', origin: 'osm', lat: 26.9362, lng: 75.8279 }),
    ]);
    expect(far).toHaveLength(2);

    const differentIds = mergeCandidates([
      cand({ key: 'a', name: 'Fort', wikidataId: 'Q1' }),
      cand({ key: 'b', name: 'Fort', wikidataId: 'Q2' }),
    ]);
    expect(differentIds).toHaveLength(2);
  });

  it('merges an article centroid up to ~450 m from an OSM object only when names are identical', () => {
    const merged = mergeCandidates([
      cand({ key: 'a', name: 'Amber Fort', origin: 'wikipedia', lat: 26.9855, lng: 75.8513 }),
      cand({ key: 'b', name: 'Amber Fort', origin: 'osm', lat: 26.9885, lng: 75.8513 }), // ~330 m
    ]);
    expect(merged).toHaveLength(1);
    const notMerged = mergeCandidates([
      cand({ key: 'a', name: 'Amber Fort', origin: 'osm', lat: 26.9855, lng: 75.8513 }),
      cand({ key: 'b', name: 'Amber Fort', origin: 'osm', lat: 26.9885, lng: 75.8513 }),
    ]);
    expect(notMerged).toHaveLength(2);
  });

  it('gives coordinate-less listings a location only on a unique name match', () => {
    const list = [
      cand({ key: 'a', name: 'City Palace', origin: 'wikivoyage', lat: null, lng: null }),
      cand({ key: 'b', name: 'City Palace', origin: 'wikipedia', lat: 26.9258, lng: 75.8237 }),
      cand({ key: 'c', name: 'Mystery Haveli', origin: 'wikivoyage', lat: null, lng: null }),
      cand({ key: 'd', name: 'Twin Temple', origin: 'osm', lat: 26.9, lng: 75.8 }),
      cand({ key: 'e', name: 'Twin Temple', origin: 'osm', lat: 26.95, lng: 75.85 }),
      cand({ key: 'f', name: 'Twin Temple', origin: 'wikivoyage', lat: null, lng: null }),
    ];
    const { attached, unresolved } = attachMissingCoordinates(list);
    expect(attached).toBe(1);
    expect(list[0]?.lat).toBeCloseTo(26.9258, 4);
    expect(unresolved.map((u) => u.key).sort()).toEqual(['c', 'f']);
  });
});

describe('popularity and ranking', () => {
  it('log-scales pageviews/sitelinks, normalises per destination to [0,1] and is monotonic', () => {
    const pop = computePopularity([
      { pageviews: 100_000, sitelinks: 120, tagCompleteness: 0.8, wikivoyageProminence: 1 },
      { pageviews: 1_000, sitelinks: 10, tagCompleteness: 0.5, wikivoyageProminence: 0.5 },
      { pageviews: 0, sitelinks: 0, tagCompleteness: 0.2, wikivoyageProminence: 0 },
    ]);
    expect(pop[0]).toBe(1);
    expect(pop[0]!).toBeGreaterThan(pop[1]!);
    expect(pop[1]!).toBeGreaterThan(pop[2]!);
    for (const p of pop) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
    // log scaling: 10x the views is far less than 10x the score
    const a = computePopularity([
      { pageviews: 100, sitelinks: 0, tagCompleteness: 0, wikivoyageProminence: 0 },
      { pageviews: 1000, sitelinks: 0, tagCompleteness: 0, wikivoyageProminence: 0 },
    ]);
    expect(a[0]! / a[1]!).toBeGreaterThan(0.6);
    expect(computePopularity([])).toEqual([]);
    expect(computePopularity([{ pageviews: 0, sitelinks: 0, tagCompleteness: 0, wikivoyageProminence: 0 }])).toEqual([0]);
  });

  it('scores tag completeness and Wikivoyage prominence', () => {
    const none = tagCompleteness({ hasWikipedia: false, hasWikidata: false, hasWebsite: false, hasOpeningHours: false, hasPhone: false, hasAddress: false, hasDescription: false, hasImage: false });
    const all = tagCompleteness({ hasWikipedia: true, hasWikidata: true, hasWebsite: true, hasOpeningHours: true, hasPhone: true, hasAddress: true, hasDescription: true, hasImage: true });
    expect(none).toBe(0);
    expect(all).toBeCloseTo(1, 5);
    expect(wikivoyageProminence(false, 500)).toBe(0);
    expect(wikivoyageProminence(true, 0)).toBe(0.5);
    expect(wikivoyageProminence(true, 1000)).toBe(1);
  });

  it('interleaves categories and discounts repeated subtypes (diversity-aware ranking)', () => {
    const items: RankInput[] = [];
    for (let i = 0; i < 12; i += 1) {
      items.push({ id: `temple-${i}`, category: 'spiritual', subtype: 'temple', popularity: 0.9 - i * 0.01 });
    }
    for (let i = 0; i < 4; i += 1) {
      items.push({ id: `fort-${i}`, category: 'sights', subtype: i < 3 ? 'fort' : 'tower', popularity: 0.6 - i * 0.01 });
    }
    for (let i = 0; i < 3; i += 1) {
      items.push({ id: `cafe-${i}`, category: 'cafe', subtype: 'cafe', popularity: 0.3 - i * 0.01 });
    }
    const ranked = rankWithDiversity(items);
    expect(ranked).toHaveLength(items.length);
    expect(new Set(ranked.map((r) => r.id)).size).toBe(items.length);

    const top6 = ranked.slice(0, 6).map((r) => r.id.split('-')[0]);
    expect(new Set(top6).size).toBeGreaterThanOrEqual(3); // temples do not take all of the first page
    expect(top6.filter((c) => c === 'temple').length).toBeLessThanOrEqual(3);

    // scores strictly decrease along the ranking and stay in (0,1]
    for (let i = 1; i < ranked.length; i += 1) {
      expect(ranked[i]!.rankScore).toBeLessThan(ranked[i - 1]!.rankScore);
    }
    expect(ranked[0]!.rankScore).toBeLessThanOrEqual(1);
    expect(ranked.at(-1)!.rankScore).toBeGreaterThan(0);

    // within a category the original popularity order is preserved
    const temples = ranked.filter((r) => r.id.startsWith('temple')).map((r) => r.id);
    expect(temples).toEqual([...temples].sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1])));

    expect(rankWithDiversity([])).toEqual([]);
    // deterministic
    expect(rankWithDiversity(items)).toEqual(ranked);
  });
});

describe('geo utilities', () => {
  it('computes haversine distance and round-trips polyline5', () => {
    const d = haversineMeters({ lat: 26.9239, lng: 75.8267 }, { lat: 26.9258, lng: 75.8237 });
    expect(d).toBeGreaterThan(300);
    expect(d).toBeLessThan(400);
    const coords: Array<[number, number]> = [
      [75.8267, 26.9239],
      [75.8237, 26.9258],
      [-9.1393, 38.7223],
    ];
    const decoded = decodePolyline(encodePolyline(coords));
    expect(decoded).toHaveLength(3);
    decoded.forEach((c, i) => {
      expect(c[0]).toBeCloseTo(coords[i]![0], 4);
      expect(c[1]).toBeCloseTo(coords[i]![1], 4);
    });
    // reference vector from the polyline algorithm docs
    expect(encodePolyline([[-120.2, 38.5], [-120.95, 40.7], [-126.453, 43.252]])).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  });
});

describe('routing estimator, macro-geo hygiene, and 0ms starter POIs', () => {
  it('computes Kyoto walking distance (< 1.8km) and international road transit without India metro copy', async () => {
    // 1. Kyoto short walk: Gion -> Kiyomizu-dera (~1.3 km straight-line)
    const gion = { lat: 35.0037, lng: 135.7756 };
    const kiyomizu = { lat: 34.9949, lng: 135.7850 };
    const walkEst = estimateRoute('driving-car', [gion, kiyomizu]);
    expect(walkEst.profile).toBe('foot-walking');
    expect(walkEst.advisory).toBe('Estimated walking distance');
    expect(walkEst.distanceM).toBeGreaterThan(1400);
    expect(walkEst.distanceM).toBeLessThan(2100);

    // 2. Kyoto urban drive: Fushimi Inari -> Kinkaku-ji (~9.2 km straight-line, outside India bbox)
    const fushimi = { lat: 34.9671, lng: 135.7727 };
    const kinkaku = { lat: 35.0394, lng: 135.7292 };
    const kyotoRoad = estimateRoute('driving-car', [fushimi, kinkaku]);
    expect(kyotoRoad.profile).toBe('driving-car');
    expect(kyotoRoad.advisory).toBe('Estimated road transit');
    expect(kyotoRoad.advisory).not.toContain('Indian');

    // 3. Verify HTTP /v1/geo/route attribution for Kyoto never mentions India calibration
    const bundle = await buildApp({ forceLocalStore: true, logger: false });
    await bundle.app.ready();
    try {
      const routeRes = await bundle.app.inject({
        method: 'POST',
        url: '/v1/geo/route',
        payload: {
          profile: 'driving-car',
          coordinates: [gion, kiyomizu],
        },
      });
      expect(routeRes.statusCode).toBe(200);
      const body = routeRes.json() as {
        profile: string;
        advisory?: string;
        attribution: string;
      };
      expect(body.profile).toBe('foot-walking');
      expect(body.advisory).toBe('Estimated walking distance');
      expect(body.attribution).toContain('Estimated walking distance');
      expect(body.attribution).not.toContain('India');

      const kyotoDriveRes = await bundle.app.inject({
        method: 'POST',
        url: '/v1/geo/route',
        payload: {
          profile: 'driving-car',
          coordinates: [fushimi, kinkaku],
        },
      });
      expect(kyotoDriveRes.statusCode).toBe(200);
      expect(kyotoDriveRes.json().advisory).toBe('Estimated road transit');
      expect(kyotoDriveRes.body).not.toContain('Indian');
    } finally {
      await bundle.app.close();
    }
  });

  it('filters out macro-geographic entities (Western Ghats, Anaimalai Hills, states, provinces) while keeping national parks & viewpoints', () => {
    expect(categorizeWikipedia('Mountain range in India', 'Western Ghats')).toBeNull();
    expect(
      categorizeWikipedia('Mountain range in Kerala and Tamil Nadu, India', 'Anaimalai Hills')
    ).toBeNull();
    expect(categorizeWikipedia('State of India', 'Kerala')).toBeNull();
    expect(categorizeWikipedia('Province of Indonesia', 'Bali')).toBeNull();
    expect(categorizeWikipedia('Country in Southeast Asia', 'Vietnam')).toBeNull();
    expect(categorizeWikipedia('Continent', 'Asia')).toBeNull();

    // Visitable national parks and viewpoints remain classified
    expect(
      categorizeWikipedia('National park in Kerala, India', 'Eravikulam National Park')?.category
    ).toBe('nature');
    expect(
      categorizeWikipedia('Tourist viewpoint in Munnar, Kerala', 'Top Station Viewpoint')?.category
    ).toBe('nature');

    // Title casing & empty image URL hygiene
    expect(toTitleCasePlaceName('hanoi')).toBe('Hanoi');
    expect(toTitleCasePlaceName('north goa')).toBe('North Goa');
    expect(sanitizeImageObject({ url: '' })).toBeNull();
    expect(sanitizeImageObject({ url: '   ' })).toBeNull();
    expect(
      sanitizeImageObject({ url: 'https://upload.wikimedia.org/wikipedia/commons/test.jpg' })?.url
    ).toBe('https://upload.wikimedia.org/wikipedia/commons/test.jpg');
  });

  it('serves >= 6 verified starter POIs in 0ms (zero upstream HTTP calls) across all 20 high-traffic slugs', async () => {
    const enqueuedSlugs: string[] = [];
    const t = await createSeededTestPlaces(
      {},
      {
        enqueuePackJob: async (payload) => {
          enqueuedSlugs.push(payload.slug);
          return `pack:${payload.slug}`;
        },
      }
    );
    const requiredSlugs = [
      'jaipur',
      'udaipur',
      'jodhpur',
      'munnar',
      'kochi',
      'alleppey',
      'north-goa',
      'kyoto',
      'tokyo',
      'bali',
      'dubai',
      'singapore',
      'bangkok',
      'shimla',
      'darjeeling',
      'gangtok',
      'pondicherry',
      'mysuru',
      'ooty',
      'coorg',
    ];

    try {
      for (const slug of requiredSlugs) {
        const dest = await t.repo.getDestinationBySlug(slug);
        expect(dest, `missing destination seed for ${slug}`).not.toBeNull();
        const res = await t.services.places.listPlaces(dest!, { limit: 20 });
        expect(res.places.length, `expected >= 6 starter POIs for ${slug}`).toBeGreaterThanOrEqual(6);
        for (const row of res.places) {
          expect(row.place.name[0]).toBe(row.place.name[0]?.toUpperCase());
          if (row.place.image !== null) {
            expect(row.place.image.url).toMatch(/^https?:\/\/\S+/);
          }
        }
      }
      // Because every slug had >= 6 starter POIs, listPlaces did not block on Wikipedia liveNearby!
      expect(t.fx.calls).toHaveLength(0);
    } finally {
      await t.services.close();
    }
  });
});
