import type { AppEnv } from '../../config/env.js';
import { CURATED_OPEN_POIS } from '../geo/curated-india-pois.js';
import { getTemplatePoiCatalog } from '../explore/template-catalog.js';
import type { PlacesServices } from '../places/places-module.js';
import { STARTER_OPEN_POIS } from '../places/seed/starter-pois.js';
import type { DestinationRecord } from '../places/types.js';
import { haversineMeters } from '../places/util/geo.js';
import { namesSimilar, normalizeName, toTitleCasePlaceName } from '../places/util/text.js';
import { resolveDoorToDoorJourney } from '../transit/corridor-service.js';
import {
  dedupeMustInclude,
  type IntentDestination,
  type IntentMustInclude,
  type TripIntent,
} from './intent.js';
import type { LlmProvider } from './llm/types.js';

export interface GazetteerTown {
  key: string;
  aliases: string[];
  name: string;
  country: string;
  countryCode: string;
  lat: number;
  lng: number;
  /** Nearest / parent destination slug in destinations.json when applicable. */
  destinationSlug?: string;
}

export const TOWN_GAZETTEER: readonly GazetteerTown[] = [
  // Himachal & Uttarakhand
  { key: 'kasol', aliases: ['parvati valley', 'chalal'], name: 'Kasol', country: 'India', countryCode: 'IN', lat: 32.01, lng: 77.315, destinationSlug: 'himachal-pradesh' },
  { key: 'tosh', aliases: ['kalga', 'pulga', 'barshaini'], name: 'Tosh', country: 'India', countryCode: 'IN', lat: 32.0175, lng: 77.4548, destinationSlug: 'himachal-pradesh' },
  { key: 'bir', aliases: ['bir billing', 'billing'], name: 'Bir', country: 'India', countryCode: 'IN', lat: 32.0467, lng: 76.7219, destinationSlug: 'dharamshala' },
  { key: 'mcleodganj', aliases: ['mcleod ganj', 'dharamkot', 'bhagsu'], name: 'McLeodganj', country: 'India', countryCode: 'IN', lat: 32.2426, lng: 76.3213, destinationSlug: 'dharamshala' },
  { key: 'solang', aliases: ['solang valley', 'sissu', 'atal tunnel'], name: 'Solang Valley', country: 'India', countryCode: 'IN', lat: 32.3166, lng: 77.1575, destinationSlug: 'manali' },
  { key: 'kaza', aliases: ['kibber', 'langza', 'tabo', 'dhankar'], name: 'Kaza', country: 'India', countryCode: 'IN', lat: 32.2276, lng: 78.0715, destinationSlug: 'spiti-valley' },
  { key: 'kalpa', aliases: ['kinnaur', 'sangla', 'chitkul'], name: 'Kalpa', country: 'India', countryCode: 'IN', lat: 31.5326, lng: 78.2528, destinationSlug: 'himachal-pradesh' },
  { key: 'mashobra', aliases: ['kufri', 'narkanda', 'chail'], name: 'Mashobra', country: 'India', countryCode: 'IN', lat: 31.1319, lng: 77.2294, destinationSlug: 'shimla' },
  { key: 'dalhousie', aliases: ['khajjiar'], name: 'Dalhousie', country: 'India', countryCode: 'IN', lat: 32.5387, lng: 75.971, destinationSlug: 'himachal-pradesh' },
  { key: 'haridwar', aliases: ['har ki pauri'], name: 'Haridwar', country: 'India', countryCode: 'IN', lat: 29.9457, lng: 78.1642, destinationSlug: 'rishikesh' },
  { key: 'auli', aliases: ['joshimath', 'chopta', 'tungnath'], name: 'Auli', country: 'India', countryCode: 'IN', lat: 30.5286, lng: 79.5603, destinationSlug: 'uttarakhand' },
  { key: 'jim-corbett', aliases: ['corbett', 'ramnagar', 'mukteshwar', 'bhimtal'], name: 'Jim Corbett', country: 'India', countryCode: 'IN', lat: 29.53, lng: 78.7747, destinationSlug: 'nainital' },

  // Kashmir & Ladakh
  { key: 'srinagar', aliases: ['kashmir', 'dal lake'], name: 'Srinagar', country: 'India', countryCode: 'IN', lat: 34.0837, lng: 74.7973, destinationSlug: 'india' },
  { key: 'gulmarg', aliases: ['kongdoori'], name: 'Gulmarg', country: 'India', countryCode: 'IN', lat: 34.0484, lng: 74.3805, destinationSlug: 'india' },
  { key: 'pahalgam', aliases: ['betaab valley', 'aru valley', 'sonamarg'], name: 'Pahalgam', country: 'India', countryCode: 'IN', lat: 34.0161, lng: 75.315, destinationSlug: 'india' },
  { key: 'nubra-valley', aliases: ['nubra', 'hunder', 'diskit', 'turtuk'], name: 'Nubra Valley', country: 'India', countryCode: 'IN', lat: 34.5858, lng: 77.4694, destinationSlug: 'ladakh' },
  { key: 'pangong', aliases: ['pangong tso', 'pangong lake', 'spangmik'], name: 'Pangong Tso', country: 'India', countryCode: 'IN', lat: 33.9114, lng: 78.4312, destinationSlug: 'ladakh' },

  // Goa, West & Rajasthan
  { key: 'agonda', aliases: ['canacona'], name: 'Agonda', country: 'India', countryCode: 'IN', lat: 15.0447, lng: 73.9859, destinationSlug: 'south-goa' },
  { key: 'palolem', aliases: ['patnem', 'cabo de rama'], name: 'Palolem', country: 'India', countryCode: 'IN', lat: 15.01, lng: 74.0232, destinationSlug: 'south-goa' },
  { key: 'panjim', aliases: ['panaji', 'fontainhas', 'old goa'], name: 'Panjim', country: 'India', countryCode: 'IN', lat: 15.4909, lng: 73.8278, destinationSlug: 'goa' },
  { key: 'assagao', aliases: ['siolim', 'morjim', 'ashwem', 'mandrem', 'arambol'], name: 'Assagao', country: 'India', countryCode: 'IN', lat: 15.5957, lng: 73.7852, destinationSlug: 'north-goa' },
  { key: 'rann-of-kutch', aliases: ['kutch', 'white rann', 'dhordo', 'bhuj'], name: 'Rann of Kutch', country: 'India', countryCode: 'IN', lat: 23.8289, lng: 69.5214, destinationSlug: 'india' },
  { key: 'ahmedabad', aliases: ['amdavad', 'sabarmati'], name: 'Ahmedabad', country: 'India', countryCode: 'IN', lat: 23.0225, lng: 72.5714, destinationSlug: 'india' },
  { key: 'dwarka', aliases: ['somnath', 'gir'], name: 'Dwarka', country: 'India', countryCode: 'IN', lat: 22.2442, lng: 68.9685, destinationSlug: 'india' },
  { key: 'lonavala', aliases: ['mahabaleshwar', 'alibaug', 'pune', 'nashik'], name: 'Lonavala', country: 'India', countryCode: 'IN', lat: 18.7557, lng: 73.4091, destinationSlug: 'maharashtra' },
  { key: 'osian', aliases: [], name: 'Osian', country: 'India', countryCode: 'IN', lat: 26.7258, lng: 72.9056, destinationSlug: 'jodhpur' },
  { key: 'ranakpur', aliases: ['kumbhalgarh', 'mount abu', 'bundi', 'bikaner', 'ranthambore', 'sawai madhopur'], name: 'Ranakpur', country: 'India', countryCode: 'IN', lat: 25.1154, lng: 73.4728, destinationSlug: 'rajasthan' },

  // North & Central
  { key: 'fatehpur-sikri', aliases: [], name: 'Fatehpur Sikri', country: 'India', countryCode: 'IN', lat: 27.0945, lng: 77.6679, destinationSlug: 'agra' },
  { key: 'prayagraj', aliases: ['allahabad', 'triveni sangam'], name: 'Prayagraj', country: 'India', countryCode: 'IN', lat: 25.4358, lng: 81.8463, destinationSlug: 'uttar-pradesh' },
  { key: 'sarnath', aliases: [], name: 'Sarnath', country: 'India', countryCode: 'IN', lat: 25.3809, lng: 83.0245, destinationSlug: 'varanasi' },
  { key: 'mathura', aliases: ['vrindavan'], name: 'Vrindavan', country: 'India', countryCode: 'IN', lat: 27.5797, lng: 77.6964, destinationSlug: 'uttar-pradesh' },
  { key: 'lucknow', aliases: [], name: 'Lucknow', country: 'India', countryCode: 'IN', lat: 26.8467, lng: 80.9462, destinationSlug: 'uttar-pradesh' },
  { key: 'chandigarh', aliases: [], name: 'Chandigarh', country: 'India', countryCode: 'IN', lat: 30.7333, lng: 76.7794, destinationSlug: 'punjab' },
  { key: 'khajuraho', aliases: ['orchha', 'bhopal', 'ujjain', 'indore'], name: 'Khajuraho', country: 'India', countryCode: 'IN', lat: 24.8318, lng: 79.9199, destinationSlug: 'india' },

  // South India
  { key: 'kumarakom', aliases: ['marari', 'kuttanad'], name: 'Kumarakom', country: 'India', countryCode: 'IN', lat: 9.6175, lng: 76.4301, destinationSlug: 'alleppey' },
  { key: 'varkala', aliases: ['kovalam', 'trivandrum', 'thiruvananthapuram', 'poovar'], name: 'Varkala', country: 'India', countryCode: 'IN', lat: 8.7379, lng: 76.7163, destinationSlug: 'kerala' },
  { key: 'thekkady', aliases: ['periyar', 'vagamon'], name: 'Thekkady', country: 'India', countryCode: 'IN', lat: 9.6031, lng: 77.1615, destinationSlug: 'kerala' },
  { key: 'wayanad', aliases: ['kalpetta', 'kozhikode'], name: 'Wayanad', country: 'India', countryCode: 'IN', lat: 11.6854, lng: 76.132, destinationSlug: 'kerala' },
  { key: 'coorg', aliases: ['madikeri', 'kodagu', 'virajpet', 'kushalnagar'], name: 'Coorg', country: 'India', countryCode: 'IN', lat: 12.4244, lng: 75.7382, destinationSlug: 'coorg' },
  { key: 'gokarna', aliases: ['om beach', 'kudle beach', 'murudeshwar'], name: 'Gokarna', country: 'India', countryCode: 'IN', lat: 14.5479, lng: 74.3188, destinationSlug: 'karnataka' },
  { key: 'chikmagalur', aliases: ['chikkamagaluru', 'kabini', 'udupi'], name: 'Chikmagalur', country: 'India', countryCode: 'IN', lat: 13.3161, lng: 75.772, destinationSlug: 'karnataka' },
  { key: 'ooty', aliases: ['udagamandalam', 'udhagamandalam', 'nilgiris'], name: 'Ooty', country: 'India', countryCode: 'IN', lat: 11.4102, lng: 76.695, destinationSlug: 'ooty' },
  { key: 'coonoor', aliases: ['kotagiri'], name: 'Coonoor', country: 'India', countryCode: 'IN', lat: 11.353, lng: 76.7959, destinationSlug: 'india' },
  { key: 'kodaikanal', aliases: ['madurai', 'rameswaram', 'kanyakumari', 'thanjavur', 'chennai', 'mahabalipuram'], name: 'Kodaikanal', country: 'India', countryCode: 'IN', lat: 10.2381, lng: 77.4892, destinationSlug: 'india' },
  { key: 'auroville', aliases: [], name: 'Auroville', country: 'India', countryCode: 'IN', lat: 12.0069, lng: 79.8106, destinationSlug: 'pondicherry' },
  { key: 'hyderabad', aliases: ['visakhapatnam', 'vizag', 'araku', 'tirupati'], name: 'Hyderabad', country: 'India', countryCode: 'IN', lat: 17.385, lng: 78.4867, destinationSlug: 'india' },

  // East, Northeast & Islands
  { key: 'dawki', aliases: ['shnongpdeng', 'mawlynnong', 'nongriat'], name: 'Dawki', country: 'India', countryCode: 'IN', lat: 25.1842, lng: 92.0197, destinationSlug: 'meghalaya' },
  { key: 'kaziranga', aliases: ['guwahati', 'majuli', 'assam', 'tawang'], name: 'Kaziranga', country: 'India', countryCode: 'IN', lat: 26.5775, lng: 93.1711, destinationSlug: 'india' },
  { key: 'lachung', aliases: ['lachen', 'yumthang', 'pelling', 'tsomgo', 'nathula'], name: 'Lachung', country: 'India', countryCode: 'IN', lat: 27.6891, lng: 88.7429, destinationSlug: 'sikkim' },
  { key: 'kalimpong', aliases: ['kurseong', 'sundarbans', 'shantiniketan'], name: 'Kalimpong', country: 'India', countryCode: 'IN', lat: 27.066, lng: 88.4695, destinationSlug: 'west-bengal' },
  { key: 'puri', aliases: ['konark', 'bhubaneswar', 'odisha'], name: 'Puri', country: 'India', countryCode: 'IN', lat: 19.8135, lng: 85.8312, destinationSlug: 'india' },
  { key: 'neil-island', aliases: ['shaheed dweep', 'neil'], name: 'Neil Island', country: 'India', countryCode: 'IN', lat: 11.8322, lng: 93.0419, destinationSlug: 'havelock' },
  { key: 'lakshadweep', aliases: ['agatti', 'bangaram'], name: 'Agatti Island', country: 'India', countryCode: 'IN', lat: 10.8569, lng: 72.1942, destinationSlug: 'india' },

  // International sub-destinations
  { key: 'krabi', aliases: ['ao nang', 'railay'], name: 'Krabi', country: 'Thailand', countryCode: 'TH', lat: 8.0863, lng: 98.9063, destinationSlug: 'phuket' },
  { key: 'phi-phi', aliases: ['koh phi phi', 'phi phi islands'], name: 'Koh Phi Phi', country: 'Thailand', countryCode: 'TH', lat: 7.7407, lng: 98.7784, destinationSlug: 'phuket' },
  { key: 'koh-samui', aliases: ['samui', 'koh phangan', 'pattaya'], name: 'Koh Samui', country: 'Thailand', countryCode: 'TH', lat: 9.512, lng: 100.0136, destinationSlug: 'thailand' },
  { key: 'ninh-binh', aliases: ['tam coc', 'trang an', 'sapa', 'sa pa'], name: 'Ninh Binh', country: 'Vietnam', countryCode: 'VN', lat: 20.2506, lng: 105.9745, destinationSlug: 'hanoi' },
  { key: 'ho-chi-minh', aliases: ['ho chi minh city', 'saigon', 'phu quoc'], name: 'Ho Chi Minh City', country: 'Vietnam', countryCode: 'VN', lat: 10.8231, lng: 106.6297, destinationSlug: 'vietnam' },
  { key: 'uluwatu', aliases: ['nusa penida', 'nusa dua', 'jimbaran'], name: 'Uluwatu', country: 'Indonesia', countryCode: 'ID', lat: -8.8291, lng: 115.0849, destinationSlug: 'bali' },
  { key: 'nara', aliases: ['uji'], name: 'Nara', country: 'Japan', countryCode: 'JP', lat: 34.6851, lng: 135.8048, destinationSlug: 'kyoto' },
  { key: 'osaka', aliases: ['dotonbori'], name: 'Osaka', country: 'Japan', countryCode: 'JP', lat: 34.6937, lng: 135.5023, destinationSlug: 'kyoto' },
  { key: 'kawaguchiko', aliases: ['mt fuji', 'mount fuji', 'hakone'], name: 'Lake Kawaguchiko', country: 'Japan', countryCode: 'JP', lat: 35.4982, lng: 138.7686, destinationSlug: 'tokyo' },
  { key: 'sintra', aliases: ['cascais', 'porto'], name: 'Sintra', country: 'Portugal', countryCode: 'PT', lat: 38.8029, lng: -9.3817, destinationSlug: 'lisbon' },
  { key: 'abu-dhabi', aliases: ['yas island'], name: 'Abu Dhabi', country: 'United Arab Emirates', countryCode: 'AE', lat: 24.4539, lng: 54.3773, destinationSlug: 'united-arab-emirates' },
  { key: 'cappadocia', aliases: ['goreme', 'antalya'], name: 'Cappadocia', country: 'Turkey', countryCode: 'TR', lat: 38.6431, lng: 34.8289, destinationSlug: 'turkey' },
  { key: 'florence', aliases: ['firenze', 'venice', 'venezia', 'milan', 'amalfi'], name: 'Florence', country: 'Italy', countryCode: 'IT', lat: 43.7696, lng: 11.2558, destinationSlug: 'italy' },
];

const COUNTRY_BY_CODE: Record<string, string> = {
  IN: 'India',
  TH: 'Thailand',
  VN: 'Vietnam',
  ID: 'Indonesia',
  AE: 'United Arab Emirates',
  SG: 'Singapore',
  JP: 'Japan',
  FR: 'France',
  IT: 'Italy',
  PT: 'Portugal',
  GB: 'United Kingdom',
  TR: 'Turkey',
  MV: 'Maldives',
};

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(fallback);
      });
  });
}

function matchSeedDestination(
  rawName: string,
  allDests: DestinationRecord[]
): DestinationRecord | null {
  const qn = normalizeName(rawName);
  if (!qn) return null;

  let best: { d: DestinationRecord; score: number } | null = null;
  const kindRank: Record<DestinationRecord['kind'], number> = {
    city: 5,
    area: 4,
    region: 3,
    state: 2,
    country: 1,
  };

  for (const d of allDests) {
    const candidates = [d.name, d.slug.replace(/-/g, ' '), ...d.aliases];
    let score = 0;
    for (const c of candidates) {
      const cn = normalizeName(c);
      if (!cn) continue;
      if (cn === qn) {
        score = Math.max(score, 100 + kindRank[d.kind]);
      } else if (
        (cn.length >= 4 && qn === `${cn} city`) ||
        (qn.length >= 4 && cn === `${qn} valley`) ||
        (qn.length >= 4 && cn === `${qn} island`)
      ) {
        score = Math.max(score, 90 + kindRank[d.kind]);
      } else if (namesSimilar(rawName, c) && Math.min(cn.length, qn.length) >= 4) {
        score = Math.max(score, 80 + kindRank[d.kind]);
      }
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { d, score };
    }
  }
  return best ? best.d : null;
}

function matchGazetteerTown(rawName: string): GazetteerTown | null {
  const qn = normalizeName(rawName);
  if (!qn) return null;
  for (const t of TOWN_GAZETTEER) {
    const names = [t.name, t.key.replace(/-/g, ' '), ...t.aliases];
    for (const n of names) {
      const nn = normalizeName(n);
      if (nn === qn || (nn.length >= 4 && namesSimilar(rawName, n))) {
        return t;
      }
    }
  }
  return null;
}

export interface GroundIntentOptions {
  /** When true (Stage B `/confirm`), keeps coordinates of destinations already marked `resolved: true` by user typeahead. */
  trustAlreadyResolved?: boolean;
  /** Allow calling Photon autocomplete when local destination DB & gazetteer both miss. */
  allowLiveAutocomplete?: boolean;
  llm?: LlmProvider;
  config?: Partial<AppEnv>;
}

export async function groundIntent(
  intent: TripIntent,
  places: PlacesServices,
  options: GroundIntentOptions = {}
): Promise<TripIntent> {
  const allDests = await places.repo.listDestinations({});
  const allowLive =
    options.allowLiveAutocomplete ?? places.nodeEnv !== 'test';

  // 1. Ground destinations
  const groundedDests: IntentDestination[] = [];
  for (let i = 0; i < intent.destinations.length; i += 1) {
    const raw = intent.destinations[i]!;
    if (
      options.trustAlreadyResolved &&
      raw.resolved &&
      typeof raw.lat === 'number' &&
      typeof raw.lng === 'number' &&
      Number.isFinite(raw.lat) &&
      Number.isFinite(raw.lng)
    ) {
      groundedDests.push({
        ...raw,
        name: toTitleCasePlaceName(raw.name),
        order: i + 1,
      });
      continue;
    }

    const seedHit = matchSeedDestination(raw.name, allDests);
    if (seedHit) {
      groundedDests.push({
        name: seedHit.name,
        country: raw.country ?? COUNTRY_BY_CODE[seedHit.countryCode] ?? seedHit.countryCode,
        ...(raw.nights !== undefined ? { nights: raw.nights } : {}),
        order: i + 1,
        confidence: Math.max(raw.confidence, 0.92),
        destinationSlug: seedHit.slug,
        lat: seedHit.lat,
        lng: seedHit.lng,
        resolved: true,
      });
      continue;
    }

    const townHit = matchGazetteerTown(raw.name);
    if (townHit) {
      groundedDests.push({
        name: townHit.name,
        country: raw.country ?? townHit.country,
        ...(raw.nights !== undefined ? { nights: raw.nights } : {}),
        order: i + 1,
        confidence: Math.max(raw.confidence, 0.9),
        ...(townHit.destinationSlug ? { destinationSlug: townHit.destinationSlug } : {}),
        lat: townHit.lat,
        lng: townHit.lng,
        resolved: true,
      });
      continue;
    }

    if (allowLive && raw.name.trim().length >= 2) {
      const auto = await withTimeout(
        places.places.autocomplete(raw.name, { limit: 3 }),
        2000,
        { results: [], cached: false, photonAvailable: false }
      );
      const top = auto.results[0];
      if (top) {
        groundedDests.push({
          name: top.name,
          country:
            raw.country ??
            (top.countryCode ? COUNTRY_BY_CODE[top.countryCode] ?? top.countryCode : undefined),
          ...(raw.nights !== undefined ? { nights: raw.nights } : {}),
          order: i + 1,
          confidence: Math.max(raw.confidence, 0.8),
          ...(top.slug ? { destinationSlug: top.slug } : {}),
          lat: top.lat,
          lng: top.lng,
          resolved: true,
        });
        continue;
      }
    }

    // Unresolved: explicitly strip any ungrounded coords/slug
    groundedDests.push({
      name: toTitleCasePlaceName(raw.name),
      ...(raw.country ? { country: raw.country } : {}),
      ...(raw.nights !== undefined ? { nights: raw.nights } : {}),
      order: i + 1,
      confidence: Math.min(raw.confidence, 0.5),
      resolved: false,
    });
  }

  // Deduplicate destinations that resolved to the same canonical name (e.g. "Agonda" + "South Goa" -> "South Goa")
  const dedupedDests: IntentDestination[] = [];
  const seenDestNames = new Set<string>();
  for (const gd of groundedDests) {
    const key = normalizeName(gd.name);
    if (key && seenDestNames.has(key)) continue;
    if (key) seenDestNames.add(key);
    dedupedDests.push({ ...gd, order: dedupedDests.length + 1 });
  }

  // Gather candidate places in resolved destinations for grounding mustInclude
  const resolvedDestIds = new Set<string>();
  const resolvedCoords: Array<{ lat: number; lng: number }> = [];
  for (const gd of dedupedDests) {
    if (gd.lat !== undefined && gd.lng !== undefined) {
      resolvedCoords.push({ lat: gd.lat, lng: gd.lng });
    }
    if (gd.destinationSlug) {
      const dr = allDests.find((d) => d.slug === gd.destinationSlug);
      if (dr) {
        const sub = await places.places.subtreeIds(dr);
        for (const id of sub.ids) resolvedDestIds.add(id);
      }
    }
  }

  const storedPlaces =
    resolvedDestIds.size > 0
      ? (
          await places.repo.queryPlaces({
            destinationIds: [...resolvedDestIds],
            limit: 200,
            offset: 0,
          })
        ).rows.map((r) => r.place)
      : [];

  const templatePois = getTemplatePoiCatalog();

  // 2. Ground mustInclude items
  const groundedMust: IntentMustInclude[] = [];
  for (const item of intent.mustInclude) {
    if (
      options.trustAlreadyResolved &&
      item.resolved &&
      item.placeRefId &&
      typeof item.lat === 'number' &&
      typeof item.lng === 'number'
    ) {
      groundedMust.push(item);
      continue;
    }

    const qn = normalizeName(item.name);
    if (!qn) continue;

    const nearEnough = (lat: number, lng: number): boolean => {
      if (resolvedCoords.length === 0) return true;
      return resolvedCoords.some(
        (c) => haversineMeters(c, { lat, lng }) <= 250_000
      );
    };

    // Check stored places in destination packs / curated seeds
    const storedHit = storedPlaces.find(
      (p) =>
        (normalizeName(p.name) === qn || namesSimilar(p.name, item.name)) &&
        nearEnough(p.lat, p.lng)
    );
    if (storedHit) {
      groundedMust.push({
        name: storedHit.name,
        sourceQuote: item.sourceQuote,
        placeRefId: storedHit.refId,
        lat: storedHit.lat,
        lng: storedHit.lng,
        resolved: true,
      });
      continue;
    }

    // Check STARTER_OPEN_POIS (including explicit aliases like "city palace udaipur")
    const starterHit = STARTER_OPEN_POIS.find(
      (sp) =>
        (normalizeName(sp.name) === qn ||
          namesSimilar(sp.name, item.name) ||
          sp.aliases.some((a) => normalizeName(a) === qn || namesSimilar(a, item.name))) &&
        nearEnough(sp.lat, sp.lng)
    );
    if (starterHit) {
      groundedMust.push({
        name: starterHit.name,
        sourceQuote: item.sourceQuote,
        placeRefId: starterHit.refId,
        lat: starterHit.lat,
        lng: starterHit.lng,
        resolved: true,
      });
      continue;
    }

    // Check CURATED_OPEN_POIS
    const curatedHit = CURATED_OPEN_POIS.find(
      (p) =>
        (normalizeName(p.name) === qn ||
          namesSimilar(p.name, item.name) ||
          p.aliases.some((a) => normalizeName(a) === qn || namesSimilar(a, item.name))) &&
        nearEnough(p.lat, p.lng)
    );
    if (curatedHit) {
      groundedMust.push({
        name: curatedHit.name,
        sourceQuote: item.sourceQuote,
        placeRefId: curatedHit.placeRefId,
        lat: curatedHit.lat,
        lng: curatedHit.lng,
        resolved: true,
      });
      continue;
    }

    // Check verified template POI catalog (~550+ real-world landmarks)
    const tplHit = templatePois.find((tp) => {
      if (!nearEnough(tp.lat, tp.lng)) return false;
      const tpn = normalizeName(tp.title);
      return (
        tpn === qn ||
        namesSimilar(tp.title, item.name) ||
        (qn.length >= 5 && tpn.includes(qn))
      );
    });
    if (tplHit) {
      groundedMust.push({
        name: tplHit.title,
        sourceQuote: item.sourceQuote,
        placeRefId: tplHit.placeRefId,
        lat: tplHit.lat,
        lng: tplHit.lng,
        resolved: true,
      });
      continue;
    }

    // Check if mustInclude is actually a sub-destination in TOWN_GAZETTEER or allDests
    const townAsPlace = matchGazetteerTown(item.name);
    if (townAsPlace && nearEnough(townAsPlace.lat, townAsPlace.lng)) {
      groundedMust.push({
        name: townAsPlace.name,
        sourceQuote: item.sourceQuote,
        placeRefId: `gazetteer:${townAsPlace.key}`,
        lat: townAsPlace.lat,
        lng: townAsPlace.lng,
        resolved: true,
      });
      continue;
    }

    const destAsPlace = matchSeedDestination(item.name, allDests);
    if (
      destAsPlace &&
      destAsPlace.kind !== 'country' &&
      nearEnough(destAsPlace.lat, destAsPlace.lng)
    ) {
      groundedMust.push({
        name: destAsPlace.name,
        sourceQuote: item.sourceQuote,
        placeRefId: `dest:${destAsPlace.slug}`,
        lat: destAsPlace.lat,
        lng: destAsPlace.lng,
        resolved: true,
      });
      continue;
    }

    if (allowLive && item.name.trim().length >= 3) {
      const bias = resolvedCoords[0];
      const auto = await withTimeout(
        places.places.autocomplete(item.name, {
          lat: bias?.lat,
          lng: bias?.lng,
          limit: 3,
        }),
        2000,
        { results: [], cached: false, photonAvailable: false }
      );
      const hit = auto.results.find((r) => nearEnough(r.lat, r.lng));
      if (hit) {
        groundedMust.push({
          name: hit.name,
          sourceQuote: item.sourceQuote,
          placeRefId: hit.id,
          lat: hit.lat,
          lng: hit.lng,
          resolved: true,
        });
        continue;
      }
    }

    // Unresolved: never attach fake coordinates
    groundedMust.push({
      name: item.name,
      sourceQuote: item.sourceQuote,
      resolved: false,
    });
  }

  const seenRefIds = new Set<string>();
  const uniqueMust = dedupeMustInclude(groundedMust).filter((m) => {
    if (!m.placeRefId) return true;
    if (seenRefIds.has(m.placeRefId)) return false;
    seenRefIds.add(m.placeRefId);
    return true;
  });

  // 3. Ground door-to-door origin, return hub & multi-modal transit route options
  if (intent.origin?.name?.trim()) {
    const journey = await resolveDoorToDoorJourney({
      origin: intent.origin,
      returnPoint: intent.returnPoint,
      roundTrip: intent.roundTrip,
      transportMode: intent.transportMode ?? 'any',
      firstDestination: dedupedDests[0] ?? null,
      lastDestination: dedupedDests[dedupedDests.length - 1] ?? null,
      startDateIso: intent.dates.start,
      endDateIso: intent.dates.end,
      selectedOutboundOptionId: intent.selectedOutboundOptionId,
      selectedReturnOptionId: intent.selectedReturnOptionId,
      places,
      llm: options.llm,
      config: options.config,
      allowLiveAutocomplete: allowLive,
    });

    return {
      ...intent,
      origin: journey.origin,
      returnPoint: journey.returnPoint,
      roundTrip: journey.roundTrip,
      selectedOutboundOptionId: journey.selectedOutboundOptionId,
      selectedReturnOptionId: journey.selectedReturnOptionId,
      routeOptions: {
        outbound: journey.outboundOptions,
        return: journey.returnOptions,
      },
      destinations: dedupedDests,
      mustInclude: uniqueMust,
    };
  }

  return {
    ...intent,
    origin: null,
    returnPoint: intent.returnPoint ?? null,
    destinations: dedupedDests,
    mustInclude: uniqueMust,
  };
}
