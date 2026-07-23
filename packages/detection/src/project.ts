import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { DeployTarget, Detector, Framework, PackageManager, ProjectInfo } from './types.js';

/**
 * Project detector.
 * Reads package.json + lockfile + framework config to determine whether an app
 * exists, its framework, package manager, and deploy target.
 */
export const projectDetector: Detector<ProjectInfo> = {
  name: 'project',
  async run(cwd: string): Promise<ProjectInfo> {
    const pkg = await readPackageJson(cwd);
    const hasApp = pkg != null || (await hasSourceFiles(cwd));

    return {
      hasApp,
      framework: detectFramework(cwd, pkg),
      packageManager: detectPackageManager(cwd),
      root: cwd,
      deployTargets: detectDeployTargets(cwd),
    };
  },
};

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

async function readPackageJson(cwd: string): Promise<PackageJson | null> {
  try {
    const raw = await fsp.readFile(path.join(cwd, 'package.json'), 'utf8');
    return JSON.parse(raw) as PackageJson;
  } catch {
    return null;
  }
}

function allDeps(pkg: PackageJson | null): Record<string, string> {
  return { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
}

function detectFramework(cwd: string, pkg: PackageJson | null): Framework {
  const deps = allDeps(pkg);
  if ('next' in deps || exists(cwd, 'next.config.js') || exists(cwd, 'next.config.mjs') || exists(cwd, 'next.config.ts')) {
    return 'nextjs';
  }
  if ('express' in deps) return 'node-express';
  if ('vite' in deps || exists(cwd, 'vite.config.js') || exists(cwd, 'vite.config.ts')) return 'vite';
  if (pkg == null) return 'none';
  return 'unknown';
}

function detectPackageManager(cwd: string): PackageManager {
  if (exists(cwd, 'pnpm-lock.yaml')) return 'pnpm';
  if (exists(cwd, 'yarn.lock')) return 'yarn';
  if (exists(cwd, 'bun.lockb') || exists(cwd, 'bun.lock')) return 'bun';
  if (exists(cwd, 'package-lock.json')) return 'npm';
  return 'unknown';
}

function detectDeployTargets(cwd: string): DeployTarget[] {
  const targets: DeployTarget[] = [];
  if (exists(cwd, 'vercel.json') || exists(cwd, '.vercel')) targets.push('vercel');
  if (exists(cwd, 'netlify.toml') || exists(cwd, '.netlify')) targets.push('netlify');
  return targets.length ? targets : ['none'];
}

function exists(cwd: string, rel: string): boolean {
  return fs.existsSync(path.join(cwd, rel));
}

async function hasSourceFiles(cwd: string): Promise<boolean> {
  try {
    const entries = await fsp.readdir(cwd);
    return entries.some((e) => /\.(m?[jt]sx?|py|go|rb|rs|java)$/.test(e)) || entries.includes('src');
  } catch {
    return false;
  }
}
