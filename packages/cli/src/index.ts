/**
 * Library entry for the published `localbrain` package.
 * Re-exports the ai.* client so `import { ai } from 'localbrain'` works
 *. The CLI bin lives in cli.ts.
 */
export { ai, createAi, LocalProvider, LocalbrainError } from 'localbrain-client';
export type {
  Ai,
  Provider,
  ChatOptions,
  SummarizeOptions,
  ExtractSchema,
  LocalProviderConfig,
  LocalbrainErrorCode,
} from 'localbrain-client';
