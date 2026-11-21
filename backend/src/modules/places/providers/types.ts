import type { LatLng } from '../types.js';

export interface AutocompleteSuggestion {
  id: string;
  name: string;
  /** Comma-joined context line, e.g. "Jaipur, Rajasthan, India". */
  secondary: string;
  kind: 'country' | 'state' | 'city' | 'area' | 'place';
  lat: number;
  lng: number;
  countryCode: string | null;
  osmKey: string | null;
  osmValue: string | null;
  source: 'photon';
}

export interface PhotonProvider {
  autocomplete(
    query: string,
    options?: { lat?: number; lng?: number; lang?: string; limit?: number }
  ): Promise<{ suggestions: AutocompleteSuggestion[]; cached: boolean }>;
}

export interface WikivoyageListing {
  type: 'see' | 'do' | 'eat' | 'drink' | 'sleep' | 'buy' | 'listing' | 'other';
  name: string;
  alt: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  url: string | null;
  hours: string | null;
  price: string | null;
  phone: string | null;
  content: string | null;
  wikidata: string | null;
  wikipedia: string | null;
  image: string | null;
  /** Nearest preceding section heading (e.g. "Temples", "Budget"). */
  section: string | null;
  /** Wikivoyage page the listing came from (a district sub-page for big cities). */
  pageTitle: string;
}

export interface WikivoyageResult {
  /** Canonical title of the main page that was found (null when the page does not exist). */
  pageTitle: string | null;
  pages: string[];
  listings: WikivoyageListing[];
}

export interface WikivoyageProvider {
  fetchListings(title: string, options?: { refresh?: boolean }): Promise<WikivoyageResult>;
}

export interface WikiGeoHit {
  pageId: number;
  title: string;
  lat: number;
  lng: number;
  distM: number;
}

export interface WikiPageDetail {
  title: string;
  pageId: number | null;
  wikidataId: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  /** Commons/enwiki file name of the lead image (without "File:" prefix). */
  imageFile: string | null;
  lat: number | null;
  lng: number | null;
}

export interface WikipediaProvider {
  geosearch(
    center: LatLng,
    radiusM: number,
    limit: number,
    options?: { refresh?: boolean }
  ): Promise<WikiGeoHit[]>;
  /** Keys are the requested titles. Missing pages are absent. */
  pageDetails(titles: string[], options?: { refresh?: boolean }): Promise<Record<string, WikiPageDetail>>;
  /** Intro extracts (plain text, a few sentences). Keys are the requested titles. */
  summaries(titles: string[], options?: { refresh?: boolean }): Promise<Record<string, string>>;
  /** Sum of daily views for the trailing window (the MediaWiki action API caps `pageviews` at 60 days). */
  pageviews(titles: string[], options?: { refresh?: boolean }): Promise<Record<string, number>>;
}

export interface WikidataEntityInfo {
  sitelinkCount: number;
  enwikiTitle: string | null;
}

export interface WikidataProvider {
  sitelinks(
    ids: string[],
    options?: { refresh?: boolean }
  ): Promise<Record<string, WikidataEntityInfo>>;
}

export interface CommonsFileInfo {
  file: string;
  thumbUrl: string;
  sourceUrl: string;
  author: string | null;
  license: string | null;
  licenseUrl: string | null;
}

export interface CommonsProvider {
  fileInfo(files: string[], options?: { refresh?: boolean }): Promise<Record<string, CommonsFileInfo>>;
}

export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat: number;
  lng: number;
  tags: Record<string, string>;
}

export interface OverpassProvider {
  /** ONE bounded query per destination. Never call this per user request. */
  fetchPois(
    center: LatLng,
    radiusM: number,
    options?: { refresh?: boolean }
  ): Promise<OverpassElement[]>;
}

export type RouteProfile = 'driving-car' | 'foot-walking';

export interface RouteResult {
  profile: RouteProfile;
  distanceM: number;
  durationS: number;
  /** Encoded polyline (precision 5). */
  geometry: string;
  geometryFormat: 'polyline5';
  /** `[lng, lat]` pairs (decoded form of `geometry`). */
  coordinates: Array<[number, number]>;
  source: 'openrouteservice' | 'estimate';
  cached: boolean;
  advisory?: string;
}

export interface RoutingProvider {
  route(profile: RouteProfile, coordinates: LatLng[]): Promise<RouteResult>;
}

export interface PackProviders {
  wikivoyage: WikivoyageProvider;
  wikipedia: WikipediaProvider;
  wikidata: WikidataProvider;
  commons: CommonsProvider;
  overpass: OverpassProvider;
}

export interface PlacesProviders extends PackProviders {
  photon: PhotonProvider;
  routing: RoutingProvider;
}
