import type { GlobalFlags } from '../flags.js';
import { loadConfig, writeServerState, clearServerState, readServerState, isPidAlive } from '../config.js';
import { bringUp } from '../server-runtime.js';
import { announce, success, warn, info, color } from '../ui.js';

/**
 * `localbrain start` / `stop`.
 * `start` runs the local OpenAI-compatible endpoint in the foreground and keeps
 * it alive until interrupted. If not set up yet, routes the user to setup.
 */
export async function runStart(flags: GlobalFlags): Promise<void> {
  const config = await loadConfig();
  if (!config) {
    warn('localbrain is not set up yet. Run `npx localbrain` first.');
    return;
  }

  // If an instance is already running, reuse it.
  const existing = await readServerState();
  if (existing && isPidAlive(existing.pid) && existing.pid !== process.pid) {
    success(`Already running at ${color.cyan(existing.url)} (pid ${existing.pid}).`);
    return;
  }

  announce('Starting the local AI endpoint', 'a few seconds to load the model');
  const { engine, server } = await bringUp(config, { port: flags.port ?? config.port });
  await writeServerState({ pid: process.pid, url: server.url, port: server.port, modelId: config.modelId });

  success(`Local AI ready at ${color.cyan(server.url)} ${color.dim('(no API key required)')}`);
  info(color.dim('Press Ctrl+C to stop.'));

  const shutdown = async () => {
    info('\nStopping…');
    try {
      await server.stop();
      await engine.unload();
    } finally {
      await clearServerState();
      process.exit(0);
    }
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  // Keep the process alive until a signal triggers shutdown.
  await new Promise<never>(() => {});
}

export async function runStop(_flags: GlobalFlags): Promise<void> {
  const state = await readServerState();
  if (!state) {
    warn('No running localbrain endpoint found.');
    return;
  }
  if (isPidAlive(state.pid)) {
    try {
      process.kill(state.pid, 'SIGTERM');
      success(`Stopped localbrain (pid ${state.pid}).`);
    } catch {
      warn(`Could not signal pid ${state.pid}; it may have already exited.`);
    }
  } else {
    warn('The recorded endpoint process is not running.');
  }
  await clearServerState();
}
