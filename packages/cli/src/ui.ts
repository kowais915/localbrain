import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import type { GlobalFlags } from './flags.js';
import { theme, gradient, markLine, MARK } from './branding.js';

/**
 * Terminal UI helpers for the guiding rules: announce before acting, ask before
 * anything big, show diffs. Dependency-free — uses Node builtins and the shared
 * octopus theme so output reads as one cohesive tool.
 */

export { gradient, markLine, MARK };

/** Themed color palette (re-exported so commands share one source of truth). */
export const color = {
  dim: theme.dim,
  bold: theme.bold,
  green: theme.green,
  yellow: theme.yellow,
  red: theme.red,
  cyan: theme.accent,
  brand: theme.brand,
};

export function announce(what: string, roughTiming?: string): void {
  stdout.write(theme.brand('▸ ') + what + (roughTiming ? theme.dim(` (${roughTiming})`) : '') + '\n');
}

export function section(title: string): void {
  stdout.write('\n' + theme.brand('◆ ') + theme.bold(title) + '\n');
}

export function step(msg: string): void {
  stdout.write('  ' + theme.accent('⤙') + ' ' + msg + '\n');
}

export function success(msg: string): void {
  stdout.write(theme.green('✔ ') + msg + '\n');
}

export function warn(msg: string): void {
  stdout.write(theme.yellow('▲ ') + msg + '\n');
}

export function error(msg: string): void {
  stdout.write(theme.red('✖ ') + msg + '\n');
}

export function info(msg: string): void {
  stdout.write(msg + '\n');
}

export async function confirm(question: string, flags: GlobalFlags, defaultYes = false): Promise<boolean> {
  if (flags.yes) return true;
  if (!stdin.isTTY) {
    warn(`${question} — non-interactive; assuming "no". Pass --yes to auto-confirm.`);
    return false;
  }
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const hint = defaultYes ? '[Y/n]' : '[y/N]';
    const answer = (await rl.question(`${theme.brand('?')} ${question} ${theme.dim(hint)} `)).trim().toLowerCase();
    if (!answer) return defaultYes;
    return answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}

/**
 * Interactive single-choice menu. Returns the chosen option's value.
 * Falls back to the default option when non-interactive or --yes is set.
 */
export async function select<T>(
  question: string,
  options: Array<{ label: string; value: T }>,
  defaultIndex: number,
  flags: GlobalFlags,
): Promise<T> {
  const def = Math.min(Math.max(0, defaultIndex), options.length - 1);
  if (flags.yes || !stdin.isTTY) return options[def]!.value;

  info('\n' + theme.bold(question));
  options.forEach((o, i) => info(`  ${theme.brand(String(i + 1))}. ${o.label}`));
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    while (true) {
      const ans = (await rl.question(`Choose ${theme.dim(`[1-${options.length}], default ${def + 1}`)}: `)).trim();
      if (!ans) return options[def]!.value;
      const n = Number(ans);
      if (Number.isInteger(n) && n >= 1 && n <= options.length) return options[n - 1]!.value;
      warn(`Please enter a number between 1 and ${options.length}.`);
    }
  } finally {
    rl.close();
  }
}

/** Print a compact unified-ish diff for a single file change. */
export function showDiff(path: string, before: string | null, after: string): void {
  info(theme.bold(`\n${path}`) + (before === null ? theme.dim(' (new file)') : ''));
  const beforeLines = before === null ? [] : before.split('\n');
  const afterLines = after.split('\n');
  const max = Math.max(beforeLines.length, afterLines.length);
  let shown = 0;
  for (let i = 0; i < max && shown < 40; i++) {
    const b = beforeLines[i];
    const a = afterLines[i];
    if (b === a) continue;
    if (b !== undefined) info(theme.red(`- ${b}`));
    if (a !== undefined) info(theme.green(`+ ${a}`));
    shown++;
  }
  if (shown === 0) info(theme.dim('  (no textual changes)'));
}

/** A tentacle-styled progress bar for downloads. */
export function progressBar(ratio: number, width = 24): string {
  const r = Math.min(1, Math.max(0, ratio));
  const filled = Math.round(r * width);
  const bar = gradient('█'.repeat(filled)) + theme.dim('░'.repeat(width - filled));
  return theme.brand('▕') + bar + theme.brand('▏');
}
