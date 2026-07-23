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

  let stopping = false;
  const shutdown = async () => {
    if (stopping) {
      // Second Ctrl+C: don't wait around, just go.
      process.exit(0);
    }
    stopping = true;
    info('\nStopping…');
    // Safety net: never hang on shutdown.
    const force = setTimeout(() => process.exit(0), 3000);
    force.unref?.();
    try {
      await server.stop(); // force-closes open connections (see server.ts)
      await engine.unload();
    } catch {
      // ignore — we're exiting anyway
    } finally {
      await clearServerState();
      process.exit(0);
    }
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());

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
