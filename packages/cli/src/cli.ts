#!/usr/bin/env node
/**
 * localbrain CLI entry.
 *
 *   npx localbrain            → the one-shot setup flow (detect → pull → serve → wire)
 *   localbrain start|stop     → start/stop the local endpoint
 *   localbrain doctor         → diagnose + one-key fixes
 *   localbrain replace-api    → swap paid-API calls to local (diffed)
 *   localbrain ideas          → suggest AI features that fit the app
 *   localbrain undo           → revert the last changes
 *   localbrain uninstall      → remove config, env entries, cached models
 *
 * Global flags: --yes, --model <name>, --config-only, --offline, --port <n>
 */
import { parseArgs } from './flags.js';
import { banner } from './branding.js';
import { runSetup } from './commands/setup.js';
import { runStart, runStop } from './commands/start.js';
import { runDoctor } from './commands/doctor.js';
import { runReplaceApi } from './commands/replace-api.js';
import { runIdeas } from './commands/ideas.js';
import { runUndo } from './commands/undo.js';
import { runUninstall } from './commands/uninstall.js';

const HELP = `localbrain — a free, private AI for your app, running on your machine.

Usage:
  npx localbrain              Set up: detect → download model → serve → wire in
  localbrain start|stop       Start/stop the local endpoint (default :4141)
  localbrain doctor           Diagnose problems and offer fixes
  localbrain replace-api      Swap paid-API calls to the free local endpoint
  localbrain ideas            Suggest AI features that fit your app
  localbrain undo             Revert the last changes localbrain made
  localbrain uninstall        Remove config, env entries, and cached models

Flags:
  --yes            Skip confirmation prompts
  --model <name>   Use a specific model
  --config-only    Set up without editing your code
  --offline        Use a local/pre-seeded model (no download)
  --port <n>       Use a specific port
`;

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const { command, flags, positionals } = parseArgs(rawArgs);
  void positionals;

  if (command === 'help' || rawArgs.includes('--help') || rawArgs.includes('-h')) {
    console.log(banner());
    console.log(HELP);
    return;
  }

  switch (command) {
    case 'setup':
      return runSetup(flags);
    case 'start':
      return runStart(flags);
    case 'stop':
      return runStop(flags);
    case 'doctor':
      return runDoctor(flags);
    case 'replace-api':
      return runReplaceApi(flags);
    case 'ideas':
      return runIdeas(flags);
    case 'undo':
      return runUndo(flags);
    case 'uninstall':
      return runUninstall(flags);
    default:
      console.error(`Unknown command: ${command}\n`);
      console.log(HELP);
      process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  const e = err as { message?: string; hint?: string };
  console.error(`\nError: ${e?.message ?? String(err)}`);
  if (e?.hint) console.error(e.hint);
  process.exitCode = 1;
});
