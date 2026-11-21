import { browserApiBase } from '@/lib/api-base';
import type { ItineraryItem, OpenPoiResult, TripMeta } from '@/lib/types';
import { haversineKm, isValidCoordinate } from '@/features/map/map-utils';

export type DiscoveryCategory =
  | ''
  | 'sights'
  | 'food'
  | 'cafe'
  | 'culture'
  | 'nature'
  | 'spiritual'
  | 'stay'
  | 'activity'
  | 'nightlife';

export type DiscoveryScope = 'destination' | 'near-day' | 'bbox';

export type PackBuildStatus = 'none' | 'building' | 'ready' | 'stale';

export interface PlaceImageInfo {
  url: string;
  author: string | null;
  license: string | null;
  licenseUrl: string | null;
  sourceUrl: string | null;
}

export interface DiscoveredPlace {
  id: string;
  refId: string;
  name: string;
  nameLocal: Record<string, string>;
  category: string;
  subtype: string | null;
  lat: number;
  lng: number;
  address: string | null;
  website: string | null;
  openingHours: string | null;
  description: string | null;
  whyVisit: string | null;
  typicalDurationMins: number | null;
  bestTime: string | null;
  dietaryHints: string[];
  image: PlaceImageInfo | null;
  popularity: number;
  distanceM: number | null;
  origin: 'pack' | 'curated' | 'live';
  wikipediaUrl: string | null;
  wikidataId: string | null;
}

export interface DestinationOption {
  slug: string;
  name: string;
  secondary?: string;
  lat?: number;
  lng?: number;
}

export interface GeoAutocompleteSuggestion {
  id: string;
  source: 'destination' | 'photon';
  slug: string | null;
  name: string;
  secondary: string;
  kind: 'country' | 'state' | 'region' | 'city' | 'area' | 'place';
  lat: number;
  lng: number;
  countryCode: string | null;
  packStatus: PackBuildStatus | null;
}

export interface PlacesFetchResult {
  status: PackBuildStatus;
  source: 'pack' | 'live' | 'offline';
  destination: { slug: string; name: string };
  places: DiscoveredPlace[];
  attribution: string;
}

export const DISCOVERY_CATEGORIES: ReadonlyArray<{
  id: DiscoveryCategory;
  label: string;
}> = [
  { id: '', label: 'All' },
  { id: 'sights', label: 'Top sights' },
  { id: 'food', label: 'Food' },
  { id: 'cafe', label: 'Cafés' },
  { id: 'culture', label: 'Culture' },
  { id: 'nature', label: 'Nature' },
  { id: 'spiritual', label: 'Spiritual' },
  { id: 'stay', label: 'Stays' },
  { id: 'activity', label: 'Activities' },
  { id: 'nightlife', label: 'Nightlife' },
];

const KNOWN_DESTINATIONS: Record<
  string,
  { slug: string; name: string; lat: number; lng: number }
> = {
  rishikesh: { slug: 'rishikesh', name: 'Rishikesh', lat: 30.0869, lng: 78.2676 },
  tapovan: { slug: 'rishikesh', name: 'Rishikesh', lat: 30.1257, lng: 78.3202 },
  'triveni ghat': { slug: 'rishikesh', name: 'Rishikesh', lat: 30.1033, lng: 78.2948 },
  haridwar: { slug: 'rishikesh', name: 'Rishikesh', lat: 29.9457, lng: 78.1642 },
  landour: { slug: 'landour', name: 'Landour', lat: 30.4631, lng: 78.0972 },
  mussoorie: { slug: 'mussoorie', name: 'Mussoorie', lat: 30.4598, lng: 78.0644 },
  dehradun: { slug: 'dehradun', name: 'Dehradun', lat: 30.3165, lng: 78.0322 },
  nainital: { slug: 'nainital', name: 'Nainital', lat: 29.3919, lng: 79.4542 },
  jaipur: { slug: 'jaipur', name: 'Jaipur', lat: 26.9124, lng: 75.7873 },
  udaipur: { slug: 'udaipur', name: 'Udaipur', lat: 24.5854, lng: 73.7125 },
  jodhpur: { slug: 'jodhpur', name: 'Jodhpur', lat: 26.2389, lng: 73.0243 },
  jaisalmer: { slug: 'jaisalmer', name: 'Jaisalmer', lat: 26.9157, lng: 70.9083 },
  pushkar: { slug: 'pushkar', name: 'Pushkar', lat: 26.4897, lng: 74.5511 },
  rajasthan: { slug: 'jaipur', name: 'Jaipur', lat: 26.9124, lng: 75.7873 },
  goa: { slug: 'goa', name: 'Goa', lat: 15.2993, lng: 74.124 },
  'south goa': { slug: 'south-goa', name: 'South Goa', lat: 15.0447, lng: 73.9859 },
  'north goa': { slug: 'north-goa', name: 'North Goa', lat: 15.5494, lng: 73.7535 },
  agonda: { slug: 'south-goa', name: 'South Goa', lat: 15.0447, lng: 73.9859 },
  palolem: { slug: 'south-goa', name: 'South Goa', lat: 15.01, lng: 74.0232 },
  madgaon: { slug: 'south-goa', name: 'South Goa', lat: 15.2673, lng: 73.9701 },
  'cabo de rama': { slug: 'south-goa', name: 'South Goa', lat: 15.0888, lng: 73.9272 },
  fontainhas: { slug: 'goa', name: 'Goa', lat: 15.4968, lng: 73.8313 },
  varanasi: { slug: 'varanasi', name: 'Varanasi', lat: 25.3109, lng: 83.0107 },
  kashi: { slug: 'varanasi', name: 'Varanasi', lat: 25.3109, lng: 83.0107 },
  dashashwamedh: { slug: 'varanasi', name: 'Varanasi', lat: 25.3068, lng: 83.0105 },
  sarnath: { slug: 'varanasi', name: 'Varanasi', lat: 25.3762, lng: 83.0227 },
  ayodhya: { slug: 'ayodhya', name: 'Ayodhya', lat: 26.7956, lng: 82.1944 },
  manali: { slug: 'manali', name: 'Manali', lat: 32.2396, lng: 77.1887 },
  spiti: { slug: 'spiti-valley', name: 'Spiti Valley', lat: 32.246, lng: 78.0349 },
  'spiti valley': { slug: 'spiti-valley', name: 'Spiti Valley', lat: 32.246, lng: 78.0349 },
  kaza: { slug: 'spiti-valley', name: 'Spiti Valley', lat: 32.2276, lng: 78.0715 },
  shimla: { slug: 'shimla', name: 'Shimla', lat: 31.1048, lng: 77.1734 },
  dharamshala: { slug: 'dharamshala', name: 'Dharamshala', lat: 32.219, lng: 76.3234 },
  ladakh: { slug: 'ladakh', name: 'Ladakh', lat: 34.1526, lng: 77.5771 },
  leh: { slug: 'leh', name: 'Leh', lat: 34.1526, lng: 77.5771 },
  munnar: { slug: 'munnar', name: 'Munnar', lat: 10.0889, lng: 77.0595 },
  alleppey: { slug: 'alleppey', name: 'Alleppey', lat: 9.4981, lng: 76.3388 },
  kochi: { slug: 'kochi', name: 'Kochi', lat: 9.9312, lng: 76.2673 },
  kerala: { slug: 'munnar', name: 'Munnar', lat: 10.0889, lng: 77.0595 },
  hampi: { slug: 'hampi', name: 'Hampi', lat: 15.335, lng: 76.46 },
  pondicherry: { slug: 'pondicherry', name: 'Pondicherry', lat: 11.9416, lng: 79.8083 },
  darjeeling: { slug: 'darjeeling', name: 'Darjeeling', lat: 27.041, lng: 88.2663 },
  gangtok: { slug: 'gangtok', name: 'Gangtok', lat: 27.3389, lng: 88.6065 },
  shillong: { slug: 'shillong', name: 'Shillong', lat: 25.5788, lng: 91.8933 },
  amritsar: { slug: 'amritsar', name: 'Amritsar', lat: 31.634, lng: 74.8723 },
  agra: { slug: 'agra', name: 'Agra', lat: 27.1767, lng: 78.0081 },
  delhi: { slug: 'delhi', name: 'Delhi', lat: 28.6139, lng: 77.209 },
  mumbai: { slug: 'mumbai', name: 'Mumbai', lat: 19.076, lng: 72.8777 },
  bengaluru: { slug: 'bengaluru', name: 'Bengaluru', lat: 12.9716, lng: 77.5946 },
  kolkata: { slug: 'kolkata', name: 'Kolkata', lat: 22.5726, lng: 88.3639 },
  hanoi: { slug: 'hanoi', name: 'Hanoi', lat: 21.0285, lng: 105.8542 },
  'hanoi old quarter': { slug: 'hanoi', name: 'Hanoi', lat: 21.0285, lng: 105.8542 },
  'ha long': { slug: 'ha-long', name: 'Ha Long', lat: 20.9302, lng: 106.9885 },
  'ha long bay': { slug: 'ha-long', name: 'Ha Long', lat: 20.9302, lng: 106.9885 },
  'da nang': { slug: 'da-nang', name: 'Da Nang', lat: 16.0544, lng: 108.2022 },
  'hoi an': { slug: 'hoi-an', name: 'Hoi An', lat: 15.8775, lng: 108.3267 },
  vietnam: { slug: 'hanoi', name: 'Hanoi', lat: 21.0285, lng: 105.8542 },
  kyoto: { slug: 'kyoto', name: 'Kyoto', lat: 35.0116, lng: 135.7681 },
  tokyo: { slug: 'tokyo', name: 'Tokyo', lat: 35.6762, lng: 139.6503 },
  lisbon: { slug: 'lisbon', name: 'Lisbon', lat: 38.7223, lng: -9.1393 },
  bali: { slug: 'bali', name: 'Bali', lat: -8.4095, lng: 115.1889 },
  ubud: { slug: 'ubud', name: 'Ubud', lat: -8.5069, lng: 115.2625 },
  bangkok: { slug: 'bangkok', name: 'Bangkok', lat: 13.7563, lng: 100.5018 },
  phuket: { slug: 'phuket', name: 'Phuket', lat: 7.8804, lng: 98.3923 },
  'chiang mai': { slug: 'chiang-mai', name: 'Chiang Mai', lat: 18.7883, lng: 98.9853 },
  singapore: { slug: 'singapore', name: 'Singapore', lat: 1.3521, lng: 103.8198 },
  dubai: { slug: 'dubai', name: 'Dubai', lat: 25.2048, lng: 55.2708 },
  paris: { slug: 'paris', name: 'Paris', lat: 48.8566, lng: 2.3522 },
  rome: { slug: 'rome', name: 'Rome', lat: 41.9028, lng: 12.4964 },
  london: { slug: 'london', name: 'London', lat: 51.5072, lng: -0.1276 },
  istanbul: { slug: 'istanbul', name: 'Istanbul', lat: 41.0082, lng: 28.9784 },
  coorg: { slug: 'coorg', name: 'Coorg', lat: 12.4244, lng: 75.7382 },
  madikeri: { slug: 'coorg', name: 'Coorg', lat: 12.4244, lng: 75.7382 },
  gokarna: { slug: 'gokarna', name: 'Gokarna', lat: 14.5479, lng: 74.3188 },
  ooty: { slug: 'ooty', name: 'Ooty', lat: 11.4102, lng: 76.695 },
  kodaikanal: { slug: 'kodaikanal', name: 'Kodaikanal', lat: 10.2381, lng: 77.4892 },
  varkala: { slug: 'varkala', name: 'Varkala', lat: 8.7379, lng: 76.7163 },
  wayanad: { slug: 'wayanad', name: 'Wayanad', lat: 11.6854, lng: 76.132 },
  mysore: { slug: 'mysuru', name: 'Mysuru', lat: 12.2958, lng: 76.6394 },
  mysuru: { slug: 'mysuru', name: 'Mysuru', lat: 12.2958, lng: 76.6394 },
  kasol: { slug: 'kasol', name: 'Kasol', lat: 32.0099, lng: 77.3149 },
  srinagar: { slug: 'srinagar', name: 'Srinagar', lat: 34.0837, lng: 74.7973 },
  kashmir: { slug: 'srinagar', name: 'Srinagar', lat: 34.0837, lng: 74.7973 },
  andaman: { slug: 'andaman', name: 'Andaman', lat: 11.6234, lng: 92.7265 },
  meghalaya: { slug: 'shillong', name: 'Shillong', lat: 25.5788, lng: 91.8933 },
  kaziranga: { slug: 'kaziranga', name: 'Kaziranga', lat: 26.5775, lng: 93.1711 },
  rann: { slug: 'kutch', name: 'Rann of Kutch', lat: 23.7337, lng: 69.8597 },
  kutch: { slug: 'kutch', name: 'Rann of Kutch', lat: 23.7337, lng: 69.8597 },
  osaka: { slug: 'osaka', name: 'Osaka', lat: 34.6937, lng: 135.5023 },
  thailand: { slug: 'bangkok', name: 'Bangkok', lat: 13.7563, lng: 100.5018 },
  sri_lanka: { slug: 'colombo', name: 'Colombo', lat: 6.9271, lng: 79.8612 },
  'sri lanka': { slug: 'colombo', name: 'Colombo', lat: 6.9271, lng: 79.8612 },
  nepal: { slug: 'kathmandu', name: 'Kathmandu', lat: 27.7172, lng: 85.324 },
  kathmandu: { slug: 'kathmandu', name: 'Kathmandu', lat: 27.7172, lng: 85.324 },
  bhutan: { slug: 'paro', name: 'Paro', lat: 27.4287, lng: 89.4164 },
};

/**
 * Resolves initial destination coordinates synchronously from `trip.destinationSummary`,
 * `trip.title`, or geo-located items so newly created trips (e.g. Munnar, Kyoto) never
 * mount centered on Rishikesh.
 */
export function resolveInitialTripCenter(
  trip: Pick<TripMeta, 'title' | 'destinationSummary'> | null | undefined,
  items: ReadonlyArray<ItineraryItem> = []
): { lat: number; lng: number } | null {
  for (const item of items) {
    if (
      !item.deletedAt &&
      typeof item.lat === 'number' &&
      typeof item.lng === 'number' &&
      isValidCoordinate(item.lat, item.lng)
    ) {
      return { lat: item.lat, lng: item.lng };
    }
  }
  if (!trip) return null;

  const combinedText = `${trip.destinationSummary || ''} · ${trip.title || ''}`
    .replace(/\(\d+D\)/gi, ' ')
    .replace(/local sandbox draft/gi, ' ')
    .replace(/saved in browser/gi, ' ');

  const rawTokens = combinedText
    .split(/[·,–—/|&]+|\bto\b|\band\b/i)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 2);

  for (const lower of rawTokens) {
    if (KNOWN_DESTINATIONS[lower]) {
      return { lat: KNOWN_DESTINATIONS[lower]!.lat, lng: KNOWN_DESTINATIONS[lower]!.lng };
    }
    for (const [alias, target] of Object.entries(KNOWN_DESTINATIONS)) {
      if (alias.length >= 3 && lower.includes(alias)) {
        return { lat: target.lat, lng: target.lng };
      }
    }
  }

  return null;
}

/**
 * Infers ordered destination options from a trip's summary, title, and geo-located stops.
 */
export function inferTripDestinations(
  trip: Pick<TripMeta, 'title' | 'destinationSummary'>,
  items: ReadonlyArray<ItineraryItem>
): DestinationOption[] {
  const seen = new Set<string>();
  const out: DestinationOption[] = [];

  const pushMatch = (opt: DestinationOption) => {
    if (seen.has(opt.slug)) return;
    seen.add(opt.slug);
    out.push(opt);
  };

  const combinedText = `${trip.destinationSummary || ''} · ${trip.title || ''}`
    .replace(/\(\d+D\)/gi, ' ')
    .replace(/local sandbox draft/gi, ' ')
    .replace(/saved in browser/gi, ' ');

  const rawTokens = combinedText
    .split(/[·,–—/|&]+|\bto\b|\band\b/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);

  for (const token of rawTokens) {
    const lower = token.toLowerCase();
    const direct = KNOWN_DESTINATIONS[lower];
    if (direct) {
      pushMatch(direct);
      continue;
    }
    // Check substring matches against known destinations
    for (const [alias, target] of Object.entries(KNOWN_DESTINATIONS)) {
      if (alias.length >= 3 && lower.includes(alias)) {
        pushMatch(target);
      }
    }
  }

  // Also scan stop titles if still empty
  if (out.length === 0) {
    for (const item of items) {
      if (item.deletedAt) continue;
      const lower = item.title.toLowerCase();
      for (const [alias, target] of Object.entries(KNOWN_DESTINATIONS)) {
        if (alias.length >= 4 && lower.includes(alias)) {
          pushMatch(target);
        }
      }
    }
  }

  // Fallback to Rishikesh, Jaipur, Kyoto, Lisbon quick presets when draft has no destination yet
  if (out.length === 0) {
    pushMatch(KNOWN_DESTINATIONS.rishikesh!);
    pushMatch(KNOWN_DESTINATIONS.jaipur!);
    pushMatch(KNOWN_DESTINATIONS.kyoto!);
    pushMatch(KNOWN_DESTINATIONS.lisbon!);
  }

  return out;
}

const PHOTO_BY_DEST: Record<string, PlaceImageInfo> = {
  rishikesh: {
    url: '/img/destinations/rishikesh.jpg',
    author: 'आशीष_भटनागर',
    license: 'CC BY-SA 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Lakshman_jhula,_Rishikesh_2.jpg',
  },
  jaipur: {
    url: '/img/destinations/jaipur.jpg',
    author: 'Chainwit.',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:East_facade_Hawa_Mahal_Jaipur_from_ground_level_(July_2022)_-_img_01.jpg',
  },
  udaipur: {
    url: '/img/destinations/udaipur.jpg',
    author: 'Hirumon',
    license: 'CC BY 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/3.0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:City_Palace_Udaipur_Rajasthan_India.JPG',
  },
  varanasi: {
    url: '/img/destinations/varanasi.jpg',
    author: 'Schwiki',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:Boats_at_sunrise_Ganges_River_Varanasi_Uttar_Pradesh_Schwiki.jpg',
  },
  goa: {
    url: '/img/destinations/goa.jpg',
    author: 'Ravi Dwivedi',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Sunloungers_at_Palolem_beach.jpg',
  },
  kyoto: {
    url: '/img/destinations/kyoto.jpg',
    author: 'Basile Morin',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:Torii_path_with_lantern_at_Fushimi_Inari_Taisha_Shrine,_Kyoto,_Japan.jpg',
  },
  lisbon: {
    url: '/img/destinations/lisbon.jpg',
    author: 'Dale Cruse',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:Alfama_Rooftops_and_Tagus_River_View,_Lisbon_(54733828355).jpg',
  },
  hanoi: {
    url: '/img/destinations/ha-noi.jpg',
    author: 'Jakub Hałun',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:Street_seller_of_fingered_citrons_in_Old_Town_of_Hanoi,_20240204_1335_5772.jpg',
  },
  'ha-long': {
    url: '/img/destinations/ha-long-bay.jpg',
    author: 'lumoplank',
    license: 'CC0',
    licenseUrl: 'http://creativecommons.org/publicdomain/zero/1.0/deed.en',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Ha_Long_Bay_-_Halong1407.jpg',
  },
  'spiti-valley': {
    url: '/img/destinations/spiti-valley.jpg',
    author: 'Deepank Ranka',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Dhankar_Gompa,_Spiti.jpg',
  },
  hampi: {
    url: '/img/destinations/hampi.jpg',
    author: 'RanjithaRKRao',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:The_Grand_Stone_chariot_in_the_midst_of_Mantapas_at_Vittala_Temple,_Hampi.jpg',
  },
  bali: {
    url: '/img/destinations/bali.jpg',
    author: 'Vyacheslav Argenberg',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Rice_terraces,_Bali.jpg',
  },
};

interface OfflineSeedPlace {
  destSlugs: string[];
  refId: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  description: string;
  address: string;
  popularity: number;
  typicalDurationMins: number;
  dietaryHints: string[];
  photoKey?: string;
}

const OFFLINE_CURATED_PLACES: OfflineSeedPlace[] = [
  // Rishikesh, Landour & Mussoorie
  {
    destSlugs: ['rishikesh', 'uttarakhand'],
    refId: 'osm:way:parmarth-niketan-rishikesh',
    name: 'Parmarth Niketan Ganga Aarti Ghat',
    category: 'spiritual',
    lat: 30.1193,
    lng: 78.3125,
    description: 'Evening Ganga aarti on flat paved ghat steps near Ram Jhula.',
    address: 'Swarg Ashram, Rishikesh',
    popularity: 0.88,
    typicalDurationMins: 75,
    dietaryHints: ['pure-veg', 'satvik'],
    photoKey: 'rishikesh',
  },
  {
    destSlugs: ['rishikesh', 'uttarakhand'],
    refId: 'osm:node:beatles-ashram-chaurasi-kutia',
    name: 'Chaurasi Kutia (Beatles Ashram)',
    category: 'culture',
    lat: 30.1128,
    lng: 78.3169,
    description: 'Mural-painted meditation domes inside Rajaji forest edge.',
    address: 'Swarg Ashram, Rishikesh',
    popularity: 0.79,
    typicalDurationMins: 90,
    dietaryHints: ['pure-veg'],
    photoKey: 'rishikesh',
  },
  {
    destSlugs: ['rishikesh', 'uttarakhand'],
    refId: 'osm:node:chotiwala-rishikesh',
    name: 'Little Buddha Café, Laxman Jhula',
    category: 'cafe',
    lat: 30.1259,
    lng: 78.3298,
    description: 'River-overlooking treehouse café serving vegetarian platters and herbal teas.',
    address: 'Laxman Jhula Rd, Tapovan, Rishikesh',
    popularity: 0.68,
    typicalDurationMins: 60,
    dietaryHints: ['pure-veg', 'vegan'],
  },
  {
    destSlugs: ['landour', 'mussoorie', 'rishikesh', 'uttarakhand'],
    refId: 'osm:node:char-dukan-landour',
    name: 'Chaar Dukan, Landour',
    category: 'cafe',
    lat: 30.4631,
    lng: 78.0972,
    description: 'Historic cantonment square famous for pancakes, waffles, and ginger lemon honey tea.',
    address: 'Sister Bazaar Cantt, Landour, Mussoorie',
    popularity: 0.84,
    typicalDurationMins: 60,
    dietaryHints: ['veg-friendly'],
  },
  {
    destSlugs: ['landour', 'mussoorie', 'rishikesh', 'uttarakhand'],
    refId: 'osm:node:lal-tibba-landour',
    name: 'Lal Tibba Scenic Viewpoint',
    category: 'nature',
    lat: 30.4675,
    lng: 78.0947,
    description: 'Highest ridge point in Landour with morning Bandarpunch and Nanda Devi views.',
    address: 'Landour Chakkar, Mussoorie',
    popularity: 0.81,
    typicalDurationMins: 50,
    dietaryHints: [],
  },
  {
    destSlugs: ['landour', 'mussoorie', 'uttarakhand'],
    refId: 'osm:node:landour-bakehouse',
    name: 'Landour Bakehouse',
    category: 'cafe',
    lat: 30.4609,
    lng: 78.1031,
    description: '19th-century Garhwali bakery heritage recipes in Sister’s Bazaar.',
    address: 'Sisters Bazaar, Landour, Mussoorie',
    popularity: 0.76,
    typicalDurationMins: 55,
    dietaryHints: ['eggless-options', 'veg-friendly'],
  },
  // Jaipur & Udaipur
  {
    destSlugs: ['jaipur', 'rajasthan'],
    refId: 'wd:Q213917',
    name: 'Hawa Mahal (Palace of Winds)',
    category: 'sights',
    lat: 26.9239,
    lng: 75.8267,
    description: '1799 pink sandstone five-storey jharokha lattice facade in Badi Choupad.',
    address: 'Hawa Mahal Rd, Badi Choupad, Jaipur',
    popularity: 0.94,
    typicalDurationMins: 75,
    dietaryHints: [],
    photoKey: 'jaipur',
  },
  {
    destSlugs: ['jaipur', 'rajasthan'],
    refId: 'wd:Q466813',
    name: 'Amber Fort & Sheesh Mahal',
    category: 'sights',
    lat: 26.9855,
    lng: 75.8513,
    description: 'Hilltop Rajput palace overlooking Maota Lake with mirror-inlaid courtyards.',
    address: 'Devisinghpura, Amer, Jaipur',
    popularity: 0.93,
    typicalDurationMins: 150,
    dietaryHints: [],
    photoKey: 'jaipur',
  },
  {
    destSlugs: ['jaipur', 'rajasthan'],
    refId: 'osm:node:lmb-johari-bazaar',
    name: 'Laxmi Mishthan Bhandar (LMB)',
    category: 'food',
    lat: 26.9203,
    lng: 75.8269,
    description: 'Pure-vegetarian Rajasthani thali, dal baati churma, and paneer ghewar since 1954.',
    address: 'Johari Bazaar, Pink City, Jaipur',
    popularity: 0.77,
    typicalDurationMins: 65,
    dietaryHints: ['pure-veg', 'jain-available'],
  },
  {
    destSlugs: ['jaipur', 'rajasthan'],
    refId: 'wd:Q1062080',
    name: 'Jantar Mantar Astronomical Observatory',
    category: 'culture',
    lat: 26.9248,
    lng: 75.8246,
    description: 'UNESCO World Heritage stone astronomical instruments built by Sawai Jai Singh II.',
    address: 'Gangori Bazaar, Jaipur',
    popularity: 0.85,
    typicalDurationMins: 75,
    dietaryHints: [],
  },
  // Goa & South Goa
  {
    destSlugs: ['south-goa', 'goa', 'north-goa'],
    refId: 'osm:way:palolem-beach-canacona',
    name: 'Palolem Crescent Beach',
    category: 'nature',
    lat: 15.01,
    lng: 74.0232,
    description: 'Calm palm-lined bay in Canacona ideal for morning kayaking and sunset walks.',
    address: 'Palolem, Canacona, South Goa',
    popularity: 0.86,
    typicalDurationMins: 120,
    dietaryHints: ['veg-friendly', 'seafood'],
    photoKey: 'goa',
  },
  {
    destSlugs: ['south-goa', 'goa'],
    refId: 'wikidata:Q5015726:cabo-de-rama',
    name: 'Cabo de Rama Cliff Fort',
    category: 'sights',
    lat: 15.0888,
    lng: 73.9272,
    description: 'Laterite sea-cliff headland fort overlooking the Arabian Sea.',
    address: 'Canaguinim, South Goa',
    popularity: 0.78,
    typicalDurationMins: 75,
    dietaryHints: [],
    photoKey: 'goa',
  },
  {
    destSlugs: ['goa', 'south-goa', 'north-goa'],
    refId: 'wd:Q3524671',
    name: 'Fontainhas Latin Quarter Walk',
    category: 'culture',
    lat: 15.4968,
    lng: 73.8313,
    description: 'Ochre and indigo Portuguese heritage lanes, bakeries, and azulejo tilework in Panaji.',
    address: 'Mala, Panaji, Goa',
    popularity: 0.82,
    typicalDurationMins: 90,
    dietaryHints: ['veg-friendly'],
  },
  // Varanasi
  {
    destSlugs: ['varanasi', 'ayodhya'],
    refId: 'wikidata:Q4686668:kashi-vishwanath',
    name: 'Shri Kashi Vishwanath Dham Corridor',
    category: 'spiritual',
    lat: 25.3109,
    lng: 83.0107,
    description: 'Riverfront temple corridor connecting Lalita Ghat directly to the sanctum.',
    address: 'Lahori Tola, Varanasi',
    popularity: 0.94,
    typicalDurationMins: 90,
    dietaryHints: ['pure-veg', 'satvik'],
    photoKey: 'varanasi',
  },
  {
    destSlugs: ['varanasi'],
    refId: 'wikidata:Q3595865:dashashwamedh-ghat',
    name: 'Dashashwamedh Ghat Sandhya Aarti',
    category: 'spiritual',
    lat: 25.3068,
    lng: 83.0105,
    description: 'Synchronized brass-lamp evening Ganga ceremony best viewed from a moored boat.',
    address: 'Godowlia, Varanasi',
    popularity: 0.9,
    typicalDurationMins: 75,
    dietaryHints: ['pure-veg'],
    photoKey: 'varanasi',
  },
  // Vietnam
  {
    destSlugs: ['hanoi', 'vietnam'],
    refId: 'wikidata:Q1856241:hanoi-old-quarter',
    name: 'Hoan Kiem Lake & Ngoc Son Temple',
    category: 'sights',
    lat: 21.0285,
    lng: 105.8542,
    description: 'Pedestrian-friendly lakeside promenade at the heart of Hanoi Old Quarter.',
    address: 'Hoan Kiem, Hanoi',
    popularity: 0.91,
    typicalDurationMins: 90,
    dietaryHints: ['vegan-chay'],
    photoKey: 'hanoi',
  },
  {
    destSlugs: ['ha-long', 'hanoi', 'vietnam'],
    refId: 'wikidata:Q190128:ha-long-bay-pier',
    name: 'Ha Long Bay Limestone Karsts Cruise',
    category: 'nature',
    lat: 20.9302,
    lng: 106.9885,
    description: 'UNESCO emerald bay dotted with limestone islands and kayaking lagoons.',
    address: 'Tuan Chau Marina, Ha Long',
    popularity: 0.93,
    typicalDurationMins: 240,
    dietaryHints: ['veg-prebook'],
    photoKey: 'ha-long',
  },
  {
    destSlugs: ['hoi-an', 'da-nang', 'vietnam'],
    refId: 'wikidata:Q36062:hoi-an-ancient-town',
    name: 'Hoi An Ancient Town Lantern Quarter',
    category: 'culture',
    lat: 15.8775,
    lng: 108.3267,
    description: 'Car-free riverside shophouses, Japanese Covered Bridge, and silk lantern boats.',
    address: 'Minh An, Hoi An',
    popularity: 0.9,
    typicalDurationMins: 120,
    dietaryHints: ['vegan-chay'],
  },
  // Kyoto & Lisbon
  {
    destSlugs: ['kyoto', 'tokyo', 'japan'],
    refId: 'wd:Q593944',
    name: 'Fushimi Inari Taisha Torii Trail',
    category: 'spiritual',
    lat: 34.9671,
    lng: 135.7727,
    description: 'Thousands of vermilion senbon torii gates winding up wooded Mount Inari.',
    address: '68 Fukakusa Yabunouchicho, Fushimi Ward, Kyoto',
    popularity: 0.96,
    typicalDurationMins: 120,
    dietaryHints: [],
    photoKey: 'kyoto',
  },
  {
    destSlugs: ['kyoto', 'japan'],
    refId: 'wd:Q270600',
    name: 'Kiyomizu-dera & Higashiyama Lanes',
    category: 'culture',
    lat: 34.9949,
    lng: 135.785,
    description: 'Wooden hillside stage overlooking Kyoto paired with preserved Sannenzaka tea houses.',
    address: '1-294 Kiyomizu, Higashiyama Ward, Kyoto',
    popularity: 0.94,
    typicalDurationMins: 120,
    dietaryHints: ['shojin-veg'],
    photoKey: 'kyoto',
  },
  {
    destSlugs: ['lisbon', 'portugal'],
    refId: 'wd:Q664859',
    name: 'Miradouro de Santa Luzia & Alfama',
    category: 'sights',
    lat: 38.7116,
    lng: -9.1304,
    description: 'Azulejo-tiled terrace overlooking Alfama’s terracotta rooftops and the Tagus estuary.',
    address: 'Largo Santa Luzia, Alfama, Lisbon',
    popularity: 0.89,
    typicalDurationMins: 75,
    dietaryHints: [],
    photoKey: 'lisbon',
  },
  {
    destSlugs: ['lisbon', 'portugal'],
    refId: 'wd:Q490226',
    name: 'Pastéis de Belém & Jerónimos Promenade',
    category: 'cafe',
    lat: 38.6975,
    lng: -9.2032,
    description: 'Historic 1837 bakery serving warm custard tarts beside the Manueline monastery.',
    address: 'Rua de Belém 84–92, Lisbon',
    popularity: 0.92,
    typicalDurationMins: 60,
    dietaryHints: ['veg-friendly'],
    photoKey: 'lisbon',
  },
];

function buildOfflinePlacesFallback(params: {
  slug: string;
  name: string;
  category?: DiscoveryCategory;
  q?: string;
  near?: { lat: number; lng: number } | null;
  bbox?: string | null;
}): PlacesFetchResult {
  const slugLower = params.slug.toLowerCase();
  let pool = OFFLINE_CURATED_PLACES.filter(
    (p) =>
      p.destSlugs.includes(slugLower) ||
      p.name.toLowerCase().includes(slugLower) ||
      p.address.toLowerCase().includes(slugLower)
  );
  if (pool.length === 0) {
    pool = OFFLINE_CURATED_PLACES;
  }

  let bboxNums: [number, number, number, number] | null = null;
  if (params.bbox) {
    const parsed = params.bbox.split(',').map((n) => Number(n.trim()));
    if (parsed.length === 4 && parsed.every((n) => Number.isFinite(n))) {
      bboxNums = parsed as [number, number, number, number];
    }
  }

  const filtered = pool.filter((p) => {
    if (params.category && p.category !== params.category) return false;
    if (params.q) {
      const qLower = params.q.toLowerCase();
      const hay = `${p.name} ${p.description} ${p.address} ${p.category}`.toLowerCase();
      if (!hay.includes(qLower)) return false;
    }
    if (bboxNums) {
      const [west, south, east, north] = bboxNums;
      if (p.lng < west || p.lng > east || p.lat < south || p.lat > north) {
        return false;
      }
    }
    return true;
  });

  const mapped: DiscoveredPlace[] = filtered.map((p) => {
    const distanceM = params.near
      ? Math.round(haversineKm(params.near, { lat: p.lat, lng: p.lng }) * 1000)
      : null;
    return {
      id: p.refId,
      refId: p.refId,
      name: p.name,
      nameLocal: {},
      category: p.category,
      subtype: null,
      lat: p.lat,
      lng: p.lng,
      address: p.address,
      website: null,
      openingHours: null,
      description: p.description,
      whyVisit: p.description,
      typicalDurationMins: p.typicalDurationMins,
      bestTime: null,
      dietaryHints: p.dietaryHints,
      image: p.photoKey ? (PHOTO_BY_DEST[p.photoKey] ?? null) : null,
      popularity: p.popularity,
      distanceM,
      origin: 'curated',
      wikipediaUrl: null,
      wikidataId: null,
    };
  });

  if (params.near) {
    mapped.sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0));
  } else {
    mapped.sort((a, b) => b.popularity - a.popularity);
  }

  return {
    status: 'ready',
    source: 'offline',
    destination: { slug: params.slug, name: params.name },
    places: mapped.slice(0, 24),
    attribution: '© OpenStreetMap contributors · Wikidata · Wikimedia Commons',
  };
}

export async function fetchGeoAutocomplete(
  query: string,
  signal?: AbortSignal
): Promise<GeoAutocompleteSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  try {
    const res = await fetch(
      `${browserApiBase()}/v1/geo/autocomplete?q=${encodeURIComponent(trimmed)}&limit=8`,
      { signal }
    );
    if (res.ok) {
      const body = (await res.json()) as { results?: GeoAutocompleteSuggestion[] };
      if (Array.isArray(body.results)) return body.results;
    }
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return [];
  }

  // Offline local destination match fallback
  const qLower = trimmed.toLowerCase();
  const seen = new Set<string>();
  const localMatches: GeoAutocompleteSuggestion[] = [];
  for (const [alias, dest] of Object.entries(KNOWN_DESTINATIONS)) {
    if (seen.has(dest.slug)) continue;
    if (alias.includes(qLower) || dest.name.toLowerCase().includes(qLower)) {
      seen.add(dest.slug);
      localMatches.push({
        id: `local-${dest.slug}`,
        source: 'destination',
        slug: dest.slug,
        name: dest.name,
        secondary: 'Offline destination index',
        kind: 'city',
        lat: dest.lat,
        lng: dest.lng,
        countryCode: null,
        packStatus: 'ready',
      });
    }
  }
  return localMatches.slice(0, 8);
}

function mapOpenPoiToDiscoveredPlace(
  poi: OpenPoiResult,
  near?: { lat: number; lng: number } | null
): DiscoveredPlace {
  const catMap: Record<string, string> = {
    temple: 'spiritual',
    beach: 'nature',
    cafe_meal: 'food',
    transit_hub: 'transport',
    heritage: 'sights',
    nature: 'nature',
    stay: 'stay',
    market: 'activity',
  };
  return {
    id: poi.placeRefId,
    refId: poi.placeRefId,
    name: poi.name,
    nameLocal: poi.nameHi ? { hi: poi.nameHi } : {},
    category: catMap[poi.category] ?? 'activity',
    subtype: poi.category,
    lat: poi.lat,
    lng: poi.lng,
    address: poi.address,
    website: null,
    openingHours: null,
    description: poi.accessibilityNotes || poi.address,
    whyVisit: poi.accessibilityNotes || null,
    typicalDurationMins: 60,
    bestTime: null,
    dietaryHints: poi.dietaryHints ?? [],
    image: null,
    popularity: 0.7,
    distanceM:
      near && isValidCoordinate(poi.lat, poi.lng)
        ? Math.round(haversineKm(near, { lat: poi.lat, lng: poi.lng }) * 1000)
        : null,
    origin: 'curated',
    wikipediaUrl: null,
    wikidataId: null,
  };
}

export async function fetchDestinationPlaces(params: {
  slug: string;
  name: string;
  category?: DiscoveryCategory;
  q?: string;
  near?: { lat: number; lng: number } | null;
  bbox?: string | null;
  limit?: number;
  signal?: AbortSignal;
}): Promise<PlacesFetchResult> {
  const qs = new URLSearchParams();
  if (params.category) qs.set('category', params.category);
  if (params.q?.trim()) qs.set('q', params.q.trim());
  if (params.near && isValidCoordinate(params.near.lat, params.near.lng)) {
    qs.set('near', `${params.near.lat.toFixed(5)},${params.near.lng.toFixed(5)}`);
    qs.set('radius', '12000');
  }
  if (params.bbox?.trim()) {
    qs.set('bbox', params.bbox.trim());
  }
  qs.set('limit', String(params.limit ?? 24));

  try {
    const res = await fetch(
      `${browserApiBase()}/v1/destinations/${encodeURIComponent(params.slug)}/places?${qs.toString()}`,
      { signal: params.signal }
    );

    if (res.ok || res.status === 202) {
      const data = (await res.json()) as {
        status: PackBuildStatus;
        source: 'pack' | 'live';
        destination: { slug: string; name: string };
        places: DiscoveredPlace[];
        attribution: string;
      };
      return {
        status: data.status,
        source: data.source,
        destination: data.destination,
        places: data.places ?? [],
        attribution: data.attribution,
      };
    }

    // Secondary open-POI fallback (/v1/places/search) when slug is not in destinations DB
    const poiQs = new URLSearchParams({
      q: params.q?.trim() || params.name,
      limit: String(params.limit ?? 24),
    });
    if (params.near) {
      poiQs.set('lat', String(params.near.lat));
      poiQs.set('lng', String(params.near.lng));
    }
    const poiRes = await fetch(
      `${browserApiBase()}/v1/places/search?${poiQs.toString()}`,
      { signal: params.signal }
    );
    if (poiRes.ok) {
      const poiBody = (await poiRes.json()) as {
        results?: OpenPoiResult[];
        attribution?: string;
      };
      const mapped = (poiBody.results ?? []).map((r) =>
        mapOpenPoiToDiscoveredPlace(r, params.near)
      );
      if (mapped.length > 0) {
        return {
          status: 'ready',
          source: 'pack',
          destination: { slug: params.slug, name: params.name },
          places: mapped,
          attribution:
            poiBody.attribution ??
            '© OpenStreetMap contributors · Overture Maps · Wikidata',
        };
      }
    }
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      throw err;
    }
  }

  return buildOfflinePlacesFallback(params);
}
