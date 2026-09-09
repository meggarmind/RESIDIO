# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Format a defect or implementation slice**: use `## Summary`, `## Root Cause`, `## What Breaks If This Is Never Done`, `## Required Change`, `## Scope`, `## Provenance`, then `Related:` where applicable. Use the broader PRD structure only for a genuine multi-slice initiative.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## Pull requests as a triage surface

**PRs as a request surface: no.** External/feature-request PRs do NOT run through the triage queue. Only issues are triaged.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

Before reporting it as filed, attach it to its native map parent and verify that relation. A body
reference such as `Related: #291` does not parent the issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.
