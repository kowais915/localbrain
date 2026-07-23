/**
 * Normalized detection results.
 * Every detector returns a small, typed, serializable result so the
 * orchestrator can branch (A–D) and print a tailored summary.
 */

export interface HardwareInfo {
  os: 'macos' | 'linux' | 'windows' | 'unknown';
  arch: string;
  cpuCores: number;
  totalRamGb: number;
  freeRamGb: number;
  freeDiskGb: number;
  gpu: {
    present: boolean;
    kind?: 'apple' | 'nvidia' | 'amd' | 'intel' | 'other';
    vramGb?: number;
  };
  /** true when running with elevated privileges (warn). */
  isRoot: boolean;
  hasWritePermission: boolean;
}

export type Framework = 'nextjs' | 'node-express' | 'vite' | 'none' | 'unknown';
export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun' | 'unknown';

export interface ProjectInfo {
  /** true if this folder looks like an app at all. */
  hasApp: boolean;
  framework: Framework;
  packageManager: PackageManager;
  root: string;
  /** Deploy targets inferred from config. */
  deployTargets: DeployTarget[];
}

export type DeployTarget = 'vercel' | 'netlify' | 'none' | 'unknown';

export type AssistantId = 'cursor' | 'claude-code' | 'windsurf' | 'cline' | 'copilot';

export interface AssistantInfo {
  id: AssistantId;
  /** Path to the assistant's config we would read/merge. */
  configPath?: string;
  /** Existing custom base URL / model override we must warn about. */
  existingOverride?: { baseUrl?: string; model?: string };
}

export interface AiUsageSite {
  file: string;
  line: number;
  /** Which paid provider this call targets. */
  provider: 'openai' | 'anthropic' | 'other';
  /** A short snippet for the diff preview. */
  snippet: string;
}

export interface AiUsageInfo {
  /** true if any paid-API usage or key was found. */
  found: boolean;
  sites: AiUsageSite[];
  /** Keys discovered in .env-style files (names only, never values logged). */
  envKeyNames: string[];
}

export interface DetectionReport {
  hardware: HardwareInfo;
  project: ProjectInfo;
  assistants: AssistantInfo[];
  aiUsage: AiUsageInfo;
}

/** A detector is a pure-ish probe over a working directory. */
export interface Detector<T> {
  readonly name: string;
  run(cwd: string): Promise<T>;
}
