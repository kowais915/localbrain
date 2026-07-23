import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';

/**
 * Global, content-addressed cache layout.
 * ~/.localbrain/{models,config,backups}. Models are cached by hash so the
 * download is a one-time cost per machine.
 */
export function localbrainHome(): string {
  return process.env.LOCALBRAIN_HOME ?? path.join(os.homedir(), '.localbrain');
}

export function modelsDir(): string {
  return path.join(localbrainHome(), 'models');
}

export function configPath(): string {
  return path.join(localbrainHome(), 'config.json');
}

export function backupsDir(): string {
  return path.join(localbrainHome(), 'backups');
}

export function transactionsDir(): string {
  return path.join(localbrainHome(), 'transactions');
}

/** Path to the running-server descriptor (pid + url + port). */
export function serverStatePath(): string {
  return path.join(localbrainHome(), 'server.json');
}

/** Content-addressed model file path (by sha256). */
export function modelCachePath(sha256: string): string {
  return path.join(modelsDir(), `${sha256}.gguf`);
}

/** Sidecar license file stored next to a cached model (attribution). */
export function modelLicensePath(sha256: string): string {
  return path.join(modelsDir(), `${sha256}.LICENSE.txt`);
}

/** Ensure a directory exists (recursive, idempotent). */
export async function ensureDir(dir: string): Promise<void> {
  await fsp.mkdir(dir, { recursive: true });
}

/** Ensure all standard localbrain dirs exist. */
export async function ensureHomeDirs(): Promise<void> {
  await Promise.all([
    ensureDir(modelsDir()),
    ensureDir(backupsDir()),
    ensureDir(transactionsDir()),
  ]);
}

/** Best-effort free disk space (bytes) for the volume backing `dir`. */
export async function freeDiskBytes(dir: string = localbrainHome()): Promise<number> {
  try {
    // Ensure the path exists so statfs resolves to the right volume.
    let probe = dir;
    while (!fs.existsSync(probe)) {
      const parent = path.dirname(probe);
      if (parent === probe) break;
      probe = parent;
    }
    const stats = await fsp.statfs(probe);
    return stats.bavail * stats.bsize;
  } catch {
    return 0; // unknown; callers treat 0 as "could not determine"
  }
}

/** Whether we can write into `dir` (creates it if needed). */
export async function canWrite(dir: string = localbrainHome()): Promise<boolean> {
  try {
    await ensureDir(dir);
    const probe = path.join(dir, `.write-probe-${process.pid}`);
    await fsp.writeFile(probe, 'ok');
    await fsp.rm(probe, { force: true });
    return true;
  } catch {
    return false;
  }
}
