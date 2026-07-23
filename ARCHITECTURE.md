# localbrain — Architecture

This document describes how localbrain is put together and why. It records the
concrete design decisions so any contributor (or coding assistant) can implement
a layer without re-deriving the design.

## One-sentence purpose

Your app needs AI, but you don't want to pay per request — localbrain gives it a
free local brain instead: one command downloads a small open-weight model, stands
up a local OpenAI-compatible endpoint, and wires it into your app.

## The four layers

localbrain is four independent, separately-testable layers. Each layer depends
only on the ones below it, and each has a normalized, typed contract so it can be
exercised in isolation.

```
┌──────────────────────────────────────────────────────────────┐
│  CLI / Orchestrator            packages/cli  (published as    │
│  npx localbrain · setup · doctor · undo · uninstall ·         │
│  start/stop · ideas · replace-api                 'localbrain')│
├──────────────────────────────────────────────────────────────┤
│  Detection Engine              packages/detection             │
│  hardware · project/framework · package-manager · assistant · │
│  existing-AI-usage · deploy-target  → DetectionReport         │
├──────────────────────────────────────────────────────────────┤
│  Adapters                      packages/adapters              │
│  assistant adapters (Cursor, Claude Code) · framework         │
│  adapters (Next.js, Express) · apply/undo · agentrules        │
├──────────────────────────────────────────────────────────────┤
│  Model Runtime                 packages/runtime               │
│  model selection · downloader (CDN, resumable, verified,      │
│  cached) · inference (node-llama-cpp) · OpenAI HTTP server     │
└──────────────────────────────────────────────────────────────┘
        ▲                                        ▲
   user's app ── ai.* lib (packages/lib) ────────┘
   coding assistant ── base URL override ─────────┘
```

The `ai.*` client library (`packages/lib`) is a thin fifth piece that both the
user's app and the CLI depend on; it talks to the runtime's HTTP server through a
**provider** interface.

## Why an OpenAI-compatible endpoint

OpenAI's `/v1` shape is the universal contract. The user's app, any coding
assistant, and any language can all talk to the same local server with no custom
protocol. Three consequences fall out of this choice:

1. The paid-API swap (`replace-api`) becomes a one-line base-URL change.
2. Coding assistants integrate by pointing their base URL at `localhost:4141/v1`.
3. A future cloud/sidecar provider needs no app code changes — only a different
   base URL behind the same provider interface.

## Data flow of a single call

```
app or assistant
  → POST http://localhost:4141/v1/chat/completions   (or /embeddings)
    → runtime HTTP server (packages/runtime/server.ts)
      → inference engine (node-llama-cpp, prebuilt binary)
        → local GGUF model
      ← streamed tokens
    ← OpenAI-shaped response (SSE for streaming)
```

Nothing leaves the machine. No API key is required.

## Provider abstraction (design for the future, one provider in MVP)

`packages/lib` defines a `Provider` interface (`chat`, `classify`, `extract`,
`summarize`, `embed`, `health`). MVP ships exactly one implementation:
`LocalProvider`, bound to `LOCALBRAIN_URL` (default `http://localhost:4141/v1`).

v2 adds `cloud` and `sidecar` providers selected per-environment. Because app
code only ever calls `ai.*`, the same code runs free-and-local in dev and on a
chosen provider in prod — the environment picks the provider, not the code.

`extract` deserves a note: it relies on the runtime's grammar / JSON-schema
constrained decoding so its output is *always* valid JSON matching the requested
shape. This is enforced at the inference layer, not by post-hoc parsing.

## Model selection

On first run the hardware detector reports RAM/GPU/disk; `runtime/models.ts`
picks the **smartest model that runs smoothly, never the biggest**, using the
rough Q4 memory rule (~0.6–0.7 GB RAM per billion params + headroom). A timed
smoke test validates the choice and offers to drop a tier if it's slow.

Only ungated, permissively-licensed models are blessed defaults (SmolLM2 /
Qwen small / Phi — Apache-2.0 / MIT). Llama and Gemma are deliberately **not**
defaults (gated + restrictive); they can be an opt-in advanced choice where the
user supplies their own token.

## Zero-auth model delivery

The single most important runtime property: **nothing in the happy path requires
a login, token, account, or compiler.**

- Only redistributable (Apache-2.0 / MIT, ungated) models are shipped, hosted as
  our own copies on a no-auth CDN (e.g. Cloudflare R2). Users never touch a
  gated source or a token.
- Single-file quantized (Q4) GGUF per model — easy to mirror, checksum, run on CPU.
- A **signed manifest** lists each model's URL(s), byte size, and SHA-256.
- Downloads are **resumable** (HTTP range requests) and verified after download.
- **Mirror fallback chain:** primary CDN → secondary mirror → ungated HF repo (anon).
- **Prebuilt runtime binaries** via node-llama-cpp — never compile on the user's
  machine (no node-gyp / Python / Xcode wall).
- Proxy-aware; global content-addressed cache at `~/.localbrain/models`.
- Offline / air-gapped path: point at a local GGUF or pre-seeded bundle.

## Packaging & publish strategy

This project is organized as five source packages and publishes **two** to npm
(the Prisma model — a heavy CLI plus a featherweight client):

- **`localbrain`** (`packages/cli`) — the CLI, run via `npx localbrain`. It declares
  the `localbrain` bin (`dist/cli.js`) and bundles the internal `@localbrain/*`
  workspace packages **and** `localbrain-client` via tsup (`noExternal`).
  `node-llama-cpp` is kept **external** so its prebuilt native binaries install
  normally when the CLI runs.
- **`localbrain-client`** (`packages/lib`) — the `ai.*` HTTP client that apps
  install (`npm i localbrain-client`). **Zero dependencies** — it only calls
  `fetch` against the local endpoint, so it installs in seconds and bundles for
  any target (including edge/serverless build steps). Apps import from here, never
  from `localbrain`, so they never pull `node-llama-cpp`.
- `@localbrain/detection`, `@localbrain/runtime`, `@localbrain/adapters` stay
  **private** workspace packages, bundled into the `localbrain` CLI only.

Both packages are versioned in lockstep by semantic-release: `@semantic-release/npm`
publishes the CLI, and an `@semantic-release/exec` step versions + publishes
`localbrain-client` at the same version.

Development uses TypeScript project references (`tsc --build`) across the workspace
for fast incremental typechecking; production uses tsup to bundle the CLI.

Rationale: the split keeps app installs tiny and native-dep-free while `npx localbrain`
carries the full runtime — apps pay only for the thin client they actually use.

## Reversibility & safety

Every mutation goes through `packages/adapters/apply.ts`: announce → show diff →
confirm (unless `--yes`) → back up prior content to `~/.localbrain/backups` →
write → record a transaction manifest. `localbrain undo` reverts the last
transaction atomically. `computeWarnings` (in the CLI) runs the full
warning list *before* any action, so the user is never surprised by a failure
localbrain could have predicted.

## Directory map

```
/packages/cli          # npx entry + orchestrator (published as 'localbrain')
/packages/runtime      # model selection + download + inference + OpenAI server
/packages/detection    # pluggable detectors → DetectionReport
/packages/adapters     # assistant + framework adapters, apply/undo, agentrules
/packages/lib          # the ai.* client library (provider interface)
/docs                  # README, ARCHITECTURE.md, MODELS.md
/examples              # tiny example apps (Next.js, Express)
```

## Where to start implementing

See `ROADMAP.md` for the phased, dependency-ordered plan. The short version:
build the runtime core (download → inference → server) first so there is a real
endpoint to talk to, then the `ai.*` lib against it, then detection, then the
CLI orchestrator, then adapters.
