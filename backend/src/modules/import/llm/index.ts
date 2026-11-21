import type { AppEnv } from '../../../config/env.js';
import { GeminiProvider } from './gemini.js';
import { NullProvider } from './fake.js';
import type { LlmProvider } from './types.js';

export * from './types.js';
export { GeminiProvider } from './gemini.js';
export { FakeProvider, NullProvider } from './fake.js';

/** Gemini when `GEMINI_API_KEY` is set, otherwise the null provider (=> Basic mode). */
export function createLlmProvider(config: Pick<AppEnv, 'GEMINI_API_KEY' | 'GEMINI_MODEL'> & { GEMINI_TIMEOUT_MS?: number }): LlmProvider {
  const key = config.GEMINI_API_KEY?.trim();
  if (!key) return new NullProvider();
  return new GeminiProvider({
    apiKey: key,
    model: config.GEMINI_MODEL,
    timeoutMs: config.GEMINI_TIMEOUT_MS,
  });
}
