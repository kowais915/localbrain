#!/usr/bin/env node
// Stress / repro tool for the localbrain endpoint timeout bug.
//
// Fires a batch of sequential requests, then a concurrent burst, printing
// per-request latency and flagging the first stall. Use it to reproduce the
// "times out on the Nth request" symptom and to confirm a fix.
//
// Usage:
//   node scripts/stress.mjs                     # defaults: 10 sequential, 5 concurrent
//   SEQ=20 CONC=8 node scripts/stress.mjs
//   LOCALBRAIN_URL=http://localhost:4141/v1 node scripts/stress.mjs
//
// Tip: run the server with LOCALBRAIN_DEBUG=1 in another terminal so the
// server-side timing logs line up with what this script sees.

const BASE = (process.env.LOCALBRAIN_URL || 'http://localhost:4141/v1').replace(/\/$/, '');
const SEQ = Number(process.env.SEQ) || 10;
const CONC = Number(process.env.CONC) || 5;
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS) || 60_000;

const prompts = [
  'Say hello in five words.',
  'Name three primary colors.',
  'What is 2 + 2?',
  'Give one word for happy.',
  'Summarize: the cat sat on the mat.',
];

async function once(i, prompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('client timeout')), TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], max_tokens: 64 }),
      signal: controller.signal,
    });
    const data = await res.json();
    const ms = Date.now() - started;
    const text = data?.choices?.[0]?.message?.content ?? '';
    return { i, ok: res.ok, ms, text: text.slice(0, 40).replace(/\n/g, ' ') };
  } catch (err) {
    const ms = Date.now() - started;
    return { i, ok: false, ms, error: err?.name === 'AbortError' ? `TIMED OUT after ${ms}ms` : err.message };
  } finally {
    clearTimeout(timer);
  }
}

function line(r) {
  const tag = r.ok ? 'ok ' : 'FAIL';
  const detail = r.ok ? `"${r.text}"` : r.error;
  return `  [${String(r.i).padStart(2)}] ${tag} ${String(r.ms).padStart(6)}ms  ${detail}`;
}

async function main() {
  console.log(`endpoint: ${BASE}`);
  console.log(`health:   ${await health()}\n`);

  console.log(`Sequential (${SEQ} requests, one at a time)`);
  let firstStall = null;
  for (let i = 1; i <= SEQ; i++) {
    const r = await once(i, prompts[(i - 1) % prompts.length]);
    console.log(line(r));
    if (!r.ok && firstStall === null) firstStall = i;
  }
  if (firstStall !== null) console.log(`  ⚠ first failure at request #${firstStall}`);

  console.log(`\nConcurrent (${CONC} requests fired at once)`);
  const burst = await Promise.all(
    Array.from({ length: CONC }, (_, k) => once(k + 1, prompts[k % prompts.length])),
  );
  burst.sort((a, b) => a.i - b.i).forEach((r) => console.log(line(r)));

  const failures = burst.filter((r) => !r.ok).length;
  console.log(`\nDone. Concurrent failures: ${failures}/${CONC}.`);
  process.exit(firstStall !== null || failures > 0 ? 1 : 0);
}

async function health() {
  try {
    const res = await fetch(`${BASE}/models`);
    return res.ok ? 'ok' : `HTTP ${res.status}`;
  } catch (e) {
    return `unreachable (${e.message}) — is the endpoint running?`;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
