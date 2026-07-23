import { undoLast } from '@localbrain/adapters';
import type { GlobalFlags } from '../flags.js';
import { success, info } from '../ui.js';

/**
 * `localbrain undo`.
 * Revert the last set of changes localbrain made, restoring backups atomically.
 */
export async function runUndo(_flags: GlobalFlags): Promise<void> {
  const { reverted, id } = await undoLast();
  if (reverted > 0) success(`Reverted ${reverted} change(s) from ${id}.`);
  else info('Nothing to undo.');
}
