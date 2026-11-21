import type { z } from 'zod';
import type { GeminiSchema } from '../gemini-schema.js';

export type LlmPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

export type LlmLabel = 'intent' | 'plan-day' | 'assist-search' | 'assist-propose' | 'other';

export interface GenerateStructuredArgs<T> {
  system: string;
  userParts: LlmPart[];
  /** Validation schema applied to the model output (strict). */
  schema: z.ZodType<T>;
  /** Gemini `responseSchema`. Derive with `toGeminiSchema(schema)` when omitted. */
  responseSchema?: GeminiSchema;
  temperature?: number;
  maxOutputTokens?: number;
  label?: LlmLabel;
  /** Test seam only (FakeProvider reads it; real providers ignore it and it is never sent to a model). */
  fakeContext?: unknown;
}

export interface GenerateStructuredResult<T> {
  data: T;
  /** Number of validation-repair round trips used (0 = first answer was valid). */
  repairs: number;
  usage?: { promptTokens?: number; outputTokens?: number };
}

export interface LlmProvider {
  readonly name: string;
  /** False when there is no key / provider is disabled: callers must use Basic mode. */
  readonly available: boolean;
  generateStructured<T>(args: GenerateStructuredArgs<T>): Promise<GenerateStructuredResult<T>>;
}

export type LlmFailureReason = 'no_api_key' | 'quota_exhausted' | 'ai_error' | 'invalid_output' | 'timeout';

export class LlmError extends Error {
  constructor(
    public readonly reason: LlmFailureReason,
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = 'LlmError';
  }
}
