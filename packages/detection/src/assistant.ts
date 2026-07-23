import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AssistantInfo, Detector } from './types.js';

/**
 * Assistant detector.
 * Detects installed/configured coding assistants by config or install presence.
 * MVP wires Cursor + Claude Code; others are detected for reporting only.
 */
export const assistantDetector: Detector<AssistantInfo[]> = {
  name: 'assistant',
  async run(cwd: string): Promise<AssistantInfo[]> {
    const home = os.homedir();
    const found: AssistantInfo[] = [];

    // Cursor: project .cursor/ or global config/install.
    const cursorProject = path.join(cwd, '.cursor');
    const cursorGlobal = path.join(home, '.cursor');
    if (fs.existsSync(cursorProject) || fs.existsSync(cursorGlobal) || cursorAppInstalled()) {
      found.push({ id: 'cursor', configPath: firstExisting([cursorProject, cursorGlobal]) });
    }

    // Claude Code: project .claude/ or CLAUDE.md, or global ~/.claude.
    const claudeProject = path.join(cwd, '.claude');
    const claudeMd = path.join(cwd, 'CLAUDE.md');
    const claudeGlobal = path.join(home, '.claude');
    if (fs.existsSync(claudeProject) || fs.existsSync(claudeMd) || fs.existsSync(claudeGlobal)) {
      found.push({ id: 'claude-code', configPath: firstExisting([claudeMd, claudeProject, claudeGlobal]) });
    }

    // Reported-only (not wired in MVP).
    if (fs.existsSync(path.join(home, '.codeium')) || fs.existsSync(path.join(cwd, '.windsurf'))) {
      found.push({ id: 'windsurf' });
    }

    return found;
  },
};

function cursorAppInstalled(): boolean {
  if (os.platform() === 'darwin') return fs.existsSync('/Applications/Cursor.app');
  return false;
}

function firstExisting(paths: string[]): string | undefined {
  return paths.find((p) => fs.existsSync(p));
}
