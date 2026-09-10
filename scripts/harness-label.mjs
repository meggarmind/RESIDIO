#!/usr/bin/env node
/**
 * Harness label backstop.
 *
 * Three harnesses work this repo — Claude Code, OpenCode and Codex (`CORE.md` §7) — and they
 * all authenticate as the same GitHub login, so the assignee cannot tell them apart (#297).
 * `docs/agents/project-board.md` ("Harness labels") puts that record in repo labels instead:
 * `harness:claude`, `harness:codex`, `harness:opencode`, added at the same moment the agent
 * sets Status to `In progress`.
 *
 * This script is the **backstop, not the mechanism**. It derives the lane from the PR's branch
 * prefix (`branchPrefixes` in `.github/issue-workflow.json` — read from that file, never
 * hardcoded) and adds the matching label to every linked issue that does not already carry it.
 * It cannot cover the window between an agent starting work and its first push; the manual
 * `In progress` step is what covers that.
 *
 * Three rules, all load-bearing:
 *
 *   1. **Additive only.** Labels record that a harness *has worked* an issue, not that it
 *      currently holds it. Two harnesses on one issue is simply two labels. There is no DELETE
 *      call in this file and there must never be one — removing a label would erase another
 *      harness's record. The add goes through `POST /repos/{owner}/{repo}/issues/{n}/labels`,
 *      which appends; `PUT`/`PATCH` with a full label array would clobber concurrent additions.
 *   2. **Never guess.** `fix` is a lane, not a harness — a `fix/issue-`, `feat/` or `chore/`
 *      branch says nothing about which harness produced it, so those are left unlabelled.
 *   3. **Never gate.** Unlike `pr-claim-check.mjs`, which enforces a claim discipline and is
 *      blocking by design, this workflow only records. Every non-catastrophic path exits 0.
 *
 * That last rule does not mean silence: a missing environment variable or an API call this
 * token cannot make is reported loudly on stderr, so a broken backstop reads as broken rather
 * than as "nothing to label".
 *
 * Usage:
 *   node scripts/harness-label.mjs [--ci]
 *
 * Requires GITHUB_TOKEN, GITHUB_REPOSITORY (owner/repo) and PR_NUMBER in the environment.
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  fetchPullRequestData,
  laneFromBranch,
  readBranchPrefixMap,
  resolveIssueNumbers,
} from './pr-claim-check.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const issueWorkflowConfigPath = path.join(repoRoot, '.github', 'issue-workflow.json');

const ci = process.argv.includes('--ci');

/**
 * The three harness lanes that own a `harness:*` label, per `docs/agents/project-board.md`.
 * `fix` is deliberately absent: it is a lane in `branchPrefixes`, but it is not a harness.
 */
export const HARNESS_LANES = ['claude', 'codex', 'opencode'];

/**
 * Maps a lane name to its repo label, or null when the lane names no harness. Pure.
 *
 * Only `claude`, `codex` and `opencode` map to a label. `fix` — and any future non-harness
 * lane, and null itself — return null so the caller stops rather than inventing a harness.
 */
export function labelForLane(lane) {
  if (!lane) return null;
  return HARNESS_LANES.includes(lane) ? `harness:${lane}` : null;
}

/**
 * Decides what to do for one issue given the labels it already carries. Pure — the network
 * calls live in `main()`, so the add/skip rule is testable without touching the API.
 */
export function decideLabelAction({ number, existingLabels, label }) {
  if ((existingLabels ?? []).includes(label)) {
    return {
      number,
      label,
      action: 'skip',
      message: `Issue #${number}: ${label} already present, skipping.`,
    };
  }

  return {
    number,
    label,
    action: 'add',
    message: `Issue #${number}: adding ${label}.`,
  };
}

async function githubRest({ token, method, url, body }) {
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (cause) {
    throw new Error(`Could not reach the GitHub REST API (${method} ${url}): ${cause.message}`);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    // Never echo the token; truncate defensively in case of a proxy error page.
    throw new Error(
      `GitHub REST API returned ${response.status} ${response.statusText} for ${method} ${url}: ${text.slice(0, 500)}`,
    );
  }

  return response.json();
}

/** Reads the label names currently on an issue. */
async function fetchIssueLabels({ token, owner, repo, number }) {
  const issue = await githubRest({
    token,
    method: 'GET',
    url: `https://api.github.com/repos/${owner}/${repo}/issues/${number}`,
  });

  return (issue.labels ?? []).map((entry) => (typeof entry === 'string' ? entry : entry.name));
}

/**
 * Adds a single label to an issue.
 *
 * `POST .../labels` is additive: it sends only the one new label and leaves everything else
 * on the issue untouched. Do not "simplify" this to a PUT with the full label set — that
 * replaces, and would silently drop a label another harness added between our read and write.
 */
async function addIssueLabel({ token, owner, repo, number, label }) {
  await githubRest({
    token,
    method: 'POST',
    url: `https://api.github.com/repos/${owner}/${repo}/issues/${number}/labels`,
    body: { labels: [label] },
  });
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const prNumberRaw = process.env.PR_NUMBER;
  const notes = [];

  if (!token || !repository || !prNumberRaw) {
    const missing = [
      !token && 'GITHUB_TOKEN',
      !repository && 'GITHUB_REPOSITORY',
      !prNumberRaw && 'PR_NUMBER',
    ].filter(Boolean);

    // Loud on stderr, but still exit 0: this workflow records, it does not gate.
    console.error(
      `\nharness-label: missing required environment variable(s): ${missing.join(', ')}.\n` +
        'No label was applied. This is reported rather than swallowed, but it does not fail the job.\n',
    );
    return;
  }

  const prNumber = Number(prNumberRaw);
  const [owner, repo] = repository.split('/');

  let prefixMap;
  try {
    prefixMap = readBranchPrefixMap(issueWorkflowConfigPath);
  } catch (error) {
    console.error(`\nharness-label: failed to read lane branch prefixes.\n${error.message}\n`);
    return;
  }

  let pr;
  try {
    pr = await fetchPullRequestData({ token, owner, repo, prNumber });
  } catch (error) {
    console.error(`\nharness-label: failed to read pull request data.\n${error.message}\n`);
    return;
  }

  const lane = laneFromBranch(pr.headRefName, prefixMap);
  const label = labelForLane(lane);

  console.log(`\nHarness label — branch \`${pr.headRefName}\`, lane ${lane ?? '(none)'}\n`);

  if (!label) {
    const reason = lane
      ? `Branch lane \`${lane}\` names no harness (it is a lane, not a harness). Nothing to label.`
      : 'Branch prefix matches no lane in .github/issue-workflow.json. Nothing to label — ' +
        'a harness is never guessed from a feat/, chore/ or bare fix/ branch.';
    console.log(reason);
    await writeSummary(label, [reason]);
    return;
  }

  const issueNumbers = resolveIssueNumbers({
    branchName: pr.headRefName,
    prefixes: Object.values(prefixMap),
    closingIssueNumbers: pr.closingIssues.map((issue) => issue.number),
  });

  if (issueNumbers.length === 0) {
    const reason =
      "No linked issue found in the branch name or the PR's closing references. Nothing to label.";
    console.log(reason);
    await writeSummary(label, [reason]);
    return;
  }

  for (const number of issueNumbers) {
    let existingLabels;
    try {
      existingLabels = await fetchIssueLabels({ token, owner, repo, number });
    } catch (error) {
      const note = `Issue #${number}: could not read current labels — ${error.message}`;
      console.error(note);
      notes.push(note);
      continue;
    }

    const decision = decideLabelAction({ number, existingLabels, label });

    if (decision.action === 'skip') {
      console.log(decision.message);
      notes.push(decision.message);
      continue;
    }

    try {
      await addIssueLabel({ token, owner, repo, number, label });
      console.log(decision.message);
      notes.push(decision.message);
    } catch (error) {
      // A fork PR gets a read-only token, so the POST 403s. That is expected, not a failure
      // of this job — the label gets added on the maintainer-side run or by hand.
      const note = `Issue #${number}: could not add ${label} — ${error.message}`;
      console.error(note);
      notes.push(note);
    }
  }

  console.log('');
  await writeSummary(label, notes);
}

async function writeSummary(label, lines) {
  if (!ci || !process.env.GITHUB_STEP_SUMMARY) return;

  const { appendFileSync } = await import('node:fs');
  const out = ['## Harness label', ''];
  if (label) out.push(`Label: \`${label}\``, '');
  for (const line of lines) out.push(`- ${line}`);
  out.push('');

  appendFileSync(process.env.GITHUB_STEP_SUMMARY, out.join('\n'));
}

// Only run when executed directly, so the pure functions above stay importable
// (and network-free) for tests.
const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  await main();
}
