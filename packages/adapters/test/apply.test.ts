import { describe, it, expect, beforeEach } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

describe('applyPlan / undoLast', () => {
  beforeEach(async () => {
    process.env.LOCALBRAIN_HOME = await fsp.mkdtemp(path.join(os.tmpdir(), 'lb-home-'));
  });

  it('creates files, backs up existing ones, and reverts on undo', async () => {
    const { applyPlan, undoLast } = await import('../src/apply.js');
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'lb-proj-'));
    const created = path.join(dir, 'lib', 'ai.ts');
    const modified = path.join(dir, 'existing.txt');
    await fsp.writeFile(modified, 'ORIGINAL');

    await applyPlan({
      changes: [
        { path: created, before: null, after: 'NEW\n', summary: 'create' },
        { path: modified, before: 'ORIGINAL', after: 'CHANGED\n', summary: 'modify' },
      ],
      warnings: [],
    });

    expect(fs.readFileSync(created, 'utf8')).toBe('NEW\n');
    expect(fs.readFileSync(modified, 'utf8')).toBe('CHANGED\n');

    const res = await undoLast();
    expect(res.reverted).toBe(2);
    expect(fs.existsSync(created)).toBe(false); // created file removed
    expect(fs.readFileSync(modified, 'utf8')).toBe('ORIGINAL'); // restored
  });

  it('reports nothing to undo when clean', async () => {
    const { undoLast } = await import('../src/apply.js');
    expect((await undoLast()).reverted).toBe(0);
  });
});
