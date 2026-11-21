import zlib from 'node:zlib';
import { extractText, getDocumentProxy } from 'unpdf';
import { redactAadhaarNumbers } from '../../security/aadhaar-redactor.js';

export type DetectedSourceKind =
  | 'irctc'
  | 'flight'
  | 'bus'
  | 'stay'
  | 'social'
  | 'unstructured';

export type DocumentExtractionClass = 'DIGITAL_TEXT' | 'SCANNED_PDF_OR_IMAGE';

export interface Stage1ExtractionResult {
  cleanedText: string;
  aadhaarRedactions: number;
  detectedKind: DetectedSourceKind;
}

export interface DocumentClassificationResult extends Stage1ExtractionResult {
  documentClass: DocumentExtractionClass;
  isScannedOrImage: boolean;
}

export function redactAadhaarInText(input: string): {
  redactedText: string;
  redactionCount: number;
} {
  return redactAadhaarNumbers(input);
}

export function stripHtmlAndEmailNoise(raw: string): string {
  let text = raw;

  // Decode common quoted-printable soft line breaks & =3D
  if (text.includes('=3D') || /=\r?\n/.test(text)) {
    text = text
      .replace(/=\r?\n/g, '')
      .replace(/=([0-9A-Fa-f]{2})/g, (_m, hex: string) => {
        const code = parseInt(hex, 16);
        return code >= 32 || code === 9 || code === 10 || code === 13
          ? String.fromCharCode(code)
          : ' ';
      });
  }

  // Strip <style> and <script> blocks
  text = text
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ');

  // Convert block HTML tags to newlines so line-oriented parsers stay accurate
  text = text
    .replace(/<\/?(?:tr|p|div|br|li|h[1-6]|table)[^>]*>/gi, '\n')
    .replace(/<\/?(?:td|th)[^>]*>/gi, '  ')
    .replace(/<[^>]+>/g, ' ');

  // Decode basic HTML entities
  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#8377;/g, '₹')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text;
}

function unescapePdfString(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, ' ')
    .replace(/\\t/g, ' ')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');
}

function extractPdfOperatorsFromContentStream(streamContent: string): string[] {
  const chunks: string[] = [];

  // Match TJ arrays: [(Hello) -20 ( World)] TJ
  const tjArrayRe = /\[((?:[^[\]]|\([^()\\]*(?:\\.[^()\\]*)*\))*)\]\s*TJ/g;
  let arrMatch: RegExpExecArray | null;
  while ((arrMatch = tjArrayRe.exec(streamContent)) !== null) {
    const inner = arrMatch[1] ?? '';
    const parts: string[] = [];
    const strRe = /\(([^()\\]*(?:\\.[^()\\]*)*)\)/g;
    let sm: RegExpExecArray | null;
    while ((sm = strRe.exec(inner)) !== null) {
      if (sm[1]) parts.push(unescapePdfString(sm[1]));
    }
    if (parts.length > 0) chunks.push(parts.join(''));
  }

  // Match simple (...) Tj or (...) '
  const pdfParenRegex = /\(([^()\\]*(?:\\.[^()\\]*)*)\)\s*(?:T[jJ]|')/g;
  let m: RegExpExecArray | null;
  while ((m = pdfParenRegex.exec(streamContent)) !== null) {
    if (m[1]) {
      chunks.push(unescapePdfString(m[1]));
    }
  }

  return chunks;
}

function isPdfBuffer(buffer: Buffer, mimeType = 'application/octet-stream'): boolean {
  return (
    (buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-') ||
    mimeType.toLowerCase() === 'application/pdf'
  );
}

/**
 * Synchronous PDF/UTF-8 text extractor kept for backward compatibility with synchronous callers.
 * Supports uncompressed PDF text operators as well as zlib FlateDecode streams.
 */
export function extractTextFromBuffer(
  buffer: Buffer,
  mimeType = 'application/octet-stream'
): string {
  if (isPdfBuffer(buffer, mimeType)) {
    const rawLatin1 = buffer.toString('latin1');
    const collected: string[] = [];

    // 1. Decompress any FlateDecode stream...endstream blocks
    const streamRe = /stream(?:\r\n|\n)([\s\S]*?)(?:\r\n|\n)?endstream/g;
    let sm: RegExpExecArray | null;
    while ((sm = streamRe.exec(rawLatin1)) !== null) {
      const bodyLatin1 = sm[1];
      if (!bodyLatin1) continue;
      const streamBytes = Buffer.from(bodyLatin1, 'latin1');
      let decoded: string | null = null;
      for (const decompress of [zlib.inflateSync, zlib.inflateRawSync]) {
        try {
          decoded = decompress(streamBytes).toString('latin1');
          break;
        } catch {
          // Not a valid zlib/deflate stream or uses predictors/other filters
        }
      }
      if (decoded) {
        collected.push(...extractPdfOperatorsFromContentStream(decoded));
      }
    }

    // 2. Also scan uncompressed PDF operators directly
    const rawUtf8 = buffer.toString('utf8');
    collected.push(...extractPdfOperatorsFromContentStream(rawUtf8));

    if (collected.length > 0) {
      return collected.join('\n');
    }

    // Fallback: keep printable ASCII + Devanagari UTF-8 runs
    return rawUtf8.replace(/[^\x09\x0A\x0D\x20-\x7E\u0900-\u097F₹]/g, ' ');
  }

  return buffer.toString('utf8');
}

/**
 * Asynchronous PDF text extractor powered by `unpdf` (PDF.js serverless build) to accurately
 * decode real-world FlateDecode, ToUnicode CMap, and multi-column digital tickets (IRCTC, IndiGo,
 * Air India, MakeMyTrip), falling back cleanly to `extractTextFromBuffer` on malformed fixtures.
 */
export async function extractTextFromBufferAsync(
  buffer: Buffer,
  mimeType = 'application/octet-stream'
): Promise<string> {
  if (!isPdfBuffer(buffer, mimeType)) {
    return buffer.toString('utf8');
  }

  let doc: Awaited<ReturnType<typeof getDocumentProxy>> | null = null;
  try {
    doc = await getDocumentProxy(new Uint8Array(buffer), { verbosity: 0 });
    const res = await extractText(doc, { mergePages: true });
    const text = Array.isArray(res.text) ? res.text.join('\n\n') : res.text;
    if (text && text.trim().length > 0) {
      return text;
    }
  } catch {
    // Malformed PDF test fixture or unsupported encryption: fall back to legacy operator extractor
  } finally {
    const disposable = doc as unknown as { destroy?: () => Promise<void> } | null;
    if (disposable && typeof disposable.destroy === 'function') {
      await disposable.destroy().catch(() => undefined);
    }
  }

  return extractTextFromBuffer(buffer, mimeType);
}

export function classifyAndSanitizeInput(rawInput: string): Stage1ExtractionResult {
  const stripped = stripHtmlAndEmailNoise(rawInput);
  // Mandatory Stage-1 Aadhaar redaction BEFORE any downstream parser, log, or LLM call
  const { redactedText, redactionCount } = redactAadhaarInText(stripped);

  const lower = redactedText.toLowerCase();

  let detectedKind: DetectedSourceKind = 'unstructured';

  if (
    lower.includes('irctc') ||
    lower.includes('electronic reservation slip') ||
    /\btrn\s*[:.-]?\s*\d{5}\b/i.test(redactedText) ||
    (/\bpnr\b/i.test(redactedText) &&
      /\b\d{10}\b/.test(redactedText) &&
      /\b(?:cnf|rac|wl|rlwl|pqwl|tqwl|coach|berth|rajdhani|shatabdi|vande bharat|express|exp)\b/i.test(
        redactedText
      ))
  ) {
    detectedKind = 'irctc';
  } else if (
    /\b(?:indigo|air india|akasa|spicejet|vistara|boarding pass)\b/i.test(redactedText) ||
    /\b(?:6E|AI|QP|IX|SG|UK)[-\s]?\d{3,4}\b/.test(redactedText)
  ) {
    detectedKind = 'flight';
  } else if (
    /\b(?:redbus|abhibus|zingbus|nuego|intrcity|vrl travels|ksrtc|upsrtc|msrtc|hrtc)\b/i.test(
      redactedText
    ) ||
    (/\b(?:tin|boarding point|dropping point)\b/i.test(redactedText) &&
      /\bseat\b/i.test(redactedText))
  ) {
    detectedKind = 'bus';
  } else if (
    /\b(?:makemytrip|goibibo|cleartrip|airbnb|zostel|check-in|check in)\b/i.test(
      redactedText
    ) &&
    /\b(?:check-out|check out|nights?|hotel|homestay|hostel|villa|resort|property)\b/i.test(
      redactedText
    )
  ) {
    detectedKind = 'stay';
  } else if (
    /\b(?:instagram\.com\/reel|instagram\.com\/p\/|youtube\.com\/shorts|youtu\.be\/|youtube\.com\/watch)\b/i.test(
      redactedText
    )
  ) {
    detectedKind = 'social';
  }

  return {
    cleanedText: redactedText,
    aadhaarRedactions: redactionCount,
    detectedKind,
  };
}

/**
 * Extracts text from a document buffer (`unpdf` for `%PDF-` with legacy fallback), immediately
 * applies mandatory DPDPA 2023 Aadhaar redaction, and classifies whether the document is
 * born-digital text or a scanned PDF / image requiring multimodal vision.
 */
export async function classifyAndExtractDocument(
  buffer: Buffer,
  mimeType = 'application/octet-stream'
): Promise<DocumentClassificationResult> {
  const isImage = /^image\//i.test(mimeType);
  if (isImage) {
    return {
      cleanedText: '',
      aadhaarRedactions: 0,
      detectedKind: 'unstructured',
      documentClass: 'SCANNED_PDF_OR_IMAGE',
      isScannedOrImage: true,
    };
  }

  const rawText = await extractTextFromBufferAsync(buffer, mimeType);
  const stage1 = classifyAndSanitizeInput(rawText);
  const meaningfulLetters = (stage1.cleanedText.match(/\p{L}/gu) ?? []).length;
  const isScannedOrImage = isPdfBuffer(buffer, mimeType) && meaningfulLetters < 40;

  return {
    ...stage1,
    documentClass: isScannedOrImage ? 'SCANNED_PDF_OR_IMAGE' : 'DIGITAL_TEXT',
    isScannedOrImage,
  };
}

export const classifyAndExtractDocumentAsync = classifyAndExtractDocument;
