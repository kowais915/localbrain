import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { FileChange } from './types.js';

export async function readIfExists(p: string): Promise<string | null> {
  try {
    return await fsp.readFile(p, 'utf8');
  } catch {
    return null;
  }
}

/** Build a change that creates a file, or skip if it already has the content. */
export async function createFileChange(filePath: string, content: string, summary: string): Promise<FileChange | null> {
  const before = await readIfExists(filePath);
  if (before === content) return null;
  return { path: filePath, before, after: content, summary };
}

/** Build a change that ensures `line` is present in an env-style file. */
export async function ensureEnvLineChange(
  filePath: string,
  key: string,
  value: string,
  summary: string,
): Promise<FileChange | null> {
  const before = await readIfExists(filePath);
  const line = `${key}=${value}`;
  if (before && new RegExp(`^${key}=`, 'm').test(before)) return null; // already set
  const after = before ? `${before}${before.endsWith('\n') ? '' : '\n'}${line}\n` : `${line}\n`;
  return { path: filePath, before, after, summary };
}

/** Ensure a pattern is gitignored. */
export async function ensureGitignoreChange(cwd: string, pattern: string): Promise<FileChange | null> {
  const filePath = path.join(cwd, '.gitignore');
  const before = await readIfExists(filePath);
  if (before && before.split('\n').some((l) => l.trim() === pattern)) return null;
  const after = before ? `${before}${before.endsWith('\n') ? '' : '\n'}${pattern}\n` : `${pattern}\n`;
  return { path: filePath, before, after, summary: `gitignore ${pattern}` };
}

export function fileExists(p: string): boolean {
  return fs.existsSync(p);
}
