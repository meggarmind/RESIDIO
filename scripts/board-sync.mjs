#!/usr/bin/env node
/**
 * Board sync (#1104): keeps issue labels and the Projects v2 Status column in step with what
 * actually happens in development, so nobody has to move cards by hand.
 *
 * One engine, two modes, around pure functions that never touch the network:
 *
 *   decideTransition(event, issue, config)  one development event -> the diff for one issue
 *   decideParent(issue, config)             roll a parent's children up into the parent
 *   reconcileIssue(issue, config)           derive the expected state from current facts
 *
 * Each returns { status?, addLabels[], removeLabels[], close?, reopen?, comment?, notes? }
 * and is already normalised against the issue it was given: labels the issue has/lacks are
 * dropped from the diff, an unchanged status is omitted, `close` only appears on an OPEN issue.
 * An empty diff therefore means "nothing to do", which makes every handler idempotent.
 *
 * Modes (the thin I/O layer below; not unit-tested beyond argument parsing):
 *   --event       react to the GitHub Actions event in GITHUB_EVENT_NAME / GITHUB_EVENT_PATH
 *   --reconcile   sweep open issues + recently closed ones and repair drift (nightly)
 *                 add --dry-run to print the table and write nothing
 *
 * Interpretations worth knowing (the state machine is in decideTransition):
 *   - Configuration: board facts (branches, statuses, labels) come from
 *     .github/board-automation.json; project owner/number/statusField and branch lane
 *     prefixes come from .github/issue-workflow.json. Omit `stageBranch` on a repo without a
 *     stage branch and merges go straight to Done.
 *   - A status never regresses on its own, with these deliberate exceptions: a draft PR
 *     (converted_to_draft) pulls In review back to In progress, a PR closed unmerged pulls
 *     In review back to In progress when no other PR is open, and a reopened issue goes back
 *     to In progress / Ready.
 *   - `needs-info` only sends an issue back to Backlog while it is still at or before Ready.
 *   - A manual close (completed, no merged PR) is treated as "no code to ship" -> Done. When a
 *     merged PR exists the PR handler owns the transition, so issue.closed stays silent.
 *   - Parents (issues with sub-issues) never carry on-stage, are never reopened, and are only
 *     closed when every child is Done (or, without a stage branch, every child is closed).
 *   - Missing readiness headings only produce a warning comment; the label is never reverted.
 *
 * Failure policy: per-issue errors are logged and summarised, exit code stays 0. Exit 1 only
 * for configuration / authentication failures.
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  WorkflowError,
  findStatusOption,
  isIssueBranch,
  lanePrefixes,
  loadConfig,
  run,
  statusName,
} from './issue-workflow.mjs';
import { belongsToRepository } from './issue-monitor.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WORKFLOW_CONFIG_PATH = resolve(SCRIPT_DIR, '..', '.github', 'issue-workflow.json');
const BOARD_CONFIG_PATH = resolve(SCRIPT_DIR, '..', '.github', 'board-automation.json');

/* ------------------------------------------------------------------------------------------ */
/* Pure core                                                                                   */
/* ------------------------------------------------------------------------------------------ */

/** Merge the two config files into the single object the pure functions take. */
export function mergeConfig(workflowConfig, boardConfig) {
  return {
    ...workflowConfig,
    ...boardConfig,
    statuses: { ...(workflowConfig.statuses ?? {}), ...(boardConfig.statuses ?? {}) },
    labels: { ...(boardConfig.labels ?? {}) },
  };
}

export function loadBoardConfig(workflowPath = WORKFLOW_CONFIG_PATH, boardPath = BOARD_CONFIG_PATH) {
  const workflow = loadConfig(workflowPath);
  let board;
  try {
    board = JSON.parse(readFileSync(boardPath, 'utf8'));
  } catch (error) {
    throw new WorkflowError(`Unable to read board automation configuration at ${boardPath}: ${error.message}`);
  }
  return mergeConfig(workflow, board);
}

const STATUS_ORDER = ['backlog', 'ready', 'inProgress', 'inReview', 'onStage', 'done'];

/** Position of a Status name in the lifecycle; -1 for unset/unknown. */
export function statusRank(config, status) {
  if (!status) return -1;
  return STATUS_ORDER.findIndex((key) => config.statuses[key] === status);
}

const rankOf = (key) => STATUS_ORDER.indexOf(key);

export function triageLabels(config) {
  const l = config.labels ?? {};
  return [l.backlog, l.needsInfo, ...(l.legacyTriage ?? []), ...(l.ready ?? [])].filter(Boolean);
}

export function isExempt(issue, config) {
  const exempt = config.exemptLabels ?? [];
  return (issue.labels ?? []).some((label) => exempt.includes(label));
}

const hasStage = (config) => Boolean(config.stageBranch);

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A PR that merges production back into stage (CORE.md section 7 sync PR). */
export function isSyncPr(pr, config) {
  if (!pr || !hasStage(config)) return false;
  if (pr.head && pr.head === config.prodBranch) return true;
  const pattern = new RegExp(`^chore:\\s*sync ${escapeRegExp(config.prodBranch)} into ${escapeRegExp(config.stageBranch)}`, 'i');
  return pattern.test(String(pr.title ?? ''));
}

const normaliseReason = (reason) => String(reason ?? '').toLowerCase().replace(/[^a-z]/g, '');

export function closedWithoutShipping(issue, config) {
  const reason = normaliseReason(issue.stateReason);
  return reason === 'notplanned' || reason === 'duplicate' || (issue.labels ?? []).includes(config.labels?.wontfix);
}

/** Readiness groups with no matching `## heading` in the body. */
export function missingReadiness(body, config) {
  const text = String(body ?? '');
  const missing = [];
  for (const [group, headings] of Object.entries(config.readinessHeadings ?? {})) {
    const found = headings.some((heading) => new RegExp(`^#{1,6}\\s+${escapeRegExp(heading)}\\b`, 'im').test(text));
    if (!found) missing.push({ group, headings });
  }
  return missing;
}

export function readinessComment(missing, config) {
  const lines = missing.map(({ headings }) => `- ${headings.map((h) => `\`## ${h}\``).join(' or ')}`);
  return [
    config.readinessCommentMarker,
    'This issue was marked ready but its body has no heading for:',
    '',
    ...lines,
    '',
    'The label stays; add the sections so the next agent can start cold (CORE.md section 10).',
  ].join('\n');
}

export function releaseComment(version, config) {
  return `${config.releaseCommentMarker}\nReleased in ${version}`;
}

/** Issue number from a lane branch such as `claude/issue-12-slug`, or null. */
export function issueNumberFromBranch(config, branch) {
  const name = String(branch ?? '');
  for (const prefix of Object.values(lanePrefixes(config))) {
    if (!name.startsWith(prefix)) continue;
    const match = name.slice(prefix.length).match(/^(\d+)-/);
    if (match) return Number(match[1]);
  }
  return null;
}

/**
 * Every issue a PR relates to: GitHub's closingIssuesReferences, `Closes|Fixes|Resolves #n`
 * keywords (never "Part of": that names an epic the PR only contributes to) in the body (lists like `Closes #1, #2` included), and the number in the head
 * branch. De-duplicated, ascending. References qualified with another repository are ignored.
 * @param {{ closingIssuesReferences?: any[], body?: string, headRefName?: string, config?: any, selfNumber?: number }} [input]
 * @returns {number[]}
 */
export function parseLinkedIssues({ closingIssuesReferences = [], body = '', headRefName = '', config, selfNumber } = {}) {
  const found = new Set();
  for (const ref of closingIssuesReferences ?? []) {
    const repo = ref.repository ? `${ref.repository.owner?.login ?? ''}/${ref.repository.name ?? ''}` : null;
    if (repo && config?.repository && repo.toLowerCase() !== config.repository.toLowerCase()) continue;
    if (Number.isInteger(ref.number)) found.add(ref.number);
  }
  const keyword = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+((?:(?:,|and|&)?\s*(?:[\w.-]+\/[\w.-]+)?#\d+\s*)+)/gi;
  for (const match of String(body ?? '').matchAll(keyword)) {
    for (const ref of match[1].matchAll(/(?:([\w.-]+\/[\w.-]+))?#(\d+)/g)) {
      if (ref[1] && config?.repository && ref[1].toLowerCase() !== config.repository.toLowerCase()) continue;
      found.add(Number(ref[2]));
    }
  }
  const fromBranch = config ? issueNumberFromBranch(config, headRefName) : null;
  if (fromBranch) found.add(fromBranch);
  if (selfNumber != null) found.delete(Number(selfNumber));
  return [...found].sort((a, b) => a - b);
}

/** @typedef {{ status?: string, addLabels: string[], removeLabels: string[], close?: boolean, reopen?: boolean, comment?: string, notes?: string[] }} Decision */

function emptyDecision() {
  return { addLabels: [], removeLabels: [], notes: [] };
}

/**
 * Make a decision relative to the issue: idempotent, minimal, and never self-contradicting.
 * @returns {Decision}
 */
function finalize(issue, decision) {
  const have = new Set(issue.labels ?? []);
  const remove = [...new Set(decision.removeLabels)].filter((label) => have.has(label));
  const add = [...new Set(decision.addLabels)].filter((label) => !have.has(label) && !decision.removeLabels.includes(label));
  const out = { addLabels: add, removeLabels: remove };
  if (decision.status && decision.status !== issue.status) out.status = decision.status;
  if (decision.close && issue.state === 'OPEN') out.close = true;
  if (decision.reopen && issue.state === 'CLOSED') out.reopen = true;
  if (decision.comment) out.comment = decision.comment;
  if (decision.notes?.length) out.notes = decision.notes;
  return out;
}

export const isEmptyDecision = (d) => !d.status && !d.close && !d.reopen && !d.comment && d.addLabels.length === 0 && d.removeLabels.length === 0;

function markDone(d, config) {
  d.status = config.statuses.done;
  d.removeLabels.push(...triageLabels(config), config.labels.onStage);
  d.close = true;
}

function markOnStage(d, issue, config) {
  d.removeLabels.push(...triageLabels(config));
  d.close = true;
  if (statusRank(config, issue.status) >= rankOf('onStage')) return; // never regress Done
  d.status = config.statuses.onStage;
  d.addLabels.push(config.labels.onStage);
}

/** Move to `target` only while the current status is at or before `ceilingKey`. */
function advance(d, issue, config, target, ceilingKey) {
  if (statusRank(config, issue.status) <= rankOf(ceilingKey)) d.status = config.statuses[target];
}

/**
 * Event types: issue.opened | issue.labeled (label) | issue.reopened | issue.closed
 * | branch.created (branch) | pr.draft | pr.ready | pr.closed | pr.merged
 * (pr: {base, head, title}; pr.merged into prod from stage also needs released/version/
 * alreadyCommented, supplied by the caller after its ancestry check).
 * @param {any} event
 * @param {any} issue
 * @param {any} config
 * @returns {Decision}
 */
export function decideTransition(event, issue, config) {
  const d = emptyDecision();
  if (isExempt(issue, config)) return finalize(issue, d);
  const labels = config.labels;
  const have = new Set(issue.labels ?? []);
  const triage = triageLabels(config);
  const readyLabels = labels.ready ?? [];
  const open = issue.state === 'OPEN';
  const rank = statusRank(config, issue.status);

  switch (event.type) {
    case 'issue.opened': {
      const nonLegacy = [labels.backlog, labels.needsInfo, ...readyLabels].filter((l) => have.has(l));
      const legacy = (labels.legacyTriage ?? []).filter((l) => have.has(l));
      d.removeLabels.push(...legacy);
      if (readyLabels.some((l) => have.has(l))) {
        // Created already ready (or a cancelled pending `labeled` run): honour it.
        d.removeLabels.push(labels.backlog, labels.needsInfo);
        if (rank < rankOf('ready')) d.status = config.statuses.ready;
      } else {
        if (nonLegacy.length === 0) d.addLabels.push(labels.backlog);
        if (rank < 0) d.status = config.statuses.backlog;
      }
      break;
    }
    case 'issue.labeled': {
      if (event.label === labels.needsInfo) {
        d.removeLabels.push(labels.backlog, ...(labels.legacyTriage ?? []), ...readyLabels);
        if (rank <= rankOf('ready')) d.status = config.statuses.backlog;
      } else if (readyLabels.includes(event.label)) {
        d.removeLabels.push(labels.backlog, labels.needsInfo, ...(labels.legacyTriage ?? []));
        if (rank < rankOf('ready')) d.status = config.statuses.ready;
        const missing = missingReadiness(issue.body, config);
        if (missing.length && !event.alreadyCommented) d.comment = readinessComment(missing, config);
      }
      break;
    }
    case 'branch.created': {
      if (!open || !isIssueBranch(config, issue.number, event.branch)) break;
      advance(d, issue, config, 'inProgress', 'ready');
      break;
    }
    case 'pr.draft': {
      if (open) advance(d, issue, config, 'inProgress', 'inReview');
      break;
    }
    case 'pr.ready': {
      if (open) advance(d, issue, config, 'inReview', 'inReview');
      break;
    }
    case 'pr.merged': {
      const pr = event.pr ?? {};
      const stage = hasStage(config);
      if (stage && pr.base === config.stageBranch) {
        if (isSyncPr(pr, config)) markDone(d, config);
        else markOnStage(d, issue, config);
      } else if (stage && pr.base === config.prodBranch) {
        if (pr.head === config.stageBranch) {
          if (!event.released) break;
          d.status = config.statuses.done;
          d.removeLabels.push(labels.onStage, ...triage);
          d.close = true;
          if (event.version && !event.alreadyCommented) d.comment = releaseComment(event.version, config);
        } else {
          markDone(d, config); // hotfix straight to production
        }
      } else if (!stage && pr.base === config.prodBranch) {
        markDone(d, config);
      }
      break;
    }
    case 'pr.closed': {
      if (!issue.hasOpenPr && issue.status === config.statuses.inReview) d.status = config.statuses.inProgress;
      break;
    }
    case 'issue.reopened': {
      d.removeLabels.push(labels.onStage);
      d.reopen = true;
      d.status = issue.hasBranch || issue.hasOpenPr ? config.statuses.inProgress : config.statuses.ready;
      break;
    }
    case 'issue.closed': {
      if (closedWithoutShipping(issue, config)) {
        d.status = config.statuses.done;
        d.removeLabels.push(...triage, labels.onStage);
      } else if (!issue.hasMergedPr && rank < rankOf('onStage')) {
        // Manual close with no merged PR: nothing to ship, so it is simply Done.
        d.status = config.statuses.done;
        d.removeLabels.push(...triage, labels.onStage);
      }
      break;
    }
    default:
      break;
  }
  return finalize(issue, d);
}

/**
 * Event type for a pull_request webhook action and the PR as `gh pr view` reports it
 * (mergedAt/state/isDraft; there is no `merged` field). Null when the action needs no handling.
 */
export function prEventType(action, pr) {
  const merged = Boolean(pr?.mergedAt) || pr?.state === 'MERGED';
  const opening = action === 'opened' || action === 'reopened';
  if (action === 'closed') return merged ? 'pr.merged' : 'pr.closed';
  if (action === 'converted_to_draft' || (opening && pr?.isDraft)) return 'pr.draft';
  if (action === 'ready_for_review' || (opening && !pr?.isDraft)) return 'pr.ready';
  return null;
}

/** A parent (issue with sub-issues) is rolled up from its children, never moved by a PR event. */
export function decideLinked(event, issue, config) {
  return (issue.children ?? []).length > 0 ? decideParent(issue, config) : decideTransition(event, issue, config);
}

/** The single write gate: nothing is written on a dry run or for an empty diff. */
export function commit(issue, decision, options, writer) {
  if (options.dryRun || isEmptyDecision(decision)) return false;
  writer(issue, decision);
  return true;
}

/**
 * Roll an issue's children up into it. `issue.children` is [{state, status}].
 * @param {any} issue
 * @param {any} config
 * @returns {Decision}
 */
export function decideParent(issue, config) {
  const d = emptyDecision();
  const children = issue.children ?? [];
  if (children.length === 0 || isExempt(issue, config)) return finalize(issue, d);
  d.removeLabels.push(config.labels.onStage); // parents never carry on-stage
  const rank = statusRank(config, issue.status);
  const allDone = children.every((c) => c.status === config.statuses.done);
  const allClosed = children.every((c) => c.state === 'CLOSED');
  const started = new Set([config.statuses.inProgress, config.statuses.inReview, config.statuses.onStage, config.statuses.done]);
  const anyStarted = children.some((c) => c.state === 'CLOSED' || started.has(c.status));

  if (allDone || (allClosed && !hasStage(config))) {
    d.status = config.statuses.done;
    d.close = true;
  } else if (allClosed) {
    if (rank < rankOf('onStage')) d.status = config.statuses.onStage;
  } else if (anyStarted) {
    if (rank < rankOf('inProgress')) d.status = config.statuses.inProgress;
  }
  return finalize(issue, d);
}

/**
 * Expected state from current facts. Extra facts on `issue`: mergedPrBase (base branch of the
 * newest merged, non-sync closing PR, else null), released (that PR is in production),
 * hasOpenPr, openPrIsDraft, hasBranch. Parents are left to decideParent.
 * @param {any} issue
 * @param {any} config
 * @returns {Decision}
 */
export function reconcileIssue(issue, config) {
  const d = emptyDecision();
  if (isExempt(issue, config) || (issue.children ?? []).length > 0) return finalize(issue, d);
  const labels = config.labels;
  const have = new Set(issue.labels ?? []);
  const triage = triageLabels(config);
  const stage = hasStage(config);
  const onStageBase = stage && issue.mergedPrBase === config.stageBranch && !issue.released;
  const rank = statusRank(config, issue.status);

  if (issue.state === 'CLOSED') {
    if (closedWithoutShipping(issue, config)) {
      d.status = config.statuses.done;
      d.removeLabels.push(...triage, labels.onStage);
    } else if (onStageBase) {
      d.status = config.statuses.onStage;
      d.addLabels.push(labels.onStage);
      d.removeLabels.push(...triage);
    } else {
      // Released, shipped straight to production, no stage branch, or a manual close.
      d.status = config.statuses.done;
      d.removeLabels.push(labels.onStage, ...triage);
    }
    return finalize(issue, d);
  }

  if (have.has(labels.onStage)) {
    if (onStageBase) {
      d.status = config.statuses.onStage;
      d.close = true;
      d.removeLabels.push(...triage);
    } else if (issue.mergedPrBase) {
      d.status = config.statuses.done;
      d.close = true;
      d.removeLabels.push(labels.onStage, ...triage);
    } else {
      d.removeLabels.push(labels.onStage);
      d.notes.push(`has ${labels.onStage} but no merged PR; label removed, status left at ${issue.status ?? 'unset'}`);
    }
    return finalize(issue, d);
  }

  // Open issue: derive the lane from live work, never moving backwards from started work.
  const readyLabel = (labels.ready ?? []).some((l) => have.has(l));
  let expected;
  if (issue.hasOpenPr && !issue.openPrIsDraft) expected = 'inReview';
  else if (issue.hasOpenPr || issue.hasBranch) expected = 'inProgress';
  else if (readyLabel) expected = 'ready';
  else expected = 'backlog';

  if (rank >= rankOf('onStage')) {
    d.notes.push(`open but ${issue.status}; left alone`);
  } else if (rank >= rankOf('inProgress') && rankOf(expected) < rank) {
    if (!issue.hasBranch && !issue.hasOpenPr) d.notes.push(`${issue.status} with no branch or open PR; reported only`);
  } else if (rank < 0 || rankOf(expected) > rank) {
    d.status = config.statuses[expected];
  }

  const effective = d.status ? statusRank(config, d.status) : rank;
  const legacy = (labels.legacyTriage ?? []).filter((l) => have.has(l));
  d.removeLabels.push(...legacy);
  if (effective <= rankOf('ready')) {
    if (readyLabel) d.removeLabels.push(labels.backlog, labels.needsInfo);
    else if (![labels.backlog, labels.needsInfo].some((l) => have.has(l))) d.addLabels.push(labels.backlog);
  }
  return finalize(issue, d);
}

/* ------------------------------------------------------------------------------------------ */
/* Arguments                                                                                   */
/* ------------------------------------------------------------------------------------------ */

export const USAGE = `Usage:
  node scripts/board-sync.mjs --event [--dry-run]       react to the current GitHub Actions event
  node scripts/board-sync.mjs --reconcile [--dry-run]   sweep issues and repair board drift
  node scripts/board-sync.mjs --help

Options:
  --ci        accepted for symmetry with harness-label.mjs (no behaviour change)
  --dry-run   print the changes; write nothing

Environment: GH_TOKEN (a PAT that can edit the Project), GITHUB_EVENT_NAME, GITHUB_EVENT_PATH,
GITHUB_STEP_SUMMARY (optional).`;

export function parseArgs(args) {
  const options = { mode: null, dryRun: false, ci: false, help: false };
  for (const arg of args) {
    if (arg === '--event') options.mode = 'event';
    else if (arg === '--reconcile') options.mode = 'reconcile';
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--ci') options.ci = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new WorkflowError(`Unknown option "${arg}". Use --help.`);
  }
  if (!options.help && !options.mode) throw new WorkflowError('Choose a mode: --event or --reconcile (see --help).');
  return options;
}

/* ------------------------------------------------------------------------------------------ */
/* I/O layer                                                                                   */
/* ------------------------------------------------------------------------------------------ */

const ISSUE_LIMIT = 5000;
const MERGED_PR_LIMIT = 3000;

const gh = (args, cwd) => run('gh', args, cwd);
const ghJson = (args, cwd) => JSON.parse(gh(args, cwd) || 'null');

function sleepSeconds(seconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000);
}

/* GraphQL project access. `gh project *` resolves the owner type through queries the board PAT
 * cannot make ("unknown owner type"), so the project is read and written with `gh api graphql`
 * directly. Values are always passed as variables (-f/-F), never interpolated into a query. */

const PROJECT_PAGE_LIMIT = 50;

function projectQuery(ownerKind) {
  if (ownerKind !== 'user' && ownerKind !== 'organization') throw new WorkflowError(`Unknown project owner kind "${ownerKind}".`);
  return `query($owner: String!, $number: Int!, $statusField: String!, $cursor: String) {
  ${ownerKind}(login: $owner) {
    projectV2(number: $number) {
      id
      field(name: $statusField) { ... on ProjectV2SingleSelectField { id name options { id name } } }
      items(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          content { __typename ... on Issue { number url } ... on PullRequest { number url } }
          fieldValueByName(name: $statusField) { ... on ProjectV2ItemFieldSingleSelectValue { name } }
        }
      }
    }
  }
}`;
}

/**
 * Arguments for one page of the project query. The cursor is omitted on the first page.
 * @param {string} ownerKind
 * @param {{ owner: string, number: number, statusField: string, cursor?: string | null }} options
 */
export function projectQueryArgs(ownerKind, { owner, number, statusField, cursor }) {
  const args = ['api', 'graphql', '-f', `query=${projectQuery(ownerKind)}`, '-f', `owner=${owner}`, '-F', `number=${number}`, '-f', `statusField=${statusField}`];
  if (cursor) args.push('-f', `cursor=${cursor}`);
  return args;
}

export function setStatusArgs(projectId, itemId, fieldId, optionId) {
  const query = `mutation($p: ID!, $i: ID!, $f: ID!, $o: String!) {
  updateProjectV2ItemFieldValue(input: { projectId: $p, itemId: $i, fieldId: $f, value: { singleSelectOptionId: $o } }) { projectV2Item { id } }
}`;
  return ['api', 'graphql', '-f', `query=${query}`, '-f', `p=${projectId}`, '-f', `i=${itemId}`, '-f', `f=${fieldId}`, '-f', `o=${optionId}`];
}

export function addItemArgs(projectId, contentId) {
  const query = `mutation($p: ID!, $c: ID!) {
  addProjectV2ItemById(input: { projectId: $p, contentId: $c }) { item { id } }
}`;
  return ['api', 'graphql', '-f', `query=${query}`, '-f', `p=${projectId}`, '-f', `c=${contentId}`];
}

/** The owner node of a project response, whichever of user/organization it came back under. */
export function projectNode(response) {
  return response?.data?.user?.projectV2 ?? response?.data?.organization?.projectV2 ?? null;
}

/** Throws the GraphQL error messages, if the response carries any. */
export function assertNoGraphqlErrors(response) {
  if (Array.isArray(response?.errors) && response.errors.length > 0) {
    throw new WorkflowError(`GraphQL error: ${response.errors.map((e) => e?.message ?? String(e)).join('; ')}`);
  }
  return response;
}

/** Maps one page of project items to the shape the rest of this file uses; drafts (no content) are skipped. */
export function mapProjectItems(response, repository) {
  const nodes = projectNode(response)?.items?.nodes ?? [];
  const items = [];
  for (const node of nodes) {
    if (!node?.content?.url) continue;
    items.push({
      id: node.id,
      content: { type: node.content.__typename, number: node.content.number, url: node.content.url },
      status: node.fieldValueByName?.name ?? null,
    });
  }
  return repository ? items.filter((item) => belongsToRepository(item, repository)) : items;
}

function graphql(args, cwd) {
  let response;
  try {
    response = JSON.parse(gh(args, cwd) || 'null');
  } catch (error) {
    if (error instanceof WorkflowError) throw error;
    throw new WorkflowError(`gh api graphql failed: ${error.message}`);
  }
  return assertNoGraphqlErrors(response);
}

function loadProjectAs(ownerKind, project, statusField, repository, cwd) {
  let projectId = null;
  let field = null;
  const items = [];
  let cursor;
  for (let page = 0; page < PROJECT_PAGE_LIMIT; page += 1) {
    const response = graphql(projectQueryArgs(ownerKind, { owner: project.owner, number: project.number, statusField, cursor }), cwd);
    const node = projectNode(response);
    if (!node) return null;
    projectId = node.id;
    field = node.field?.options ? node.field : field;
    items.push(...mapProjectItems(response, repository));
    const info = node.items?.pageInfo;
    if (!info?.hasNextPage) return { projectId, field, items };
    cursor = info.endCursor;
  }
  throw new WorkflowError(`Project ${project.number} has more than ${PROJECT_PAGE_LIMIT * 100} items; stopping at the safety limit.`);
}

/** Loads project id, Status field and items. Tries the owner as a user, then as an organization. */
function loadProject(project, statusField, repository, cwd) {
  let loaded = null;
  let userError = null;
  try {
    loaded = loadProjectAs('user', project, statusField, repository, cwd);
  } catch (error) {
    userError = error;
  }
  if (!loaded) loaded = loadProjectAs('organization', project, statusField, repository, cwd);
  if (!loaded) {
    throw new WorkflowError(`Project ${project.number} not found for owner ${project.owner}${userError ? ` (${userError.message})` : ''}. Check the token and its project scope.`);
  }
  return loaded;
}

class Board {
  constructor(config, cwd) {
    this.config = config;
    this.cwd = cwd;
    this.loaded = false;
  }

  load() {
    if (this.loaded) return;
    const { project, statusField } = this.config;
    const loaded = loadProject(project, statusField, this.config.repository, this.cwd);
    this.projectId = loaded.projectId;
    this.field = loaded.field;
    if (!this.field) throw new WorkflowError(`Project ${project.number} has no "${statusField}" field.`);
    this.items = new Map();
    for (const item of loaded.items) {
      if (item.content?.type === 'PullRequest') continue;
      this.items.set(Number(item.content?.number), item);
    }
    this.loaded = true;
  }

  status(number) {
    this.load();
    const item = this.items.get(Number(number));
    return item ? statusName(item, this.config.statusField) : null;
  }

  setStatus(number, status) {
    this.load();
    let item = this.items.get(Number(number));
    if (!item) {
      const issueNode = ghJson(['issue', 'view', String(number), '--repo', this.config.repository, '--json', 'id'], this.cwd);
      if (!issueNode?.id) throw new WorkflowError(`Issue #${number} did not return a node ID.`);
      const added = graphql(addItemArgs(this.projectId, issueNode.id), this.cwd);
      const addedId = added?.data?.addProjectV2ItemById?.item?.id;
      if (!addedId) throw new WorkflowError(`Adding issue #${number} to the project returned no item ID.`);
      item = { id: addedId, content: { number }, status: null };
      this.items.set(Number(number), item);
    }
    const option = findStatusOption(this.field, status);
    graphql(setStatusArgs(this.projectId, item.id, this.field.id, option.id), this.cwd);
    item.status = status;
  }
}

class Repo {
  constructor(config, cwd) {
    this.config = config;
    this.cwd = cwd;
    this.board = new Board(config, cwd);
    this._facts = null;
  }

  api(path) {
    return ghJson(['api', `repos/${this.config.repository}/${path}`], this.cwd);
  }

  /** Branches, open PRs and merged PRs with their linked issues; fetched once per run. */
  facts() {
    if (this._facts) return this._facts;
    const repo = this.config.repository;
    const branches = gh(['api', `repos/${repo}/branches?per_page=100`, '--paginate', '--jq', '.[].name'], this.cwd).split('\n').filter(Boolean);
    const fields = 'number,title,body,headRefName,baseRefName,isDraft,mergeCommit,closingIssuesReferences,mergedAt';
    const open = ghJson(['pr', 'list', '--repo', repo, '--state', 'open', '--limit', '300', '--json', fields], this.cwd) ?? [];
    const merged = ghJson(['pr', 'list', '--repo', repo, '--state', 'merged', '--limit', String(MERGED_PR_LIMIT), '--json', fields], this.cwd) ?? [];
    const link = (pr) => parseLinkedIssues({ ...pr, config: this.config, selfNumber: pr.number });
    this._facts = {
      branches,
      open: open.map((pr) => ({ ...pr, linked: link(pr) })),
      merged: merged.map((pr) => ({ ...pr, linked: link(pr) })),
      mergedLimitHit: merged.length >= MERGED_PR_LIMIT,
    };
    return this._facts;
  }

  /** Full issue object for the pure functions. `excludePr` ignores a PR that just closed. */
  issue(number, { excludePr } = {}) {
    const raw = ghJson(['issue', 'view', String(number), '--repo', this.config.repository, '--json', 'number,title,state,stateReason,labels,body,comments,closedAt'], this.cwd);
    const facts = this.facts();
    const openPrs = facts.open.filter((pr) => pr.linked.includes(Number(number)) && pr.number !== excludePr);
    const mergedPrs = facts.merged
      .filter((pr) => pr.linked.includes(Number(number)))
      .filter((pr) => !isSyncPr({ head: pr.headRefName, title: pr.title }, this.config))
      .sort((a, b) => String(b.mergedAt).localeCompare(String(a.mergedAt)));
    const latest = mergedPrs[0] ?? null;
    return {
      number: raw.number,
      title: raw.title,
      state: raw.state,
      stateReason: raw.stateReason,
      labels: (raw.labels ?? []).map((l) => l.name),
      body: raw.body ?? '',
      comments: raw.comments ?? [],
      closedAt: raw.closedAt,
      status: this.board.status(number),
      hasOpenPr: openPrs.length > 0,
      openPrIsDraft: openPrs.length > 0 && openPrs.every((pr) => pr.isDraft),
      hasBranch: facts.branches.some((b) => isIssueBranch(this.config, number, b)) || openPrs.length > 0,
      hasMergedPr: mergedPrs.length > 0,
      mergedPrBase: latest?.baseRefName ?? null,
      mergedPrSha: latest?.mergeCommit?.oid ?? null,
      released: latest ? this.isReleased(latest.mergeCommit?.oid, latest.baseRefName) : false,
    };
  }

  isReleased(sha, base) {
    if (!sha) return false;
    if (!hasStage(this.config) || base === this.config.prodBranch) return true;
    try {
      run('git', ['merge-base', '--is-ancestor', sha, `origin/${this.config.prodBranch}`], this.cwd);
      return true;
    } catch {
      return false;
    }
  }

  children(number) {
    let subs = [];
    try {
      subs = this.api(`issues/${number}/sub_issues?per_page=100`) ?? [];
    } catch {
      return [];
    }
    return subs.map((s) => ({ number: s.number, state: String(s.state).toUpperCase(), status: this.board.status(s.number) }));
  }

  parentNumber(number) {
    try {
      return this.api(`issues/${number}/parent`)?.number ?? null;
    } catch {
      return null;
    }
  }
}

/** Human-readable rows describing a decision, also used as the dry-run output. */
export function describeChanges(issue, decision) {
  const rows = [];
  if (decision.status) rows.push({ issue: issue.number, field: 'status', change: `${issue.status ?? '(unset)'} → ${decision.status}` });
  for (const l of decision.addLabels) rows.push({ issue: issue.number, field: 'label', change: `+ ${l}` });
  for (const l of decision.removeLabels) rows.push({ issue: issue.number, field: 'label', change: `− ${l}` });
  if (decision.close) rows.push({ issue: issue.number, field: 'state', change: 'OPEN → CLOSED' });
  if (decision.reopen) rows.push({ issue: issue.number, field: 'state', change: 'CLOSED → OPEN' });
  if (decision.comment) rows.push({ issue: issue.number, field: 'comment', change: decision.comment.split('\n').find((line) => line && !line.startsWith('<!--')) ?? 'comment' });
  for (const note of decision.notes ?? []) rows.push({ issue: issue.number, field: 'note', change: note });
  return rows;
}

function apply(repo, issue, decision) {
  const n = String(issue.number);
  const base = ['--repo', repo.config.repository];
  if (decision.addLabels.length || decision.removeLabels.length) {
    const args = ['issue', 'edit', n, ...base];
    if (decision.addLabels.length) args.push('--add-label', decision.addLabels.join(','));
    if (decision.removeLabels.length) args.push('--remove-label', decision.removeLabels.join(','));
    gh(args, repo.cwd);
  }
  if (decision.status) repo.board.setStatus(issue.number, decision.status);
  if (decision.reopen) gh(['issue', 'reopen', n, ...base], repo.cwd);
  if (decision.comment) gh(['issue', 'comment', n, ...base, '--body', decision.comment], repo.cwd);
  if (decision.close) gh(['issue', 'close', n, ...base, '--reason', 'completed'], repo.cwd);
}

function commentedWith(issue, marker) {
  return (issue.comments ?? []).some((c) => String(c.body ?? '').includes(marker));
}

function evaluateParent(repo, report, number, options) {
  const parent = repo.parentNumber(number);
  if (!parent) return;
  const issue = repo.issue(parent);
  issue.children = repo.children(parent);
  const decision = decideParent(issue, repo.config);
  report.rows.push(...describeChanges(issue, decision));
  commit(issue, decision, options, (i, d) => apply(repo, i, d));
}

function handle(repo, report, number, event, options, extra = {}) {
  try {
    const issue = repo.issue(number, { excludePr: extra.excludePr });
    issue.children = repo.children(number);
    const marker = repo.config.readinessCommentMarker;
    const decision = decideLinked({ alreadyCommented: commentedWith(issue, marker), ...event }, issue, repo.config);
    report.rows.push(...describeChanges(issue, decision));
    commit(issue, decision, options, (i, d) => apply(repo, i, d));
    evaluateParent(repo, report, number, options);
  } catch (error) {
    report.errors.push(`#${number}: ${error.message}`);
  }
}

function releaseVersion(repo, sha, prNumber) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const tags = run('git', ['tag', '--points-at', sha], repo.cwd).split('\n').filter((t) => /^v\d/.test(t));
      if (tags.length) return tags.sort().at(-1);
    } catch { /* tag not fetched yet */ }
    // release.yml pushes the tag after the merge, so it can land a moment after this run starts.
    try { run('git', ['fetch', '--tags', '--quiet', 'origin'], repo.cwd); } catch { /* offline */ }
    if (attempt < 5) sleepSeconds(10);
  }
  return `PR #${prNumber}`;
}

/** Release PR stage -> prod: every closed On-stage issue whose merge is in this release is Done. */
function releaseMode(repo, report, pr, number, options) {
  const sha = pr.mergeCommit?.oid;
  if (!sha) throw new WorkflowError('Release PR has no merge commit.');
  try { run('git', ['fetch', '--quiet', 'origin', sha], repo.cwd); } catch { /* already present */ }
  const version = releaseVersion(repo, sha, number);
  repo.board.load();
  const candidates = [...repo.board.items.keys()].filter((n) => repo.board.status(n) === repo.config.statuses.onStage);
  for (const candidate of candidates) {
    try {
      const issue = repo.issue(candidate);
      if (issue.state !== 'CLOSED' || !issue.mergedPrSha) continue;
      let inRelease = false;
      try {
        run('git', ['merge-base', '--is-ancestor', issue.mergedPrSha, sha], repo.cwd);
        inRelease = true;
      } catch { /* not part of this release */ }
      if (!inRelease) continue;
      const event = {
        type: 'pr.merged',
        pr: { base: repo.config.prodBranch, head: repo.config.stageBranch },
        released: true,
        version,
        alreadyCommented: commentedWith(issue, repo.config.releaseCommentMarker),
      };
      const decision = decideTransition(event, issue, repo.config);
      report.rows.push(...describeChanges(issue, decision));
      commit(issue, decision, options, (i, d) => apply(repo, i, d));
      evaluateParent(repo, report, candidate, options);
    } catch (error) {
      report.errors.push(`#${candidate}: ${error.message}`);
    }
  }
}

function eventMode(repo, report, options) {
  const name = process.env.GITHUB_EVENT_NAME;
  const path = process.env.GITHUB_EVENT_PATH;
  if (!name || !path) throw new WorkflowError('--event needs GITHUB_EVENT_NAME and GITHUB_EVENT_PATH.');
  const payload = JSON.parse(readFileSync(path, 'utf8'));
  const config = repo.config;

  if (name === 'issues') {
    const map = { opened: 'issue.opened', labeled: 'issue.labeled', reopened: 'issue.reopened', closed: 'issue.closed' };
    const type = map[payload.action];
    if (type) handle(repo, report, payload.issue.number, { type, label: payload.label?.name }, options);
    return;
  }
  if (name === 'create') {
    if (payload.ref_type !== 'branch') return;
    const number = issueNumberFromBranch(config, payload.ref);
    if (number) handle(repo, report, number, { type: 'branch.created', branch: payload.ref }, options);
    return;
  }
  if (name === 'pull_request' || name === 'pull_request_target') {
    const n = payload.pull_request.number;
    let pr;
    try {
      pr = ghJson(['pr', 'view', String(n), '--repo', config.repository, '--json', 'closingIssuesReferences,body,headRefName,baseRefName,isDraft,mergedAt,state,mergeCommit,title,number'], repo.cwd);
    } catch (error) {
      report.errors.push(`PR #${n}: could not read pull request: ${error.message}`);
      return;
    }
    const linked = parseLinkedIssues({ ...pr, config, selfNumber: n });
    const info = { base: pr.baseRefName, head: pr.headRefName, title: pr.title };
    const type = prEventType(payload.action, pr);
    if (!type) return;

    if (type === 'pr.merged' && hasStage(config) && info.base === config.prodBranch && info.head === config.stageBranch) {
      releaseMode(repo, report, pr, n, options);
      return;
    }
    for (const number of linked) {
      handle(repo, report, number, { type, pr: info }, options, { excludePr: type === 'pr.closed' ? n : undefined });
    }
  }
}

function reconcileMode(repo, report, options) {
  const config = repo.config;
  const since = Date.now() - Number(config.reconcileClosedWindowDays ?? 90) * 86_400_000;
  const list = ghJson(['issue', 'list', '--repo', config.repository, '--state', 'all', '--limit', String(ISSUE_LIMIT), '--json', 'number,state,closedAt'], repo.cwd) ?? [];
  if (list.length >= ISSUE_LIMIT) report.notes.push(`Issue list hit the ${ISSUE_LIMIT} limit; older issues were not reconciled.`);
  if (repo.facts().mergedLimitHit) report.notes.push(`Merged PR list hit the ${MERGED_PR_LIMIT} limit; older merges are invisible to reconcile.`);
  const numbers = list
    .filter((i) => i.state === 'OPEN' || (i.closedAt && new Date(i.closedAt).getTime() >= since))
    .map((i) => i.number);
  for (const number of numbers) {
    try {
      const issue = repo.issue(number);
      issue.children = repo.children(number);
      const decision = issue.children.length ? decideParent(issue, config) : reconcileIssue(issue, config);
      report.rows.push(...describeChanges(issue, decision));
      commit(issue, decision, options, (i, d) => apply(repo, i, d));
    } catch (error) {
      report.errors.push(`#${number}: ${error.message}`);
    }
  }
}

export function formatReport(report, options) {
  const lines = [`## Board sync${options.dryRun ? ' (dry run)' : ''}`, ''];
  if (report.rows.length) {
    lines.push('| Issue | Field | Change |', '| --- | --- | --- |');
    for (const row of report.rows) lines.push(`| #${row.issue} | ${row.field} | ${String(row.change).replace(/\|/g, '\\|')} |`);
  } else {
    lines.push('No changes.');
  }
  if (report.notes?.length) lines.push('', ...report.notes.map((n) => `> ${n}`));
  if (report.errors.length) lines.push('', `### Errors (${report.errors.length})`, ...report.errors.map((e) => `- ${e}`));
  return lines.join('\n');
}

export function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`board-sync: ${error.message}\n\n${USAGE}`);
    return 1;
  }
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  const report = { rows: [], errors: [], notes: [] };
  try {
    const config = loadBoardConfig();
    const repo = new Repo(config, resolve(SCRIPT_DIR, '..'));
    repo.board.load(); // auth / config failures surface here and are the only exit-1 path
    if (options.mode === 'event') eventMode(repo, report, options);
    else reconcileMode(repo, report, options);
  } catch (error) {
    console.error(`board-sync stopped: ${error.message}`);
    return 1;
  }
  const text = formatReport(report, options);
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) {
    try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`); } catch { /* summary is best effort */ }
  }
  return 0;
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) process.exitCode = main();
