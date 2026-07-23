import type {
  ChatOptions,
  ExtractSchema,
  LocalProviderConfig,
  Provider,
  SummarizeOptions,
} from '../types.js';
import { LocalbrainError, HINTS } from '../errors.js';
import { toJsonSchema } from '../schema.js';

const DEFAULT_BASE_URL = 'http://localhost:4141/v1';

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

/**
 * LocalProvider — talks to the local OpenAI-compatible endpoint.
 *
 * classify/extract/summarize are prompt + constrained-decoding strategies on
 * top of chat completions. `extract` and `classify` use `response_format:
 * json_schema` so the runtime grammar-constrains output to valid JSON.
 */
export class LocalProvider implements Provider {
  readonly name = 'local';
  private readonly baseUrl: string;
  private readonly model?: string;
  private readonly embedModel?: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;

  constructor(cfg: LocalProviderConfig = {}) {
    this.baseUrl = (cfg.baseUrl ?? process.env.LOCALBRAIN_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.model = cfg.model;
    this.embedModel = cfg.embedModel;
    this.apiKey = cfg.apiKey;
    this.timeoutMs = cfg.timeoutMs ?? 60_000;
  }

  async chat(prompt: string, opts: ChatOptions = {}): Promise<string> {
    const messages: Array<{ role: string; content: string }> = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: prompt });
    const data = await this.post<ChatCompletionResponse>(
      '/chat/completions',
      {
        model: this.model,
        messages,
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
        stop: opts.stop,
      },
      opts.signal,
    );
    return this.firstContent(data);
  }

  async classify(text: string, labels: string[], opts: ChatOptions = {}): Promise<string> {
    if (labels.length === 0) throw new LocalbrainError('SCHEMA_VIOLATION', 'classify requires at least one label', 'Pass a non-empty labels array.');
    const schema = {
      type: 'object',
      properties: { label: { type: 'string', enum: labels } },
      required: ['label'],
      additionalProperties: false,
    };
    const data = await this.post<ChatCompletionResponse>(
      '/chat/completions',
      {
        model: this.model,
        messages: [
          { role: 'system', content: 'You are a precise text classifier. Choose exactly one label.' },
          { role: 'user', content: `Classify the following text into one of [${labels.join(', ')}].\n\nText:\n${text}` },
        ],
        temperature: opts.temperature ?? 0,
        max_tokens: opts.maxTokens,
        response_format: { type: 'json_schema', json_schema: { name: 'classification', schema } },
      },
      opts.signal,
    );
    const parsed = this.parseJson<{ label?: string }>(this.firstContent(data));
    const label = parsed.label;
    if (!label || !labels.includes(label)) {
      throw new LocalbrainError('SCHEMA_VIOLATION', `classify returned an invalid label: ${String(label)}`, 'The model returned a label outside the provided set. Retry or adjust labels.');
    }
    return label;
  }

  async extract<T extends ExtractSchema>(text: string, schema: T, opts: ChatOptions = {}): Promise<T> {
    const jsonSchema = toJsonSchema(schema);
    const data = await this.post<ChatCompletionResponse>(
      '/chat/completions',
      {
        model: this.model,
        messages: [
          { role: 'system', content: 'Extract the requested fields as strict JSON. Use empty/0 values when not present.' },
          { role: 'user', content: `Extract fields from this text:\n\n${text}` },
        ],
        temperature: opts.temperature ?? 0,
        max_tokens: opts.maxTokens,
        response_format: { type: 'json_schema', json_schema: { name: 'extraction', schema: jsonSchema } },
      },
      opts.signal,
    );
    return this.parseJson<T>(this.firstContent(data));
  }

  async summarize(text: string, opts: SummarizeOptions = {}): Promise<string> {
    const lengthHint =
      opts.length === 'short' ? 'in one or two sentences' : opts.length === 'long' ? 'in a few short paragraphs' : 'concisely';
    const styleHint = opts.style ? ` Style: ${opts.style}.` : '';
    return this.chat(`Summarize the following ${lengthHint}.${styleHint}\n\n${text}`, {
      temperature: opts.temperature ?? 0.2,
      maxTokens: opts.maxTokens,
      system: opts.system,
      signal: opts.signal,
    });
  }

  async embed(text: string, opts: { signal?: AbortSignal } = {}): Promise<number[]> {
    const data = await this.post<{ data?: Array<{ embedding?: number[] }> }>(
      '/embeddings',
      { model: this.embedModel ?? this.model, input: text },
      opts.signal,
    );
    const vector = data.data?.[0]?.embedding;
    if (!vector) throw new LocalbrainError('BAD_RESPONSE', 'embeddings response had no vector', 'Check that the model supports embeddings, then run `localbrain doctor`.');
    return vector;
  }

  async health(): Promise<{ ok: boolean; model?: string; detail?: string }> {
    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/models`, { method: 'GET' });
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
      const data = (await res.json()) as { data?: Array<{ id?: string }> };
      return { ok: true, model: data.data?.[0]?.id };
    } catch (err) {
      return { ok: false, detail: (err as Error)?.message };
    }
  }

  // --- internals ---

  private async post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchWithTimeout(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      const e = err as Error;
      if (e?.name === 'AbortError') throw new LocalbrainError('ABORTED', 'request aborted', 'The request was aborted.');
      if (/timed out/i.test(e?.message ?? '')) throw new LocalbrainError('TIMEOUT', e.message, HINTS.TIMEOUT);
      throw new LocalbrainError('ENDPOINT_DOWN', e?.message ?? 'connection failed', HINTS.ENDPOINT_DOWN, err);
    }
    if (res.status === 503) {
      throw new LocalbrainError('MODEL_NOT_READY', 'model is still loading', HINTS.MODEL_NOT_READY);
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new LocalbrainError('BAD_RESPONSE', `HTTP ${res.status}: ${detail}`, 'The endpoint returned an error. Run `localbrain doctor`.');
    }
    return (await res.json()) as T;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) h['Authorization'] = `Bearer ${this.apiKey}`;
    return h;
  }

  private async fetchWithTimeout(url: string, init: RequestInit & { signal?: AbortSignal }): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('request timed out')), this.timeoutMs);
    const onAbort = () => controller.abort();
    if (init.signal) init.signal.addEventListener('abort', onAbort, { once: true });
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
      init.signal?.removeEventListener('abort', onAbort);
    }
  }

  private firstContent(data: ChatCompletionResponse): string {
    const content = data.choices?.[0]?.message?.content;
    if (content == null) throw new LocalbrainError('BAD_RESPONSE', 'no content in completion response', 'The endpoint returned an unexpected shape. Run `localbrain doctor`.');
    return content;
  }

  private parseJson<T>(raw: string): T {
    try {
      return JSON.parse(raw) as T;
    } catch {
      // Attempt to salvage a JSON object embedded in surrounding text.
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]) as T;
        } catch {
          /* fall through */
        }
      }
      throw new LocalbrainError('SCHEMA_VIOLATION', 'model did not return valid JSON', 'Constrained decoding failed; retry or run `localbrain doctor`.');
    }
  }
}
