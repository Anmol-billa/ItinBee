import type { PlaceCategory } from './types.js';
import type { WikivoyageListing } from './providers/types.js';

export interface Categorization {
  category: PlaceCategory;
  subtype: string;
}

const STAY_TOURISM = new Set([
  'hotel',
  'hostel',
  'guest_house',
  'motel',
  'apartment',
  'resort',
  'camp_site',
  'chalet',
  'alpine_hut',
  'wilderness_hut',
]);

const HIGH_CONFIDENCE_HISTORIC = new Set([
  'castle',
  'fort',
  'monument',
  'archaeological_site',
  'ruins',
  'palace',
  'manor',
  'city_gate',
  'citywalls',
  'battlefield',
  'tower',
  'tomb',
]);

const WORSHIP_HISTORIC = new Set(['temple', 'monastery', 'church', 'shrine']);

/** Tags that make a minor-looking object worth listing. */
export function hasNotabilitySignal(tags: Record<string, string>): boolean {
  return Boolean(
    tags.wikidata ||
      tags.wikipedia ||
      tags.wikimedia_commons ||
      tags.website ||
      tags['contact:website'] ||
      tags.heritage ||
      (tags['name:en'] && (tags.opening_hours || tags.description))
  );
}

/** Classifies an OpenStreetMap element. Returns null for junk (minor objects without any notability signal). */
export function categorizeOsm(tags: Record<string, string>): Categorization | null {
  const amenity = tags.amenity;
  const tourism = tags.tourism;
  const historic = tags.historic;
  const natural = tags.natural;
  const leisure = tags.leisure;

  if (amenity && ['restaurant', 'fast_food', 'food_court', 'ice_cream'].includes(amenity)) {
    return { category: 'food', subtype: amenity };
  }
  if (amenity === 'cafe') return { category: 'cafe', subtype: 'cafe' };
  if (amenity && ['bar', 'pub', 'nightclub', 'biergarten'].includes(amenity)) {
    return { category: 'nightlife', subtype: amenity };
  }
  if (tourism && STAY_TOURISM.has(tourism)) return { category: 'stay', subtype: tourism };

  if (amenity === 'place_of_worship') {
    return hasNotabilitySignal(tags)
      ? { category: 'spiritual', subtype: tags.religion ?? 'place_of_worship' }
      : null;
  }
  if (historic && WORSHIP_HISTORIC.has(historic)) {
    return hasNotabilitySignal(tags) || historic === 'monastery' || historic === 'temple'
      ? { category: 'spiritual', subtype: historic }
      : null;
  }
  if (tourism === 'museum' || tourism === 'gallery') {
    return { category: 'culture', subtype: tourism };
  }
  if (amenity === 'theatre' || amenity === 'arts_centre') {
    return hasNotabilitySignal(tags) ? { category: 'culture', subtype: amenity } : null;
  }
  if (tourism && ['zoo', 'theme_park', 'aquarium'].includes(tourism)) {
    return { category: 'activity', subtype: tourism };
  }
  if (historic) {
    if (HIGH_CONFIDENCE_HISTORIC.has(historic)) return { category: 'sights', subtype: historic };
    return hasNotabilitySignal(tags) ? { category: 'sights', subtype: historic } : null;
  }
  if (tourism === 'attraction' || tourism === 'viewpoint') {
    return { category: 'sights', subtype: tourism };
  }
  if (tourism === 'artwork') {
    return hasNotabilitySignal(tags) ? { category: 'sights', subtype: 'artwork' } : null;
  }
  if (natural) {
    return { category: 'nature', subtype: natural };
  }
  if (leisure && ['park', 'garden', 'nature_reserve'].includes(leisure)) {
    return hasNotabilitySignal(tags) || leisure === 'nature_reserve'
      ? { category: 'nature', subtype: leisure }
      : null;
  }
  return null;
}

const KEYWORDS: Array<{ re: RegExp; category: PlaceCategory; subtype: string }> = [
  { re: /\b(railway|metro|subway|train|bus|tram|ferry) (station|terminal|stop)\b|\bairport\b|\bjunction station\b|\bterminus\b/i, category: 'transport', subtype: 'station' },
  { re: /\b(zoo|zoological|theme park|amusement park|water park|aquarium|safari park|racecourse|stadium|casino)\b/i, category: 'activity', subtype: 'attraction' },
  { re: /\b(temple|mandir|shrine|mosque|masjid|church|cathedral|basilica|monastery|gompa|gurdwara|gurudwara|synagogue|dargah|ashram|pagoda|stupa|abbey|convent|chapel|math|vihara|jain|buddhist|hindu|sikh)\b/i, category: 'spiritual', subtype: 'worship' },
  { re: /\b(museum|gallery|theatre|theater|opera house|concert hall|library|cultural cent(?:er|re)|art cent(?:er|re)|planetarium|memorial museum)\b/i, category: 'culture', subtype: 'museum' },
  { re: /\b(national park|wildlife|sanctuary|nature reserve|botanical|garden|gardens|park|lake|river|waterfall|falls|beach|mountain|peak|hill|forest|island|bay|cave|caves|valley|gorge|canyon|glacier|lagoon|reef|pass|dam|viewpoint|promenade)\b/i, category: 'nature', subtype: 'nature' },
  { re: /\b(fort|palace|castle|monument|memorial|tower|gate|bridge|square|plaza|market|bazaar|heritage|tomb|mausoleum|ruins|archaeological|historic|neighbou?rhood|district|old town|quarter|stepwell|baoli|ghat|observatory|statue|fountain|aqueduct|landmark|lighthouse|haveli|cenotaph|citadel|walls?|tram line|viewing|skyscraper|building)\b/i, category: 'sights', subtype: 'landmark' },
  { re: /\b(hotel|resort|hostel|guest ?house|homestay)\b/i, category: 'stay', subtype: 'hotel' },
  { re: /\b(cafe|café|coffee ?house|tea house|bakery)\b/i, category: 'cafe', subtype: 'cafe' },
  { re: /\b(restaurant|eatery|dhaba)\b/i, category: 'food', subtype: 'restaurant' },
];

const NON_PLACE = /\b(school|college|university|institute|hospital|clinic|bank|company|corporation|road|highway|expressway|street|avenue|constituency|politician|film|album|television|village in|town in|city in|district in|municipality|settlement|locality in|suburb|neighbourhood in|census|ward|police|court|ministry)\b/i;

/**
 * Classifies a Wikipedia article from its short description ("Fort in Jaipur, India") and title.
 * Returns null for things that are not visitable places.
 */
export function categorizeWikipedia(description: string | null, title: string): Categorization | null {
  const text = `${description ?? ''}`.trim();
  if (!text) return null;
  // Short descriptions such as "Hindu temple in Kyoto" begin with the place type: test it first
  const head = text.split(/\b(?:in|at|near|on|of|located)\b/i)[0] ?? text;
  // the head noun is the last place-type word ("Hill fort" is a fort, not a hill)
  let best: { k: (typeof KEYWORDS)[number]; end: number; len: number } | null = null;
  for (const k of KEYWORDS) {
    const hit = lastMatchEnd(k.re, head);
    if (
      hit &&
      (!best || hit.end > best.end || (hit.end === best.end && hit.len > best.len))
    ) {
      best = { k, end: hit.end, len: hit.len };
    }
  }
  if (best) return { category: best.k.category, subtype: refineSubtype(best.k, head) };
  if (NON_PLACE.test(text)) return null;
  for (const k of KEYWORDS) {
    if (k.re.test(`${text} ${title}`) && k.category !== 'food' && k.category !== 'cafe') {
      return { category: k.category, subtype: refineSubtype(k, text) };
    }
  }
  return null;
}

function lastMatchEnd(re: RegExp, text: string): { end: number; len: number } | null {
  const g = new RegExp(re.source, 'gi');
  let best: { end: number; len: number } | null = null;
  let m: RegExpExecArray | null;
  while ((m = g.exec(text)) !== null) {
    const end = m.index + m[0].length;
    const len = m[0].length;
    if (!best || end > best.end || (end === best.end && len > best.len)) {
      best = { end, len };
    }
    if (m[0].length === 0) g.lastIndex += 1;
  }
  return best;
}

function refineSubtype(k: { subtype: string }, text: string): string {
  const m = text.match(
    /\b(fort|palace|castle|temple|mosque|church|cathedral|monastery|museum|gallery|garden|park|lake|waterfall|beach|market|bazaar|tower|gate|bridge|square|tomb|observatory|ghat|stepwell|viewpoint|island|station|airport|zoo|aquarium|shrine|gurdwara|ruins)\b/i
  );
  return m ? (m[1] as string).toLowerCase() : k.subtype;
}

const WV_COFFEE = /\b(cafe|café|coffee|tea|bakery|chai|espresso|roaster)\b/i;

/** Wikivoyage listing type + keywords -> category. */
export function categorizeWikivoyage(listing: WikivoyageListing): Categorization | null {
  const hay = `${listing.name} ${listing.section ?? ''}`;
  const nameOnly = listing.name;
  switch (listing.type) {
    case 'eat':
      return WV_COFFEE.test(nameOnly)
        ? { category: 'cafe', subtype: 'cafe' }
        : { category: 'food', subtype: 'restaurant' };
    case 'drink':
      return WV_COFFEE.test(nameOnly) || /\b(cafes?|coffee|tea)\b/i.test(listing.section ?? '')
        ? { category: 'cafe', subtype: 'cafe' }
        : { category: 'nightlife', subtype: 'bar' };
    case 'sleep':
      return { category: 'stay', subtype: hotelSubtype(`${listing.name} ${listing.section ?? ''}`) };
    case 'buy':
      return { category: 'activity', subtype: 'shopping' };
    case 'see':
    case 'do': {
      for (const k of KEYWORDS) {
        if (k.category === 'transport' || k.category === 'stay' || k.category === 'food' || k.category === 'cafe') continue;
        if (k.re.test(hay)) {
          if (listing.type === 'do' && (k.category === 'sights' || k.category === 'nature')) {
            continue; // "do" listings are activities even when the name mentions a lake/fort
          }
          return { category: k.category, subtype: refineSubtype(k, hay) };
        }
      }
      return listing.type === 'see'
        ? { category: 'sights', subtype: 'see' }
        : { category: 'activity', subtype: 'do' };
    }
    default:
      return null;
  }
}

function hotelSubtype(text: string): string {
  const m = text.match(/\b(hostel|resort|homestay|guest ?house|haveli|camp|villa|apartment|hotel)\b/i);
  return m ? (m[1] as string).toLowerCase().replace(/\s+/g, '_') : 'hotel';
}
