import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AdapterContext, AdapterPlan, AssistantAdapter } from '../types.js';
import { agentRulesContent } from '../agentrules.js';
import { createFileChange } from '../util.js';

/**
 * Cursor assistant adapter.
 * Installs a project rules file so Cursor prefers the local endpoint, and prints
 * the exact manual step for pointing Cursor's OpenAI base URL at it (Cursor's
 * model base URL lives in app settings, not a project file).
 */
export const cursorAdapter: AssistantAdapter = {
  id: 'cursor',
  async detect(ctx: AdapterContext): Promise<boolean> {
    return (
      fs.existsSync(path.join(ctx.cwd, '.cursor')) ||
      fs.existsSync(path.join(ctx.cwd, '.cursorrules')) ||
      fs.existsSync(path.join(os.homedir(), '.cursor')) ||
      (os.platform() === 'darwin' && fs.existsSync('/Applications/Cursor.app'))
    );
  },
  async plan(ctx: AdapterContext): Promise<AdapterPlan> {
    const changes = [];
    const rulesFile = path.join(ctx.cwd, '.cursor', 'rules', 'localbrain.md');
    const change = await createFileChange(rulesFile, agentRulesContent(ctx.endpointUrl), 'Add Cursor rules for localbrain');
    if (change) changes.push(change);

    return {
      changes,
      warnings: [],
      manualInstructions:
        `To route Cursor's own model calls to the free local model:\n  Settings → Models → enable "Override OpenAI Base URL" → ${ctx.endpointUrl}\n  (leave the API key blank; none is required)`,
    };
  },
};
