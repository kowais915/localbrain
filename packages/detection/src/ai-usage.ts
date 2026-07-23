import fsp from 'node:fs/promises';
import path from 'node:path';
import type { AiUsageInfo, AiUsageSite, Detector } from './types.js';

/**
 * Existing-AI-usage detector.
 * Scans source + .env for calls to paid APIs so the CLI can offer the swap.
 * NEVER logs secret values — only the names of keys found.
 */

const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.turbo']);
const SOURCE_RE = /\.(m?[jt]sx?)$/;
const MAX_FILES = 2000;

const PATTERNS: Array<{ re: RegExp; provider: AiUsageSite['provider'] }> = [
  { re: /api\.openai\.com/, provider: 'openai' },
  { re: /from\s+['"]openai['"]|require\(\s*['"]openai['"]\s*\)|new\s+OpenAI\s*\(/, provider: 'openai' },
  { re: /api\.anthropic\.com/, provider: 'anthropic' },
  { re: /@anthropic-ai\/sdk|new\s+Anthropic\s*\(/, provider: 'anthropic' },
];

const KEY_NAME_RE = /^(OPENAI_API_KEY|ANTHROPIC_API_KEY|[A-Z0-9_]*(OPENAI|ANTHROPIC|AI)[A-Z0-9_]*KEY)\s*=/;

export const aiUsageDetector: Detector<AiUsageInfo> = {
  name: 'ai-usage',
  async run(cwd: string): Promise<AiUsageInfo> {
    const sites: AiUsageSite[] = [];
    const envKeyNames = new Set<string>();
    let scanned = 0;

    const walk = async (dir: string): Promise<void> => {
      if (scanned >= MAX_FILES) return;
      let entries: import('node:fs').Dirent[];
      try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (scanned >= MAX_FILES) return;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!IGNORE_DIRS.has(entry.name) && !entry.name.startsWith('.git')) await walk(full);
          continue;
        }
        if (entry.name.startsWith('.env')) {
          await scanEnv(full, envKeyNames);
          continue;
        }
        if (SOURCE_RE.test(entry.name)) {
          scanned++;
          await scanSource(full, cwd, sites);
        }
      }
    };

    await walk(cwd);

    return {
      found: sites.length > 0 || envKeyNames.size > 0,
      sites,
      envKeyNames: [...envKeyNames],
    };
  },
};

async function scanSource(file: string, cwd: string, sites: AiUsageSite[]): Promise<void> {
  let content: string;
  try {
    content = await fsp.readFile(file, 'utf8');
  } catch {
    return;
  }
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const { re, provider } of PATTERNS) {
      if (re.test(line)) {
        sites.push({
          file: path.relative(cwd, file),
          line: i + 1,
          provider,
          snippet: line.trim().slice(0, 200),
        });
        break;
      }
    }
  }
}

async function scanEnv(file: string, keyNames: Set<string>): Promise<void> {
  let content: string;
  try {
    content = await fsp.readFile(file, 'utf8');
  } catch {
    return;
  }
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(KEY_NAME_RE);
    if (match) keyNames.add(match[1]!.split('=')[0]!.trim());
  }
}
