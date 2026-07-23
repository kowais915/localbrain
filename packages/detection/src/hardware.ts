import os from 'node:os';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Detector, HardwareInfo } from './types.js';

const execFileP = promisify(execFile);

/**
 * Hardware detector.
 * Probes OS, CPU, GPU/VRAM, free RAM, free disk, privilege/write access.
 */
export const hardwareDetector: Detector<HardwareInfo> = {
  name: 'hardware',
  async run(cwd: string): Promise<HardwareInfo> {
    const platform = os.platform();
    const osName: HardwareInfo['os'] =
      platform === 'darwin' ? 'macos' : platform === 'win32' ? 'windows' : platform === 'linux' ? 'linux' : 'unknown';

    const [freeDiskGb, gpu, hasWritePermission] = await Promise.all([
      freeDiskGbFor(cwd),
      detectGpu(osName, os.arch()),
      canWriteHome(),
    ]);

    return {
      os: osName,
      arch: os.arch(),
      cpuCores: os.cpus().length,
      totalRamGb: round(os.totalmem() / 1e9),
      freeRamGb: round(os.freemem() / 1e9),
      freeDiskGb,
      gpu,
      isRoot: typeof process.getuid === 'function' ? process.getuid() === 0 : false,
      hasWritePermission,
    };
  },
};

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

async function freeDiskGbFor(dir: string): Promise<number> {
  try {
    let probe = dir;
    while (!fs.existsSync(probe)) {
      const parent = path.dirname(probe);
      if (parent === probe) break;
      probe = parent;
    }
    const st = await fsp.statfs(probe);
    return round((st.bavail * st.bsize) / 1e9);
  } catch {
    return 0;
  }
}

async function canWriteHome(): Promise<boolean> {
  try {
    const dir = os.tmpdir();
    const probe = path.join(dir, `.lb-write-probe-${process.pid}`);
    await fsp.writeFile(probe, 'ok');
    await fsp.rm(probe, { force: true });
    return true;
  } catch {
    return false;
  }
}

async function detectGpu(osName: HardwareInfo['os'], arch: string): Promise<HardwareInfo['gpu']> {
  // Apple silicon: unified memory GPU is always present.
  if (osName === 'macos' && arch === 'arm64') {
    return { present: true, kind: 'apple' };
  }
  // NVIDIA via nvidia-smi (Linux/Windows).
  try {
    const { stdout } = await execFileP('nvidia-smi', ['--query-gpu=memory.total', '--format=csv,noheader,nounits'], {
      timeout: 3000,
    });
    const mb = parseInt(stdout.trim().split('\n')[0] ?? '', 10);
    if (Number.isFinite(mb) && mb > 0) {
      return { present: true, kind: 'nvidia', vramGb: round(mb / 1024) };
    }
  } catch {
    // no nvidia-smi
  }
  return { present: false };
}
