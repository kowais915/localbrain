// End-to-end integration test for the localbrain stack (no real model needed).
// Exercises: OpenAI server ← LocalProvider (ai.*) over HTTP, detection on a
// fixture, and adapter applyPlan/undo. Run with: node scripts/e2e.mjs
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const { startServer } = await import('../packages/runtime/dist/index.js');
const libMod = await import('../packages/lib/dist/index.js');
const { LocalProvider } = libMod;
const detection = await import('../packages/detection/dist/index.js');

let passed = 0;
const ok = (name) => { console.log('  \x1b[32m✓\x1b[0m ' + name); passed++; };

// --- Fake engine implementing the Engine contract ---
function makeFakeEngine() {
  return {
    modelInfo: { spec: { id: 'fake-model' }, contextSize: 2048 },
    async *complete(params) {
      const last = params.messages[params.messages.length - 1]?.content ?? '';
      if (params.jsonSchema) {
        const props = params.jsonSchema.properties ?? {};
        // Produce schema-shaped JSON.
        if (props.label?.enum) { yield JSON.stringify({ label: props.label.enum[0] }); return; }
        const obj = {};
        for (const [k, v] of Object.entries(props)) {
          obj[k] = v.type === 'integer' || v.type === 'number' ? 42 : v.type === 'boolean' ? true : `x-${k}`;
        }
        yield JSON.stringify(obj);
        return;
      }
      // Stream a couple of chunks echoing.
      yield 'Hello';
      yield ' there';
      void last;
    },
    async completeText(params) {
      let out = '';
      for await (const c of this.complete(params)) out += c;
      return out;
    },
    async embed(text) { return [text.length, 0.1, 0.2, 0.3]; },
    async smokeTest() { return { ok: true, tokensPerSec: 42 }; },
    async unload() {},
  };
}

// === 1. Server + lib over real HTTP ===
console.log('\nServer + ai.* lib (real HTTP):');
const server = await startServer({ engine: makeFakeEngine(), port: 4199, modelId: 'fake-model' });
const ai = new LocalProvider({ baseUrl: server.url });

try {
  const health = await ai.health();
  assert.equal(health.ok, true); assert.equal(health.model, 'fake-model'); ok('ai.health()');

  const chat = await ai.chat('hi');
  assert.equal(chat, 'Hello there'); ok('ai.chat() streamed→joined');

  const label = await ai.classify('urgent thing', ['work', 'personal', 'urgent']);
  assert.equal(label, 'work'); ok('ai.classify() returns a valid label');

  const extracted = await ai.extract('Invoice for $42 to Jane', { name: '', amount: 0, paid: false });
  assert.equal(extracted.amount, 42); assert.equal(extracted.name, 'x-name'); assert.equal(extracted.paid, true);
  ok('ai.extract() returns schema-valid JSON');

  const summary = await ai.summarize('some long text');
  assert.ok(summary.length > 0); ok('ai.summarize()');

  const emb = await ai.embed('vector me');
  assert.ok(Array.isArray(emb) && emb.length === 4); ok('ai.embed()');

  // Raw streaming SSE
  const res = await fetch(`${server.url}/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], stream: true }),
  });
  const text = await res.text();
  assert.ok(text.includes('data:') && text.includes('[DONE]')); ok('SSE streaming shape');

  // 404 for unknown route
  const nf = await fetch(`${server.url}/nope`);
  assert.equal(nf.status, 404); ok('unknown route → 404');
} finally {
  await server.stop();
}

// === 2. Detection on a fixture ===
console.log('\nDetection engine:');
const fx = await fsp.mkdtemp(path.join(os.tmpdir(), 'lb-fixture-'));
await fsp.writeFile(path.join(fx, 'package.json'), JSON.stringify({ dependencies: { next: '14.0.0' } }));
await fsp.writeFile(path.join(fx, 'package-lock.json'), '{}');
await fsp.writeFile(path.join(fx, 'vercel.json'), '{}');
await fsp.mkdir(path.join(fx, 'app'), { recursive: true });
await fsp.writeFile(path.join(fx, 'app', 'route.ts'), "import OpenAI from 'openai'\nconst c = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })\n");
await fsp.writeFile(path.join(fx, '.env'), 'OPENAI_API_KEY=sk-secret-should-not-be-logged\n');

const report = await detection.detect(fx);
assert.equal(report.project.framework, 'nextjs'); ok('framework: nextjs');
assert.equal(report.project.packageManager, 'npm'); ok('package manager: npm');
assert.ok(report.project.deployTargets.includes('vercel')); ok('deploy target: vercel');
assert.equal(report.aiUsage.found, true); ok('AI usage detected');
assert.ok(report.aiUsage.envKeyNames.includes('OPENAI_API_KEY')); ok('env key name captured');
assert.ok(!JSON.stringify(report).includes('sk-secret')); ok('secret VALUE never captured');
assert.equal(detection.chooseBranch(report), 'C-paid-api'); ok('branch: C-paid-api');

// === 3. Adapters applyPlan + undo (isolated LOCALBRAIN_HOME) ===
console.log('\nAdapters apply/undo:');
const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'lb-home-'));
process.env.LOCALBRAIN_HOME = home;
const adapters = await import('../packages/adapters/dist/index.js');
const target = path.join(fx, 'lib', 'ai.ts');
const plan = { changes: [{ path: target, before: null, after: "export { ai } from 'localbrain'\n", summary: 'add helper' }], warnings: [] };
const txn = await adapters.applyPlan(plan);
assert.ok(fs.existsSync(target)); ok('applyPlan created file');
assert.ok(txn.applied.length === 1); ok('transaction recorded');
const undo = await adapters.undoLast();
assert.equal(undo.reverted, 1); assert.ok(!fs.existsSync(target)); ok('undoLast reverted the change');

console.log(`\n\x1b[32mAll ${passed} checks passed.\x1b[0m`);
