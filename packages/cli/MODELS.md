# Models

localbrain ships only **ungated, permissively-licensed** open-weight models so the
happy path needs no login, token, account, or license click-through.
Each model is a single-file quantized (Q4) GGUF, hosted as our own copy on a
no-auth CDN, listed in a signed manifest with its byte size and SHA-256, and
verified after download.

> The values below are **placeholders** until the CDN copies and signed manifest
> exist. Populate `sizeBytes`, `sources`, and `sha256` in
> `packages/runtime/src/models.ts` and mirror them here.

## Recommended models by system

`localbrain` auto-picks one of these from your detected RAM/GPU on first run; you can
always override with `--model <id>`. Bigger models are smarter but slower and use more
memory — if one feels slow, `localbrain` will offer to drop a tier.

| Your system | Recommended | Model id | Size | Good for |
|---|---|---|---|---|
| **Low-end** — ≤ 8 GB RAM, no GPU, older laptops | SmolLM2 1.7B | `smollm2-1.7b` | ~1 GB | tagging, extraction, routing, short summaries |
| ↳ *ultra-light / just testing* | SmolLM2 135M / 360M | `smollm2-135m` · `smollm2-360m` | ~90 MB · ~230 MB | smoke tests, simple classify/extract |
| **Mid-range** — 8–16 GB RAM (incl. Apple M1/M2 8–16 GB) | Qwen2.5 3B | `qwen2.5-3b` | ~2 GB | the sweet spot: solid classify/extract/summarize + light chat |
| **High-end** — 16 GB+ RAM, or a real GPU (Apple M-series Pro/Max, NVIDIA ≥ 6 GB VRAM) | Qwen2.5 7B | `qwen2.5-7b` | ~4.5 GB | noticeably smarter — better reasoning and longer context |

Notes:

- **Apple Silicon** uses the GPU automatically via unified memory — an M-series machine
  with 16 GB+ comfortably runs the 7B.
- **Rule of thumb (Q4):** a model needs roughly `params × 0.7 GB` of RAM plus headroom,
  so ~2.6 GB for the 3B and ~6.4 GB for the 7B.
- Whatever tier you're on, all models are Apache-2.0 and ungated — no login or token.
- Still too heavy? Use a nano model (`smollm2-135m`/`360m`); still want more quality on a
  big machine? These are small by design — for GPT-class tasks, keep a cloud model and
  route only those calls out.

## Blessed default models (by RAM tier)

| Model id | Tier | ~Params | ~Size (Q4) | License | Notes |
|---|---|---|---|---|---|
| `smollm2-135m` | nano | 135M | ~90 MB | Apache-2.0 | **Lightest.** Default smoke test + very-low-RAM fallback; instant download. Weak quality — best for testing and simple classify/extract. |
| `smollm2-360m` | nano | 360M | ~230 MB | Apache-2.0 | Small but a bit more capable; low-RAM fallback. |
| `qwen2.5-0.5b` | nano | 0.5B | ~400 MB | Apache-2.0 | Optional sub-500 MB option (via `--model qwen2.5-0.5b`). |
| `smollm2-1.7b` | tiny | 1.7B | ~1 GB | Apache-2.0 | ≤8 GB RAM, CPU-friendly; good at tag/extract/sort |
| `qwen2.5-3b` | small | 3B | ~2 GB | Apache-2.0 | 8–16 GB RAM — **default sweet spot** |
| `qwen2.5-7b` | medium | 7B | ~4.5 GB | Apache-2.0 | 16 GB+ or real GPU — noticeably smarter |

For the fastest possible local test, force the lightest model:

```bash
localbrain --model smollm2-135m --yes   # ~90 MB
```

Phi (MIT) is also a blessed option. **Llama and Gemma are deliberately excluded
as defaults** (gated + restrictive licenses); they may be offered as an opt-in
"advanced" choice where the user supplies their own token.

## Memory rule

Rough Q4 estimate: **~0.6–0.7 GB RAM per billion params + headroom**. localbrain
picks the smartest model that runs *smoothly*, never the biggest, and validates
the choice with a timed smoke test (offering to drop a tier if it's slow).

## Manifest fields (per model)

| Field | Meaning |
|---|---|
| `id` | Stable id used by `--model` and the content-addressed cache |
| `sizeBytes` | Download size of the Q4 GGUF |
| `sha256` | Checksum verified after download |
| `sources` | Mirror fallback chain: primary CDN → secondary mirror → ungated HF (anon) |
| `license` | SPDX id — must be `Apache-2.0` or `MIT` for a blessed default |

## Attribution

Each model's LICENSE text is downloaded and stored alongside the model file in
`~/.localbrain/models`, satisfying Apache-2.0 / MIT attribution requirements.
