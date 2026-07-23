/**
 * Global CLI flags.
 * Kept dependency-free for the skeleton; swap in a CLI framework
 * during implementation for nicer help/prompts.
 */
export interface GlobalFlags {
  yes: boolean;          // --yes: skip confirms
  model?: string;        // --model <name>
  configOnly: boolean;   // --config-only: no code edits
  offline: boolean;      // --offline: use local/pre-seeded model
  port?: number;         // --port <n>
}

export interface ParsedArgs {
  command: string;
  flags: GlobalFlags;
  positionals: string[];
}

export function parseArgs(argv: string[]): ParsedArgs {
  const flags: GlobalFlags = { yes: false, configOnly: false, offline: false };
  const positionals: string[] = [];
  let command = '';

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--yes' || a === '-y') flags.yes = true;
    else if (a === '--config-only') flags.configOnly = true;
    else if (a === '--offline') flags.offline = true;
    else if (a === '--model') flags.model = argv[++i];
    else if (a === '--port') flags.port = Number(argv[++i]);
    else if (a.startsWith('--model=')) flags.model = a.slice('--model='.length);
    else if (a.startsWith('--port=')) flags.port = Number(a.slice('--port='.length));
    else if (!command && !a.startsWith('-')) command = a;
    else positionals.push(a);
  }

  return { command: command || 'setup', flags, positionals };
}
