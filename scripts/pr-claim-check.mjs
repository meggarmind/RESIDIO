#!/usr/bin/env node
/**
 * PR claim check.
 *
 * Two harnesses (Claude Code and Codex, on separate lanes per
 * `.github/issue-workflow.json`) can work this repo concurrently. `docs/agents/branching.md`
 * §5 names the remote branch list as the live coordination signal, but that only helps once
 * a branch exists — it does nothing for the window between deciding to take an issue and
 * pushing the first commit, which is exactly when two sessions duplicate work (#297).
 *
 * The GitHub assignee field is the only signal that closes that window, and as of 2026-09-07
 * it was effectively unused (1 of 86 open issues carried an assignee). This script makes the
 * claim discipline enforceable: a PR whose linked issue has no assignee, or is assigned to
 * someone other than the PR author, fails the build.
 *
 * Scope correction (see the issue's comment thread, verified 2026-09-07): the repo has
 * exactly one assignable user today, so the "assigned to someone else" branch cannot
 * currently distinguish harnesses — it activates once a second collaborator joins. The
 * "unassigned" case is the one that matters right now and is tested hardest.
 *
 * The PR author is resolved from the pull request's `author.login` via the GitHub GraphQL
 * API — never from git commit metadata. The commit identity configured for this repo is
 * `meggarmin` (no trailing `d`), which is not the GitHub login `meggarmind`; a commit-based
 * check would fail on every PR.
 *
 * The linked issue(s) are resolved from:
 *   1. The branch name, using the lane prefixes in `.github/issue-workflow.json`
 *      (`branchPrefixes`) — read from that file, never hardcoded, so a new lane can't
 *      silently bypass the check.
 *   2. GitHub's own `closingIssuesReferences` connection on the pull request (the API's own
 *      parse of `Closes #n` / `Fixes #n` etc. in the PR body) — this script does not
 *      re-implement that parsing.
 *
 * A PR with no linked issue at all passes (plenty of legitimate PRs have no issue) with a
 * note in the job summary. Unlike `migration-drift.mjs`, this check does NOT auto-assign
 * anything — it reports; a human (or the session itself) claims the issue.
 *
 * Reached via the GitHub GraphQL API with the workflow's own `GITHUB_TOKEN` — no PAT needed
 * on a public repo. Fails loudly (non-zero exit, clear message) rather than silently passing
 * when required environment variables are missing, the API call fails, or the PR author
 * cannot be resolved — an unverified check must never read as "pass".
 *
 * Usage:
 *   node scripts/pr-claim-check.mjs [--ci]
 *
 * Requires GITHUB_TOKEN, GITHUB_REPOSITORY (owner/repo) and PR_NUMBER in the environment.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const issueWorkflowConfigPath = path.join(repoRoot, '.github', 'issue-workflow.json');

const ci = process.argv.includes('--ci');

/**
 * Reads the lane branch prefixes from `.github/issue-workflow.json` (`branchPrefixes`,
 * e.g. `{ codex: "codex/issue-", claude: "feat/issue-", opencode: "opencode/issue-" }`).
 * Read from the file rather than hardcoded so a new lane cannot silently bypass the check.
 */
export function readBranchPrefixes(configPath) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (cause) {
    throw new Error(`Could not read or parse ${configPath}: ${cause.message}`);
  }

  const prefixes = raw?.branchPrefixes;
  if (!prefixes || typeof prefixes !== 'object' || Object.keys(prefixes).length === 0) {
    throw new Error(`No "branchPrefixes" object found in ${configPath}`);
  }

  return Object.values(prefixes);
}

/**
 * Extracts the issue number from a branch name given the lane prefixes, e.g.
 * `codex/issue-107-fix-thing` with prefix `codex/issue-` -> 107. Returns null when no
 * prefix matches or no number follows it.
 */
export function issueNumberFromBranch(branchName, prefixes) {
  if (!branchName) return null;

  for (const prefix of prefixes) {
    if (!branchName.startsWith(prefix)) continue;
    const match = /^(\d+)/.exec(branchName.slice(prefix.length));
    if (match) return Number(match[1]);
  }

  return null;
}

/**
 * Combines the branch-derived issue number (if any) with the issue numbers GitHub's own
 * `closingIssuesReferences` already resolved from the PR body, deduplicated and sorted.
 * Pure — no I/O — so it is testable without hitting the API.
 */
export function resolveIssueNumbers({ branchName, prefixes, closingIssueNumbers }) {
  const numbers = new Set(closingIssueNumbers ?? []);

  const branchIssue = issueNumberFromBranch(branchName, prefixes);
  if (branchIssue !== null) numbers.add(branchIssue);

  return [...numbers].sort((a, b) => a - b);
}

/**
 * Applies the rule table to one issue: pass when assigned to the PR author, fail (naming
 * the reason) otherwise. `issue` is `{ number, assignees: string[] }` — login names, not
 * full user objects, since that is all the rule needs.
 */
export function evaluateIssueClaim(issue, prAuthorLogin) {
  const { number, assignees = [] } = issue;

  if (assignees.length === 0) {
    return {
      ok: false,
      number,
      reason: 'unassigned',
      message: `Issue #${number} has no assignee. Claim it before opening a PR: gh issue edit ${number} --add-assignee @me`,
    };
  }

  if (assignees.includes(prAuthorLogin)) {
    return { ok: true, number, reason: 'assigned-to-author' };
  }

  return {
    ok: false,
    number,
    reason: 'assigned-to-other',
    message:
      `Issue #${number} is assigned to ${assignees.join(', ')}, not @${prAuthorLogin}. ` +
      'Coordinate with them rather than reassigning it — the fix here is a conversation, ' +
      'not `gh issue edit --add-assignee`.',
  };
}

/** Applies evaluateIssueClaim to every resolved issue and aggregates the result. */
export function evaluateClaims(issues, prAuthorLogin) {
  const results = issues.map((issue) => evaluateIssueClaim(issue, prAuthorLogin));
  const failures = results.filter((result) => !result.ok);
  return { ok: failures.length === 0, results, failures };
}

/**
 * Turns the resolved issue numbers and their evaluation into the final pass/fail outcome
 * and a human-readable summary. Separated from `main()` so the "no issue resolved" and
 * "all pass" / "some fail" rows of the rule table are testable without any network access.
 */
export function decideOutcome(issueNumbers, evaluation) {
  if (issueNumbers.length === 0) {
    return {
      ok: true,
      summary:
        'No linked issue found in the branch name or the PR\'s closing references. Nothing to verify.',
    };
  }

  if (evaluation.ok) {
    return {
      ok: true,
      summary: `Linked issue(s) assigned to the PR author: ${issueNumbers.map((n) => `#${n}`).join(', ')}.`,
    };
  }

  return {
    ok: false,
    summary: evaluation.failures.map((failure) => failure.message).join('\n'),
  };
}

async function graphql({ token, query, variables }) {
  let response;
  try {
    response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (cause) {
    throw new Error(`Could not reach the GitHub GraphQL API: ${cause.message}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    // Never echo the token; the body from this endpoint does not contain it, but
    // truncate defensively in case of a proxy error page.
    throw new Error(
      `GitHub GraphQL API returned ${response.status} ${response.statusText}: ${body.slice(0, 500)}`,
    );
  }

  const payload = await response.json();

  if (payload.errors?.length) {
    throw new Error(`GitHub GraphQL API returned errors: ${JSON.stringify(payload.errors).slice(0, 500)}`);
  }

  return payload.data;
}

async function fetchPullRequestData({ token, owner, repo, prNumber }) {
  const query = `
    query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $number) {
          author { login }
          headRefName
          closingIssuesReferences(first: 20) {
            nodes {
              number
              assignees(first: 10) { nodes { login } }
            }
          }
        }
      }
    }
  `;

  const data = await graphql({ token, query, variables: { owner, repo, number: prNumber } });
  const pr = data?.repository?.pullRequest;

  if (!pr) {
    throw new Error(
      `GitHub GraphQL API returned no pull request data for ${owner}/${repo}#${prNumber} — ` +
        'check that PR_NUMBER and GITHUB_REPOSITORY are correct.',
    );
  }

  return {
    authorLogin: pr.author?.login ?? null,
    headRefName: pr.headRefName ?? null,
    closingIssues: (pr.closingIssuesReferences?.nodes ?? []).map((node) => ({
      number: node.number,
      assignees: (node.assignees?.nodes ?? []).map((assignee) => assignee.login),
    })),
  };
}

async function fetchIssueAssignees({ token, owner, repo, number }) {
  const query = `
    query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $number) {
          number
          assignees(first: 10) { nodes { login } }
        }
      }
    }
  `;

  const data = await graphql({ token, query, variables: { owner, repo, number } });
  const issue = data?.repository?.issue;

  if (!issue) {
    throw new Error(`GitHub GraphQL API returned no data for issue #${number} in ${owner}/${repo}.`);
  }

  return {
    number: issue.number,
    assignees: (issue.assignees?.nodes ?? []).map((assignee) => assignee.login),
  };
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const prNumberRaw = process.env.PR_NUMBER;

  if (!token || !repository || !prNumberRaw) {
    const missing = [
      !token && 'GITHUB_TOKEN',
      !repository && 'GITHUB_REPOSITORY',
      !prNumberRaw && 'PR_NUMBER',
    ].filter(Boolean);

    // Loud, non-zero failure — never a silent pass. A pull_request run from a fork still
    // gets a read-only GITHUB_TOKEN on a public repo, so this should only trip on a
    // misconfigured workflow, not on the fork case itself.
    console.error(
      `\npr-claim-check: missing required environment variable(s): ${missing.join(', ')}.\n` +
        'This check cannot run without them — it is failing loudly rather than passing silently.\n',
    );
    process.exitCode = 1;
    return;
  }

  const prNumber = Number(prNumberRaw);
  const [owner, repo] = repository.split('/');

  let prefixes;
  try {
    prefixes = readBranchPrefixes(issueWorkflowConfigPath);
  } catch (error) {
    console.error(`\npr-claim-check: failed to read lane branch prefixes.\n${error.message}\n`);
    process.exitCode = 1;
    return;
  }

  let pr;
  try {
    pr = await fetchPullRequestData({ token, owner, repo, prNumber });
  } catch (error) {
    console.error(`\npr-claim-check: failed to read pull request data.\n${error.message}\n`);
    process.exitCode = 1;
    return;
  }

  if (!pr.authorLogin) {
    console.error(
      '\npr-claim-check: could not resolve the pull request author login from the API.\n' +
        'Failing loudly rather than passing an unverified check.\n',
    );
    process.exitCode = 1;
    return;
  }

  const closingIssueNumbers = pr.closingIssues.map((issue) => issue.number);
  const issueNumbers = resolveIssueNumbers({
    branchName: pr.headRefName,
    prefixes,
    closingIssueNumbers,
  });

  // closingIssuesReferences already carried assignees for those issues. The
  // branch-derived issue number might not be among them (e.g. the PR body has no
  // closing keyword) — fetch it separately in that case.
  const issuesByNumber = new Map(pr.closingIssues.map((issue) => [issue.number, issue]));
  const issues = [];

  for (const number of issueNumbers) {
    if (issuesByNumber.has(number)) {
      issues.push(issuesByNumber.get(number));
      continue;
    }

    try {
      issues.push(await fetchIssueAssignees({ token, owner, repo, number }));
    } catch (error) {
      console.error(`\npr-claim-check: failed to read issue #${number}.\n${error.message}\n`);
      process.exitCode = 1;
      return;
    }
  }

  const evaluation = evaluateClaims(issues, pr.authorLogin);
  const outcome = decideOutcome(issueNumbers, evaluation);

  console.log(`\nPR claim check — author @${pr.authorLogin}, branch \`${pr.headRefName}\`\n`);
  console.log(outcome.summary);
  console.log('');

  if (ci && process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs');
    const lines = ['## PR claim check', ''];

    if (issueNumbers.length === 0) {
      lines.push(
        "No linked issue was found in the branch name or the PR's closing references. Nothing to verify.",
        '',
      );
    } else {
      lines.push(`Linked issue(s): ${issueNumbers.map((n) => `#${n}`).join(', ')}`, '');
      for (const result of evaluation.results) {
        lines.push(
          result.ok
            ? `- #${result.number}: assigned to the PR author (pass)`
            : `- ${result.message}`,
        );
      }
      lines.push('');
    }

    appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'));
  }

  // Blocking by design, same reasoning as migration-drift.mjs: a non-blocking warning is
  // exactly what let claim discipline go unenforced in the first place.
  process.exitCode = outcome.ok ? 0 : 1;
}

// Only run when executed directly, so the pure functions above stay importable
// (and network-free) for tests.
const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  await main();
}
