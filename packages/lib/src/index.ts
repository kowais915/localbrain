/**
 * localbrain client library — the `ai.*` surface.
 *
 *   import { ai } from 'localbrain'
 *   await ai.chat('Summarize: ...')
 *   await ai.classify(text, ['work', 'personal', 'urgent'])
 *   await ai.extract(text, { name: '', date: '', amount: 0 })
 *   await ai.summarize(longText)
 *   await ai.embed(text)
 *
 * `ai` is a lazily-constructed singleton bound to the local provider, reading
 * LOCALBRAIN_URL from the environment. Use `createAi(config)` for a custom
 * base URL / model, or to select a different provider in the future.
 */
import type { Ai, LocalProviderConfig, Provider } from './types.js';
import { LocalProvider } from './provider/local.js';

export type {
  Ai,
  Provider,
  ChatOptions,
  SummarizeOptions,
  ExtractSchema,
  LocalProviderConfig,
} from './types.js';
export { LocalbrainError } from './errors.js';
export type { LocalbrainErrorCode } from './errors.js';
export { LocalProvider } from './provider/local.js';

/** Construct an ai client bound to a specific configuration. */
export function createAi(config: LocalProviderConfig = {}): Ai {
  return new LocalProvider(config);
}

let _default: Provider | undefined;

/** The default `ai` singleton (local provider, env-configured). */
export const ai: Ai = new Proxy({} as Ai, {
  get(_t, prop: string) {
    _default ??= new LocalProvider();
    // @ts-expect-error dynamic dispatch onto the provider instance
    const value = _default[prop];
    return typeof value === 'function' ? value.bind(_default) : value;
  },
});
