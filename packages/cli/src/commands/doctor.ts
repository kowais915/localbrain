import fs from 'node:fs';
import type { GlobalFlags } from '../flags.js';
import { loadConfig, readServerState, isPidAlive } from '../config.js';
import { ai } from '@localbrain/lib';
import { canWrite, localbrainHome } from '@localbrain/runtime';
import { success, warn, error, info, color, announce } from '../ui.js';

/**
 * `localbrain doctor`.
 * Diagnose config/model/endpoint/permissions and report pass/fail with fixes.
 */
export async function runDoctor(_flags: GlobalFlags): Promise<void> {
  announce('Running diagnostics');
  let problems = 0;
  const fail = (msg: string, fix: string) => {
    error(msg);
    info(color.dim(`    ↳ ${fix}`));
    problems++;
  };

  // 1. Set up?
  const config = await loadConfig();
  if (!config) {
    fail('Not set up yet.', 'Run `npx localbrain` to set up.');
    info('\nNothing else to check until setup completes.');
    return;
  }
  success('Config found.');

  // 2. Model cached?
  if (fs.existsSync(config.modelPath)) success(`Model present: ${config.modelId}`);
  else fail(`Model file missing at ${config.modelPath}.`, 'Re-run `npx localbrain` to download it again.');

  // 3. Write permission to home dir.
  if (await canWrite(localbrainHome())) success('Cache directory is writable.');
  else fail('Cannot write to ~/.localbrain.', 'Check permissions; localbrain uses a userspace path.');

  // 4. Endpoint reachable?
  const state = await readServerState();
  if (state && isPidAlive(state.pid)) {
    const health = await ai.health();
    if (health.ok) success(`Endpoint healthy at ${state.url} (model: ${health.model ?? 'unknown'}).`);
    else fail(`Endpoint process is running but not responding: ${health.detail ?? ''}.`, 'Try `localbrain stop` then `localbrain start`.');
  } else {
    warn('Endpoint is not running.');
    info(color.dim('    ↳ Start it with `localbrain start`.'));
  }

  info('');
  if (problems === 0) success('All good.');
  else error(`${problems} problem(s) found — see fixes above.`);
}
