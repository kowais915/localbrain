/**
 * Detection engine.
 * Runs all detectors and assembles a normalized DetectionReport that the
 * orchestrator uses to choose a branch (A–D) and print a tailored summary.
 */
import type { DetectionReport } from './types.js';
import { hardwareDetector } from './hardware.js';
import { projectDetector } from './project.js';
import { assistantDetector } from './assistant.js';
import { aiUsageDetector } from './ai-usage.js';

export * from './types.js';
export { hardwareDetector } from './hardware.js';
export { projectDetector } from './project.js';
export { assistantDetector } from './assistant.js';
export { aiUsageDetector } from './ai-usage.js';

/** Run the full detection phase over a working directory. */
export async function detect(cwd: string = process.cwd()): Promise<DetectionReport> {
  const [hardware, project, assistants, aiUsage] = await Promise.all([
    hardwareDetector.run(cwd),
    projectDetector.run(cwd),
    assistantDetector.run(cwd),
    aiUsageDetector.run(cwd),
  ]);
  return { hardware, project, assistants, aiUsage };
}

/** Branch selection. */
export type Branch = 'A-existing-app' | 'B-no-assistant' | 'C-paid-api' | 'D-empty-folder';

export function chooseBranch(report: DetectionReport): Branch {
  // TODO: refine precedence. Draft logic:
  if (!report.project.hasApp) return 'D-empty-folder';
  if (report.aiUsage.found) return 'C-paid-api';
  if (report.assistants.length === 0) return 'B-no-assistant';
  return 'A-existing-app';
}
