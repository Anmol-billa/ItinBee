import type { LabelShape } from '@/components/world/DieCutLabel';
import { MONTH_NAMES, SHOWCASE } from '@/data/showcase';
import { fetchExplore, type ExploreResult } from '@/lib/explore-client';
import { allPhotoCredits, getPhoto } from '@/lib/photos';

export const PLACE_CATEGORIES = [
  { id: 'sights', label: 'Top sights' },
  { id: 'culture', label: 'Culture & heritage' },
  { id: 'nature', label: 'Nature' },
  { id: 'food', label: 'Food' },
  { id: 'cafe', label: 'Cafes' },
  { id: 'spiritual', label: 'Spiritual' },
  { id: 'activity', label: 'Activities' },
  { id: 'stay', label: 'Stays' },
] as const;

export type PlaceCategoryId = (typeof PLACE_CATEGORIES)[number]['id'] | 'nightlife' | 'transport';
export type DestinationKind = 'country' | 'state' | 'region' | 'city' | 'area';
export type PackStatus = 'none' | 'building' | 'ready' | 'stale';

export interface DestinationImage {
  url: string;
  author: string | null;
  license: string | null;
  licenseUrl?: string | null;
  sourceUrl: string | null;
}

export interface DestinationSummary {
  id: string;
  slug: string;
  name: string;
  kind: DestinationKind;
  parentSlug: string | null;
  countryCode: string;
  lat: number;
  lng: number;
  aliases: string[];
  bestMonths: number[];
  heroImage: DestinationImage | null;
  packStatus: PackStatus;
  /** Optional editorial landscape tag for grouping in fallback/UI. */
  vibe?: 'hills' | 'beaches' | 'heritage' | 'spiritual' | 'city';
  typicalDays?: number;
  regionLabel?: string;
}

export interface DestinationTreeNode extends DestinationSummary {
  children: DestinationTreeNode[];
}

export interface DestinationPlace {
  id: string;
  refId: string;
  name: string;
  category: string;
  subtype: string | null;
  lat: number;
  lng: number;
  address: string | null;
  description: string | null;
  whyVisit: string | null;
  typicalDurationMins: number | null;
  bestTime: string | null;
  dietaryHints: string[];
  image: DestinationImage | null;
  /** 0..1 open-data prominence score — NEVER a star rating. */
  popularity: number;
  origin: 'pack' | 'curated' | 'live';
  wikipediaUrl: string | null;
}

export interface DestinationHubData {
  destinations: DestinationSummary[];
  tree: DestinationTreeNode[];
  fallback: boolean;
}

export interface DestinationDetailData {
  destination: DestinationSummary & {
    summary: string | null;
    wikipediaTitle: string | null;
  };
  breadcrumb: Array<{ slug: string; name: string; kind: DestinationKind }>;
  children: DestinationSummary[];
  placeCounts: Record<string, number>;
  attribution: string;
  fallback: boolean;
}

export interface DestinationPlacesData {
  status: PackStatus;
  source: 'pack' | 'live';
  total: number;
  places: DestinationPlace[];
  attribution: string;
  fallback: boolean;
}

const PHOTO_SLUGS = new Set(allPhotoCredits().map((p) => p.slug));

export function hasLocalPhoto(slug: string): boolean {
  return PHOTO_SLUGS.has(slug);
}

const SHAPES: LabelShape[] = ['round', 'arch', 'notch', 'oval'];

export function shapeForSlug(slug: string): LabelShape {
  const sc = SHOWCASE.find((s) => s.slug === slug);
  if (sc) return sc.shape;
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) | 0;
  return SHAPES[Math.abs(hash) % SHAPES.length]!;
}

export function formatBestMonths(months: number[]): string {
  if (!months || months.length === 0) return 'Year-round';
  if (months.length >= 10) return 'Year-round';
  const names = months
    .filter((m) => m >= 1 && m <= 12)
    .map((m) => MONTH_NAMES[m - 1]!.slice(0, 3));
  if (names.length <= 4) return names.join(', ');
  return `${names[0]} – ${names[names.length - 1]}`;
}

function apiBase(): string {
  const internal = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || '127.0.0.1:4000';
  const normalized = internal.startsWith('http') ? internal : `http://${internal}`;
  return normalized.replace(/\/+$/, '');
}

/* ----- Fallback Destinations Catalog (derived from SHOWCASE + hierarchy) ----- */

interface FallbackSeed {
  slug: string;
  name: string;
  kind: DestinationKind;
  parentSlug: string | null;
  countryCode: string;
  lat: number;
  lng: number;
  bestMonths: number[];
  typicalDays: number;
  regionLabel: string;
  vibe: DestinationSummary['vibe'];
  summary: string;
}

const FALLBACK_SEEDS: FallbackSeed[] = [
  // Countries
  {
    slug: 'india',
    name: 'India',
    kind: 'country',
    parentSlug: null,
    countryCode: 'IN',
    lat: 21.1458,
    lng: 79.0882,
    bestMonths: [10, 11, 12, 1, 2, 3],
    typicalDays: 7,
    regionLabel: 'South Asia',
    vibe: 'heritage',
    summary: 'Himalayan passes, Konkan and Kerala coastlines, desert forts and river ghats connected by rail, road and air.',
  },
  {
    slug: 'vietnam',
    name: 'Vietnam',
    kind: 'country',
    parentSlug: null,
    countryCode: 'VN',
    lat: 16.0471,
    lng: 108.2068,
    bestMonths: [10, 11, 12, 1, 2, 3, 4],
    typicalDays: 7,
    regionLabel: 'Southeast Asia',
    vibe: 'heritage',
    summary: 'Limestone karsts of Ha Long Bay, Hanoi street-side ca phe, and lantern-lit evenings in Hoi An.',
  },
  {
    slug: 'japan',
    name: 'Japan',
    kind: 'country',
    parentSlug: null,
    countryCode: 'JP',
    lat: 36.2048,
    lng: 138.2529,
    bestMonths: [3, 4, 5, 10, 11],
    typicalDays: 8,
    regionLabel: 'East Asia',
    vibe: 'heritage',
    summary: 'Cedar shrines, bullet-train corridors and seasonal foliage from Kyoto to Tokyo.',
  },
  {
    slug: 'indonesia',
    name: 'Indonesia',
    kind: 'country',
    parentSlug: null,
    countryCode: 'ID',
    lat: -8.4095,
    lng: 115.1889,
    bestMonths: [4, 5, 6, 7, 8, 9, 10],
    typicalDays: 6,
    regionLabel: 'Southeast Asia',
    vibe: 'beaches',
    summary: 'Volcanic highlands, terraced rice valleys and Indian Ocean surf breaks.',
  },
  {
    slug: 'portugal',
    name: 'Portugal',
    kind: 'country',
    parentSlug: null,
    countryCode: 'PT',
    lat: 38.7223,
    lng: -9.1393,
    bestMonths: [3, 4, 5, 6, 9, 10],
    typicalDays: 6,
    regionLabel: 'Europe',
    vibe: 'city',
    summary: 'Tiled hillside neighbourhoods, yellow trams and Atlantic viewpoints.',
  },

  // Indian States & Regions
  {
    slug: 'himachal-pradesh',
    name: 'Himachal Pradesh',
    kind: 'state',
    parentSlug: 'india',
    countryCode: 'IN',
    lat: 31.8,
    lng: 77.2,
    bestMonths: [4, 5, 6, 9, 10],
    typicalDays: 6,
    regionLabel: 'North India · Himalayas',
    vibe: 'hills',
    summary: 'High-altitude monasteries in Spiti, pine valleys around Manali and riverside walks in Parvati Valley.',
  },
  {
    slug: 'rajasthan',
    name: 'Rajasthan',
    kind: 'state',
    parentSlug: 'india',
    countryCode: 'IN',
    lat: 26.9124,
    lng: 74.2179,
    bestMonths: [10, 11, 12, 1, 2, 3],
    typicalDays: 6,
    regionLabel: 'West India · Heritage',
    vibe: 'heritage',
    summary: 'Hilltop forts, lake palaces, stepwells and desert dunes across Jaipur, Udaipur, Jodhpur and Jaisalmer.',
  },
  {
    slug: 'kerala',
    name: 'Kerala',
    kind: 'state',
    parentSlug: 'india',
    countryCode: 'IN',
    lat: 10.1632,
    lng: 76.6413,
    bestMonths: [9, 10, 11, 12, 1, 2, 3],
    typicalDays: 6,
    regionLabel: 'South India · Coast & Hills',
    vibe: 'beaches',
    summary: 'Munnar tea estates, tranquil Alleppey backwater canals and Fort Kochi spice-harbour streets.',
  },
  {
    slug: 'uttarakhand',
    name: 'Uttarakhand',
    kind: 'state',
    parentSlug: 'india',
    countryCode: 'IN',
    lat: 30.0668,
    lng: 79.0193,
    bestMonths: [9, 10, 11, 2, 3, 4, 5],
    typicalDays: 4,
    regionLabel: 'North India · Himalayas',
    vibe: 'hills',
    summary: 'Ganga ghats in Rishikesh and Haridwar paired with quiet deodar ridges in Landour and Kumaon.',
  },
  {
    slug: 'karnataka',
    name: 'Karnataka',
    kind: 'state',
    parentSlug: 'india',
    countryCode: 'IN',
    lat: 15.3173,
    lng: 75.7139,
    bestMonths: [10, 11, 12, 1, 2],
    typicalDays: 4,
    regionLabel: 'South India · Heritage & Hills',
    vibe: 'heritage',
    summary: 'Boulder-strewn Vijayanagara ruins at Hampi, coffee estates of Coorg and Arabian Sea coves at Gokarna.',
  },
  {
    slug: 'uttar-pradesh',
    name: 'Uttar Pradesh',
    kind: 'state',
    parentSlug: 'india',
    countryCode: 'IN',
    lat: 25.3176,
    lng: 82.9739,
    bestMonths: [10, 11, 12, 1, 2, 3],
    typicalDays: 3,
    regionLabel: 'North India · Spiritual & Heritage',
    vibe: 'spiritual',
    summary: 'Sunrise ghats of Varanasi, Buddhist stupas of Sarnath and Mughal architecture.',
  },
  {
    slug: 'goa',
    name: 'Goa',
    kind: 'state',
    parentSlug: 'india',
    countryCode: 'IN',
    lat: 15.2993,
    lng: 74.124,
    bestMonths: [11, 12, 1, 2],
    typicalDays: 5,
    regionLabel: 'Konkan Coast',
    vibe: 'beaches',
    summary: 'Quiet South Goa crescents at Palolem and Agonda, Portuguese Latin Quarter lanes in Fontainhas and spice plantations.',
  },
  {
    slug: 'ladakh',
    name: 'Ladakh',
    kind: 'region',
    parentSlug: 'india',
    countryCode: 'IN',
    lat: 34.1526,
    lng: 77.5771,
    bestMonths: [6, 7, 8, 9],
    typicalDays: 8,
    regionLabel: 'Trans-Himalaya',
    vibe: 'hills',
    summary: 'Acclimatised routes from Leh to Nubra Valley, Pangong Tso and centuries-old gompas.',
  },
  {
    slug: 'west-bengal',
    name: 'West Bengal',
    kind: 'state',
    parentSlug: 'india',
    countryCode: 'IN',
    lat: 27.041,
    lng: 88.2663,
    bestMonths: [3, 4, 5, 10, 11],
    typicalDays: 4,
    regionLabel: 'East India',
    vibe: 'hills',
    summary: 'Darjeeling toy-train ridges under Kanchenjunga and heritage streets of Kolkata.',
  },

  // Indian Cities & Sub-regions
  {
    slug: 'spiti-valley',
    name: 'Spiti Valley',
    kind: 'region',
    parentSlug: 'himachal-pradesh',
    countryCode: 'IN',
    lat: 32.2461,
    lng: 78.0349,
    bestMonths: [5, 6, 7, 8, 9, 10],
    typicalDays: 7,
    regionLabel: 'Himachal Pradesh',
    vibe: 'hills',
    summary: 'Cold-desert valley of Key, Dhankar and Tabo monasteries, high villages at Kibber and Langza, and star-filled skies.',
  },
  {
    slug: 'manali',
    name: 'Manali',
    kind: 'city',
    parentSlug: 'himachal-pradesh',
    countryCode: 'IN',
    lat: 32.2432,
    lng: 77.1892,
    bestMonths: [3, 4, 5, 6, 10, 11],
    typicalDays: 4,
    regionLabel: 'Himachal Pradesh',
    vibe: 'hills',
    summary: 'Cedar-shaded Hadimba Temple, Old Manali orchards and gateway passes toward Solang and Lahaul.',
  },
  {
    slug: 'kasol',
    name: 'Kasol',
    kind: 'city',
    parentSlug: 'himachal-pradesh',
    countryCode: 'IN',
    lat: 32.0099,
    lng: 77.3149,
    bestMonths: [3, 4, 5, 6, 9, 10],
    typicalDays: 3,
    regionLabel: 'Himachal Pradesh',
    vibe: 'hills',
    summary: 'Parvati River footpath trails to Chalal, Manikaran hot springs and pine-rimmed cafes.',
  },
  {
    slug: 'jaipur',
    name: 'Jaipur',
    kind: 'city',
    parentSlug: 'rajasthan',
    countryCode: 'IN',
    lat: 26.9124,
    lng: 75.7873,
    bestMonths: [10, 11, 12, 1, 2, 3],
    typicalDays: 4,
    regionLabel: 'Rajasthan',
    vibe: 'heritage',
    summary: 'pink-sandstone Hawa Mahal, Amer Fort ramparts, Jantar Mantar instruments and block-printing bazaars.',
  },
  {
    slug: 'udaipur',
    name: 'Udaipur',
    kind: 'city',
    parentSlug: 'rajasthan',
    countryCode: 'IN',
    lat: 24.5854,
    lng: 73.7125,
    bestMonths: [10, 11, 12, 1, 2, 3],
    typicalDays: 3,
    regionLabel: 'Rajasthan',
    vibe: 'heritage',
    summary: 'Lake Pichola ghats, City Palace courtyards, Bagore Ki Haveli folk evenings and Aravalli sunset viewpoints.',
  },
  {
    slug: 'jodhpur',
    name: 'Jodhpur',
    kind: 'city',
    parentSlug: 'rajasthan',
    countryCode: 'IN',
    lat: 26.2389,
    lng: 73.0243,
    bestMonths: [10, 11, 12, 1, 2, 3],
    typicalDays: 3,
    regionLabel: 'Rajasthan',
    vibe: 'heritage',
    summary: 'Mehrangarh Fort towering above blue-painted Brahmpuri lanes, Rao Jodha Desert Rock Park and clock-tower spice stalls.',
  },
  {
    slug: 'jaisalmer',
    name: 'Jaisalmer',
    kind: 'city',
    parentSlug: 'rajasthan',
    countryCode: 'IN',
    lat: 26.9157,
    lng: 70.9083,
    bestMonths: [11, 12, 1, 2],
    typicalDays: 3,
    regionLabel: 'Rajasthan',
    vibe: 'heritage',
    summary: 'Living golden-sandstone fort, carved Patwon Ki Haveli facades and quiet Thar desert dunes around Khuri.',
  },
  {
    slug: 'alleppey',
    name: 'Alleppey',
    kind: 'city',
    parentSlug: 'kerala',
    countryCode: 'IN',
    lat: 9.4981,
    lng: 76.3388,
    bestMonths: [11, 12, 1, 2],
    typicalDays: 4,
    regionLabel: 'Kerala',
    vibe: 'beaches',
    summary: 'Palm-fringed Vembanad canals, shikara canoe rides through narrow village waterways and Marari beach sunsets.',
  },
  {
    slug: 'munnar',
    name: 'Munnar',
    kind: 'city',
    parentSlug: 'kerala',
    countryCode: 'IN',
    lat: 10.0889,
    lng: 77.0595,
    bestMonths: [9, 10, 11, 12, 1, 2, 3],
    typicalDays: 3,
    regionLabel: 'Kerala',
    vibe: 'hills',
    summary: 'Rolling Western Ghats tea gardens, Eravikulam Nilgiri tahr slopes and misty Top Station mornings.',
  },
  {
    slug: 'rishikesh',
    name: 'Rishikesh',
    kind: 'city',
    parentSlug: 'uttarakhand',
    countryCode: 'IN',
    lat: 30.0869,
    lng: 78.2676,
    bestMonths: [9, 10, 11, 2, 3, 4],
    typicalDays: 3,
    regionLabel: 'Uttarakhand',
    vibe: 'spiritual',
    summary: 'Evening Ganga aarti at Triveni and Parmarth ghats, suspension bridges, white-water stretches and forested cafes.',
  },
  {
    slug: 'hampi',
    name: 'Hampi',
    kind: 'city',
    parentSlug: 'karnataka',
    countryCode: 'IN',
    lat: 15.335,
    lng: 76.46,
    bestMonths: [10, 11, 12, 1, 2],
    typicalDays: 3,
    regionLabel: 'Karnataka',
    vibe: 'heritage',
    summary: 'Vittala stone chariot, Virupaksha temple bazaar, coracle crossings on the Tungabhadra and Matanga Hill sunrise.',
  },
  {
    slug: 'varanasi',
    name: 'Varanasi',
    kind: 'city',
    parentSlug: 'uttar-pradesh',
    countryCode: 'IN',
    lat: 25.3176,
    lng: 82.9739,
    bestMonths: [10, 11, 12, 1, 2, 3],
    typicalDays: 3,
    regionLabel: 'Uttar Pradesh',
    vibe: 'spiritual',
    summary: 'Dawn boat rides along Assi to Dashashwamedh ghats, Kashi Vishwanath corridor, kachori alleys and nearby Sarnath.',
  },
  {
    slug: 'darjeeling',
    name: 'Darjeeling',
    kind: 'city',
    parentSlug: 'west-bengal',
    countryCode: 'IN',
    lat: 27.041,
    lng: 88.2663,
    bestMonths: [3, 4, 5, 10, 11],
    typicalDays: 4,
    regionLabel: 'West Bengal',
    vibe: 'hills',
    summary: 'First-flush tea estates, Himalayan Railway steam loops, Observatory Hill monasteries and clear Kanchenjunga dawns.',
  },

  // International Cities & Regions
  {
    slug: 'kyoto',
    name: 'Kyoto',
    kind: 'city',
    parentSlug: 'japan',
    countryCode: 'JP',
    lat: 35.0116,
    lng: 135.7681,
    bestMonths: [3, 4, 5, 10, 11],
    typicalDays: 5,
    regionLabel: 'Japan',
    vibe: 'heritage',
    summary: 'Fushimi Inari vermilion torii trails, Arashiyama bamboo groves, Gion wooden machiya lanes and Uji matcha houses.',
  },
  {
    slug: 'bali',
    name: 'Bali',
    kind: 'region',
    parentSlug: 'indonesia',
    countryCode: 'ID',
    lat: -8.4095,
    lng: 115.1889,
    bestMonths: [4, 5, 6, 7, 8, 9, 10],
    typicalDays: 6,
    regionLabel: 'Indonesia',
    vibe: 'beaches',
    summary: 'Ubud Tegallalang subak terraces, Uluwatu cliff temples, Sidemen valley walks and Nusa island coves.',
  },
  {
    slug: 'ha-noi',
    name: 'Hanoi',
    kind: 'city',
    parentSlug: 'vietnam',
    countryCode: 'VN',
    lat: 21.0278,
    lng: 105.8342,
    bestMonths: [10, 11, 12, 1, 2, 3, 4],
    typicalDays: 3,
    regionLabel: 'Vietnam',
    vibe: 'city',
    summary: 'Hoan Kiem morning walks, Old Quarter 36 guild streets, egg coffee balconies and Temple of Literature courtyards.',
  },
  {
    slug: 'ha-long-bay',
    name: 'Ha Long Bay',
    kind: 'region',
    parentSlug: 'vietnam',
    countryCode: 'VN',
    lat: 20.9101,
    lng: 107.1839,
    bestMonths: [10, 11, 12, 1, 2, 3, 4],
    typicalDays: 3,
    regionLabel: 'Vietnam',
    vibe: 'beaches',
    summary: 'Emerald Gulf of Tonkin waters dotted with towering limestone islands, kayaking lagoons and Lan Ha Bay anchorages.',
  },
  {
    slug: 'lisbon',
    name: 'Lisbon',
    kind: 'city',
    parentSlug: 'portugal',
    countryCode: 'PT',
    lat: 38.7223,
    lng: -9.1393,
    bestMonths: [3, 4, 5, 6, 9, 10],
    typicalDays: 4,
    regionLabel: 'Portugal',
    vibe: 'city',
    summary: 'Alfama miradouros over the Tagus, Belém maritime monuments, pastelarias and day trips to Sintra.',
  },
];

function seedToSummary(s: FallbackSeed): DestinationSummary {
  let heroImage: DestinationImage | null = null;
  if (hasLocalPhoto(s.slug)) {
    const p = getPhoto(s.slug);
    heroImage = { url: p.src, author: p.author, license: p.license, sourceUrl: p.sourceUrl };
  }
  return {
    id: `seed:${s.slug}`,
    slug: s.slug,
    name: s.name,
    kind: s.kind,
    parentSlug: s.parentSlug,
    countryCode: s.countryCode,
    lat: s.lat,
    lng: s.lng,
    aliases: [],
    bestMonths: s.bestMonths,
    heroImage,
    packStatus: 'ready',
    vibe: s.vibe,
    typicalDays: s.typicalDays,
    regionLabel: s.regionLabel,
  };
}

function buildTree(list: DestinationSummary[]): DestinationTreeNode[] {
  const map = new Map<string, DestinationTreeNode>(
    list.map((d) => [d.slug, { ...d, children: [] }])
  );
  const roots: DestinationTreeNode[] = [];
  for (const node of map.values()) {
    const parent = node.parentSlug ? map.get(node.parentSlug) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

const FALLBACK_PLACES_BY_DEST: Record<string, Array<Omit<DestinationPlace, 'id' | 'refId' | 'origin' | 'image' | 'wikipediaUrl'> & { photoSlug?: string }>> = {
  jaipur: [
    {
      name: 'Hawa Mahal',
      category: 'sights',
      subtype: 'palace',
      lat: 26.9239,
      lng: 75.8267,
      address: 'Badi Choupad, Pink City',
      description: 'Five-storey latticework sandstone screen built in 1799 so royal women could observe street processions.',
      whyVisit: 'Best photographed in early morning sun from the Wind View cafes across Sireh Deori Bazaar.',
      typicalDurationMins: 60,
      bestTime: '08:30–10:00',
      dietaryHints: [],
      popularity: 0.92,
      photoSlug: 'jaipur',
    },
    {
      name: 'Amer Fort',
      category: 'culture',
      subtype: 'fort',
      lat: 26.9855,
      lng: 75.8513,
      address: 'Devisinghpura, Amer',
      description: 'Hilltop Kachwaha citadel overlooking Maota Lake with Sheesh Mahal mirror mosaics and Diwan-i-Aam courtyard.',
      whyVisit: 'Arrive at opening to walk the cobblestoned ramparts before tour buses arrive.',
      typicalDurationMins: 150,
      bestTime: 'Morning',
      dietaryHints: [],
      popularity: 0.95,
    },
    {
      name: 'Lassiwala (MI Road)',
      category: 'food',
      subtype: 'sweet_shop',
      lat: 26.9162,
      lng: 75.808,
      address: 'Shop 312, Mirza Ismail Road',
      description: 'Thick earthen-kulhad yoghurt lassi served fresh since 1944 until mid-afternoon.',
      whyVisit: 'Classic vegetarian refreshment stop between Old City sights.',
      typicalDurationMins: 30,
      bestTime: 'Before 14:00',
      dietaryHints: ['Vegetarian'],
      popularity: 0.74,
    },
    {
      name: 'Panna Meena ka Kund',
      category: 'culture',
      subtype: 'stepwell',
      lat: 26.9877,
      lng: 75.853,
      address: 'Near Anokhi Museum, Amer',
      description: 'Sixteenth-century square stepwell with symmetrical criss-crossing stone staircases.',
      whyVisit: 'Quiet architectural gem five minutes below Amer Fort.',
      typicalDurationMins: 45,
      bestTime: 'Morning',
      dietaryHints: [],
      popularity: 0.78,
    },
  ],
  udaipur: [
    {
      name: 'City Palace, Udaipur',
      category: 'sights',
      subtype: 'palace',
      lat: 24.5764,
      lng: 73.6835,
      address: 'Old City, Lake Pichola',
      description: 'Granite and marble Mewar palace complex rising along the eastern bank of Lake Pichola.',
      whyVisit: 'Panoramic jharokha balconies, Mor Chowk peacock mosaics and crystal galleries.',
      typicalDurationMins: 140,
      bestTime: '09:30–12:00',
      dietaryHints: [],
      popularity: 0.93,
      photoSlug: 'udaipur',
    },
    {
      name: 'Gangaur Ghat',
      category: 'spiritual',
      subtype: 'ghat',
      lat: 24.5797,
      lng: 73.6819,
      address: 'Near Bagore Ki Haveli',
      description: 'Triple-arched stone waterfront ghat looking straight across Lake Pichola.',
      whyVisit: 'Calm dawn light and evening folk dance performances next door at Bagore Ki Haveli.',
      typicalDurationMins: 50,
      bestTime: 'Sunrise or 18:30',
      dietaryHints: [],
      popularity: 0.79,
    },
  ],
  rishikesh: [
    {
      name: 'Parmarth Niketan Ganga Aarti',
      category: 'spiritual',
      subtype: 'ghat',
      lat: 30.1194,
      lng: 78.3125,
      address: 'Swarg Ashram, Ram Jhula',
      description: 'Evening riverside lamp ceremony with Vedic chants along the pedestrian east bank.',
      whyVisit: 'Accessible riverfront steps with seating options for senior travellers.',
      typicalDurationMins: 75,
      bestTime: '17:45–19:00',
      dietaryHints: ['Vegetarian'],
      popularity: 0.88,
      photoSlug: 'rishikesh',
    },
    {
      name: 'Chotiwala & Swarg Ashram Bhojanalayas',
      category: 'food',
      subtype: 'restaurant',
      lat: 30.1225,
      lng: 78.3131,
      address: 'Ram Jhula East Bank',
      description: 'Pure-vegetarian Garhwali and North Indian thalis served steps from the ghats.',
      whyVisit: 'Sattvic and Jain-friendly meal options without onion/garlic on request.',
      typicalDurationMins: 55,
      bestTime: 'Lunch',
      dietaryHints: ['Vegetarian', 'Jain'],
      popularity: 0.71,
    },
  ],
  varanasi: [
    {
      name: 'Dashashwamedh & Assi Ghat Sunrise Boat',
      category: 'spiritual',
      subtype: 'ghat',
      lat: 25.3069,
      lng: 83.0104,
      address: 'Dashashwamedh Ghat, Varanasi',
      description: 'Historic riverfront steps stretching along the crescent west bank of the Ganga.',
      whyVisit: 'Rowboat or electric boat ride at daybreak sees Subah-e-Banaras without street crowds.',
      typicalDurationMins: 90,
      bestTime: '05:30–07:00',
      dietaryHints: [],
      popularity: 0.94,
      photoSlug: 'varanasi',
    },
    {
      name: 'Sarnath Dhamek Stupa',
      category: 'culture',
      subtype: 'monument',
      lat: 25.3809,
      lng: 83.0245,
      address: 'Sarnath, 10 km northeast of Varanasi',
      description: 'Fifth-century cylindrical brick stupa marking the deer park of the Buddha’s first discourse.',
      whyVisit: 'Level, shaded garden paths ideal for an unhurried afternoon outing.',
      typicalDurationMins: 90,
      bestTime: '15:30–17:30',
      dietaryHints: [],
      popularity: 0.85,
    },
  ],
  goa: [
    {
      name: 'Palolem & Agonda Coves',
      category: 'nature',
      subtype: 'beach',
      lat: 15.01,
      lng: 74.0232,
      address: 'Canacona, South Goa',
      description: 'Sheltered crescent bays lined with coconut palms, calm morning swim waters and kayak rentals.',
      whyVisit: 'Far gentler waves and quieter evenings than the North Goa belt.',
      typicalDurationMins: 150,
      bestTime: 'Morning or Sunset',
      dietaryHints: [],
      popularity: 0.87,
      photoSlug: 'goa',
    },
    {
      name: 'Fontainhas Latin Quarter',
      category: 'culture',
      subtype: 'neighbourhood',
      lat: 15.4959,
      lng: 73.8318,
      address: 'Panjim, Goa',
      description: 'Ochre, indigo and terracotta Portuguese villas, azulejo nameplates and heritage bakeries.',
      whyVisit: 'Walkable morning trail ending with poee bread and filter coffee.',
      typicalDurationMins: 90,
      bestTime: '08:30–10:30',
      dietaryHints: [],
      popularity: 0.81,
    },
  ],
};

function buildFallbackPlaces(slug: string, category?: string): DestinationPlace[] {
  const seeds = FALLBACK_SEEDS.filter((s) => s.slug === slug || s.parentSlug === slug);
  const targetSlugs = seeds.map((s) => s.slug);
  const rawList: DestinationPlace[] = [];

  for (const s of targetSlugs) {
    const entries = FALLBACK_PLACES_BY_DEST[s] ?? [];
    for (const e of entries) {
      let image: DestinationImage | null = null;
      if (e.photoSlug && hasLocalPhoto(e.photoSlug)) {
        const p = getPhoto(e.photoSlug);
        image = { url: p.src, author: p.author, license: p.license, sourceUrl: p.sourceUrl };
      }
      rawList.push({
        id: `curated:${s}:${e.name.toLowerCase().replace(/\W+/g, '-')}`,
        refId: `curated:${s}:${e.name.toLowerCase().replace(/\W+/g, '-')}`,
        name: e.name,
        category: e.category,
        subtype: e.subtype,
        lat: e.lat,
        lng: e.lng,
        address: e.address,
        description: e.description,
        whyVisit: e.whyVisit,
        typicalDurationMins: e.typicalDurationMins,
        bestTime: e.bestTime,
        dietaryHints: e.dietaryHints,
        image,
        popularity: e.popularity,
        origin: 'curated',
        wikipediaUrl: null,
      });
    }
  }

  // Synthesize representative landmarks from child/showcase metadata if no explicit place rows exist
  if (rawList.length === 0) {
    const targetSeed = FALLBACK_SEEDS.find((s) => s.slug === slug);
    const name = targetSeed?.name ?? slug.replace(/-/g, ' ');
    const imgSlug = targetSeed && hasLocalPhoto(targetSeed.slug) ? targetSeed.slug : undefined;
    const p = imgSlug ? getPhoto(imgSlug) : null;
    const baseImg = p ? { url: p.src, author: p.author, license: p.license, sourceUrl: p.sourceUrl } : null;
    const lat = targetSeed?.lat ?? 20.59;
    const lng = targetSeed?.lng ?? 78.96;

    rawList.push(
      {
        id: `curated:${slug}:historic-core`,
        refId: `curated:${slug}:historic-core`,
        name: `${name} Old Quarter & Heritage Core`,
        category: 'sights',
        subtype: 'landmark',
        lat,
        lng,
        address: name,
        description: targetSeed?.summary ?? `Signature landmarks and walkable heritage core in ${name}.`,
        whyVisit: 'Start your first morning here to get oriented before heading to outlying viewpoints.',
        typicalDurationMins: 120,
        bestTime: 'Morning',
        dietaryHints: [],
        image: baseImg,
        popularity: 0.86,
        origin: 'curated',
        wikipediaUrl: null,
      },
      {
        id: `curated:${slug}:local-kitchens`,
        refId: `curated:${slug}:local-kitchens`,
        name: `${name} Regional Kitchens & Market Walk`,
        category: 'food',
        subtype: 'market',
        lat: lat + 0.01,
        lng: lng + 0.01,
        address: `Central ${name}`,
        description: `Traditional local dishes, tea houses and seasonal produce stalls in ${name}.`,
        whyVisit: 'Easy to pair with an evening stroll.',
        typicalDurationMins: 75,
        bestTime: 'Evening',
        dietaryHints: ['Vegetarian'],
        image: null,
        popularity: 0.72,
        origin: 'curated',
        wikipediaUrl: null,
      },
      {
        id: `curated:${slug}:scenic-viewpoint`,
        refId: `curated:${slug}:scenic-viewpoint`,
        name: `${name} Panorama & Nature Trail`,
        category: 'nature',
        subtype: 'viewpoint',
        lat: lat - 0.012,
        lng: lng + 0.008,
        address: name,
        description: `Open air lookout and gentle trail surrounding ${name}.`,
        whyVisit: 'Clear golden-hour light and calmer crowds.',
        typicalDurationMins: 90,
        bestTime: 'Late afternoon',
        dietaryHints: [],
        image: null,
        popularity: 0.68,
        origin: 'curated',
        wikipediaUrl: null,
      }
    );
  }

  return category ? rawList.filter((item) => item.category === category) : rawList;
}

export const FALLBACK_ATTRIBUTION =
  'Place data © OpenStreetMap contributors (ODbL) · Wikivoyage & Wikipedia text CC BY-SA 4.0 · Photographs: Wikimedia Commons (per-image licence)';

/* ----- Live Fetchers with Graceful Fallback ----- */

export async function fetchDestinationsHub(): Promise<DestinationHubData> {
  try {
    const res = await fetch(`${apiBase()}/v1/destinations?tree=true`, {
      next: { revalidate: 120 },
      signal: AbortSignal.timeout(2500),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        destinations: DestinationSummary[];
        tree?: DestinationTreeNode[];
      };
      if (data.destinations && data.destinations.length > 0) {
        // Hydrate local hero photos when backend heroImage is null
        const enriched = data.destinations.map((d) => {
          const sc = SHOWCASE.find((s) => s.slug === d.slug);
          let heroImage = d.heroImage;
          if (!heroImage && hasLocalPhoto(d.slug)) {
            const p = getPhoto(d.slug);
            heroImage = { url: p.src, author: p.author, license: p.license, sourceUrl: p.sourceUrl };
          }
          return {
            ...d,
            heroImage,
            typicalDays: sc?.days,
            regionLabel: sc?.region,
          };
        });
        return {
          destinations: enriched,
          tree: data.tree && data.tree.length > 0 ? data.tree : buildTree(enriched),
          fallback: false,
        };
      }
    }
  } catch {
    /* fall through to showcase hierarchy */
  }

  const summaries = FALLBACK_SEEDS.map(seedToSummary);
  return {
    destinations: summaries,
    tree: buildTree(summaries),
    fallback: true,
  };
}

export async function fetchDestinationDetail(slug: string): Promise<DestinationDetailData | null> {
  const cleanSlug = slug.trim().toLowerCase();
  try {
    const res = await fetch(`${apiBase()}/v1/destinations/${encodeURIComponent(cleanSlug)}`, {
      next: { revalidate: 120 },
      signal: AbortSignal.timeout(2500),
    });
    if (res.ok) {
      const data = (await res.json()) as Omit<DestinationDetailData, 'fallback'>;
      let heroImage = data.destination.heroImage;
      if (!heroImage && hasLocalPhoto(data.destination.slug)) {
        const p = getPhoto(data.destination.slug);
        heroImage = { url: p.src, author: p.author, license: p.license, sourceUrl: p.sourceUrl };
      }
      return {
        ...data,
        destination: { ...data.destination, heroImage },
        fallback: false,
      };
    }
  } catch {
    /* fall through to showcase seed */
  }

  const seed = FALLBACK_SEEDS.find((s) => s.slug === cleanSlug);
  const showcaseHit = SHOWCASE.find((s) => s.slug === cleanSlug);
  if (!seed && !showcaseHit) return null;

  const resolvedSeed: FallbackSeed = seed ?? {
    slug: showcaseHit!.slug,
    name: showcaseHit!.name,
    kind: 'city',
    parentSlug: 'india',
    countryCode: ['kyoto', 'bali', 'ha-long-bay', 'ha-noi', 'lisbon'].includes(showcaseHit!.slug) ? 'XX' : 'IN',
    lat: 20.5937,
    lng: 78.9629,
    bestMonths: showcaseHit!.bestMonths,
    typicalDays: showcaseHit!.days,
    regionLabel: showcaseHit!.region,
    vibe: 'heritage',
    summary: `Plan a mapped ${showcaseHit!.days}-day itinerary in ${showcaseHit!.name}, ${showcaseHit!.region}.`,
  };

  const summaryDto = seedToSummary(resolvedSeed);
  const breadcrumb: Array<{ slug: string; name: string; kind: DestinationKind }> = [];
  let cursor = resolvedSeed.parentSlug
    ? FALLBACK_SEEDS.find((x) => x.slug === resolvedSeed.parentSlug)
    : undefined;
  while (cursor) {
    breadcrumb.unshift({ slug: cursor.slug, name: cursor.name, kind: cursor.kind });
    cursor = cursor.parentSlug ? FALLBACK_SEEDS.find((x) => x.slug === cursor!.parentSlug) : undefined;
  }

  const children = FALLBACK_SEEDS.filter((s) => s.parentSlug === resolvedSeed.slug).map(seedToSummary);
  const allPlaces = buildFallbackPlaces(resolvedSeed.slug);
  const placeCounts: Record<string, number> = {};
  for (const p of allPlaces) {
    placeCounts[p.category] = (placeCounts[p.category] ?? 0) + 1;
  }

  return {
    destination: {
      ...summaryDto,
      summary: resolvedSeed.summary,
      wikipediaTitle: resolvedSeed.name,
    },
    breadcrumb,
    children,
    placeCounts,
    attribution: FALLBACK_ATTRIBUTION,
    fallback: true,
  };
}

export async function fetchDestinationPlaces(
  slug: string,
  category?: string,
  limit = 24
): Promise<DestinationPlacesData> {
  const cleanSlug = slug.trim().toLowerCase();
  try {
    const sp = new URLSearchParams({ limit: String(limit) });
    if (category) sp.set('category', category);
    const res = await fetch(
      `${apiBase()}/v1/destinations/${encodeURIComponent(cleanSlug)}/places?${sp.toString()}`,
      {
        next: { revalidate: 60 },
        signal: AbortSignal.timeout(2500),
      }
    );
    if (res.ok) {
      const data = (await res.json()) as Omit<DestinationPlacesData, 'fallback'>;
      return { ...data, fallback: false };
    }
  } catch {
    /* fall through */
  }

  const places = buildFallbackPlaces(cleanSlug, category).slice(0, limit);
  return {
    status: 'ready',
    source: 'pack',
    total: places.length,
    places,
    attribution: FALLBACK_ATTRIBUTION,
    fallback: true,
  };
}

export async function fetchDestinationItineraries(slug: string): Promise<ExploreResult> {
  return fetchExplore({ dest: slug });
}
