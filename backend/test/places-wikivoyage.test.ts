import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  extractTemplates,
  findSubpageTitles,
  parseWikivoyageListings,
  stripWikiMarkup,
} from '../src/modules/places/providers/wikivoyage.js';
import { readFixture } from './helpers/fixture-fetch.js';

describe('Wikivoyage template parser', () => {
  it('parses a real recorded Jaipur page (see/do/eat/sleep templates) into typed listings', () => {
    const listings = parseWikivoyageListings(readFixture('wikivoyage-jaipur.wikitext'), 'Jaipur');
    expect(listings.length).toBeGreaterThanOrEqual(10);

    const amber = listings.find((l) => l.name === 'Amber Fort');
    expect(amber).toBeDefined();
    expect(amber?.type).toBe('see');
    expect(amber?.lat).toBeCloseTo(26.985486, 5);
    expect(amber?.lng).toBeCloseTo(75.851345, 5);
    expect(amber?.wikidata).toBe('Q456817');
    expect(amber?.wikipedia).toBe('Amer Fort');
    expect(amber?.hours).toBe('8AM-6PM');
    expect(amber?.url).toMatch(/^http/);
    expect(amber?.pageTitle).toBe('Jaipur');

    for (const l of listings) {
      for (const text of [l.name, l.alt, l.content, l.price, l.hours]) {
        if (!text) continue;
        expect(text).not.toMatch(/\[\[|\]\]|\{\{|\}\}|'''|<ref|<!--/);
      }
      if (l.lat !== null) expect(l.lat).toBeGreaterThan(-90);
    }
  });

  it('splits params at top-level pipes only and strips nested templates, files, refs and links', () => {
    const wikitext = readFixture('wikivoyage-mini.wikitext');
    const listings = parseWikivoyageListings(wikitext, 'Jaipur');
    const hawa = listings.find((l) => l.name === 'Hawa Mahal');
    expect(hawa?.price).toBe('₹50'); // {{dead link|date=2023}} removed
    expect(hawa?.content).toContain('953 small windows');
    expect(hawa?.content).not.toMatch(/Skip\.jpg|ignored|\[\[/);
    expect(hawa?.section).toBe('Forts and palaces');
    expect(hawa?.wikidata).toBe('Q9000001');
    expect(hawa?.image).toBe('Hawa Mahal 2011.jpg');

    const balloon = listings.find((l) => l.name === 'Sunrise balloon ride');
    expect(balloon?.type).toBe('do');
    expect(balloon?.content).toBe('A balloon flight over the city.');

    const lmb = listings.find((l) => l.name.startsWith('Laxmi'));
    expect(lmb?.type).toBe('eat');
    expect(lmb?.alt).toBe('LMB');

    expect(listings.find((l) => l.name === 'Tapri Central')?.type).toBe('drink');
    expect(listings.find((l) => l.name === 'Samode Haveli')?.type).toBe('sleep');
    expect(listings.find((l) => l.name === 'Johari Bazaar')?.type).toBe('buy'); // {{listing|type=buy}}
    expect(listings.find((l) => l.name === 'Unknown thing')?.type).toBe('listing');
  });

  it('treats empty lat/long as missing coordinates', () => {
    const listings = parseWikivoyageListings(readFixture('wikivoyage-mini.wikitext'), 'Jaipur');
    const palace = listings.find((l) => l.name === 'City Palace');
    expect(palace?.lat).toBeNull();
    expect(palace?.lng).toBeNull();
    expect(palace?.wikipedia).toBe('City Palace, Jaipur');
  });

  it('finds district sub-pages and survives malformed markup', () => {
    expect(findSubpageTitles(readFixture('wikivoyage-mini.wikitext'), 'Jaipur')).toEqual([
      'Jaipur/Walled City',
    ]);
    expect(() => extractTemplates('{{see | name=Broken')).not.toThrow();
    expect(parseWikivoyageListings('{{see | name=Broken', 'X')).toEqual([]);
    expect(stripWikiMarkup("''italic'' [[A|b]] [http://x.org site] &amp; <b>bold</b>")).toBe(
      'italic b site & bold'
    );
  });

  it('keeps the fixture file readable on disk', () => {
    expect(fs.existsSync(new URL('./fixtures/places/wikivoyage-jaipur.wikitext', import.meta.url))).toBe(true);
  });
});
