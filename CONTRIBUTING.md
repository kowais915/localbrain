# Contributing to localbrain

Thanks for helping build a free, private, local AI layer for apps. The most
valuable and self-contained contributions are **adapters**.

## Repo layout

```
/packages/cli          # npx entry + orchestrator (published as 'localbrain')
/packages/runtime      # model selection + download + inference + OpenAI server
/packages/detection    # pluggable detectors → DetectionReport
/packages/adapters     # assistant + framework adapters, apply/undo, agentrules
/packages/lib          # the ai.* client library (provider interface)
/docs · /examples
```

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) and [`ROADMAP.md`](./ROADMAP.md) first.

## Development

```bash
npm install
npm run build        # tsc project references across the workspace
npm test             # unit tests (vitest)
npm run test:e2e     # server + lib + detection + adapters over real HTTP (no model download)
```

To try the CLI against a real model locally:

```bash
npm run build
node packages/cli/dist/cli.js --model smollm2-135m --yes   # ~90 MB
```

## Commit messages (this powers releases)

We use [Conventional Commits](https://www.conventionalcommits.org/). Your commit prefix
determines the next version automatically — see [RELEASING.md](./RELEASING.md):

- `fix: …` → patch release
- `feat: …` → minor release
- `feat!: …` or a `BREAKING CHANGE:` footer → major release
- `docs:` / `chore:` / `refactor:` / `test:` / `ci:` → no release

Example: `feat(adapters): add Windsurf assistant adapter`.

## Pull requests

1. Fork and branch from `main`.
2. Keep changes focused; add/adjust tests (adapters and detectors have fixtures to copy).
3. Make sure `npm run build && npm test && npm run test:e2e` pass.
4. Use a Conventional Commit title for the PR.

The published artifact is a single package (`localbrain`) that bundles the
private `@localbrain/*` workspace packages via tsup. Keep the layer boundaries
clean: a package should depend only on layers below it.

## Adding an assistant adapter

1. Create `packages/adapters/src/assistants/<name>.ts` implementing
   `AssistantAdapter` (`detect`, `plan`).
2. `plan()` must return diffs (`FileChange[]`), any Part-5 warnings (e.g. an
   existing base-URL override), and `manualInstructions` for graceful
   degradation.
3. Never write files directly — return a plan; the CLI shows the diff, confirms,
   backs up, and applies it via `applyPlan` so `localbrain undo` can revert it.
4. Register it in `packages/adapters/src/index.ts` (`assistantAdapters`).
5. Add a fixture + test.

## Adding a framework adapter

Same shape, under `packages/adapters/src/frameworks/<name>.ts` implementing
`FrameworkAdapter`. Typically: inject a `lib/ai` helper re-exporting `ai` from
`localbrain`, add `LOCALBRAIN_URL` to the env file, and ensure the env file is
gitignored. Warn on serverless deploy targets.

## Guiding rules

- **Announce before acting; ask before anything big; show diffs; stay reversible.**
- **Degrade gracefully:** if you can't auto-apply, print the exact manual step.
- **Never surprise the user with a predictable failure** — warn first.
- **Zero-auth happy path:** never introduce a step that needs a login, token, or
  compiler.

## Trust & transparency

localbrain targets a security-conscious audience. Document any new network call
or file write, keep the model manifest + checksums public, and make everything
reversible.
