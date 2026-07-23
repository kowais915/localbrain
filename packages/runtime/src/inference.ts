import type { ModelSpec } from './models.js';

/**
 * Inference engine.
 * Wraps node-llama-cpp with PREBUILT binaries — never compiles on the user's
 * machine. Exposes the primitives the OpenAI server maps onto:
 * streaming chat completion, embeddings, and grammar/JSON-schema constrained
 * decoding.
 *
 * node-llama-cpp is imported dynamically so the CLI can run detection/help
 * without loading native code.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionParams {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
  /** JSON schema for constrained decoding (extract/classify). */
  jsonSchema?: object;
  /** Raw GBNF grammar for constrained decoding (advanced). */
  grammar?: string;
  signal?: AbortSignal;
}

export interface LoadedModelInfo {
  spec: ModelSpec;
  contextSize: number;
}

export interface Engine {
  readonly modelInfo: LoadedModelInfo;
  /** Streamed completion — yields text chunks as they are generated. */
  complete(params: CompletionParams): AsyncIterable<string>;
  /** Convenience: full (non-streamed) completion. */
  completeText(params: CompletionParams): Promise<string>;
  embed(text: string): Promise<number[]>;
  /** Timed smoke test used to validate hardware fit. */
  smokeTest(): Promise<{ ok: boolean; tokensPerSec: number }>;
  unload(): Promise<void>;
}

export interface CreateEngineOptions {
  modelPath: string;
  spec: ModelSpec;
  /** Force CPU (skip GPU). */
  cpuOnly?: boolean;
  /** Context window size; default derived from the model. */
  contextSize?: number;
}

// Minimal structural types for the bits of node-llama-cpp we use. Kept local so
// this package need not depend on the library's types at build time.
interface NllamaModule {
  getLlama(opts?: Record<string, unknown>): Promise<NllamaLlama>;
  LlamaChatSession: new (opts: { contextSequence: unknown; systemPrompt?: string }) => NllamaChatSession;
}
interface NllamaLlama {
  gpu: unknown;
  loadModel(opts: { modelPath: string }): Promise<NllamaModel>;
  createGrammarForJsonSchema?(schema: object): Promise<unknown>;
}
interface NllamaModel {
  createContext(opts?: { contextSize?: number }): Promise<NllamaContext>;
  createEmbeddingContext?(): Promise<NllamaEmbeddingContext>;
  dispose?(): Promise<void>;
}
interface NllamaSequence {
  dispose?(): void;
}
interface NllamaContext {
  readonly contextSize: number;
  getSequence(): NllamaSequence;
  dispose?(): Promise<void>;
}
interface NllamaEmbeddingContext {
  getEmbeddingFor(text: string): Promise<{ vector: number[] | Float32Array }>;
  dispose?(): Promise<void>;
}
interface NllamaChatSession {
  dispose?(): void;
  prompt(
    text: string,
    opts?: {
      temperature?: number;
      maxTokens?: number;
      customStopTriggers?: string[];
      grammar?: unknown;
      signal?: AbortSignal;
      onTextChunk?: (chunk: string) => void;
    },
  ): Promise<string>;
  setChatHistory?(history: Array<{ type: 'system' | 'user' | 'model'; text: string }>): void;
}

/** Simple async mutex so concurrent HTTP requests share one context safely. */
class Mutex {
  private tail: Promise<void> = Promise.resolve();
  async run<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((r) => (release = r));
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

/**
 * Create the node-llama-cpp-backed engine and load the model.
 * The model is warmed with a 1-token generation so the first real request
 * doesn't look like a hang.
 */
export async function createEngine(opts: CreateEngineOptions): Promise<Engine> {
  let nllama: NllamaModule;
  try {
    nllama = (await import('node-llama-cpp')) as unknown as NllamaModule;
  } catch (err) {
    throw new Error(
      'node-llama-cpp is not available. Reinstall dependencies; localbrain ships prebuilt binaries and never compiles on your machine.',
      { cause: err },
    );
  }

  const llama = await nllama.getLlama(opts.cpuOnly ? { gpu: false } : {});
  const model = await llama.loadModel({ modelPath: opts.modelPath });
  const context = await model.createContext(opts.contextSize ? { contextSize: opts.contextSize } : {});
  const mutex = new Mutex();
  let embeddingContext: NllamaEmbeddingContext | undefined;

  const modelInfo: LoadedModelInfo = { spec: opts.spec, contextSize: context.contextSize };

  // ONE long-lived sequence + chat session, reused for every request. Requests
  // are serialized by the mutex, and each one resets the chat history — so we
  // never churn context sequences (which wedges after a couple of requests).
  const contextSequence = context.getSequence();
  const session = new nllama.LlamaChatSession({ contextSequence });

  type HistoryEntry = { type: 'system' | 'user' | 'model'; text: string };

  /** Turn OpenAI-style messages into (prior history, final user prompt). */
  function buildHistory(messages: ChatMessage[]): { history: HistoryEntry[]; lastUser: string } {
    const history: HistoryEntry[] = [];
    const systemPrompt = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    if (systemPrompt) history.push({ type: 'system', text: systemPrompt });

    const nonSystem = messages.filter((m) => m.role !== 'system');
    const lastUserIdx = [...nonSystem].reverse().findIndex((m) => m.role === 'user');
    const cutIdx = lastUserIdx === -1 ? nonSystem.length : nonSystem.length - 1 - lastUserIdx;
    for (const m of nonSystem.slice(0, cutIdx)) {
      history.push({ type: m.role === 'assistant' ? 'model' : 'user', text: m.content });
    }
    const lastUser = cutIdx < nonSystem.length ? nonSystem[cutIdx]!.content : '';
    return { history, lastUser };
  }

  async function resolveGrammar(params: CompletionParams): Promise<unknown> {
    if (params.jsonSchema && llama.createGrammarForJsonSchema) {
      return llama.createGrammarForJsonSchema(params.jsonSchema);
    }
    return undefined;
  }

  const engine: Engine = {
    modelInfo,

    complete(params: CompletionParams): AsyncIterable<string> {
      const queue: string[] = [];
      let done = false;
      let error: unknown;
      let notify: (() => void) | null = null;

      const wake = () => {
        if (notify) {
          const n = notify;
          notify = null;
          n();
        }
      };

      void mutex
        .run(async () => {
          const { history, lastUser } = buildHistory(params.messages);
          // Reset to this request's history (stateless completions), then prompt.
          if (session.setChatHistory) session.setChatHistory(history);
          const grammar = await resolveGrammar(params);
          await session.prompt(lastUser, {
            temperature: params.temperature,
            maxTokens: params.maxTokens,
            customStopTriggers: params.stop,
            grammar,
            signal: params.signal,
            onTextChunk: (chunk: string) => {
              queue.push(chunk);
              wake();
            },
          });
        })
        .then(() => {
          done = true;
          wake();
        })
        .catch((e) => {
          error = e;
          done = true;
          wake();
        });

      return {
        async *[Symbol.asyncIterator]() {
          while (true) {
            if (queue.length > 0) {
              yield queue.shift()!;
              continue;
            }
            if (error) throw error;
            if (done) return;
            await new Promise<void>((r) => (notify = r));
          }
        },
      };
    },

    async completeText(params: CompletionParams): Promise<string> {
      let out = '';
      for await (const chunk of engine.complete(params)) out += chunk;
      return out;
    },

    async embed(text: string): Promise<number[]> {
      return mutex.run(async () => {
        if (!model.createEmbeddingContext) {
          throw new Error('This model/build does not support embeddings.');
        }
        embeddingContext ??= await model.createEmbeddingContext();
        const res = await embeddingContext.getEmbeddingFor(text);
        return Array.from(res.vector);
      });
    },

    async smokeTest(): Promise<{ ok: boolean; tokensPerSec: number }> {
      const started = Date.now();
      const maxTokens = 24;
      const text = await engine.completeText({
        messages: [{ role: 'user', content: 'Reply with a short friendly greeting.' }],
        maxTokens,
        temperature: 0,
      });
      const seconds = (Date.now() - started) / 1000 || 1;
      const approxTokens = Math.max(1, Math.round(text.length / 4));
      return { ok: text.trim().length > 0, tokensPerSec: approxTokens / seconds };
    },

    async unload(): Promise<void> {
      await embeddingContext?.dispose?.();
      await context.dispose?.();
      await model.dispose?.();
    },
  };

  // Warm the model so the first real request is fast.
  try {
    await engine.completeText({ messages: [{ role: 'user', content: 'Hi' }], maxTokens: 1, temperature: 0 });
  } catch {
    // Warming is best-effort.
  }

  return engine;
}
