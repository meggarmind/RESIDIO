# Admin guide drift

The admin guide in `website/docs` documents the app. When the app changes and the guide does not, the guide quietly becomes wrong. This is the mechanism that surfaces that.

## How it works

Every page declares the app surface it documents and the commit it was last checked against:

```yaml
---
id: whatsapp-operations
title: WhatsApp operations
residio_sources:
  - src/lib/whatsapp/**
  - src/actions/whatsapp/**
  - src/app/(dashboard)/settings/whatsapp/**
residio_verified_commit: 93ed5d0
residio_verified_at: '2026-08-29'
residio_app_version: '0.4.0'
---
```

Drift is then a question git can answer directly: *has anything touched those paths since that commit?*

```bash
npm run docs:drift
```

Nothing has to be bumped by hand. The code change itself trips the check, which is the whole point — a version number someone has to remember to increment fails exactly when doc updates fail, and a page that wrongly claims to be fresh is worse than one making no claim at all.

### Statuses

| Status | Meaning |
|---|---|
| `fresh` | Nothing has touched the page's sources since it was verified |
| `DRIFT` | Commits landed on those paths — read them and decide |
| `NEEDS RESTAMP` | The stored commit is unreachable, usually after a squash or rebase |
| `UNMAPPED` | The page has no `residio_sources` — it is outside the check |

The checker always exits 0. Drift is a prompt to look, not a build failure.

## The loop

1. Run `npm run docs:drift`. Add `--verbose` for per-page diffstats.
2. For each drifted page, read the commits it lists. `git show <sha>` when the subject is not enough.
3. Decide whether the change is **user-visible** — a renamed control, a new setting, a changed rule, a different sequence of steps. Internal refactors, styling, and test changes usually are not.
4. If it is, update the page.
5. Either way, re-stamp it:

```bash
npm run docs:verify -- website/docs/integrations/whatsapp-operations.md
```

Re-stamping is also the "reviewed, nothing to change" outcome. Both paths end with the page known-good at the current commit.

`npm run docs:verify -- --all` re-stamps every page. Use it only for a deliberate baseline, never to clear a drift report you have not read — that discards the signal and leaves the guide wrong.

## Writing `residio_sources`

Keep the globs **narrow**. The false-positive rate is set entirely here, and a checker that cries drift on every commit gets muted within a week. Map a page to the routes, actions, and libs it actually describes — never to `src/**`.

Globs are repo-root relative and matched with git's `:(glob)` pathspec, so `**` spans directories. Brace expansion is not supported; list paths separately.

A new page without `residio_sources` reports as `UNMAPPED` rather than passing silently, so coverage gaps stay visible.

## App version

`residio_app_version` is stamped from the root `package.json` at verification time. It is context for the reader, not the comparison — the git anchor is what the checker uses. The version was reset to a real baseline of `0.4.0`; bump it in line with the conventional-commit prefixes already used in the log (`feat:` minor, `fix:`/`perf:` patch).

## On the site

Each page renders its stamp beneath the footer: *Verified against Residio v0.4.0 · 29 August 2026*. Pages without a stamp render nothing. The wrapper lives in `website/src/theme/DocItem/Footer/index.tsx`.

## CI

`.github/workflows/docs-drift.yml` runs on PRs touching `src/**`, `vercel.json`, or the docs, and writes drifted pages to the job summary. It does not fail the build.

It needs `fetch-depth: 0` — the default shallow clone cannot resolve the stored commits.

## Caveats

- **The initial stamp was a baseline, not an audit.** All 27 pages were stamped at `93ed5d0` when the check was introduced. That starts the clock; it does not certify that each page was accurate at that commit.
- **A history rewrite orphans stored SHAs.** They surface as `NEEDS RESTAMP` rather than crashing, but expect a batch after any rebase of `master`.
- **Screenshots are not covered.** The check reads code, not captured pixels. A screenshot can be stale while its page reports fresh.
