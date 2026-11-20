import { redactAadhaarNumbers } from '../../security/aadhaar-redactor.js';

export type DetectedSourceKind =
  | 'irctc'
  | 'flight'
  | 'bus'
  | 'stay'
  | 'social'
  | 'unstructured';

export interface Stage1ExtractionResult {
  cleanedText: string;
  aadhaarRedactions: number;
  detectedKind: DetectedSourceKind;
}

export function stripHtmlAndEmailNoise(raw: string): string {
  let text = raw;

  // Decode common quoted-printable soft line breaks & =3D
  if (text.includes('=3D') || /=\r?\n/.test(text)) {
    text = text.replace(/=\r?\n/g, '').replace(/=3D/g, '=');
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

/**
 * Extracts readable UTF-8 / PDF text operators without external native binaries,
 * then immediately applies mandatory DPDPA 2023 Aadhaar first-8-digit redaction.
 */
export function extractTextFromBuffer(
  buffer: Buffer,
  mimeType = 'application/octet-stream'
): string {
  const rawUtf8 = buffer.toString('utf8');

  // If buffer begins with %PDF-, pull literal string operators `(...)` as well as readable lines
  if (rawUtf8.startsWith('%PDF-') || mimeType === 'application/pdf') {
    const literalMatches: string[] = [];
    const pdfParenRegex = /\(([^()\\]*(?:\\.[^()\\]*)*)\)\s*T[jJ]/g;
    let m: RegExpExecArray | null;
    while ((m = pdfParenRegex.exec(rawUtf8)) !== null) {
      if (m[1]) {
        literalMatches.push(
          m[1]
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, ' ')
            .replace(/\\\(/g, '(')
            .replace(/\\\)/g, ')')
        );
      }
    }
    if (literalMatches.length > 0) {
      return literalMatches.join('\n');
    }
    // Fallback: keep printable ASCII + Devanagari UTF-8 runs
    return rawUtf8.replace(/[^\x09\x0A\x0D\x20-\x7E\u0900-\u097F₹]/g, ' ');
  }

  return rawUtf8;
}

export function classifyAndSanitizeInput(rawInput: string): Stage1ExtractionResult {
  const stripped = stripHtmlAndEmailNoise(rawInput);
  // Mandatory Stage-1 Aadhaar redaction BEFORE any downstream parser, log, or LLM call
  const { redactedText, redactionCount } = redactAadhaarNumbers(stripped);

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
