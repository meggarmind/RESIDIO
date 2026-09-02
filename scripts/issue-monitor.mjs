import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig, WorkflowError, statusName } from './issue-workflow.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(SCRIPT_DIR, '..', '.github', 'issue-workflow.json');
const WINDOWS = process.platform === 'win32';
export const DEFAULT_MONITOR_MARKER = '<!-- issue-workflow-monitor -->';

function binary(command) {
  return WINDOWS && command === 'npm' ? 'npm.cmd' : command;
}

function run(command, args, cwd = process.cwd()) {
  try {
    return execFileSync(binary(command), args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    }).trim();
  } catch (error) {
    const details = [error.stderr, error.stdout].filter(Boolean).join('\n').trim();
    throw new WorkflowError(`${command} ${args.join(' ')} failed${details ? `: ${details}` : ''}`);
  }
}

function runJson(command, args, cwd) {
  const output = run(command, args, cwd);
  try {
    return JSON.parse(output);
  } catch (error) {
    throw new WorkflowError(`Expected JSON from ${command} ${args.join(' ')}: ${error.message}`);
  }
}

function gh(config, args, cwd) {
  return run('gh', ['--repo', config.repository, ...args], cwd);
}

function ghJson(config, args, cwd) {
  return JSON.parse(gh(config, args, cwd));
}

function issueList(config, cwd) {
  return ghJson(config, ['issue', 'list', '--state', 'all', '--limit', '1000', '--json', 'number,title,state,url,closedAt,updatedAt,labels'], cwd);
}

function issueView(config, issueNumber, cwd) {
  return ghJson(config, [
    'issue', 'view', String(issueNumber), '--comments',
    '--json', 'number,title,state,url,closedAt,updatedAt,labels,comments,body,closedByPullRequestsReferences',
  ], cwd);
}

// The board is shared across repositories, so issue numbers collide: a card for
// another repo's #13 must never be read as this repo's #13. Every consumer of
// the item list depends on that, because findings are written back with
// `gh issue edit`/`gh issue comment` against this repository.
export function belongsToRepository(item, repository) {
  const url = String(item?.content?.url ?? item?.url ?? '');
  if (!url) return false;
  return new RegExp(`^https://github\\.com/${repository}/(issues|pull)/\\d+$`).test(url);
}

function projectItems(config, cwd) {
  const result = runJson('gh', ['project', 'item-list', String(config.project.number), '--owner', config.project.owner, '--format', 'json', '--limit', '1000'], cwd);
  const items = result.items ?? result;
  return items.filter((item) => belongsToRepository(item, config.repository));
}

function projectFields(config, cwd) {
  const result = runJson('gh', ['project', 'field-list', String(config.project.number), '--owner', config.project.owner, '--format', 'json'], cwd);
  return result.fields ?? result;
}

function projectDetails(config, cwd) {
  return runJson('gh', ['project', 'view', String(config.project.number), '--owner', config.project.owner, '--format', 'json'], cwd);
}

function branches(config, cwd) {
  const output = run('gh', ['api', `repos/${config.repository}/branches?per_page=100`], cwd);
  return JSON.parse(output).map((branch) => branch.name);
}

function branchCommit(config, branch, cwd) {
  try {
    const result = runJson('gh', ['api', `repos/${config.repository}/commits?sha=${encodeURIComponent(branch)}&per_page=1`], cwd);
    const commit = result[0];
    if (!commit) return null;
    return {
      branch,
      sha: commit.sha,
      timestamp: commit.commit?.committer?.date ?? commit.commit?.author?.date ?? null,
      url: commit.html_url ?? null,
    };
  } catch {
    return null;
  }
}

function pullRequests(config, cwd) {
  return ghJson(config, ['pr', 'list', '--state', 'all', '--limit', '1000', '--json', 'number,title,state,headRefName,updatedAt,mergedAt,closedAt,url'], cwd);
}

function timeline(config, issueNumber, cwd) {
  try {
    return runJson('gh', ['api', `repos/${config.repository}/issues/${issueNumber}/timeline?per_page=100`], cwd);
  } catch {
    return [];
  }
}

function labels(issue) {
  return new Set((issue.labels ?? []).map((label) => typeof label === 'string' ? label : label.name));
}

export function isMonitorComment(comment, marker = DEFAULT_MONITOR_MARKER) {
  return String(comment?.body ?? '').includes(marker);
}

export function branchPattern(config, issueNumber) {
  return new RegExp(`^${String(config.branchPrefix ?? 'codex/issue-').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${issueNumber}-`);
}

export function matchingBranches(config, issueNumber, branchNames) {
  return branchNames.filter((branch) => branchPattern(config, issueNumber).test(branch));
}

function dateValue(value) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function lifecycleEvents(issue, timelineEvents = []) {
  const supplied = [...(issue.lifecycleTransitions ?? []), ...timelineEvents];
  return supplied
    .filter((event) => ['closed', 'reopened', 'opened', 'cross-referenced', 'connected', 'disconnected', 'project_v2_item'].includes(event.event ?? event.type ?? ''))
    .map((event) => ({
      timestamp: event.createdAt ?? event.created_at ?? event.timestamp,
      source: event.url ?? event.html_url ?? 'GitHub lifecycle event',
    }));
}

export function qualifyingActivity(issue, options = {}) {
  const marker = options.marker ?? DEFAULT_MONITOR_MARKER;
  const activities = [];
  for (const comment of issue.comments ?? []) {
    if (isMonitorComment(comment, marker)) continue;
    const timestamp = comment.createdAt ?? comment.created_at;
    if (dateValue(timestamp)) activities.push({ timestamp, source: 'issue comment' });
  }
  for (const event of lifecycleEvents(issue, options.timeline ?? [])) {
    if (dateValue(event.timestamp)) activities.push({ timestamp: event.timestamp, source: event.source });
  }
  for (const commit of options.commits ?? []) {
    if (dateValue(commit.timestamp)) activities.push({ timestamp: commit.timestamp, source: `commit ${commit.sha?.slice(0, 7) ?? 'unknown'} on ${commit.branch}` });
  }
  for (const pullRequest of options.pullRequests ?? []) {
    const timestamp = pullRequest.updatedAt ?? pullRequest.mergedAt ?? pullRequest.closedAt;
    if (dateValue(timestamp)) activities.push({ timestamp, source: `PR #${pullRequest.number}` });
  }
  activities.sort((left, right) => dateValue(right.timestamp) - dateValue(left.timestamp));
  return activities[0] ?? null;
}

export function hoursSince(timestamp, now = new Date()) {
  if (!timestamp) return Infinity;
  return Math.max(0, (new Date(now).getTime() - dateValue(timestamp)) / 3_600_000);
}

function issueItem(items, issueNumber) {
  return items.find((item) => Number(item.content?.number ?? item.number) === Number(issueNumber)) ?? null;
}

function integrationEvidence(issue, pullRequestsForIssue, marker = DEFAULT_MONITOR_MARKER) {
  const lifecycle = (issue.comments ?? []).some((comment) => {
    const body = String(comment.body ?? '');
    return !isMonitorComment(comment, marker) && body.includes('Integration: merged into');
  });
  return lifecycle || pullRequestsForIssue.some((pullRequest) => Boolean(pullRequest.mergedAt) || pullRequest.state === 'MERGED');
}

export function detectFindings({ issue, status, config, branchNames = /** @type {string[]} */ ([]), commits = [], pullRequests: allPullRequests = [], timeline: timelineEvents = [], worktrees = [], now = new Date() }) {
  const monitor = config.monitor ?? {};
  const marker = monitor.commentMarker ?? DEFAULT_MONITOR_MARKER;
  const issueLabels = labels(issue);
  const issueBranches = matchingBranches(config, issue.number, branchNames);
  const linkedNumbers = new Set((issue.closedByPullRequestsReferences ?? []).map((pullRequest) => Number(pullRequest.number)));
  const issuePullRequests = allPullRequests.filter((pullRequest) => issueBranches.includes(pullRequest.headRefName) || linkedNumbers.has(Number(pullRequest.number)));
  const issueCommits = commits.filter((commit) => issueBranches.includes(commit.branch));
  const activity = qualifyingActivity(issue, { marker, timeline: timelineEvents, commits: issueCommits, pullRequests: issuePullRequests });
  const executionEvidence = issueBranches.length > 0 || issuePullRequests.some((pullRequest) => pullRequest.state === 'OPEN' || pullRequest.state === 'MERGED') || worktrees.some((worktree) => worktree.issueNumber === Number(issue.number));
  const stale = ['In progress', 'In review'].includes(status) && hoursSince(activity?.timestamp, now) >= Number(monitor.staleAfterHours ?? 24);
  const findings = [];
  if (stale) findings.push({ condition: 'stale-active', kind: 'stale', recommendation: 'Confirm the agent is still working, resume the issue, or add workflow:paused.' });
  if (status === 'In progress' && !executionEvidence) findings.push({ condition: 'in-progress-missing-evidence', kind: 'inconsistent', recommendation: 'Start the issue workflow or reconcile the missing branch, worktree, or PR evidence.' });
  if (status === 'In review' && issueBranches.length === 0 && issuePullRequests.length === 0) findings.push({ condition: 'in-review-missing-evidence', kind: 'inconsistent', recommendation: 'Restore the issue branch or link the pull request before continuing review.' });
  if (issue.state === 'CLOSED' && status !== 'Done') findings.push({ condition: 'closed-not-done', kind: 'inconsistent', recommendation: 'Reconcile the closed issue and Project status with the project owner.' });
  if (status === 'Done' && issue.state === 'OPEN') findings.push({ condition: 'done-still-open', kind: 'inconsistent', recommendation: 'Close the issue only after confirming the integration evidence.' });
  if (status === 'Done' && !integrationEvidence(issue, issuePullRequests, marker)) findings.push({ condition: 'done-no-integration', kind: 'inconsistent', recommendation: 'Verify the merge or add durable integration evidence before accepting Done.' });
  const suppressed = issueLabels.has(monitor.pausedLabel ?? 'workflow:paused');
  return {
    issue: Number(issue.number),
    title: issue.title,
    status,
    state: issue.state,
    lastActivity: activity?.timestamp ?? null,
    evidence: activity?.source ?? 'none',
    ageHours: activity ? hoursSince(activity.timestamp, now) : null,
    branches: issueBranches,
    pullRequests: issuePullRequests.map((pullRequest) => pullRequest.number),
    findings: suppressed ? [] : findings,
    suppressed: suppressed && findings.length > 0,
    suppressedConditions: suppressed ? findings.map((finding) => finding.condition) : [],
  };
}

export function recentAlertComment(issue, condition, config, now = new Date()) {
  const marker = config.monitor?.commentMarker ?? DEFAULT_MONITOR_MARKER;
  const cooldown = Number(config.monitor?.alertCooldownHours ?? 24);
  return (issue.comments ?? []).some((comment) => {
    const body = String(comment.body ?? '');
    if (!body.includes(marker) || !body.includes(`condition=${condition}`)) return false;
    return hoursSince(comment.createdAt ?? comment.created_at, now) < cooldown;
  });
}

export function monitorComment(config, finding, workflowUrl, now = new Date()) {
  const marker = config.monitor?.commentMarker ?? DEFAULT_MONITOR_MARKER;
  return [
    marker,
    `condition=${finding.condition}`,
    `Issue #${finding.issue} requires attention: ${finding.recommendation}`,
    `Detected at: ${new Date(now).toISOString()}`,
    `Last qualifying activity: ${finding.lastActivity ?? 'none'}`,
    `Evidence: ${finding.evidence}`,
    `Project status: ${finding.status}`,
    `Workflow run: ${workflowUrl}`,
  ].join('\n');
}

export function alertActions(result, dryRun = false) {
  if (dryRun || result.suppressed) return [];
  return result.findings.map((finding) => ({ issue: result.issue, condition: finding.condition }));
}

function workflowRunUrl() {
  if (process.env.GITHUB_RUN_ID && process.env.GITHUB_REPOSITORY) {
    return `${process.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  }
  return 'local monitor run';
}

function validate(config, cwd) {
  if (config.monitor?.enabled !== true) throw new WorkflowError('Issue monitor is disabled in .github/issue-workflow.json.');
  const project = projectDetails(config, cwd);
  if (!project.id) throw new WorkflowError('Project response did not include a node ID. Check gh authentication and project scope.');
  const status = projectFields(config, cwd).find((field) => field.name === config.statusField);
  if (!status) throw new WorkflowError(`Project ${config.project.number} has no "${config.statusField}" field.`);
  for (const key of ['inProgress', 'inReview', 'done']) {
    if (!(status.options ?? []).some((option) => option.name === config.statuses[key])) throw new WorkflowError(`Project Status is missing "${config.statuses[key]}".`);
  }
  return { project, status };
}

function writeFinding(config, cwd, issue, result, finding, now) {
  if (recentAlertComment(issue, finding.condition, config, now)) return 'cooldown';
  run('gh', ['issue', 'edit', String(issue.number), '--add-label', config.monitor.attentionLabel], cwd);
  run('gh', ['issue', 'comment', String(issue.number), '--body', monitorComment(config, { ...result, ...finding }, workflowRunUrl(), now)], cwd);
  return 'flagged';
}

function formatReport(results, failures = []) {
  const lines = ['Issue monitor report', '====================', ''];
  const counts = { healthy: 0, stale: 0, inconsistent: 0, suppressed: 0, failures: failures.length };
  for (const result of results) {
    if (result.suppressed) counts.suppressed += result.suppressedConditions.length;
    if (result.findings.length === 0) counts.healthy += 1;
    for (const finding of result.findings) counts[finding.kind] += 1;
    const findings = result.findings.map((finding) => finding.condition).join(', ') || (result.suppressed ? `suppressed: ${result.suppressedConditions.join(', ')}` : 'healthy');
    lines.push(`#${result.issue} [${result.status}] ${findings}; last activity=${result.lastActivity ?? 'none'}; age=${result.ageHours == null ? 'unknown' : `${result.ageHours.toFixed(1)}h`}; evidence=${result.evidence}`);
  }
  lines.push('', `Summary: healthy=${counts.healthy} stale=${counts.stale} inconsistent=${counts.inconsistent} suppressed=${counts.suppressed} failures=${counts.failures}`);
  if (failures.length) lines.push(...failures.map((failure) => `FAILURE: ${failure}`));
  return lines.join('\n');
}

export function parseArgs(args) {
  const result = { dryRun: false, issue: null };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--dry-run') result.dryRun = true;
    else if (args[index] === '--issue') {
      result.issue = args[index + 1];
      index += 1;
      if (!/^\d+$/.test(String(result.issue))) throw new WorkflowError('--issue requires a numeric issue number.');
    } else throw new WorkflowError(`Unknown option "${args[index]}". Use --dry-run or --issue <number>.`);
  }
  return result;
}

export function runMonitor(config, cwd = process.cwd(), options = {}) {
  const now = options.now ?? new Date();
  validate(config, cwd);
  const items = projectItems(config, cwd);
  const itemNumbers = new Set(items.map((item) => Number(item.content?.number ?? item.number)).filter(Boolean));
  const issueSummaries = issueList(config, cwd).filter((issue) => !options.issue || Number(issue.number) === Number(options.issue));
  if (options.issue && !issueSummaries.some((issue) => Number(issue.number) === Number(options.issue))) {
    throw new WorkflowError(`Issue #${options.issue} was not found in the repository.`);
  }
  const allBranches = branches(config, cwd);
  const pullRequestsForRepo = pullRequests(config, cwd);
  const results = [];
  const failures = [];
  for (const summary of issueSummaries) {
    if (!itemNumbers.has(Number(summary.number))) continue;
    try {
      const issue = issueView(config, summary.number, cwd);
      const item = issueItem(items, summary.number);
      const status = statusName(item, config.statusField);
      if (!status) throw new WorkflowError(`Issue #${summary.number} has no Project status.`);
      const issueBranches = matchingBranches(config, summary.number, allBranches);
      const commits = issueBranches.map((branch) => branchCommit(config, branch, cwd)).filter(Boolean);
      const result = detectFindings({ issue, status, config, branchNames: allBranches, commits, pullRequests: pullRequestsForRepo, timeline: timeline(config, summary.number, cwd), now });
      results.push(result);
      if (alertActions(result, options.dryRun).length > 0) {
        for (const finding of result.findings) writeFinding(config, cwd, issue, result, finding, now);
      }
    } catch (error) {
      failures.push(`#${summary.number}: ${error.message}`);
    }
  }
  if (options.issue && !itemNumbers.has(Number(options.issue))) failures.push(`#${options.issue}: issue is not in Project ${config.project.number}.`);
  return { results, failures, report: formatReport(results, failures) };
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const config = loadConfig(CONFIG_PATH);
    const result = runMonitor(config, resolve(SCRIPT_DIR, '..'), options);
    console.log(result.report);
    if (result.failures.length) process.exitCode = 1;
  } catch (error) {
    console.error(`\nIssue monitor stopped: ${error.message}`);
    process.exitCode = 1;
  }
}
