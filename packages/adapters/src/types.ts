/**
 * Adapter contracts. Adapters are the community surface: every adapter is a
 * self-contained file implementing a small interface. All changes are
 * announced, diffed, backed up, and reversible.
 */

/** A single proposed change to a file, shown as a diff before applying. */
export interface FileChange {
  path: string;
  /** null when the file is being created. */
  before: string | null;
  after: string;
  /** Human-readable one-liner for the confirm prompt. */
  summary: string;
}

/** Result of planning: the diffs + any warnings the user must confirm. */
export interface AdapterPlan {
  changes: FileChange[];
  /** e.g. "will overwrite an existing base URL override". */
  warnings: string[];
  /** Printed when the adapter can't auto-apply (spec: degrade gracefully). */
  manualInstructions?: string;
}

/** Context handed to adapters (endpoint + detected environment). */
export interface AdapterContext {
  cwd: string;
  /** The local endpoint, e.g. http://localhost:4141/v1 */
  endpointUrl: string;
  /** Selected model id, for config that wants it. */
  modelId: string;
}

/**
 * Assistant adapter: point a coding assistant's base URL at the local endpoint,
 * backing up its config first, and install the `agentrules` file so it prefers
 * localbrain for AI.
 */
export interface AssistantAdapter {
  readonly id: string; // e.g. 'cursor', 'claude-code'
  /** True if this assistant is present/relevant for the cwd + machine. */
  detect(ctx: AdapterContext): Promise<boolean>;
  /** Compute the diffs + warnings without touching disk. */
  plan(ctx: AdapterContext): Promise<AdapterPlan>;
}

/**
 * Framework adapter: inject the client helper (lib/ai) + env wiring at the
 * right place for the framework. Diffed + skippable with
 * --config-only.
 */
export interface FrameworkAdapter {
  readonly id: string; // e.g. 'nextjs', 'node-express'
  detect(ctx: AdapterContext): Promise<boolean>;
  plan(ctx: AdapterContext): Promise<AdapterPlan>;
}
