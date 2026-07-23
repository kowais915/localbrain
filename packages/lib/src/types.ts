/**
 * Public types for the ai.* client library.
 *
 * The library talks to a "provider".
 * MVP ships one provider: `local` (the OpenAI-compatible endpoint on
 * localhost:4141). v2 adds `cloud` and `sidecar` providers selected per
 * environment, so identical app code runs free-and-local in dev and on a
 * chosen provider in prod.
 */

export interface ChatOptions {
  /** Sampling temperature (0–2). Lower = more deterministic. */
  temperature?: number;
  /** Hard cap on generated tokens. */
  maxTokens?: number;
  /** System prompt prepended to the conversation. */
  system?: string;
  /** Stop sequences that end generation. */
  stop?: string[];
  /** Abort an in-flight request. */
  signal?: AbortSignal;
}

export interface SummarizeOptions extends ChatOptions {
  /** Rough target length for the summary. */
  length?: 'short' | 'medium' | 'long';
  /** Output style hint (e.g. "bullet points", "one sentence"). */
  style?: string;
}

/**
 * A JSON-schema-ish shape passed to `ai.extract`. The runtime enforces this
 * via grammar/JSON-schema constrained decoding so output is always valid JSON
 * matching the shape. Accepts either an example object (values used as type
 * hints) or a JSON Schema object.
 */
export type ExtractSchema = Record<string, unknown>;

/**
 * The provider contract. Every capability the library exposes maps onto one of
 * these methods. Swapping local ↔ cloud ↔ sidecar is swapping the provider.
 */
export interface Provider {
  readonly name: string;
  chat(prompt: string, opts?: ChatOptions): Promise<string>;
  classify(text: string, labels: string[], opts?: ChatOptions): Promise<string>;
  extract<T extends ExtractSchema>(text: string, schema: T, opts?: ChatOptions): Promise<T>;
  summarize(text: string, opts?: SummarizeOptions): Promise<string>;
  embed(text: string, opts?: { signal?: AbortSignal }): Promise<number[]>;
  /** Cheap liveness probe used by `doctor` and smoke tests. */
  health(): Promise<{ ok: boolean; model?: string; detail?: string }>;
}

export interface LocalProviderConfig {
  /** Base URL of the OpenAI-compatible endpoint. Defaults to LOCALBRAIN_URL or http://localhost:4141/v1. */
  baseUrl?: string;
  /** Chat/completions model id. Provider default if omitted. */
  model?: string;
  /** Embeddings model id. Provider default if omitted. */
  embedModel?: string;
  /** Optional API key (local endpoint requires none; here for parity/cloud). */
  apiKey?: string;
  /** Per-request timeout in ms. */
  timeoutMs?: number;
}

/** The shape of the top-level `ai` singleton exported from the package. */
export type Ai = Provider;
