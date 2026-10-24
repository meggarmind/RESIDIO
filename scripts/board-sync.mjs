#!/usr/bin/env node
/**
 * Board and label automation (#1104).
 *
 * Moves triage labels and the project board Status from development events, and corrects drift
 * on a nightly pass. Replaces the "a session remembers to move the card" rule in CORE.md §9.
 *
 * The rules live in `decideTransition`, which is pure: facts in, a decision out. Everything that
 * touches the network is below it. Configuration (Status option IDs, branches, labels) is
 * `.github/board-automation.json`.
 *
 * Lifecycle (owner decisions of 2026-10-24):
 *   - A PR that says `Closes #N` closes the issue when it merges into `stage`. Closed + On stage
 *     means "closed, not yet on Prod".
 *   - A merged release PR into `master` moves the issues it shipped (closed, On stage, closing PR
 *     merge commit an ancestor of the release) to Done, removes `on-stage` and comments the tag.
 *   - `backlog` replaces `needs-triage`; `needs-info` stays. All three map to Backlog.
 *   - Parents take their Status from their children and are never closed here.
 *   - Backward moves: a PR closed unmerged -> In progress; a reopened issue -> Ready or In progress.
 *   - Issues in `exempt` (the `pinned` label, #412, #1006) are never touched.
 *
 * Usage:
 *   node scripts/board-sync.mjs --event [--dry-run]
 *   node scripts/board-sync.mjs --reconcile [--dry-run] [--apply] [--report <file>]
 *
 * `--event` reads GITHUB_EVENT_NAME and GITHUB_EVENT_PATH. Labels and comments use GH_TOKEN
 * (GITHUB_TOKEN, so label edits do not retrigger workflows); board reads and writes use
 * BOARD_TOKEN when set, because a user-owned Project v2 is out of reach of GITHUB_TOKEN.
 * `--reconcile` stays a dry run until `reconcile.apply` is true in the config or `--apply` is passed.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(repoRoot, '.github', 'board-automation.json');

export const STATUS = ['Backlog', 'Ready', 'In progress', 'In review', 'On stage', 'Done'];

export function loadConfig() {
  return JSON.parse(readFileSync(configPath, 'utf8'));
}

// ---------------------------------------------------------------------------------------------
// Pure rules
// ---------------------------------------------------------------------------------------------

/** Issue numbers a PR body links. `closes` closes on merge; `refs` only marks the PR as related. */
export function parseIssueRefs(body) {
  const text = String(body ?? '');
  const numbers = (re) => [...new Set([...text.matchAll(re)].map((m) => Number(m[1])))];
  return {
    closes: numbers(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b:?\s+#(\d+)/gi),
    refs: numbers(/\b(?:part of|refs?)\b:?\s+#(\d+)/gi),
  };
}

/** The Status a parent takes from its children's Statuses. */
export function rollupStatus(childStatuses) {
  if (!childStatuses.length) return null;
  const all = (set) => childStatuses.every((s) => set.includes(s));
  if (all(['Done'])) return 'Done';
  if (all(['On stage', 'Done'])) return 'On stage';
  if (childStatuses.some((s) => ['In progress', 'In review', 'On stage', 'Done'].includes(s))) return 'In progress';
  if (all(['Ready'])) return 'Ready';
  return 'Backlog';
}

/** Names of the readiness sections the issue body lacks. */
export function missingReadySections(body, cfg) {
  return Object.entries(cfg.readyCheck.sections)
    .filter(([, pattern]) => !new RegExp(pattern, 'im').test(String(body ?? '')))
    .map(([name]) => name);
}

function isExempt(issue, cfg) {
  return cfg.exempt.issues.includes(issue.number) || issue.labels.some((l) => cfg.exempt.labels.includes(l));
}

function isNotPlanned(issue, cfg) {
  return issue.labels.some((l) => cfg.labels.notPlanned.includes(l))
    || ['not_planned', 'duplicate'].includes(String(issue.stateReason ?? '').toLowerCase());
}

/**
 * An issue closed by hand (no merged closing PR) in a repo with a stage branch, closed after the
 * last release: its work is on Stage but not yet on Prod (owner decision, 24 October 2026). With
 * no known release, or closed at or before it, it is Done.
 */
function handClosedOnStage(ctx, cfg) {
  const { issue } = ctx;
  // A closed parent rolls up from its children and never carries `on-stage`.
  if (!cfg.stageBranch || !ctx.lastReleaseAt || !issue.closedAt || issue.children?.length > 0) return false;
  return Date.parse(issue.closedAt) > Date.parse(ctx.lastReleaseAt);
}

function closedStatus(ctx, cfg) {
  const { issue } = ctx;
  if (isNotPlanned(issue, cfg)) return 'Done';
  const closer = ctx.pr ?? issue.closedBy;
  if (!closer?.merged) return handClosedOnStage(ctx, cfg) ? 'On stage' : 'Done';
  // With no stage branch to wait on, there is nothing left to ship.
  if (!cfg.stageBranch) return 'Done';
  return closer.base === cfg.stageBranch && !closer.onRelease ? 'On stage' : 'Done';
}

function openStatus(ctx, cfg, labels, out) {
  const { issue, trigger } = ctx;
  const cur = issue.status ?? null;
  const readyLabel = cfg.labels.ready.some((l) => labels.has(l));
  if (trigger === 'issue-reopened') return readyLabel ? 'Ready' : 'In progress';
  if (issue.hasOpenPr || trigger === 'pr-opened') return 'In review';
  if (trigger === 'branch-created' && (cur === null || cur === 'Backlog' || cur === 'Ready')) return 'In progress';
  // In review with no open PR: the PR closed unmerged.
  if (cur === 'In review') return 'In progress';
  if (cur === 'In progress') return cur;
  if (cur === 'On stage' || cur === 'Done') {
    out.flags.push(`open issue is ${cur}; close it if the work is delivered, or move it back by hand`);
    return cur;
  }
  return readyLabel ? 'Ready' : 'Backlog';
}

function normalizeTriage(ctx, cfg, labels, out) {
  const { trigger, label } = ctx;
  const family = cfg.labels.backlogFamily;
  const ready = cfg.labels.ready.filter((l) => labels.has(l));
  const inFamily = family.filter((l) => labels.has(l));
  const remove = (names) => names.forEach((l) => { labels.delete(l); out.removeLabels.push(l); });

  if (ready.length && inFamily.length) {
    // A backlog label added after `ready-for-*` is the owner's veto; otherwise ready wins.
    const vetoed = trigger === 'issue-labeled' && family.includes(label);
    remove(vetoed ? ready : inFamily);
  }
  if (labels.has(cfg.labels.retiredTriage)) {
    remove([cfg.labels.retiredTriage]);
    if (!cfg.labels.ready.some((l) => labels.has(l)) && !family.some((l) => labels.has(l))) {
      labels.add(cfg.labels.backlog);
      out.addLabels.push(cfg.labels.backlog);
    }
  }
  const cur = ctx.issue.status ?? null;
  const untriaged = !cfg.labels.ready.some((l) => labels.has(l)) && !family.some((l) => labels.has(l));
  if (untriaged && (cur === null || cur === 'Backlog' || cur === 'Ready')) {
    labels.add(cfg.labels.backlog);
    out.addLabels.push(cfg.labels.backlog);
  }
}

/**
 * Decides the label and Status changes for one issue.
 *
 * ctx = {
 *   trigger: 'issue-opened' | 'issue-labeled' | 'issue-reopened' | 'issue-closed' | 'pr-opened'
 *          | 'pr-closed-unmerged' | 'pr-merged' | 'branch-created' | 'child-changed' | 'release'
 *          | 'reconcile',
 *   label,       // issue-labeled: the label that changed
 *   pr,          // pr-merged: { base, merged: true }
 *   releaseTag,  // tag that shipped the issue, when known
 *   lastReleaseAt, // ISO time of the newest release tag on the release branch; null when none
 *   releasesUnavailable, // true when the tag list could not be read: hand-closed issues are left as they are
 *   issue: { number, state: 'open'|'closed', stateReason, body, labels, status, children: [{status}],
 *            hasOpenPr, closedAt, closedBy: { base, merged, onRelease } | null },
 * }
 * Returns { number, from, status, addLabels, removeLabels, comment, flags }; `status` is null when
 * no move is needed.
 */
export function decideTransition(ctx, cfg) {
  const { issue, trigger } = ctx;
  /** @type {{ number: number, from: string|null, status: string|null, addLabels: string[], removeLabels: string[], comment: {marker: string, body: string}|null, flags: string[] }} */
  const out = { number: issue.number, from: issue.status ?? null, status: null, addLabels: [], removeLabels: [], comment: null, flags: [] };
  if (isExempt(issue, cfg)) return out;

  const labels = new Set(issue.labels);
  const isParent = issue.state === 'open' && issue.children.length > 0;
  const closed = !isParent && (issue.state === 'closed' || trigger === 'pr-merged');
  const onStageLabel = cfg.labels.onStage;

  // Without the release list a hand-closed issue cannot be placed; change nothing rather than guess Done.
  const handClosed = closed && !(ctx.pr ?? issue.closedBy)?.merged && !isNotPlanned(issue, cfg) && Boolean(cfg.stageBranch) && !issue.children?.length;
  if (handClosed && ctx.releasesUnavailable) return out;

  let target;
  if (isParent) {
    target = rollupStatus(issue.children.map((c) => c.status ?? (c.state === 'closed' ? 'Done' : 'Backlog')));
  } else if (closed) {
    target = closedStatus(ctx, cfg);
  } else {
    normalizeTriage(ctx, cfg, labels, out);
    target = openStatus(ctx, cfg, labels, out);
    if (trigger === 'issue-reopened') labels.delete(onStageLabel);
  }
  if (trigger === 'issue-reopened' && issue.labels.includes(onStageLabel) && !isParent) out.removeLabels.push(onStageLabel);

  if (target && target !== issue.status) out.status = target;
  const final = target ?? issue.status;

  if (isParent || closed) {
    const want = final === 'On stage';
    if (want && !issue.labels.includes(onStageLabel)) out.addLabels.push(onStageLabel);
    if (!want && issue.labels.includes(onStageLabel)) out.removeLabels.push(onStageLabel);
  } else if (!out.removeLabels.includes(onStageLabel) && issue.labels.includes(onStageLabel) && final !== 'On stage') {
    out.flags.push(`open issue carries ${onStageLabel} but is not On stage`);
  }
  if (closed) {
    for (const l of [...cfg.labels.ready, ...cfg.labels.backlogFamily]) {
      if (issue.labels.includes(l) && !out.removeLabels.includes(l)) out.removeLabels.push(l);
    }
  }

  const closer = ctx.pr ?? issue.closedBy;
  // A hand-closed On stage issue has no closing PR: the release time alone moves it to Done.
  const handShipped = handClosed && Boolean(ctx.lastReleaseAt);
  if (closed && issue.status === 'On stage' && target === 'Done' && (closer?.onRelease || handShipped)) {
    out.comment = {
      marker: cfg.releasedMarker,
      body: `${cfg.releasedMarker}\n${ctx.releaseTag ? `Released in ${ctx.releaseTag}.` : 'Released to Prod.'}`,
    };
  }
  if (trigger === 'issue-labeled' && ctx.label === cfg.labels.readyCheck && !closed && !isParent) {
    const missing = missingReadySections(issue.body, cfg);
    if (missing.length) {
      out.comment = {
        marker: cfg.readyCheck.marker,
        body: `${cfg.readyCheck.marker}\nThis issue is marked \`${ctx.label}\` but its body has no ${missing.join(', ')} section. Add it, or the owner can veto by re-adding \`${cfg.labels.backlog}\`.`,
      };
    }
  }

  out.addLabels = [...new Set(out.addLabels)];
  out.removeLabels = [...new Set(out.removeLabels)].filter((l) => issue.labels.includes(l));
  out.addLabels = out.addLabels.filter((l) => !issue.labels.includes(l));
  return out;
}

/** Decisions for every issue a PR event touches. `issues` maps number -> issue facts. */
export function planPullRequest(kind, pr, issues, cfg) {
  const { closes, refs } = parseIssueRefs(pr.body);
  const numbers = kind === 'merged' ? closes : [...new Set([...closes, ...refs])];
  const trigger = { opened: 'pr-opened', merged: 'pr-merged', 'closed-unmerged': 'pr-closed-unmerged' }[kind];
  return numbers
    .filter((n) => issues.has(n))
    .map((n) => decideTransition({ trigger, pr: { base: pr.base, merged: kind === 'merged', onRelease: false }, issue: issues.get(n) }, cfg));
}

export function isChange(d) {
  return Boolean(d.status || d.addLabels.length || d.removeLabels.length || d.comment);
}

// ---------------------------------------------------------------------------------------------
// GitHub I/O
// ---------------------------------------------------------------------------------------------

function gh(args, { token, input } = {}) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    input,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: token ? { ...process.env, GH_TOKEN: token } : process.env,
  });
}

function graphql(query, vars = {}) {
  const args = ['api', 'graphql', '-H', 'GraphQL-Features: sub_issues', '-f', `query=${query}`];
  for (const [k, v] of Object.entries(vars)) if (v !== null && v !== undefined) args.push(typeof v === 'number' ? '-F' : '-f', `${k}=${v}`);
  return JSON.parse(gh(args, { token: process.env.BOARD_TOKEN })).data;
}

const ISSUE_FIELDS = `id number state stateReason closedAt body
  labels(first: 50) { nodes { name } }
  parent { number }
  subIssues(first: 100) { nodes { number state } }
  projectItems(first: 10) { nodes { id isArchived project { number } fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } } } }
  closedByPullRequestsReferences(first: 5, includeClosedPrs: true) { nodes { number merged baseRefName mergeCommit { oid } } }`;

function splitRepo(cfg) {
  const [owner, name] = cfg.repository.split('/');
  return { owner, name };
}

export function rawFromNode(node, cfg) {
  const item = node.projectItems.nodes.find((i) => i.project.number === cfg.project.number);
  return {
    id: node.id,
    number: node.number,
    state: node.state.toLowerCase(),
    stateReason: node.stateReason,
    closedAt: node.closedAt ?? null,
    body: node.body ?? '',
    labels: node.labels.nodes.map((l) => l.name),
    parent: node.parent?.number ?? null,
    children: node.subIssues.nodes.map((c) => ({ number: c.number, state: c.state.toLowerCase() })),
    itemId: item?.id ?? null,
    itemArchived: item?.isArchived ?? false,
    status: item?.fieldValueByName?.name ?? null,
    closers: node.closedByPullRequestsReferences.nodes
      .filter((p) => p.merged)
      .map((p) => ({ number: p.number, base: p.baseRefName, sha: p.mergeCommit?.oid ?? null })),
  };
}

function fetchRaw(numbers, cfg) {
  const { owner, name } = splitRepo(cfg);
  const result = new Map();
  for (let i = 0; i < numbers.length; i += 20) {
    const chunk = numbers.slice(i, i + 20);
    const fields = chunk.map((n) => `i${n}: issue(number: ${n}) { ${ISSUE_FIELDS} }`).join('\n');
    const data = graphql(`query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${fields} } }`, { owner, name });
    for (const n of chunk) {
      const node = data.repository[`i${n}`];
      if (node) result.set(n, rawFromNode(node, cfg));
    }
  }
  return result;
}

function fetchAllRaw(cfg) {
  const { owner, name } = splitRepo(cfg);
  const result = new Map();
  let cursor = null;
  for (;;) {
    const data = graphql(
      `query($owner: String!, $name: String!, $cursor: String) { repository(owner: $owner, name: $name) { issues(first: 50, after: $cursor) { pageInfo { hasNextPage endCursor } nodes { ${ISSUE_FIELDS} } } } }`,
      { owner, name, cursor },
    );
    const page = data.repository.issues;
    for (const node of page.nodes) result.set(node.number, rawFromNode(node, cfg));
    if (!page.pageInfo.hasNextPage) return result;
    cursor = page.pageInfo.endCursor;
  }
}

/** Issue numbers linked by open PRs (closing keywords and `Part of`/`Refs`), optionally minus one PR. */
function fetchOpenPrLinks(cfg, exceptPr = null) {
  const { owner, name } = splitRepo(cfg);
  const linked = new Set();
  let cursor = null;
  for (;;) {
    const data = graphql(
      `query($owner: String!, $name: String!, $cursor: String) { repository(owner: $owner, name: $name) { pullRequests(states: OPEN, first: 100, after: $cursor) { pageInfo { hasNextPage endCursor } nodes { number body } } } }`,
      { owner, name, cursor },
    );
    const page = data.repository.pullRequests;
    for (const pr of page.nodes) {
      if (pr.number === exceptPr) continue;
      const { closes, refs } = parseIssueRefs(pr.body);
      [...closes, ...refs].forEach((n) => linked.add(n));
    }
    if (!page.pageInfo.hasNextPage) return linked;
    cursor = page.pageInfo.endCursor;
  }
}

function git(args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

const ancestorCache = new Map();
function isOnRelease(sha, cfg) {
  if (!sha) return false;
  if (!ancestorCache.has(sha)) {
    try {
      git(['merge-base', '--is-ancestor', sha, `origin/${cfg.releaseBranch}`]);
      ancestorCache.set(sha, true);
    } catch (error) {
      // Exit 1 is "not an ancestor"; anything else (unknown commit, shallow clone) must not read as "not released".
      if (error.status !== 1) throw new Error(`cannot compare ${sha} with origin/${cfg.releaseBranch}: ${error.stderr || error.message}`);
      ancestorCache.set(sha, false);
    }
  }
  return ancestorCache.get(sha);
}

function releaseTagFor(sha) {
  try {
    return git(['tag', '--contains', sha, '--sort=version:refname']).split('\n').find((t) => /^v\d/.test(t)) ?? null;
  } catch {
    return null;
  }
}

/**
 * Parses `for-each-ref` lines of `<iso date>\t<tag>\t<peeled subject>\t<subject>` into stage
 * releases, newest first. Only `v<digit>` tags whose commit subject is a merge of the stage branch
 * or a squashed "Release v..." count; hotfix tags on the release branch are dropped. An annotated
 * tag carries the commit subject in the peeled field, a lightweight tag in the plain one.
 */
export function parseReleases(lines, stageBranch) {
  const escaped = String(stageBranch ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stageMerge = new RegExp(`^Merge pull request #\\d+ from [^/]+/${escaped}$`);
  return lines
    .map((l) => l.replace(/[\r\n]+$/, ''))
    .filter((l) => l.trim())
    .map((l) => {
      const [at, tag, peeled, plain] = l.split('\t');
      return { at, tag, subject: (peeled || plain || '').trim() };
    })
    .filter((r) => /^v\d/.test(r.tag ?? '') && !Number.isNaN(Date.parse(r.at)))
    .filter((r) => (stageBranch && stageMerge.test(r.subject)) || /^Release v\d/.test(r.subject))
    .map(({ at, tag }) => ({ at, tag }))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/** The oldest release at or after `closedAt`: the one that shipped an issue closed by hand. */
export function releaseTagForClose(releases, closedAt) {
  if (!closedAt) return null;
  const after = releases.filter((r) => Date.parse(r.at) >= Date.parse(closedAt));
  return after[after.length - 1]?.tag ?? null;
}

let releasesCache;
/** v* tags merged into the release branch, newest first. Read once per run; null when git fails. */
function releases(cfg) {
  if (releasesCache === undefined) {
    try {
      releasesCache = parseReleases(git(['for-each-ref', '--merged', `origin/${cfg.releaseBranch}`, '--sort=-creatordate', '--format=%(creatordate:iso-strict)%09%(refname:short)%09%(*subject)%09%(subject)', 'refs/tags/v*']).split('\n'), cfg.stageBranch);
    } catch (error) {
      console.error(`board-sync: cannot list release tags: ${error.stderr || error.message}`);
      releasesCache = null;
    }
  }
  return releasesCache;
}

const releaseFacts = (cfg) => ({ lastReleaseAt: releases(cfg)?.[0]?.at ?? null, releasesUnavailable: releases(cfg) === null });

/** Raw facts -> the `issue` object `decideTransition` takes. */
function toIssue(raw, cfg, { statusOf, openPrLinks }) {
  const closer = raw.closers.find((c) => [cfg.stageBranch, cfg.releaseBranch].includes(c.base));
  return {
    number: raw.number,
    state: raw.state,
    stateReason: raw.stateReason,
    closedAt: raw.closedAt,
    body: raw.body,
    labels: raw.labels,
    status: raw.status,
    children: raw.children.map((c) => ({ state: c.state, status: statusOf(c.number) })),
    hasOpenPr: openPrLinks.has(raw.number),
    closedBy: raw.state === 'closed' && closer
      ? { base: closer.base, merged: true, onRelease: closer.base === cfg.releaseBranch || isOnRelease(closer.sha, cfg), sha: closer.sha }
      : null,
  };
}

function ensureItem(raw, cfg) {
  if (raw.itemId) return raw.itemId;
  const data = graphql(
    'mutation($project: ID!, $content: ID!) { addProjectV2ItemById(input: { projectId: $project, contentId: $content }) { item { id } } }',
    { project: cfg.project.id, content: raw.id },
  );
  raw.itemId = data.addProjectV2ItemById.item.id;
  return raw.itemId;
}

function hasComment(number, marker, cfg) {
  const out = gh(['api', '--paginate', `repos/${cfg.repository}/issues/${number}/comments`, '--jq', '.[].body']);
  return out.includes(marker);
}

/**
 * Whether to write Status for this decision. A closed issue that is off the board and ends Done is old
 * history, so it is not dragged onto the board; an archived card cannot be updated at all.
 */
export function shouldWriteStatus(raw, d) {
  if (!d.status) return false;
  if (raw.itemArchived) return false;
  if (!raw.itemId && raw.state === 'closed' && d.status === 'Done') return false;
  return true;
}

/** Run fn over each item, logging and counting a throw instead of stopping. Returns the error count. */
export function runEach(items, fn, label = (item) => String(item)) {
  let errors = 0;
  for (const item of items) {
    try {
      fn(item);
    } catch (error) {
      errors += 1;
      console.log(`#${label(item)} ERROR ${String(error.stderr || error.message).trim()}`);
    }
  }
  return { errors };
}

function applyDecision(d, raw, cfg, dryRun) {
  const summary = [
    d.status ? `Status ${d.from ?? 'none'} -> ${d.status}` : null,
    d.addLabels.length ? `+${d.addLabels.join(',')}` : null,
    d.removeLabels.length ? `-${d.removeLabels.join(',')}` : null,
    d.comment ? 'comment' : null,
    ...d.flags.map((f) => `FLAG ${f}`),
  ].filter(Boolean).join('; ');
  console.log(`#${d.number} ${dryRun ? '[dry-run] ' : ''}${summary}`);
  if (dryRun) return;

  for (const label of d.addLabels) {
    gh(['api', '-X', 'POST', `repos/${cfg.repository}/issues/${d.number}/labels`, '-f', `labels[]=${label}`]);
  }
  for (const label of d.removeLabels) {
    try {
      gh(['api', '-X', 'DELETE', `repos/${cfg.repository}/issues/${d.number}/labels/${encodeURIComponent(label)}`]);
    } catch (error) {
      if (!/404/.test(String(error.stderr))) throw error;
    }
  }
  if (d.status && raw.itemArchived) {
    console.log(`#${d.number} board card archived; Status left as ${d.from ?? 'none'}`);
  } else if (shouldWriteStatus(raw, d)) {
    graphql(
      'mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) { updateProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $field, value: { singleSelectOptionId: $option } }) { projectV2Item { id } } }',
      { project: cfg.project.id, item: ensureItem(raw, cfg), field: cfg.project.statusFieldId, option: cfg.statusOptions[d.status] },
    );
  }
  if (d.comment && !hasComment(d.number, d.comment.marker, cfg)) {
    gh(['api', '-X', 'POST', `repos/${cfg.repository}/issues/${d.number}/comments`, '-f', `body=${d.comment.body}`]);
  }
}

/** Decide and apply for one issue, then re-derive each ancestor from its children. */
function syncIssue(number, ctxExtra, cfg, dryRun) {
  const raw = fetchRaw([number], cfg).get(number);
  if (!raw) return;
  const childRaw = fetchRaw(raw.children.map((c) => c.number), cfg);
  const openPrLinks = ctxExtra.openPrLinks ?? fetchOpenPrLinks(cfg);
  const issue = toIssue(raw, cfg, { statusOf: (n) => childRaw.get(n)?.status ?? null, openPrLinks });
  const ctx = { ...ctxExtra, issue, ...releaseFacts(cfg) };
  if (ctx.trigger === 'release') ctx.releaseTag = issue.closedBy?.sha ? releaseTagFor(issue.closedBy.sha) : releaseTagForClose(releases(cfg) ?? [], issue.closedAt);
  const decision = decideTransition(ctx, cfg);
  if (isChange(decision) || decision.flags.length) applyDecision(decision, raw, cfg, dryRun);
  if (raw.parent && isChange(decision) && !dryRun) syncIssue(raw.parent, { trigger: 'child-changed', openPrLinks }, cfg, dryRun);
}

function eventJobs(name, payload, cfg) {
  const action = payload.action;
  if (name === 'issues') {
    const trigger = {
      opened: 'issue-opened', labeled: 'issue-labeled', unlabeled: 'issue-labeled', reopened: 'issue-reopened', closed: 'issue-closed',
    }[action];
    return trigger ? [{ number: payload.issue.number, ctx: { trigger, label: payload.label?.name } }] : [];
  }
  if (name === 'pull_request_target' || name === 'pull_request') {
    const pr = payload.pull_request;
    const kind = action === 'closed' ? (pr.merged ? 'merged' : 'closed-unmerged')
      : ['opened', 'reopened', 'ready_for_review'].includes(action) ? 'opened' : null;
    if (!kind) return [];
    const { closes, refs } = parseIssueRefs(pr.body);
    const numbers = kind === 'merged' ? closes : [...new Set([...closes, ...refs])];
    const openPrLinks = fetchOpenPrLinks(cfg, kind === 'opened' ? null : pr.number);
    const ctx = { trigger: { opened: 'pr-opened', merged: 'pr-merged', 'closed-unmerged': 'pr-closed-unmerged' }[kind], openPrLinks };
    if (kind === 'merged') ctx.pr = { base: pr.base.ref, merged: true, onRelease: false };
    return numbers.map((number) => ({ number, ctx }));
  }
  if (name === 'create' && payload.ref_type === 'branch') {
    const match = new RegExp(cfg.branchPattern).exec(payload.ref);
    return match ? [{ number: Number(match[1]), ctx: { trigger: 'branch-created' } }] : [];
  }
  if (name === 'workflow_run') {
    const { owner, name: repo } = splitRepo(cfg);
    const data = graphql(
      'query($owner: String!, $name: String!, $label: String!) { repository(owner: $owner, name: $name) { issues(states: CLOSED, labels: [$label], first: 100) { nodes { number } } } }',
      { owner, name: repo, label: cfg.labels.onStage },
    );
    return data.repository.issues.nodes.map((n) => ({ number: n.number, ctx: { trigger: 'release' } }));
  }
  return [];
}

function runEvent(cfg, dryRun) {
  const name = process.env.GITHUB_EVENT_NAME;
  const payload = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  if (name === 'workflow_run') git(['fetch', '--quiet', 'origin', cfg.releaseBranch, '--tags']);
  const jobs = eventJobs(name, payload, cfg);
  if (!jobs.length) console.log(`board-sync: nothing to do for ${name}/${payload.action ?? payload.ref_type ?? ''}`);
  const { errors } = runEach(jobs, (job) => syncIssue(job.number, job.ctx, cfg, dryRun), (job) => job.number);
  if (errors) {
    console.error(`board-sync: ${errors} issue(s) failed`);
    process.exitCode = 1;
  }
}

function runReconcile(cfg, { dryRun, apply, report }) {
  const effectiveDryRun = dryRun || !(cfg.reconcile.apply || apply);
  if (effectiveDryRun && !dryRun) console.log('board-sync: reconcile.apply is false; running as a dry run.');
  const all = fetchAllRaw(cfg);
  const openPrLinks = fetchOpenPrLinks(cfg);

  const visiting = new Set();
  const statusOf = (n) => {
    const raw = all.get(n);
    if (!raw) return null;
    return desiredFor(n)?.status ?? raw.status;
  };
  const decisions = new Map();
  function desiredFor(n) {
    if (decisions.has(n)) return decisions.get(n);
    if (visiting.has(n)) return null;
    visiting.add(n);
    const raw = all.get(n);
    const issue = toIssue(raw, cfg, { statusOf, openPrLinks });
    const ctx = { trigger: 'reconcile', issue, ...releaseFacts(cfg) };
    if (issue.closedBy?.sha && issue.closedBy.onRelease) ctx.releaseTag = releaseTagFor(issue.closedBy.sha);
    else if (!issue.closedBy) ctx.releaseTag = releaseTagForClose(releases(cfg) ?? [], issue.closedAt);
    const d = decideTransition(ctx, cfg);
    visiting.delete(n);
    decisions.set(n, d);
    return d;
  }

  const lines = [];
  let changed = 0;
  let notOnBoard = 0;
  const { errors } = runEach([...all.keys()].sort((a, b) => a - b), (n) => {
    const d = desiredFor(n);
    if (!all.get(n).itemId) notOnBoard += 1;
    if (!isChange(d) && !d.flags.length) return;
    if (isChange(d)) changed += 1;
    applyDecision(d, all.get(n), cfg, effectiveDryRun);
    lines.push(`| #${n} | ${d.from ?? '-'} | ${d.status ?? '-'} | ${d.addLabels.join(', ') || '-'} | ${d.removeLabels.join(', ') || '-'} | ${d.comment ? 'yes' : '-'} | ${d.flags.join('; ') || '-'} |`);
  });
  const text = [
    `# board-sync reconcile (${effectiveDryRun ? 'dry run' : 'applied'})`,
    '',
    `${all.size} issues read, ${changed} would change, ${notOnBoard} not on the board, ${errors} errors.`,
    '',
    '| Issue | From | To | Add labels | Remove labels | Comment | Flags |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...lines,
    '',
  ].join('\n');
  if (report) writeFileSync(report, text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  if (errors) {
    console.error(`board-sync: ${errors} issue(s) failed`);
    process.exitCode = 1;
  }
}

function main() {
  const argv = process.argv.slice(2);
  const cfg = loadConfig();
  const dryRun = argv.includes('--dry-run');
  if (argv.includes('--event')) return runEvent(cfg, dryRun);
  if (argv.includes('--reconcile')) {
    const at = argv.indexOf('--report');
    return runReconcile(cfg, { dryRun, apply: argv.includes('--apply'), report: at >= 0 ? argv[at + 1] : null });
  }
  console.error('usage: board-sync.mjs --event | --reconcile [--dry-run] [--apply] [--report <file>]');
  process.exit(2);
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  try {
    main();
  } catch (error) {
    console.error(`board-sync failed: ${error.stderr || error.message}`);
    process.exit(1);
  }
}
