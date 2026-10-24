---
name: to-issues
description: Decompose a finalized plan, spec or PRD into vertical-slice GitHub issues for RESIDIO, present the slices for confirmation, then file them under one umbrella issue with native parents. Use when a plan has converged on concrete next steps, or the owner types /to-issues.
disable-model-invocation: true
argument-hint: <plan, issue number or description>
---

# to-issues

`CORE.md` §10 is the policy (planning becomes issues, issue authoring, the five guardrails).
This file only sequences it for Claude Code; it restates none of the rules, so read §10 first.

## 1. Gather and verify

1. Read the plan or the issue in `$ARGUMENTS`. If it is an existing issue, follow its `- [ ] #n`
   lists and sub-issues.
2. Run the inventory pass (`CORE.md` §15): check each claimed defect or gap against the code
   (and the database where it applies). Bodies go stale, and a defect may already be fixed
   (guardrail 2). Drop items already done, and record the evidence.
3. Check `gh issue list --search` for duplicates before proposing anything. In a cloud session
   without `gh`, use `mcp__github__search_issues`.
4. Resident-portal and self-service work is de-prioritized (`CORE.md` §3). Flag it; do not slice it.

## 2. Slice

- Vertical slices: each one cuts through the layers (schema, action, UI, test) and is demoable
  or verifiable on its own. Never slice by layer or by activity (guardrail 1).
- One umbrella issue holds the design and the verified facts. One issue per slice.
- Each slice must state what breaks if it is never done. If that cannot be written, it is a
  comment, not an issue.
- Never encode a decision the owner has not made (guardrail 3). Pose it as a question.

## 3. Present and wait

Show the proposed slices: title, scope, files, dependencies, the consequence sentence, and the
model tier. State the count you intend to file. Wait for confirmation of granularity and
dependencies before filing anything. Filing is the outward-facing step.

## 4. File

1. Create the umbrella, then each child in dependency order, using the `CORE.md` §10 body
   structure (`## Summary`, `## Root Cause`, `## What Breaks If This Is Never Done`,
   `## Required Change`, `## Scope`, `## Provenance`, `Related:`). Brief each slice for an
   agent starting cold: exact files and line numbers, what done means, what not to do.
2. Label `ready-for-agent` (or `ready-for-human` where it needs the owner).
3. Attach every child to exactly one native GitHub parent immediately, then verify the link.
   A textual `#n` is not a parent.
4. Findings in passing are filed but labelled and left out of the active plan (guardrail 4).

## 5. Report

List what was filed with numbers and links. If more than three issues were filed, report created
versus closed and the net movement in plain words (guardrail 5).
