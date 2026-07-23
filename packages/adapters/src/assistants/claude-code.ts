import os from 'node:os';
import path from 'node:path';
import type { AdapterContext, AdapterPlan, AssistantAdapter } from '../types.js';
import { agentRulesContent } from '../agentrules.js';
import { createFileChange, readIfExists, fileExists } from '../util.js';

/**
 * Claude Code assistant adapter.
 * Installs project agentrules so the assistant prefers the local endpoint for
 * the app's AI features. Appends to CLAUDE.md if present (backed up + diffed),
 * otherwise writes .claude/localbrain.md.
 */
export const claudeCodeAdapter: AssistantAdapter = {
  id: 'claude-code',
  async detect(ctx: AdapterContext): Promise<boolean> {
    return (
      fileExists(path.join(ctx.cwd, '.claude')) ||
      fileExists(path.join(ctx.cwd, 'CLAUDE.md')) ||
      fileExists(path.join(os.homedir(), '.claude'))
    );
  },
  async plan(ctx: AdapterContext): Promise<AdapterPlan> {
    const changes = [];
    const rules = agentRulesContent(ctx.endpointUrl);
    const claudeMd = path.join(ctx.cwd, 'CLAUDE.md');
    const existing = await readIfExists(claudeMd);

    if (existing != null) {
      const marker = '# localbrain — assistant rules';
      if (!existing.includes(marker)) {
        changes.push({
          path: claudeMd,
          before: existing,
          after: `${existing}${existing.endsWith('\n') ? '' : '\n'}\n${rules}`,
          summary: 'Append localbrain rules to CLAUDE.md',
        });
      }
    } else {
      const change = await createFileChange(
        path.join(ctx.cwd, '.claude', 'localbrain.md'),
        rules,
        'Add .claude/localbrain.md',
      );
      if (change) changes.push(change);
    }

    return {
      changes,
      warnings: [],
      manualInstructions: `Claude Code will read these rules and prefer the local endpoint at ${ctx.endpointUrl}.`,
    };
  },
};
