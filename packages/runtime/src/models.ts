import type { HardwareInfo } from '@localbrain/detection';

/**
 * Model catalog + selection logic.
 *
 * Only ungated, permissively-licensed models are blessed defaults so the happy
 * path needs no login/token/license click-through. Do NOT default to Llama or
 * Gemma (gated + restrictive) — they may be an opt-in advanced choice where the
 * user supplies their own token.
 */

export type ModelTier = 'nano' | 'tiny' | 'small' | 'medium' | 'large';

export interface ModelSpec {
  /** Stable id used by --model and the cache. */
  id: string;
  /** Human label for logs. */
  label: string;
  tier: ModelTier;
  /** Approx params in billions (for the memory rule). */
  paramsB: number;
  /** Download size in bytes (Q4 GGUF). 0 = unknown (learned on first download). */
  sizeBytes: number;
  /** SPDX license id — MUST be permissive & ungated for blessed defaults. */
  license: 'Apache-2.0' | 'MIT';
  spdxLicenseText: string;
  /**
   * Mirror fallback chain: primary CDN → secondary mirror →
   * ungated public source (anonymous). The first entry SHOULD be a self-hosted
   * no-auth CDN copy once it exists; the HF anonymous URL is the final fallback.
   */
  sources: string[];
  /**
   * SHA-256 of the GGUF for post-download verification. Empty
   * until pinned in the signed manifest — the downloader warns loudly and
   * records the observed hash when this is empty.
   */
  sha256: string;
  /** Whether this model also serves embeddings. */
  supportsEmbeddings: boolean;
}

const APACHE_2_0_NOTICE =
  'This model is distributed under the Apache License 2.0. See https://www.apache.org/licenses/LICENSE-2.0 for the full text.';

/**
 * Blessed default models. `sources[0]` is the self-hosted CDN
 * placeholder (replace `CDN_BASE` once R2 copies exist); the HF `resolve` URL
 * is the ungated anonymous fallback. Sizes/hashes are pinned in the signed
 * manifest — see MODELS.md.
 */
const CDN_BASE = process.env.LOCALBRAIN_CDN_BASE ?? 'https://models.localbrain.dev';

export const BLESSED_MODELS: Record<string, ModelSpec> = {
  'smollm2-135m': {
    id: 'smollm2-135m',
    label: 'SmolLM2 135M Instruct (Q4_K_M)',
    tier: 'nano',
    paramsB: 0.135,
    sizeBytes: 92_000_000, // ~90 MB
    license: 'Apache-2.0',
    spdxLicenseText: APACHE_2_0_NOTICE,
    sources: [
      `${CDN_BASE}/smollm2-135m-instruct-q4_k_m.gguf`,
      'https://huggingface.co/bartowski/SmolLM2-135M-Instruct-GGUF/resolve/main/SmolLM2-135M-Instruct-Q4_K_M.gguf',
      'https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct-GGUF/resolve/main/smollm2-135m-instruct-q4_k_m.gguf',
    ],
    sha256: '',
    supportsEmbeddings: false,
  },
  'smollm2-360m': {
    id: 'smollm2-360m',
    label: 'SmolLM2 360M Instruct (Q4_K_M)',
    tier: 'nano',
    paramsB: 0.36,
    sizeBytes: 240_000_000, // ~230 MB
    license: 'Apache-2.0',
    spdxLicenseText: APACHE_2_0_NOTICE,
    sources: [
      `${CDN_BASE}/smollm2-360m-instruct-q4_k_m.gguf`,
      'https://huggingface.co/bartowski/SmolLM2-360M-Instruct-GGUF/resolve/main/SmolLM2-360M-Instruct-Q4_K_M.gguf',
      'https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct-GGUF/resolve/main/smollm2-360m-instruct-q4_k_m.gguf',
    ],
    sha256: '',
    supportsEmbeddings: false,
  },
  'smollm2-1.7b': {
    id: 'smollm2-1.7b',
    label: 'SmolLM2 1.7B Instruct (Q4_K_M)',
    tier: 'tiny',
    paramsB: 1.7,
    sizeBytes: 1_000_000_000, // ~1 GB
    license: 'Apache-2.0',
    spdxLicenseText: APACHE_2_0_NOTICE,
    sources: [
      `${CDN_BASE}/smollm2-1.7b-instruct-q4_k_m.gguf`,
      'https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF/resolve/main/smollm2-1.7b-instruct-q4_k_m.gguf',
    ],
    sha256: '',
    supportsEmbeddings: false,
  },
  'qwen2.5-3b': {
    id: 'qwen2.5-3b',
    label: 'Qwen2.5 3B Instruct (Q4_K_M)',
    tier: 'small',
    paramsB: 3,
    sizeBytes: 2_000_000_000, // ~2 GB
    license: 'Apache-2.0',
    spdxLicenseText: APACHE_2_0_NOTICE,
    sources: [
      `${CDN_BASE}/qwen2.5-3b-instruct-q4_k_m.gguf`,
      'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf',
    ],
    sha256: '',
    supportsEmbeddings: false,
  },
  'qwen2.5-7b': {
    id: 'qwen2.5-7b',
    label: 'Qwen2.5 7B Instruct (Q4_K_M)',
    tier: 'medium',
    paramsB: 7,
    sizeBytes: 4_500_000_000, // ~4.5 GB
    license: 'Apache-2.0',
    spdxLicenseText: APACHE_2_0_NOTICE,
    sources: [
      `${CDN_BASE}/qwen2.5-7b-instruct-q4_k_m.gguf`,
      'https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/qwen2.5-7b-instruct-q4_k_m.gguf',
    ],
    sha256: '',
    supportsEmbeddings: false,
  },
};

/**
 * An optional slightly-larger tiny model (ungated, Apache-2.0) for when 135M/360M
 * feel too weak but you still want a sub-500MB download.
 */
export const QWEN_0_5B: ModelSpec = {
  id: 'qwen2.5-0.5b',
  label: 'Qwen2.5 0.5B Instruct (Q4_K_M)',
  tier: 'nano',
  paramsB: 0.5,
  sizeBytes: 400_000_000, // ~400 MB
  license: 'Apache-2.0',
  spdxLicenseText: APACHE_2_0_NOTICE,
  sources: [
    `${CDN_BASE}/qwen2.5-0.5b-instruct-q4_k_m.gguf`,
    'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
  ],
  sha256: '',
  supportsEmbeddings: false,
};

/**
 * The lightest, fastest model — used for development smoke tests and as the
 * default for very constrained machines (~90 MB, ungated, Apache-2.0).
 */
export const SMOKE_TEST_MODEL: ModelSpec = BLESSED_MODELS['smollm2-135m']!;

export function getModel(id: string): ModelSpec | null {
  if (id === QWEN_0_5B.id) return QWEN_0_5B;
  return BLESSED_MODELS[id] ?? null;
}

/** All user-selectable models, ordered lightest → largest (for the picker menu). */
export const SELECTABLE_MODELS: ModelSpec[] = [
  BLESSED_MODELS['smollm2-135m']!,
  BLESSED_MODELS['smollm2-360m']!,
  QWEN_0_5B,
  BLESSED_MODELS['smollm2-1.7b']!,
  BLESSED_MODELS['qwen2.5-3b']!,
  BLESSED_MODELS['qwen2.5-7b']!,
];

/** Human-friendly download size, e.g. "~90 MB" / "~4.5 GB". */
export function sizeLabel(spec: ModelSpec): string {
  if (!spec.sizeBytes) return 'size varies';
  const gb = spec.sizeBytes / 1e9;
  return gb >= 1 ? `~${gb.toFixed(1)} GB` : `~${Math.round(spec.sizeBytes / 1e6)} MB`;
}

/** ~0.6–0.7 GB RAM per billion params (Q4) + headroom. */
export function estimatedRamGb(spec: ModelSpec): number {
  return spec.paramsB * 0.7 + 1.5;
}

export interface ModelChoice {
  spec: ModelSpec | null;
  /** true when no local model fits — caller must offer hosted fallback. */
  needsHostedFallback: boolean;
  reason: string;
}

/**
 * Pick the smartest model that runs SMOOTHLY, never the biggest.
 * Leaves RAM headroom; verified afterwards by a timed smoke test.
 */
export function selectModel(hw: HardwareInfo, override?: string): ModelChoice {
  if (override) {
    const spec = getModel(override);
    return {
      spec,
      needsHostedFallback: false,
      reason: spec ? `override: ${override}` : `unknown model override: ${override}`,
    };
  }

  // Base tier selection on TOTAL RAM, not free RAM: macOS (and Linux) report
  // very little "free" memory because the OS caches aggressively and reclaims
  // it on demand, so free RAM would wrongly rule out capable machines.
  const ram = hw.totalRamGb || hw.freeRamGb;
  const hasRealGpu = hw.gpu.present && (hw.gpu.vramGb ?? 0) >= 6;

  if (ram >= 16 || hasRealGpu) {
    return { spec: BLESSED_MODELS['qwen2.5-7b']!, needsHostedFallback: false, reason: hasRealGpu ? 'GPU with ≥6GB VRAM' : '16GB+ RAM' };
  }
  if (ram >= 8) {
    return { spec: BLESSED_MODELS['qwen2.5-3b']!, needsHostedFallback: false, reason: '8–16GB RAM (default sweet spot)' };
  }
  if (ram >= 4) {
    return { spec: BLESSED_MODELS['smollm2-1.7b']!, needsHostedFallback: false, reason: '≤8GB RAM, CPU-friendly' };
  }
  if (ram >= 2) {
    return { spec: BLESSED_MODELS['smollm2-360m']!, needsHostedFallback: false, reason: 'low RAM — nano model (~230MB)' };
  }
  if (ram >= 1) {
    return { spec: BLESSED_MODELS['smollm2-135m']!, needsHostedFallback: false, reason: 'very low RAM — nano model (~90MB)' };
  }
  return { spec: null, needsHostedFallback: true, reason: 'insufficient RAM for any local model' };
}

/** Drop to the next-smaller tier (used when the smoke test is slow). */
export function nextSmallerTier(spec: ModelSpec): ModelSpec | null {
  const order = ['qwen2.5-7b', 'qwen2.5-3b', 'smollm2-1.7b', 'smollm2-360m', 'smollm2-135m'];
  const idx = order.indexOf(spec.id);
  if (idx < 0 || idx === order.length - 1) return null;
  const nextId = order[idx + 1]!;
  return getModel(nextId);
}
