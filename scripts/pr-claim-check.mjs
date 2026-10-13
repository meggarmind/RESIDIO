#!/usr/bin/env node
/**
 * PR harness-overlap check (formerly the PR claim check).
 *
 * Three harnesses work this repo — Claude Code, OpenCode and Codex (`CORE.md` §7) — and they
 * can be on it concurrently. `docs/agents/branching.md` §5 names the remote branch list as the
 * live coordination signal, but that only helps once a branch exists; it does nothing for the
 * window between deciding to take an issue and pushing the first commit, which is exactly when
 * two sessions duplicate work (#297).
 *
 * ## Why this no longer reads the assignee (#344)
 *
 * It originally did, and gated on it. Two facts killed that rule:
 *
 *   1. **All three harnesses authenticate as the same GitHub login**, so the assignee field
 *      cannot tell them apart — the same reasoning `scripts/harness-label.mjs` opens with.
 *   2. **There is one human on this project.** The original version deferred its only useful
 *      branch to a future second collaborator; that collaborator is not coming. With one
 *      assignable user, `assigned-to-other` was unreachable and `unassigned` was the only
 *      outcome the check could produce — it failed 10 of its last 15 runs, every one of them
 *      on an issue nobody had contended for.
 *
 * The harness record lives in repo labels instead (`harness:claude`, `harness:codex`,
 * `harness:opencode` — `docs/agents/project-board.md`, "Harness labels"), written additively by
 * `scripts/harness-label.mjs`. So this script reads those.
 *
 * ## The rule
 *
 * Resolve the PR's own lane from its branch prefix, then look at the linked issues for a
 * `harness:*` label belonging to a **different** harness. One means another harness has also
 * worked this issue — the collision #297 was built to catch, and the thing worth knowing.
 *
 * The PR's **own** harness label is deliberately ignored. It carries no information (the branch
 * prefix already implies it), and skipping it makes this check independent of whether
 * `harness-label.yml` — which writes that same label, on this same PR event — has run yet.
 *
 * ## Advisory, not blocking (#344)
 *
 * The original was blocking by design, on the reasoning that a non-blocking warning is what let
 * claim discipline go unenforced in the first place. That reasoning was sound for a discipline
 * and is wrong for this: an overlap is information for a human, not a defect in the PR, and the
 * other harness's work may well be the thing you want to build on. A check that failed every PR
 * taught the opposite of what it intended — the red X became the expected state.
 *
 * So the rule paths all exit 0 and surface an overlap as a `::warning::` annotation (visible on
 * the PR's Checks tab) plus a job summary entry. What still fails loudly, non-zero: a missing
 * environment variable, an API call that errors, or a PR whose author cannot be resolved. An
 * unverified check must never read as a pass.
 *
 * ## Resolving the linked issues
 *
 * Unchanged from the original:
 *   1. The branch name, using the lane prefixes in `.github/issue-workflow.json`
 *      (`branchPrefixes`) — read from that file, never hardcoded, so a new lane can't
 *      silently bypass the check.
 *   2. GitHub's own `closingIssuesReferences` connection on the pull request (the API's own
 *      parse of `Closes #n` / `Fixes #n` etc. in the PR body) — this script does not
 *      re-implement that parsing.
 *
 * A PR with no linked issue, or on a branch whose prefix names no harness (`feat/`, `chore/`,
 * bare `fix/`), passes with a note. A harness is never guessed from such a branch — the same
 * "never guess" rule `harness-label.mjs` applies when deciding what to label.
 *
 * Reached via the GitHub GraphQL API with the workflow's own `GITHUB_TOKEN` — no PAT needed
 * on a public repo.
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
 * Reads the lane -> branch prefix map from `.github/issue-workflow.json` (`branchPrefixes`,
 * e.g. `{ codex: "codex/issue-", claude: "claude/issue-", opencode: "opencode/issue-",
 * fix: "fix/issue-" }`). Read from the file rather than hardcoded so a new lane cannot
 * silently bypass the check.
 *
 * Callers that only need to match a branch (this script's own claim check) use
 * `readBranchPrefixes` below; callers that need to know *which* lane matched
 * (`scripts/harness-label.mjs`) need the map, so this is the single reader and the single
 * set of error messages for both.
 */
export function readBranchPrefixMap(configPath) {
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

  return prefixes;
}

/**
 * The lane branch prefixes as a flat array, e.g.
 * `['codex/issue-', 'claude/issue-', 'opencode/issue-', 'fix/issue-']`.
 * Thin wrapper over `readBranchPrefixMap` — the lane names are not needed to match a branch.
 */
export function readBranchPrefixes(configPath) {
  return Object.values(readBranchPrefixMap(configPath));
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
 * Resolves the lane name from a branch name given the lane -> prefix map, e.g.
 * `claude/issue-324-harness-labels` -> `'claude'`. Returns null for a missing branch name
 * or one matching no prefix.
 *
 * The **longest matching prefix wins**, so a config carrying both `fix/` and `fix/issue-`
 * cannot mis-resolve to whichever happened to be enumerated first. Pure — no I/O.
 */
export function laneFromBranch(branchName, prefixMap) {
  if (!branchName) return null;

  let bestLane = null;
  let bestLength = -1;

  for (const [lane, prefix] of Object.entries(prefixMap ?? {})) {
    if (typeof prefix !== 'string' || prefix.length === 0) continue;
    if (!branchName.startsWith(prefix)) continue;
    if (prefix.length > bestLength) {
      bestLane = lane;
      bestLength = prefix.length;
    }
  }

  return bestLane;
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
 * The three lanes that own a `harness:*` label, per `docs/agents/project-board.md`.
 * `fix` is deliberately absent: it is a lane in `branchPrefixes`, but it is not a harness.
 *
 * This vocabulary lives here rather than in `harness-label.mjs` — which is where it reads more
 * naturally — because both scripts need it and `harness-label.mjs` already imports from this
 * module. Putting it the other way round would make the two files import each other.
 * `harness-label.mjs` re-exports both, so its own callers and tests are unaffected.
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
 * The `harness:*` labels on an issue that belong to a harness *other* than `ownLane`, sorted.
 * Pure.
 *
 * Two exclusions, both load-bearing:
 *
 *   - **Our own label is ignored.** The branch prefix already implies it, so its presence says
 *     nothing; and `harness-label.yml` writes it on this same PR event, so depending on it
 *     would make the result a race.
 *   - **A `harness:`-prefixed label naming no known harness is ignored** (`harness:cursor`,
 *     say). Same "never guess" rule as `labelForLane`: an unrecognised label is not evidence
 *     of a fourth harness, it is a typo or an experiment.
 */
export function foreignHarnessLabels(labels, ownLane) {
  const own = labelForLane(ownLane);

  return HARNESS_LANES.map((lane) => `harness:${lane}`)
    .filter((label) => label !== own && (labels ?? []).includes(label))
    .sort();
}

/**
 * Applies the rule table to one issue: an overlap is a foreign harness label, nothing else.
 * `issue` is `{ number, labels: string[] }` — label names, not full label objects, since that
 * is all the rule needs.
 *
 * Note what is *not* an overlap: an issue carrying no harness label at all. `harness-label.yml`
 * adds ours on this same event and may not have run yet, and an issue worked before #324 landed
 * carries nothing. Absence is not evidence here.
 */
export function evaluateIssueOverlap(issue, ownLane) {
  const { number, labels = [] } = issue;
  const foreignHarnesses = foreignHarnessLabels(labels, ownLane);

  if (foreignHarnesses.length === 0) {
    return { number, overlap: false, foreignHarnesses: [] };
  }

  return {
    number,
    overlap: true,
    foreignHarnesses,
    message:
      `Issue #${number} also carries ${foreignHarnesses.join(', ')} — another harness has ` +
      'worked it. Check what it did before duplicating or reverting that work; the labels are ' +
      'additive and permanent, so this is a record, not a claim to contest.',
  };
}

/** Applies evaluateIssueOverlap to every resolved issue and aggregates the result. */
export function evaluateOverlaps(issues, ownLane) {
  const results = issues.map((issue) => evaluateIssueOverlap(issue, ownLane));
  const overlaps = results.filter((result) => result.overlap);
  return { clean: overlaps.length === 0, results, overlaps };
}

/**
 * Turns the resolved lane, issue numbers and their evaluation into warnings and a
 * human-readable summary. Separated from `main()` so every row of the rule table is testable
 * without any network access.
 *
 * There is no `ok` field and no failing row: this check is advisory (see the docblock). The
 * caller exits non-zero only for the loud cases in `main()` — missing configuration or an API
 * that would not answer.
 */
export function decideOutcome({ lane, issueNumbers, evaluation }) {
  if (!labelForLane(lane)) {
    const why = lane
      ? `Branch lane \`${lane}\` names no harness (it is a lane, not a harness).`
      : 'Branch prefix matches no lane in .github/issue-workflow.json.';
    return {
      warnings: [],
      summary: `${why} A harness is never guessed from a branch, so there is nothing to check.`,
    };
  }

  if (issueNumbers.length === 0) {
    return {
      warnings: [],
      summary:
        "No linked issue found in the branch name or the PR's closing references. Nothing to check.",
    };
  }

  const listed = issueNumbers.map((n) => `#${n}`).join(', ');

  if (evaluation.clean) {
    return {
      warnings: [],
      summary: `No other harness has worked the linked issue(s): ${listed}.`,
    };
  }

  return {
    warnings: evaluation.overlaps.map((overlap) => overlap.message),
    summary: `Another harness has also worked one or more of the linked issue(s): ${listed}.`,
  };
}

/**
 * Wraps a message as a GitHub Actions warning annotation, so an overlap is visible on the PR's
 * Checks tab without failing the job.
 *
 * The escaping is not cosmetic: a raw newline ends the workflow command, which would silently
 * truncate the message to its first line — the exact failure mode this check exists to avoid.
 * `%` is escaped first, or it would corrupt the escapes that follow it.
 */
export function formatWarningAnnotation(message) {
  const escaped = String(message)
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A');

  return `::warning title=PR claim check::${escaped}`;
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

/**
 * Reads the PR's author, head branch and closing issue references in one GraphQL call.
 * Exported so `scripts/harness-label.mjs` reuses this query rather than keeping a second
 * copy of it in step with this one.
 */
export async function fetchPullRequestData({ token, owner, repo, prNumber }) {
  const query = `
    query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $number) {
          author { login }
          headRefName
          closingIssuesReferences(first: 20) {
            nodes {
              number
              labels(first: 50) { nodes { name } }
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
      labels: (node.labels?.nodes ?? []).map((label) => label.name),
    })),
  };
}

async function fetchIssueLabels({ token, owner, repo, number }) {
  const query = `
    query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $number) {
          number
          labels(first: 50) { nodes { name } }
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
    labels: (issue.labels?.nodes ?? []).map((label) => label.name),
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

  let prefixMap;
  try {
    prefixMap = readBranchPrefixMap(issueWorkflowConfigPath);
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

  // The author is logged for context only. It used to be the rule's entire input, and an
  // unresolvable author was a hard failure because passing on it would have meant passing an
  // unverified check. The rule now runs off the branch lane and the issues' labels, so an
  // absent author login leaves nothing unverified — failing on it would be ceremony inherited
  // from a rule that is gone.
  const lane = laneFromBranch(pr.headRefName, prefixMap);

  const issueNumbers = resolveIssueNumbers({
    branchName: pr.headRefName,
    prefixes: Object.values(prefixMap),
    closingIssueNumbers: pr.closingIssues.map((issue) => issue.number),
  });

  // Only fetch what the rule will actually read. A branch naming no harness short-circuits
  // before any per-issue call: with no lane there is no "foreign" to compare against, so those
  // requests would be spent on a question we have already declined to answer.
  const issues = [];

  if (labelForLane(lane) && issueNumbers.length > 0) {
    // closingIssuesReferences already carried labels for those issues. The branch-derived
    // issue number might not be among them (e.g. the PR body has no closing keyword) — fetch
    // it separately in that case.
    const issuesByNumber = new Map(pr.closingIssues.map((issue) => [issue.number, issue]));

    for (const number of issueNumbers) {
      if (issuesByNumber.has(number)) {
        issues.push(issuesByNumber.get(number));
        continue;
      }

      try {
        issues.push(await fetchIssueLabels({ token, owner, repo, number }));
      } catch (error) {
        console.error(`\npr-claim-check: failed to read issue #${number}.\n${error.message}\n`);
        process.exitCode = 1;
        return;
      }
    }
  }

  const evaluation = issues.length > 0 ? evaluateOverlaps(issues, lane) : null;
  const outcome = decideOutcome({ lane, issueNumbers, evaluation });

  console.log(
    `\nPR harness-overlap check — author @${pr.authorLogin ?? '(unresolved)'}, ` +
      `branch \`${pr.headRefName}\`, lane ${lane ?? '(none)'}\n`,
  );
  console.log(outcome.summary);

  // The annotation is what actually reaches a human. This job passes, so nobody opens its log.
  for (const warning of outcome.warnings) {
    console.log(formatWarningAnnotation(warning));
  }

  console.log('');

  if (ci && process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs');
    const lines = ['## PR harness-overlap check', '', outcome.summary, ''];

    if (evaluation) {
      for (const result of evaluation.results) {
        lines.push(
          result.overlap
            ? `- ${result.message}`
            : `- #${result.number}: no other harness has worked it`,
        );
      }
      lines.push('');
    }

    appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'));
  }

  // Advisory by design — the deliberate reversal of this script's original stance (#344).
  //
  // The version this replaced argued that a non-blocking warning is what let claim discipline
  // go unenforced in the first place. That is true of a discipline and false of this. An
  // overlap is a fact about the issue's history, not a defect in the PR, and often the other
  // harness's work is what you want to build on rather than avoid. Blocking on it would
  // recreate exactly what made the assignee version useless: a check that is red on arrival,
  // and therefore ignored.
  //
  // process.exitCode is left at 0 here. The non-zero exits above — missing configuration, an
  // API that would not answer — are the only failures left, and they mean the check did not
  // run, which is a different thing from the check finding something.
}

// Only run when executed directly, so the pure functions above stay importable
// (and network-free) for tests.
const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  await main();
}
