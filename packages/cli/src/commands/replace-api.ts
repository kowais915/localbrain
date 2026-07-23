import fsp from 'node:fs/promises';
import path from 'node:path';
import { aiUsageDetector } from '@localbrain/detection';
import { applyPlan, type AdapterPlan, type FileChange } from '@localbrain/adapters';
import { loadConfig } from '../config.js';
import type { GlobalFlags } from '../flags.js';
import { announce, confirm, showDiff, success, warn, info, color } from '../ui.js';

/**
 * `localbrain replace-api`.
 * Find paid-API calls and swap them to the local endpoint, one diff per site.
 * Conservatively injects `baseURL: process.env.LOCALBRAIN_URL` into OpenAI SDK
 * client construction and keeps the paid key as a documented fallback.
 * Anything it can't safely rewrite is reported for manual handling.
 */
export async function runReplaceApi(flags: GlobalFlags): Promise<void> {
  const cwd = process.cwd();
  const usage = await aiUsageDetector.run(cwd);
  if (!usage.found || usage.sites.length === 0) {
    info('No paid-API call sites found — nothing to replace.');
    return;
  }

  const config = await loadConfig();
  const endpoint = config?.endpointUrl ?? 'http://localhost:4141/v1';

  announce(`Found paid-API usage in ${usage.sites.length} place(s)`);
  for (const s of usage.sites) info(color.dim(`  ${s.file}:${s.line}  ${s.provider}  ${s.snippet}`));

  // Group by file and compute rewrites.
  const files = [...new Set(usage.sites.map((s) => s.file))];
  const changes: FileChange[] = [];
  const manual: string[] = [];

  for (const rel of files) {
    const abs = path.join(cwd, rel);
    let content: string;
    try {
      content = await fsp.readFile(abs, 'utf8');
    } catch {
      continue;
    }
    const rewritten = rewriteOpenAiClient(content, endpoint);
    if (rewritten && rewritten !== content) {
      changes.push({ path: abs, before: content, after: rewritten, summary: `Point AI client at local endpoint (${rel})` });
    } else {
      manual.push(rel);
    }
  }

  if (changes.length === 0) {
    warn('Could not safely auto-rewrite any call sites.');
    printManual(manual, endpoint);
    return;
  }

  info(color.bold('\nProposed changes:'));
  for (const c of changes) showDiff(c.path, c.before, c.after);
  const ok = await confirm('Apply these changes? (paid keys are kept as a fallback)', flags, true);
  if (!ok) {
    info('Skipped. Nothing changed.');
    return;
  }
  const plan: AdapterPlan = { changes, warnings: [] };
  await applyPlan(plan);
  success(`Rewrote ${changes.length} file(s). ${color.dim('Reversible with `localbrain undo`.')}`);
  info(color.dim('Tip: validate your build (e.g. `npm run build`) to confirm everything stays green.'));
  if (manual.length) printManual(manual, endpoint);
}

/**
 * Inject `baseURL: process.env.LOCALBRAIN_URL` into `new OpenAI({ ... })` when a
 * baseURL isn't already configured. Idempotent (skips files already wired).
 */
function rewriteOpenAiClient(content: string, endpoint: string): string | null {
  if (content.includes('LOCALBRAIN_URL') || /baseURL\s*:/.test(content)) return content;
  const re = /new\s+OpenAI\s*\(\s*\{/;
  if (!re.test(content)) return null;
  return content.replace(
    re,
    `new OpenAI({\n    baseURL: process.env.LOCALBRAIN_URL ?? '${endpoint}', // localbrain: free local model (set LOCALBRAIN_URL; falls back to paid API key below)`,
  );
}

function printManual(files: string[], endpoint: string): void {
  if (files.length === 0) return;
  info(color.bold('\nManual steps for these files:'));
  for (const f of files) info(`  ${f}`);
  info(color.dim(`  Point the client's base URL at ${endpoint} (no API key required), e.g. baseURL: process.env.LOCALBRAIN_URL`));
}
