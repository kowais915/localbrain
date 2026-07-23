<div align="center">

<img src="https://raw.githubusercontent.com/kowais915/localbrain/main/assets/octopus.png" width="184" alt="localbrain octopus mascot" />

# 🐙 localbrain

*a small brain with a long reach*

**Give any app a free, private AI that runs on the user's own machine — no API key, no bill, works offline. One command, and it downloads its own brain.**

[![npm version](https://img.shields.io/npm/v/localbrain.svg?color=cb3837&logo=npm)](https://www.npmjs.com/package/localbrain)
[![npm downloads](https://img.shields.io/npm/dm/localbrain.svg?color=cb3837)](https://www.npmjs.com/package/localbrain)
[![Crates.io](https://img.shields.io/crates/v/localbrain?logo=rust&color=E43717&label=crate)](https://crates.io/crates/localbrain)
[![CI](https://github.com/kowais915/localbrain/actions/workflows/ci.yml/badge.svg)](https://github.com/kowais915/localbrain/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.17-brightgreen)](https://nodejs.org)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

```bash
npx localbrain
```

</div>

---

Run that in your project and localbrain pulls a lightweight open-source model, stands up a **local, OpenAI-compatible endpoint**, and wires it into your app — so your AI features run locally and for free instead of calling a paid API.

## The one problem it solves

> **Your app needs AI, but you don't want to pay OpenAI/Claude per request. localbrain gives it a free local brain instead.**

Everything localbrain does is in service of that sentence.

## See it

Before — every call costs money and leaves the machine:

```js
import OpenAI from 'openai'
const openai = new OpenAI()
const category = (await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: `Classify: ${msg}` }],
})).choices[0].message.content   // 💸 per request, needs a key, needs the network
```

After — free, private, offline, one import:

```js
import { ai } from 'localbrain-client'

// Tag a support message — runs locally, costs nothing
const category = await ai.classify(msg, ['billing', 'bug', 'feature-request'])

// Pull structured JSON out of freeform text (schema-guaranteed valid)
const invoice = await ai.extract(email, { vendor: '', total: 0, dueDate: '' })

// Summaries, chat, embeddings for semantic search — all local
const tldr    = await ai.summarize(longThread)
const vector  = await ai.embed('find me by meaning, not keywords')
```

Or point **any** OpenAI-compatible client / SDK at the endpoint printed on setup
(`http://localhost:4141/v1`, no key required).

## Quick start

```bash
# in your project folder
npx localbrain
```

localbrain will:

1. **Detect** your machine, project (Next.js / Express / …), package manager, and any assistant (Cursor, Claude Code).
2. **Pick + download** the smartest model that runs *smoothly* on your hardware (nano 90 MB → 7B), from a permissively-licensed, ungated source — no login, no token, no compiler.
3. **Serve** an OpenAI-compatible endpoint at `http://localhost:4141/v1`.
4. **Wire it in** — add a `lib/ai` helper + `LOCALBRAIN_URL`, and point your assistant at the local model. Every change is shown as a diff first and is reversible with `localbrain undo`.
5. **Smoke-test** it, then print tailored next steps.

Already calling a paid API? Run `localbrain replace-api` to swap those calls to the free local endpoint (one diff per site; your key is kept as a fallback).

## What localbrain IS for

- **Building & testing AI features without a meter running** — iterate on tagging, extraction, summaries, and search endlessly at zero cost.
- **Local-first / desktop apps** — if your app runs on the *user's* machine, the AI is free forever, at any scale, and their data never leaves their device.
- **Privacy-sensitive apps** — nothing is sent to a third party (personal, medical, legal, internal data).
- **Offline AI** — features keep working with the wifi off.
- **Killing an existing AI bill** — a drop-in, OpenAI-compatible swap.

## What localbrain is NOT

- **Not a coding agent.** It doesn't compete with Cursor/Copilot or "build your app." It's the AI your app *calls*.
- **Not a frontier model.** A small local model is great at high-volume tasks (classify, extract, summarize, route, search, light chat) — not deep multi-step reasoning or GPT-class quality. Keep a cloud model for those and route only those calls out.
- **Not magically free in production for a hosted web app.** A model runs on *some* machine (see below). It cannot run on serverless like Vercel.
- **Not a chatbot product or model host.** It's plumbing you build on.

## The honest part about "free"

"Free" depends on *where the model runs*:

| Scenario | Cost | Notes |
|---|---|---|
| Development & testing | **Free** | Model runs on your machine. The main win. |
| Desktop / local-first app in production | **Free at any scale** | Runs on each user's machine; data stays local. |
| Hosted web app in production | **Server cost, not $0** | Model runs on your server (not serverless). Usually cheaper than per-token APIs + fully private. |

## Install

Two pieces (like Prisma's `prisma` CLI + `@prisma/client`):

- **`localbrain`** — the CLI. Run it with `npx` in your project to set up the local model + endpoint; no install needed:
  ```bash
  npx localbrain
  ```
- **`localbrain-client`** — the featherweight library your app code imports. **Zero dependencies** (just `fetch` to the local endpoint), so it installs in seconds and bundles cleanly:
  ```bash
  npm i localbrain-client
  ```
  ```js
  import { ai } from 'localbrain-client'
  ```

`npx localbrain` wires this in for you (adds `lib/ai`, sets `LOCALBRAIN_URL`, installs `localbrain-client`).

**Other languages:** the endpoint is OpenAI-compatible, so any language can call it. There's also a first-party **Rust** client:

```toml
[dependencies]
localbrain = "0.1"
```
```rust
use localbrain::Client;
let ai = Client::new();
let label = ai.classify(text, &["work", "personal", "urgent"]).await?;
```

See [`clients/rust`](./clients/rust) for the crate and Axum / Actix examples.

## CLI

| Command | What it does |
|---|---|
| `npx localbrain` | One-shot setup: detect → download → serve → wire → verify. |
| `localbrain start` / `stop` | Start/stop the local endpoint. |
| `localbrain doctor` | Diagnose config / model / endpoint / permissions and suggest fixes. |
| `localbrain replace-api` | Find paid-API calls and swap them to local (diffed). |
| `localbrain ideas` | Suggest AI features that fit your app. |
| `localbrain undo` | Revert the last changes localbrain made. |
| `localbrain uninstall` | Remove config, env entries, and cached models. |

Global flags: `--yes` · `--model <name>` · `--config-only` · `--offline` · `--port <n>`

## Library

```ts
import { ai } from 'localbrain-client'

ai.chat(prompt, opts?)                 // → string
ai.classify(text, labels)              // → one label (grammar-constrained)
ai.extract(text, { field: '' })        // → schema-valid JSON
ai.summarize(text, opts?)              // → string
ai.embed(text)                         // → number[] (semantic search)
```

Errors are typed and actionable (`LocalbrainError` with a `code` and a `hint`).

## Models

localbrain ships only **ungated, permissively-licensed** models (Apache-2.0 / MIT) and
auto-picks the right one for your hardware — override anytime with `--model <id>`.

| Your system | Recommended | `--model` | Size |
|---|---|---|---|
| **Low-end** — ≤ 8 GB RAM, no GPU | SmolLM2 1.7B | `smollm2-1.7b` | ~1 GB |
| ↳ ultra-light / testing | SmolLM2 135M / 360M | `smollm2-135m` · `smollm2-360m` | ~90 / ~230 MB |
| **Mid-range** — 8–16 GB RAM (incl. Apple M1/M2) | Qwen2.5 3B | `qwen2.5-3b` | ~2 GB |
| **High-end** — 16 GB+ RAM or a real GPU | Qwen2.5 7B | `qwen2.5-7b` | ~4.5 GB |

Fastest way to try it: `localbrain --model smollm2-135m --yes` (~90 MB). Full list, sizes,
licenses, and the RAM rule-of-thumb in [MODELS.md](./MODELS.md).

## How it works

Four independent layers — CLI orchestrator, detection engine, adapters, and a model runtime (downloader + `node-llama-cpp` inference + OpenAI server) — plus the `ai.*` client library. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full picture and [ROADMAP.md](./ROADMAP.md) for status.

## Contributing

Adapters (assistants + frameworks) are the community surface — each is a self-contained file. See [CONTRIBUTING.md](./CONTRIBUTING.md). We use [Conventional Commits](https://www.conventionalcommits.org/) so releases are fully automated.

## License

[MIT](./LICENSE) for the tool. Bundled models keep their own Apache-2.0 / MIT licenses, shipped alongside them (see [MODELS.md](./MODELS.md)).
