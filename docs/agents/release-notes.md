# Release notes pages

Every release tag (`vX.Y.Z`) has one page in the admin guide wiki, under
`website/docs/release-notes/`. The page tells an estate admin what is new and what changed. It is
written from a product view, in Simplified Technical English (ASD-STE100). Owner request,
27 October 2026 (#1236). The rule is in `CORE.md` §7.

## How a page is made

1. A release tags `master` (`release.yml` or `release-fast-forward.yml`).
2. The same run calls `.github/workflows/release-notes.yml`. It runs
   `scripts/release-notes-draft.mjs`, which writes a **draft** page and adds a row to the index.
   The draft lists the PRs that the release carried, as raw material.
3. The workflow pushes the draft on `chore/release-notes-vX-Y-Z` (cut from `stage`), opens a
   tracking issue, and tries to open a draft PR into `stage`.
4. A session rewrites the draft into the final page (rules below), removes the raw material and
   the `residio_release_draft: true` line, and takes the PR through the normal gate. A PR that
   `GITHUB_TOKEN` opens does not start `PR gate`, so dispatch it by hand (`CORE.md` §16).

To draft a page again, or for a tag that the workflow missed, run **Actions > Release notes >
Run workflow** with the tag, or run `node scripts/release-notes-draft.mjs vX.Y.Z` locally.

## Sources

- The release PR body ("What ships"). Its tag annotation names it: `Release vX.Y.Z (#N, ...)`.
- The feature and fix PRs in the release, and the issues they close.

Check a claim against the PR, not only the title. Do not describe a change that a later PR in the
same release reverted.

## What goes on the page

Write for an estate admin or the estate owner, not for an engineer.

- Tell what the user can see or do now, and where (menu path, page name, button label).
- Name screens as the app names them, in **bold**: **Settings > Estate Information**.
- Group by product area: Residents, Houses, Billing and invoices, Payments, Wallets, Security and
  access, WhatsApp, Reports, Settings, Administration.
- Put engineering work (CI, agent rules, refactors, test changes, type regeneration) in one short
  "Behind the scenes" section, or leave it out. Never list PR titles one by one.
- Do not name database tables, functions, files, migrations or environment variables, except in
  "Before you upgrade", where an operator needs them.
- Portal and resident self-service changes go in one "Resident portal" section, kept short
  (`CORE.md` §3).

## Template

```markdown
---
id: vX-Y-Z
title: Release vX.Y.Z
sidebar_label: vX.Y.Z
description: <one sentence, the most important change>
residio_release: vX.Y.Z
residio_release_date: 'YYYY-MM-DD'
residio_release_type: major | minor | patch
---

# Release vX.Y.Z

**Release date:** 24 October 2026. **Release type:** Minor (new features, no upgrade steps).

## Summary

<Two to four sentences. The most important changes first.>

## Before you upgrade

<Only for a major release, or when an operator must do a step. Numbered steps.>

## New features

### <Product area>

- <One feature per bullet. Start with the subject or a verb.>

## Changes

## Fixed problems

## Behind the scenes

<Optional. One to three bullets.>
```

Leave out a section that has no content. The release type line uses these words:
**Major** (upgrade steps are necessary), **Minor** (new features, no upgrade steps), **Patch**
(fixes only). A minor release that has a "Before you upgrade" section uses: Minor (new features).
Operator steps are necessary: see **Before you upgrade**.

## ASD-STE100 rules to apply

- One topic in one sentence. Descriptive sentences: 25 words or fewer. Instructions: 20 words or
  fewer.
- Active voice. Simple present tense for what the app does now ("The **Payments** page shows...").
  Simple past for what the release changed ("This release moved...").
- One meaning for each word. Use approved, common words: "use", not "utilize"; "start", not
  "initiate"; "show", not "display" as a noun; "make sure", not "ensure".
- No idioms, no marketing words ("powerful", "seamless", "exciting").
- Write a procedure as numbered steps, one instruction for each step.
- Define a technical term the first time you use it: "a wallet (the credit that a resident pays
  in advance)".
- Write dates with the month as a name: 24 October 2026 (`CORE.md` §4).

## Index

`website/docs/release-notes/index.md` has one table row for each release, newest first, between
the `release-notes:index` markers. The draft script adds the row. Update its one-line summary when
you finish the page. The sidebar lists the pages by version, newest first; `website/sidebars.ts`
reads the folder, so a new page needs no sidebar edit.

The pages are a record of the past, so `npm run docs:drift` does not check them.
