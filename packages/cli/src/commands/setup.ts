import { detect, chooseBranch, type DetectionReport } from '@localbrain/detection';
import {
  selectModel,
  downloadModel,
  DEFAULT_PORT,
  ensureHomeDirs,
  SELECTABLE_MODELS,
  sizeLabel,
  type ModelSpec,
  type DownloadProgress,
} from '@localbrain/runtime';
import {
  assistantAdapters,
  frameworkAdapters,
  applyPlan,
  type AdapterContext,
  type AdapterPlan,
} from '@localbrain/adapters';
import { stdout } from 'node:process';
import type { GlobalFlags } from '../flags.js';
import { computeWarnings } from '../warnings.js';
import { announce, step, success, warn, info, error, confirm, select, showDiff, color, progressBar, section } from '../ui.js';
import { banner, MARK } from '../branding.js';
import { saveConfig, type LocalbrainConfig } from '../config.js';
import { verifyWithSmokeTest } from '../server-runtime.js';

/**
 * The one-shot setup flow: `npx localbrain`.
 * Linear, ask-before-acting: detect → warn → pick+download model → wire →
 * verify with a real smoke test → tailored next steps.
 */
export async function runSetup(flags: GlobalFlags): Promise<void> {
  await ensureHomeDirs();

  if (stdout.isTTY) info(banner());

  // 1. Detection (always first)
  announce('Checking your machine and project');
  const report = await detect(process.cwd());
  const branch = chooseBranch(report);
  printDetectionSummary(report, branch);

  // 2. Model selection
  const choice = selectModel(report.hardware, flags.model);
  if (choice.needsHostedFallback || !choice.spec) {
    warn('This machine has too little memory to run a local model smoothly.');
    info('A hosted fallback (with your consent) is planned; for now, try a machine with more RAM or pass --model.');
    return;
  }
  let model = choice.spec;
  step(`Recommended for your machine: ${color.bold(model.label)} ${color.dim(`(${choice.reason})`)}`);

  // 3. Let the user pick a model (interactive). --model and --yes skip the menu.
  if (!flags.offline && !flags.model) {
    const recommendedIdx = Math.max(0, SELECTABLE_MODELS.findIndex((m) => m.id === choice.spec!.id));
    model = await select(
      'Which model would you like to download? (bigger = smarter · smaller = faster & lighter)',
      SELECTABLE_MODELS.map((m) => ({
        label: `${m.label}  ${color.dim(sizeLabel(m))}${m.id === choice.spec!.id ? color.green('  ← recommended') : ''}`,
        value: m,
      })),
      recommendedIdx,
      flags,
    );
  }

  // 4. Warnings for the CHOSEN model, before acting
  const warnings = computeWarnings(report, model);
  for (const w of warnings) {
    warn(`${w.message}\n    ${color.dim('↳ ' + w.mitigation)}`);
  }
  const blocking = warnings.filter((w) => w.blocking);
  if (blocking.length > 0 && !flags.yes) {
    const proceed = await confirm('Some issues above are blocking. Continue anyway?', flags);
    if (!proceed) {
      info('Stopped. Nothing was changed.');
      return;
    }
  }

  // 5. Branch D: empty folder — set up endpoint, guide forward (don't scaffold).
  if (branch === 'D-empty-folder') {
    info(`\nThis folder is empty — there's no app to add AI to yet.`);
  }

  // 6. Download the chosen model.
  const modelPath = await pullModel(model, flags);
  if (!modelPath) return;

  // 6. Persist config.
  const config: LocalbrainConfig = {
    version: 1,
    modelId: model.id,
    modelPath,
    sha256: '',
    port: flags.port ?? DEFAULT_PORT,
    endpointUrl: `http://localhost:${flags.port ?? DEFAULT_PORT}/v1`,
    createdAt: new Date().toISOString(),
  };
  await saveConfig(config);

  // 7. Wire the app (unless --config-only or empty folder).
  const ctx: AdapterContext = { cwd: process.cwd(), endpointUrl: config.endpointUrl, modelId: model.id };
  if (branch !== 'D-empty-folder' && !flags.configOnly) {
    await wireFrameworks(ctx, report.project.framework, flags);
  }
  await wireAssistants(ctx, flags);

  // 8. Paid API present → point to replace-api (Branch C).
  if (report.aiUsage.found && report.aiUsage.sites.length > 0) {
    info(
      `\n${color.yellow('💡')} Found paid-API calls in ${report.aiUsage.sites.length} place(s). ` +
        `Run ${color.bold('localbrain replace-api')} to swap them to the free local endpoint.`,
    );
  }

  // 9. Verify with a real smoke test — only then declare success.
  announce('Verifying the local AI with a quick test');
  try {
    const smoke = await verifyWithSmokeTest(config);
    if (!smoke.ok) {
      error('The smoke test did not return a valid response. Run `localbrain doctor`.');
      return;
    }
    success(`It works. Sample reply: ${color.dim(JSON.stringify(smoke.sample.slice(0, 80)))}`);
    if (smoke.tokensPerSec < 5) {
      warn(`Generation is slow (~${smoke.tokensPerSec.toFixed(1)} tok/s). Consider a smaller model: --model smollm2-1.7b`);
    }
  } catch (err) {
    error(`Smoke test failed: ${(err as Error)?.message}. Run \`localbrain doctor\`.`);
    return;
  }

  // 10. Tailored next steps.
  printNextSteps(branch, config, report.project.framework);
}

async function pullModel(model: ModelSpec, flags: GlobalFlags): Promise<string | null> {
  if (flags.offline) {
    warn('Offline mode: expecting a pre-seeded model in the cache. Skipping download.');
  }
  announce(`Downloading ${model.label}`, model.sizeBytes ? `${(model.sizeBytes / 1e9).toFixed(1)} GB` : 'size varies');
  let lastLine = '';
  const render = (p: DownloadProgress) => {
    if (!stdout.isTTY) return;
    const pct = p.ratio ? `${Math.round(p.ratio * 100)}%` : `${(p.receivedBytes / 1e6).toFixed(0)} MB`;
    const speed = `${(p.bytesPerSec / 1e6).toFixed(1)} MB/s`;
    lastLine = `  ${progressBar(p.ratio)} ${pct} ${color.dim(speed)}`;
    stdout.write(`\r${lastLine}`);
  };

  const result = await downloadModel(model, { onProgress: render });
  if (stdout.isTTY && lastLine) stdout.write('\n');

  if (!result.ok) {
    switch (result.error.code) {
      case 'INSUFFICIENT_DISK':
        error(`Not enough disk: need ~${(result.error.needBytes / 1e9).toFixed(1)} GB, have ${(result.error.freeBytes / 1e9).toFixed(1)} GB.`);
        break;
      case 'OFFLINE':
        error('No internet connection and no cached model. Reconnect, or use --offline with a pre-seeded model.');
        break;
      case 'CHECKSUM_MISMATCH':
        error('Downloaded file failed checksum verification. Please re-run.');
        break;
      default:
        error(`Download failed: ${JSON.stringify(result.error)}`);
    }
    return null;
  }
  if (!result.sha256) {
    warn('Model SHA-256 is not yet pinned in the manifest; skipped verification (observed hash recorded).');
  }
  success(`Model ready ${result.fromCache ? color.dim('(from cache)') : ''} — ${(result.sizeBytes / 1e9).toFixed(2)} GB`);
  return result.path;
}

async function wireFrameworks(ctx: AdapterContext, _framework: string, flags: GlobalFlags): Promise<void> {
  for (const adapter of frameworkAdapters) {
    if (!(await adapter.detect(ctx))) continue;
    const plan = await adapter.plan(ctx);
    await applyAdapterPlan(`framework: ${adapter.id}`, plan, flags);
    return; // one framework
  }
}

async function wireAssistants(ctx: AdapterContext, flags: GlobalFlags): Promise<void> {
  for (const adapter of assistantAdapters) {
    if (!(await adapter.detect(ctx))) continue;
    const plan = await adapter.plan(ctx);
    await applyAdapterPlan(`assistant: ${adapter.id}`, plan, flags);
  }
}

async function applyAdapterPlan(label: string, plan: AdapterPlan, flags: GlobalFlags): Promise<void> {
  for (const w of plan.warnings) warn(w);
  if (plan.changes.length === 0) {
    if (plan.manualInstructions) info(color.dim(`\n${label}: ${plan.manualInstructions}`));
    return;
  }
  info(color.bold(`\nProposed changes (${label}):`));
  for (const change of plan.changes) showDiff(change.path, change.before, change.after);
  const ok = await confirm('Apply these changes?', flags, true);
  if (!ok) {
    info('Skipped.');
    return;
  }
  await applyPlan(plan);
  success(`Applied ${plan.changes.length} change(s) for ${label}. ${color.dim('(reversible with `localbrain undo`)')}`);
  if (plan.manualInstructions) info(color.dim(plan.manualInstructions));
}

function printDetectionSummary(report: DetectionReport, branch: string): void {
  const hw = report.hardware;
  step(`Machine: ${hw.os} ${hw.arch}, ${hw.cpuCores} cores, ${hw.freeRamGb}/${hw.totalRamGb} GB RAM free, ${hw.freeDiskGb} GB disk${hw.gpu.present ? `, GPU: ${hw.gpu.kind}` : ', no GPU'}`);
  step(`Project: ${report.project.hasApp ? report.project.framework : 'no app'}${report.project.hasApp ? `, ${report.project.packageManager}` : ''}`);
  if (report.assistants.length) step(`Assistants: ${report.assistants.map((a) => a.id).join(', ')}`);
  if (report.aiUsage.found) step(`Paid AI usage: ${report.aiUsage.sites.length} call site(s), keys: ${report.aiUsage.envKeyNames.join(', ') || 'none'}`);
  step(color.dim(`Branch: ${branch}`));
}

function printNextSteps(branch: string, config: LocalbrainConfig, framework: string): void {
  section(`${MARK} You're set — your app has a brain`);
  info(`Start the local AI anytime with: ${color.cyan('localbrain start')}`);
  info(`Endpoint: ${color.cyan(config.endpointUrl)} ${color.dim('(OpenAI-compatible, no key)')}`);
  if (branch === 'D-empty-folder') {
    info(color.dim('\nHave an app elsewhere? Run me inside that project folder.'));
    return;
  }
  if (framework === 'nextjs' || framework === 'node-express') {
    info(`\nIn code:\n  ${color.dim("import { ai } from 'localbrain'")}\n  ${color.dim("await ai.classify(text, ['work','personal','urgent'])")}`);
  } else {
    info(`\nCall it from any OpenAI-compatible client at ${color.cyan(config.endpointUrl)} (no key).`);
  }
}
