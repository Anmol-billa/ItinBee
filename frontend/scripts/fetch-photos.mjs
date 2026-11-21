#!/usr/bin/env node
/**
 * Fetches destination photographs from Wikimedia Commons with licence + author provenance.
 * Usage: node scripts/fetch-photos.mjs [slug ...]   (no args = all)
 * Output: public/img/destinations/<slug>.jpg and src/data/photo-credits.json
 * Only permissive licences are accepted (CC0, PD, CC BY, CC BY-SA).
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public/img/destinations');
const creditsPath = path.join(root, 'src/data/photo-credits.json');
const UA = 'Itinbee/1.0 (https://itinbee.com; photo build script)';

/** slug -> Commons search query (file namespace) */
const TARGETS = {
  'spiti-valley': 'Spiti Valley Key Monastery landscape',
  hampi: 'Hampi Vittala temple stone chariot',
  kyoto: 'Fushimi Inari torii gates Kyoto',
  alleppey: 'Alleppey backwaters houseboat Kerala',
  jaipur: 'Hawa Mahal Jaipur facade',
  udaipur: 'Udaipur City Palace Lake Pichola',
  varanasi: 'Varanasi ghats Ganges morning boats',
  goa: 'Palolem beach Goa',
  ladakh: 'Pangong Tso Ladakh lake',
  munnar: 'Munnar tea plantations hills',
  rishikesh: 'Lakshman Jhula Rishikesh Ganges',
  darjeeling: 'Darjeeling Kanchenjunga tea garden',
  bali: 'Tegallalang rice terraces Bali',
  'ha-long-bay': 'Ha Long Bay limestone karsts',
  lisbon: 'Lisbon Alfama rooftops Tagus view',
  'ha-noi': 'Hanoi Old Quarter street',
  jaisalmer: 'Jaisalmer Fort golden sandstone Rajasthan',
  jodhpur: 'Mehrangarh Fort blue city Jodhpur',
  delhi: 'Humayun Tomb Delhi red sandstone',
};

const ALLOWED = /^(CC0|Public domain|PD|CC BY(-SA)?( [0-9.]+)?( [A-Za-z]+)?)/i;
const strip = (s = '') => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

async function api(params) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  for (const [k, v] of Object.entries({ format: 'json', origin: '*', ...params })) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Commons API ${res.status}`);
  return res.json();
}

async function pick(query) {
  const data = await api({
    action: 'query', generator: 'search', gsrnamespace: '6', gsrlimit: '30',
    gsrsearch: `${query} filetype:bitmap`,
    prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1100',
  });
  const pages = Object.values(data.query?.pages ?? {});
  const good = [];
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii || ii.mime !== 'image/jpeg') continue;
    if (ii.width < 2000 || ii.height < 1300 || ii.width / ii.height < 1.25) continue;
    const meta = ii.extmetadata ?? {};
    const license = strip(meta.LicenseShortName?.value);
    if (!ALLOWED.test(license)) continue;
    if (/Deletion|Nominat/i.test(strip(meta.Categories?.value))) continue;
    good.push({
      title: p.title, license, author: strip(meta.Artist?.value) || 'Unknown',
      sourceUrl: ii.descriptionurl, thumb: ii.thumburl,
      licenseUrl: strip(meta.LicenseUrl?.value) || null, index: p.index ?? 99, w: ii.width,
    });
  }
  good.sort((a, b) => a.index - b.index);
  return good;
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const credits = existsSync(creditsPath) ? JSON.parse(await readFile(creditsPath, 'utf8')) : {};
  const only = process.argv.slice(2);
  for (const [slug, query] of Object.entries(TARGETS)) {
    if (only.length && !only.includes(slug)) continue;
    const cands = await pick(query);
    if (!cands.length) { console.log(`✗ ${slug}: no suitable image`); continue; }
    const c = cands[0];
    const img = await fetch(c.thumb, { headers: { 'User-Agent': UA } });
    if (!img.ok) { console.log(`✗ ${slug}: download ${img.status}`); continue; }
    await writeFile(path.join(outDir, `${slug}.jpg`), Buffer.from(await img.arrayBuffer()));
    credits[slug] = { file: `/img/destinations/${slug}.jpg`, title: c.title, author: c.author, license: c.license, licenseUrl: c.licenseUrl, sourceUrl: c.sourceUrl, alternates: cands.slice(1, 4).map((x) => x.title) };
    console.log(`✓ ${slug}: ${c.title} · ${c.license} · ${c.author.slice(0, 40)}`);
    await new Promise((r) => setTimeout(r, 700));
  }
  await mkdir(path.dirname(creditsPath), { recursive: true });
  await writeFile(creditsPath, JSON.stringify(credits, null, 2) + '\n');
}
main().catch((e) => { console.error(e); process.exit(1); });
