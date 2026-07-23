import fsp from 'node:fs/promises';
import fs from 'node:fs';
import type { GlobalFlags } from '../flags.js';
import { localbrainHome } from '@localbrain/runtime';
import { readServerState, isPidAlive, clearServerState } from '../config.js';
import { confirm, success, warn, info, color } from '../ui.js';

/**
 * `localbrain uninstall`.
 * Remove config, cached models, and runtime state. Say so plainly if nothing
 * is installed.
 */
export async function runUninstall(flags: GlobalFlags): Promise<void> {
  const home = localbrainHome();
  if (!fs.existsSync(home)) {
    info('Nothing to uninstall — localbrain has no data on this machine.');
    return;
  }

  // Stop a running endpoint first.
  const state = await readServerState();
  if (state && isPidAlive(state.pid)) {
    try {
      process.kill(state.pid, 'SIGTERM');
    } catch {
      /* ignore */
    }
    await clearServerState();
  }

  warn(`This removes ${color.bold(home)} (config, cached models, backups).`);
  const ok = await confirm('Remove all localbrain data?', flags);
  if (!ok) {
    info('Cancelled. Nothing was removed.');
    return;
  }
  await fsp.rm(home, { recursive: true, force: true });
  success('Removed localbrain data.');
  info(color.dim('Note: env entries (LOCALBRAIN_URL) and wiring in your project are left in place — use `localbrain undo` to revert those.'));
}
