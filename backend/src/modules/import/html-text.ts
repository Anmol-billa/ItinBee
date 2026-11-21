/**
 * Dependency-free readable-text extraction for blog/article pages. Not a full readability port: it removes
 * chrome (script/style/nav/header/footer/aside/form/svg), prefers <article>/<main>, keeps headings and list
 * structure as line breaks, decodes entities and returns title + description metadata.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  copy: '©',
  rupee: '₹',
  bull: '•',
  middot: '·',
  laquo: '«',
  raquo: '»',
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, body: string) => {
    if (body[0] === '#') {
      const code = body[1]?.toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return ' ';
      try {
        return String.fromCodePoint(code);
      } catch {
        return ' ';
      }
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? m;
  });
}

function metaContent(html: string, key: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)\\s*=\\s*["']${key}["'][^>]*>`,
    'i'
  );
  const tag = html.match(re)?.[0];
  if (!tag) return null;
  const content = tag.match(/content\s*=\s*"([^"]*)"|content\s*=\s*'([^']*)'/i);
  const value = content?.[1] ?? content?.[2];
  return value ? decodeEntities(value).trim() : null;
}

export interface ExtractedPage {
  title: string | null;
  description: string | null;
  text: string;
}

export function extractReadableText(html: string, maxChars = 12_000): ExtractedPage {
  const title =
    metaContent(html, 'og:title') ??
    (() => {
      const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      return m?.[1] ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim() : null;
    })();
  const description = metaContent(html, 'og:description') ?? metaContent(html, 'description');

  let body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg|iframe|canvas|nav|header|footer|aside|form|button|select|dialog)\b[\s\S]*?<\/\1>/gi, ' ');

  const article = body.match(/<article\b[\s\S]*?<\/article>/i)?.[0] ?? body.match(/<main\b[\s\S]*?<\/main>/i)?.[0];
  if (article && article.length > 400) body = article;

  body = body
    .replace(/<(h[1-6])\b[^>]*>/gi, '\n\n## ')
    .replace(/<\/(h[1-6]|p|div|section|tr|table|ul|ol|blockquote|figure|figcaption)>/gi, '\n')
    .replace(/<(br|hr)\b[^>]*>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, ' ');

  const text = decodeEntities(body)
    .replace(/[ \t\f\v\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxChars);

  return { title, description, text };
}
