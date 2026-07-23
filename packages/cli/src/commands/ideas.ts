import { projectDetector } from '@localbrain/detection';
import type { GlobalFlags } from '../flags.js';
import { info, step, color, announce } from '../ui.js';

/**
 * `localbrain ideas`.
 * Suggest AI features that fit the detected app. Falls back to the generic
 * capability menu when there are no obvious hooks.
 */
export async function runIdeas(_flags: GlobalFlags): Promise<void> {
  const project = await projectDetector.run(process.cwd());
  announce('AI feature ideas for this project');

  const generic: Array<[string, string]> = [
    ['Classify', 'tag or route incoming text (support tickets, notes, emails) into categories'],
    ['Extract', 'pull structured JSON (name, date, amount…) from freeform text or documents'],
    ['Summarize', 'condense long content — threads, articles, logs — into short summaries'],
    ['Semantic search', 'embed content and find by meaning, not just keywords'],
    ['Light chat', 'an in-app assistant for high-volume, simple Q&A'],
  ];

  if (project.framework === 'nextjs' || project.framework === 'node-express') {
    info(color.dim(`Detected ${project.framework}. Good local-model fits:`));
  } else {
    info(color.dim('Generic capability menu (works for any app):'));
  }
  for (const [name, desc] of generic) step(`${color.bold(name)} — ${desc}`);
  info(`\nAll are free and private on the local model. Call them via ${color.dim("import { ai } from 'localbrain'")}.`);
}
