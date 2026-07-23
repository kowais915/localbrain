# Releasing

Releases are **fully automated**. You don't run any release commands — you just
push to `main` with good commit messages, and CI does the rest.

## How it works

On every push to `main`, the [`Release`](.github/workflows/release.yml) workflow runs
[semantic-release](https://semantic-release.gitbook.io/), which:

1. Reads the commits since the last release.
2. Decides the next version from the commit types (see below).
3. Updates `packages/cli/package.json` and `CHANGELOG.md`.
4. Builds the bundled package and attaches an installable `localbrain-<version>.tgz`
   to the GitHub Release.
5. Creates the git tag (`vX.Y.Z`) and the GitHub Release with auto-generated notes.
6. Commits the changelog + version bump back to `main` (as `chore(release): … [skip ci]`).

If there are no releasable commits since the last release, it does nothing. No secrets
are required — it uses the built-in `GITHUB_TOKEN`.

## Commit messages decide the version

We use [Conventional Commits](https://www.conventionalcommits.org/). The prefix drives the bump:

| Commit | Example | Release |
|---|---|---|
| `fix:` | `fix: resume downloads after a dropped connection` | patch (0.1.0 → 0.1.1) |
| `feat:` | `feat: add Windsurf assistant adapter` | minor (0.1.0 → 0.2.0) |
| `feat!:` or a `BREAKING CHANGE:` footer | `feat!: change the ai.extract signature` | major (0.x → 1.0.0) |
| `docs:` `chore:` `refactor:` `test:` `ci:` | `docs: clarify the free tiers` | no release |

Scopes are optional and just for readability: `feat(runtime): …`, `fix(cli): …`.

## First release (staying pre-1.0)

The repo is seeded so releases stay in `0.x` while the API settles. After the initial
import commit, create the seed tag once:

```bash
git tag v0.1.0
git push origin v0.1.0
```

From then on, a `fix:` → `0.1.1`, a `feat:` → `0.2.0`, and a breaking change → `1.0.0`.
(Without the seed tag, the first automated release would be `1.0.0`.)

## Turning on npm publishing later

Right now releases are GitHub-only (tag + notes + tarball). To also publish `localbrain`
to npm:

1. Create an [npm automation token](https://docs.npmjs.com/creating-and-viewing-access-tokens)
   and add it as a repo secret named `NPM_TOKEN`
   (Settings → Secrets and variables → Actions).
2. In [`.releaserc.json`](./.releaserc.json), set `"npmPublish": true` in the
   `@semantic-release/npm` plugin options.

That's it — the next release publishes to npm and `npx localbrain` works for everyone.

## Manual trigger

You can also run a release on demand from the **Actions → Release → Run workflow**
button (`workflow_dispatch`).
