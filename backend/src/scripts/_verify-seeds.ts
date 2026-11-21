import { loadDestinationSeeds } from '../modules/places/seed.js';
import { HttpClient } from '../modules/places/util/http.js';
import { MemoryGeoCache } from '../modules/places/geo-cache.js';
import { WikipediaClient } from '../modules/places/providers/wikipedia.js';
import { WikivoyageClient } from '../modules/places/providers/wikivoyage.js';
import { haversineMeters } from '../modules/places/util/geo.js';

const http = new HttpClient({ userAgent: 'Itinbee/1.0 (contact via itinbee.com)' });
const cache = new MemoryGeoCache();
const wp = new WikipediaClient(http, cache);
const wv = new WikivoyageClient(http, cache);

async function main() {
  const seeds = loadDestinationSeeds();
  const titles = seeds.map((s) => s.wikipediaTitle as string);
  const details = await wp.pageDetails(titles);
  for (const s of seeds) {
    const d = details[s.wikipediaTitle as string];
    if (!d) { console.log(`MISSING-WP ${s.slug} "${s.wikipediaTitle}"`); continue; }
    if (d.lat !== null && d.lng !== null) {
      const km = haversineMeters(s, { lat: d.lat, lng: d.lng }) / 1000;
      if (km > (s.kind === 'country' || s.kind === 'state' ? 600 : 15)) console.log(`COORD-OFF ${s.slug} ${km.toFixed(1)}km wp=(${d.lat},${d.lng}) seed=(${s.lat},${s.lng})`);
    }
  }
  if (process.argv[2] !== 'wv') return;
  for (const s of seeds.filter((x) => ['city', 'area', 'region'].includes(x.kind))) {
    await new Promise((r) => setTimeout(r, 700));
    const title = s.wikivoyageTitle ?? s.wikipediaTitle?.split(',')[0] ?? s.name;
    const r = await wv.fetchListings(title);
    const located = r.listings.filter((l) => l.lat !== null).length;
    console.log(`WV ${s.slug.padEnd(14)} page=${String(r.pageTitle).padEnd(22)} pages=${r.pages.length} listings=${r.listings.length} located=${located}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
