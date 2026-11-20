import {
  CURATED_OPEN_POIS,
  buildGoogleMapsPlaceUrl,
} from '../../geo/curated-india-pois.js';
import type { ItemKind } from '../../../types/domain.js';

export interface ExtractedSocialStop {
  title: string;
  kind: ItemKind;
  lat: number | null;
  lng: number | null;
  placeRefId: string | null;
  addressLocalScript: string | null;
  dietaryFlags: string[];
  accessibilityNotes: string;
  googleMapsUrl: string | null;
  confidence: number;
  needsVerification: boolean;
}

export interface SocialExtractionResult {
  platform: 'instagram' | 'youtube' | 'web';
  sourceUrl: string;
  oembedTitle: string | null;
  stops: ExtractedSocialStop[];
}

function detectPlatform(url: string): 'instagram' | 'youtube' | 'web' {
  const lower = url.toLowerCase();
  if (lower.includes('instagram.com')) return 'instagram';
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
  return 'web';
}

function mapCategoryToItemKind(category: string): ItemKind {
  if (category === 'cafe_meal') return 'meal';
  if (category === 'stay') return 'stay';
  if (category === 'transit_hub') return 'transit';
  return 'activity';
}

/**
 * Extracts geo-grounded shortlist Idea Cards from official oEmbed metadata + user-shared captions/transcripts
 * (zero video scraping, zero Google Places API calls—grounds strictly against open Overture/OSM/Wikidata POIs).
 */
export async function extractStopsFromSocialLink(params: {
  url: string;
  captionOrTranscript?: string;
}): Promise<SocialExtractionResult> {
  const platform = detectPlatform(params.url);
  let oembedTitle: string | null = null;

  // Attempt official public oEmbed lookup only for YouTube in production if caption wasn't already supplied
  if (
    platform === 'youtube' &&
    !params.captionOrTranscript &&
    process.env.NODE_ENV === 'production'
  ) {
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(params.url)}&format=json`;
      const res = await fetch(oembedUrl);
      if (res.ok) {
        const json = (await res.json()) as { title?: string };
        oembedTitle = json.title ?? null;
      }
    } catch {
      // Non-fatal; rely on URL slugs + caption
    }
  }

  const combinedCorpus = [
    params.url.replace(/[-_/]/g, ' '),
    oembedTitle ?? '',
    params.captionOrTranscript ?? '',
  ]
    .join('\n')
    .trim();

  const lowerCorpus = combinedCorpus.toLowerCase();
  const stops: ExtractedSocialStop[] = [];
  const seenPlaceIds = new Set<string>();

  // 1. Match against curated open-data POIs
  for (const poi of CURATED_OPEN_POIS) {
    const matchedName = lowerCorpus.includes(poi.name.toLowerCase());
    const matchedAlias = poi.aliases.some((alias) =>
      lowerCorpus.includes(alias.toLowerCase())
    );

    if ((matchedName || matchedAlias) && !seenPlaceIds.has(poi.placeRefId)) {
      seenPlaceIds.add(poi.placeRefId);
      stops.push({
        title: poi.name,
        kind: mapCategoryToItemKind(poi.category),
        lat: poi.lat,
        lng: poi.lng,
        placeRefId: poi.placeRefId,
        addressLocalScript: poi.addressLocalScript ?? null,
        dietaryFlags: poi.dietaryHints,
        accessibilityNotes: poi.accessibilityNotes,
        googleMapsUrl: buildGoogleMapsPlaceUrl(poi.lat, poi.lng, poi.name),
        confidence: matchedName ? 0.96 : 0.91,
        needsVerification: false,
      });
    }
  }

  // 2. Extract numbered/bulleted ungrounded stop mentions from caption (flagged < 0.85 confidence for 1-tap verification)
  const bulletRegex =
    /(?:^|\n)\s*(?:\d+[.)]|[-•📍])\s*([A-Z][A-Za-z0-9\s'&,-]{3,48})(?=\s*(?:—|–|-|:|\n|$))/g;
  let m: RegExpExecArray | null;
  while ((m = bulletRegex.exec(params.captionOrTranscript ?? '')) !== null) {
    const rawStopTitle = m[1]!.trim();
    const alreadyCovered = stops.some(
      (s) =>
        s.title.toLowerCase().includes(rawStopTitle.toLowerCase()) ||
        rawStopTitle.toLowerCase().includes(s.title.toLowerCase().split(',')[0]!)
    );
    if (!alreadyCovered && stops.length < 10) {
      stops.push({
        title: rawStopTitle,
        kind: /\b(?:cafe|dhaba|bakers|bakehouse|restaurant|bhavan|kitchen)\b/i.test(
          rawStopTitle
        )
          ? 'meal'
          : /\b(?:homestay|villa|hostel|resort|hotel)\b/i.test(rawStopTitle)
            ? 'stay'
            : 'activity',
        lat: null,
        lng: null,
        placeRefId: null,
        addressLocalScript: null,
        dietaryFlags: [],
        accessibilityNotes: '',
        googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(rawStopTitle)}`,
        confidence: 0.76,
        needsVerification: true,
      });
    }
  }

  return {
    platform,
    sourceUrl: params.url,
    oembedTitle,
    stops,
  };
}
