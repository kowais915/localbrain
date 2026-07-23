import type { DetectionReport } from '@localbrain/detection';
import type { ModelSpec } from '@localbrain/runtime';
import { estimatedRamGb } from '@localbrain/runtime';

/**
 * Pre-flight warnings.
 * Principle: the user should never be surprised by a failure localbrain could
 * have predicted. Each warning carries a mitigation.
 */
export interface Warning {
  code: string;
  message: string;
  mitigation: string;
  /** blocking = must be resolved/confirmed before proceeding. */
  blocking: boolean;
}

/**
 * Compute warnings from the detection report + chosen model, BEFORE acting.
 * TODO: flesh out each check. Draft covers these checks:
 *  - low RAM / model won't fit smoothly     (offer smaller model / hosted)
 *  - low disk (< size + headroom)           (refuse download)
 *  - metered / large download               (offer --model small)
 *  - about to overwrite config/.env/keys    (back up, diff, confirm)
 *  - existing assistant base URL override   (back up, allow revert)
 *  - port already in use                    (auto-pick free port)
 *  - paid API key present                   (offer swap, don't remove)
 *  - serverless deploy target (Vercel)      (can't run local model in prod)
 *  - committing secrets (.env not ignored)  (warn + fix)
 *  - model license notice                   (Apache/MIT attribution)
 *  - running as root / no write permission  (userspace path)
 *  - corporate proxy / blocked download     (mirror / offline path)
 */
export function computeWarnings(report: DetectionReport, model: ModelSpec | null): Warning[] {
  const warnings: Warning[] = [];
  const hw = report.hardware;

  if (model) {
    const need = estimatedRamGb(model);
    // Compare against TOTAL RAM: "free" RAM underreports badly on macOS/Linux
    // because the OS caches aggressively and reclaims on demand.
    if (hw.totalRamGb > 0 && hw.totalRamGb < need) {
      warnings.push({
        code: 'LOW_RAM',
        message: `This model wants ~${need.toFixed(1)}GB RAM but this machine has ~${hw.totalRamGb}GB — it may be slow.`,
        mitigation: 'Use a smaller model (e.g. --model smollm2-1.7b) or a hosted fallback.',
        blocking: false,
      });
    }
    if (hw.freeDiskGb > 0 && hw.freeDiskGb * 1e9 < model.sizeBytes * 1.2) {
      warnings.push({
        code: 'LOW_DISK',
        message: 'Not enough free disk for the model download plus headroom.',
        mitigation: 'Free up space or choose a smaller model. The download will not start.',
        blocking: true,
      });
    }
  }

  if (report.project.deployTargets.some((t) => t === 'vercel' || t === 'netlify')) {
    warnings.push({
      code: 'SERVERLESS_TARGET',
      message: 'A local model cannot run on serverless (Vercel/Netlify) in production.',
      mitigation: 'Use it for dev, or run the model on a server/sidecar in prod. See README "The honest part about free".',
      blocking: false,
    });
  }

  if (report.aiUsage.found) {
    warnings.push({
      code: 'PAID_API_KEY',
      message: 'A paid API key/usage was found — those calls cost money per request.',
      mitigation: 'Run `localbrain replace-api` to swap them to the free local endpoint (key kept as fallback).',
      blocking: false,
    });
  }

  if (hw.isRoot) {
    warnings.push({
      code: 'RUNNING_AS_ROOT',
      message: 'Running as root is not required.',
      mitigation: 'localbrain installs into a userspace path (~/.localbrain).',
      blocking: false,
    });
  }

  // TODO: remaining checks (proxy, port, secrets-in-git, license notice, override).
  return warnings;
}
