import { createEngine, startServer, getModel, SMOKE_TEST_MODEL } from '@localbrain/runtime';
import type { Engine, RunningServer } from '@localbrain/runtime';
import type { LocalbrainConfig } from './config.js';

/**
 * Bring up the engine + OpenAI server from a saved config. Shared by
 * `start` and by `setup`'s verifying smoke test.
 */
export async function bringUp(
  config: LocalbrainConfig,
  opts: { port?: number; cpuOnly?: boolean } = {},
): Promise<{ engine: Engine; server: RunningServer }> {
  const spec = getModel(config.modelId) ?? SMOKE_TEST_MODEL;
  const engine = await createEngine({ modelPath: config.modelPath, spec, cpuOnly: opts.cpuOnly });
  const server = await startServer({ engine, port: opts.port ?? config.port, modelId: config.modelId });
  return { engine, server };
}

/** Bring the endpoint up, run a real request against it, then tear it down. */
export async function verifyWithSmokeTest(
  config: LocalbrainConfig,
): Promise<{ ok: boolean; tokensPerSec: number; sample: string; url: string }> {
  const { engine, server } = await bringUp(config);
  try {
    const res = await fetch(`${server.url}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Say hello in five words.' }], max_tokens: 24 }),
    });
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const sample = data.choices?.[0]?.message?.content ?? '';
    const smoke = await engine.smokeTest();
    return { ok: res.ok && sample.trim().length > 0, tokensPerSec: smoke.tokensPerSec, sample, url: server.url };
  } finally {
    await server.stop();
    await engine.unload();
  }
}
