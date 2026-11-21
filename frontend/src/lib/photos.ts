import credits from '@/data/photo-credits.json';

export interface DestinationPhoto {
  src: string;
  title: string;
  author: string;
  license: string;
  sourceUrl: string;
}

type CreditMap = Record<
  string,
  { file: string; title: string; author: string; license: string; sourceUrl: string }
>;

/** Looks up a Wikimedia Commons photograph (with licence + author) fetched by scripts/fetch-photos.mjs. */
export function getPhoto(slug: string): DestinationPhoto {
  const entry = (credits as CreditMap)[slug];
  if (!entry) {
    throw new Error(`No photo credit registered for "${slug}". Run: node scripts/fetch-photos.mjs ${slug}`);
  }
  return {
    src: entry.file,
    title: entry.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, ''),
    author: entry.author,
    license: entry.license,
    sourceUrl: entry.sourceUrl,
  };
}

export function allPhotoCredits(): Array<DestinationPhoto & { slug: string }> {
  return Object.keys(credits as CreditMap).map((slug) => ({ slug, ...getPhoto(slug) }));
}
