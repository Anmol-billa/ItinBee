import {
  LlmError,
  type GenerateStructuredArgs,
  type GenerateStructuredResult,
  type LlmLabel,
  type LlmProvider,
} from './types.js';

export type FakeHandler = (args: GenerateStructuredArgs<unknown>, callIndex: number) => unknown | Promise<unknown>;

export interface FakeCall {
  label: LlmLabel | undefined;
  system: string;
  userText: string;
  fakeContext: unknown;
}

/**
 * Deterministic provider for tests and the CI eval. Handlers are keyed by `label`; a handler may return a raw
 * (possibly invalid) object and the provider applies the same validate + repair loop semantics as GeminiProvider:
 * when validation fails, the handler is called again (`callIndex` increments) up to `maxRepairs` times.
 * A handler may also throw `LlmError` to simulate quota/outage.
 */
export class FakeProvider implements LlmProvider {
  readonly name = 'fake';
  readonly available: boolean;
  readonly calls: FakeCall[] = [];
  private readonly counters = new Map<string, number>();

  constructor(
    private readonly handlers: Partial<Record<LlmLabel | 'default', FakeHandler>> = {},
    private readonly options: { maxRepairs?: number; available?: boolean } = {}
  ) {
    this.available = options.available ?? true;
  }

  async generateStructured<T>(args: GenerateStructuredArgs<T>): Promise<GenerateStructuredResult<T>> {
    const key = args.label ?? 'other';
    const handler = this.handlers[key] ?? this.handlers.default;
    if (!handler) throw new LlmError('ai_error', `FakeProvider has no handler for "${key}"`);
    this.calls.push({
      label: args.label,
      system: args.system,
      userText: args.userParts.map((p) => ('text' in p ? p.text : '[binary]')).join('\n'),
      fakeContext: args.fakeContext,
    });
    const maxRepairs = this.options.maxRepairs ?? 2;
    let lastIssue = '';
    for (let repair = 0; repair <= maxRepairs; repair += 1) {
      const idx = this.counters.get(key) ?? 0;
      this.counters.set(key, idx + 1);
      const raw = await handler(args as GenerateStructuredArgs<unknown>, idx);
      const parsed = args.schema.safeParse(raw);
      if (parsed.success) return { data: parsed.data, repairs: repair };
      lastIssue = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    }
    throw new LlmError('invalid_output', `Fake output failed validation: ${lastIssue}`);
  }

  callsFor(label: LlmLabel): FakeCall[] {
    return this.calls.filter((c) => c.label === label);
  }
}

/** Provider used when no API key is configured. Every call throws `no_api_key`; callers run Basic mode. */
export class NullProvider implements LlmProvider {
  readonly name = 'none';
  readonly available = false;
  async generateStructured<T>(): Promise<GenerateStructuredResult<T>> {
    throw new LlmError('no_api_key', 'GEMINI_API_KEY is not configured');
  }
}
