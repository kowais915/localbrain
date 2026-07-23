import fsp from 'node:fs/promises';
import fs from 'node:fs';
import { configPath, ensureHomeDirs, serverStatePath } from '@localbrain/runtime';

/**
 * Persistent config at ~/.localbrain/config.json and the running-server
 * descriptor at ~/.localbrain/server.json.
 */
export interface LocalbrainConfig {
  version: 1;
  modelId: string;
  modelPath: string;
  sha256: string;
  port: number;
  endpointUrl: string;
  createdAt: string;
}

export interface ServerState {
  pid: number;
  url: string;
  port: number;
  modelId: string;
}

export async function loadConfig(): Promise<LocalbrainConfig | null> {
  try {
    const raw = await fsp.readFile(configPath(), 'utf8');
    return JSON.parse(raw) as LocalbrainConfig;
  } catch {
    return null;
  }
}

export async function saveConfig(config: LocalbrainConfig): Promise<void> {
  await ensureHomeDirs();
  await fsp.writeFile(configPath(), JSON.stringify(config, null, 2));
}

export async function isSetUp(): Promise<boolean> {
  const cfg = await loadConfig();
  return cfg != null && fs.existsSync(cfg.modelPath);
}

export async function readServerState(): Promise<ServerState | null> {
  try {
    const raw = await fsp.readFile(serverStatePath(), 'utf8');
    return JSON.parse(raw) as ServerState;
  } catch {
    return null;
  }
}

export async function writeServerState(state: ServerState): Promise<void> {
  await ensureHomeDirs();
  await fsp.writeFile(serverStatePath(), JSON.stringify(state, null, 2));
}

export async function clearServerState(): Promise<void> {
  await fsp.rm(serverStatePath(), { force: true });
}

/** True if a process with this pid is currently alive. */
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
