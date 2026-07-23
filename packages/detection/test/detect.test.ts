import { describe, it, expect } from 'vitest';
import os from 'node:os';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { detect, chooseBranch } from '../src/index.js';

async function fixture(files: Record<string, string>): Promise<string> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'lb-det-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    await fsp.mkdir(path.dirname(full), { recursive: true });
    await fsp.writeFile(full, content);
  }
  return dir;
}

describe('detection', () => {
  it('detects a Next.js app with paid API usage → branch C', async () => {
    const dir = await fixture({
      'package.json': JSON.stringify({ dependencies: { next: '14' } }),
      'pnpm-lock.yaml': '',
      'app/route.ts': "import OpenAI from 'openai'\nconst c = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })\n",
      '.env': 'OPENAI_API_KEY=sk-secret\n',
    });
    const report = await detect(dir);
    expect(report.project.framework).toBe('nextjs');
    expect(report.project.packageManager).toBe('pnpm');
    expect(report.aiUsage.found).toBe(true);
    expect(report.aiUsage.envKeyNames).toContain('OPENAI_API_KEY');
    // Never capture the secret value.
    expect(JSON.stringify(report)).not.toContain('sk-secret');
    expect(chooseBranch(report)).toBe('C-paid-api');
  });

  it('detects an empty folder → branch D', async () => {
    const dir = await fixture({});
    const report = await detect(dir);
    expect(report.project.hasApp).toBe(false);
    expect(chooseBranch(report)).toBe('D-empty-folder');
  });

  it('detects an Express app with no AI usage and no assistant → branch B', async () => {
    const dir = await fixture({
      'package.json': JSON.stringify({ dependencies: { express: '4' } }),
      'package-lock.json': '{}',
      'index.js': "const express = require('express')\n",
    });
    const report = await detect(dir);
    expect(report.project.framework).toBe('node-express');
    expect(report.aiUsage.found).toBe(false);
    // Branch depends on assistant presence in the environment; assert it's not C/D.
    const branch = chooseBranch(report);
    expect(['A-existing-app', 'B-no-assistant']).toContain(branch);
  });
});
