# Active issue monitor

The repository monitor is a GitHub-first safety check. It runs hourly at minute 0 and can be started manually with:

```bash
npm run issue:monitor -- --dry-run
npm run issue:monitor -- --issue 64
```

It inspects Project 1 issues in `In progress` and `In review`. An active issue is stale after 24 hours without qualifying GitHub-visible activity. Qualifying evidence is a normal issue comment, lifecycle transition, commit on `codex/issue-<number>-*`, or activity on a linked pull request. Local uncommitted edits and Codex thread state are invisible to GitHub Actions.

Findings are reported with the issue, status, last activity, evidence, age, and recommended action. Live runs add `needs-attention` and one evidence comment per condition, subject to the configured cooldown. The monitor never changes Project status, reopens or closes issues, or marks work Done.

Add `workflow:paused` when work is intentionally paused. This suppresses alerts without changing the existing status. The project owner must remove the label when work resumes.

The scheduled workflow uses the `ISSUE_WORKFLOW_PAT` secret. It must be able to write repository issue labels/comments, read pull requests and contents, and read Project data. Missing authentication, Project configuration, status options, or issue lookups fail the run visibly.
