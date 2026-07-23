# Roadmap

Where localbrain is and where it's going. Status is honest — this is a young
project and some pieces are further along than others.

Legend: `[x]` implemented · `[~]` partial · `[ ]` planned.

## Current status

The core works end to end today: `localbrain` detects your machine, downloads a
model, serves an OpenAI-compatible endpoint, wires it into your project, and
verifies it with a real generation. The `ai.*` library (`chat`, `classify`,
`extract`, `summarize`, `embed`), the detection engine, the adapters (with
diff + backup + `undo`), and the CLI commands are all implemented and covered by
unit tests plus an end-to-end test (`npm run test:e2e`).

The main gaps are model **hosting** (we currently fall back to public
model repos and download verification is skipped with a warning until hashes are
pinned) and broader assistant/framework coverage.

## Milestones

### `[x]` Runtime core
Model catalog + hardware-aware selection, a resumable and (once hashes are
pinned) SHA-256-verified downloader with a mirror fallback chain, a
`node-llama-cpp` inference engine (streaming, embeddings, JSON-schema-constrained
decoding, warm-up, smoke test), and the OpenAI-compatible HTTP server
(`/v1/chat/completions` with SSE, `/v1/embeddings`, `/v1/models`, `/health`).

### `[x]` The `ai.*` library
`LocalProvider` implementing `chat` / `classify` / `extract` / `summarize` /
`embed` / `health` against the endpoint, with typed, actionable errors.

### `[x]` Detection engine
Hardware, project (framework + package manager + deploy target), assistant, and
existing-paid-API-usage detectors (key names only, never values) + branch
selection.

### `[x]` CLI & adapters
The one-shot setup flow, `start` / `stop` / `doctor` / `undo` / `uninstall` /
`ideas` / `replace-api`, and adapters for Cursor, Claude Code, Next.js, and
Express — every change diffed, backed up, and reversible.

### `[~]` Zero-auth model hosting
Stand up a no-auth CDN, upload the blessed Q4 GGUFs, publish a signed manifest
with pinned SHA-256s, and make download verification mandatory instead of
warned. Today `sources` fall back to public repos and hashes are unpinned.

### `[ ]` Real-inference CI
CI currently proves everything except a real model generation (it uses a fake
engine to stay fast and network-light). Add a scheduled job that downloads a nano
model and does a real generate → serve → respond check.

### `[ ]` Broader coverage
More assistants (Windsurf, Cline, Copilot) and frameworks (Vite, SvelteKit,
Nuxt); a token-`usage` count in responses; an embeddings-powered local
semantic-search helper.

### `[ ]` Cloud / sidecar providers
A second and third `Provider` implementation selected per-environment, so the
same app code runs free-and-local in dev and on a chosen provider in prod — a
config switch, not a code change.

### `[ ]` Later
Empty-folder app scaffolding from templates; auto-deploy target detection;
enterprise PII-redaction mode; air-gapped install bundles.

## Contributing to the roadmap

Adapters are the easiest high-value contribution — see [CONTRIBUTING.md](./CONTRIBUTING.md).
Open an issue to propose anything here or suggest something new.
