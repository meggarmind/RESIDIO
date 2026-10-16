import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(SCRIPT_DIR, '..', '.github', 'issue-workflow.json');
const WINDOWS = process.platform === 'win32';

export class WorkflowError extends Error {}

export const LIFECYCLE_COMMENT_MARKER = '<!-- issue-workflow-lifecycle -->';

export function loadConfig(configPath = CONFIG_PATH) {
  try {
    return JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (error) {
    throw new WorkflowError(`Unable to read issue workflow configuration at ${configPath}: ${error.message}`);
  }
}

function binary(command) {
  return WINDOWS && command === 'npm' ? 'npm.cmd' : command;
}

export function commandInvocation(command, args, windows = WINDOWS) {
  if (windows && command === 'npm') {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', ['npm.cmd', ...args].join(' ')],
    };
  }

  return { command: binary(command), args };
}

// Node's execFileSync defaults to a 1 MiB buffer and throws ENOBUFS beyond it.
// `gh project item-list` for the board is ~1.1 MB of JSON, so the default made
// `start` fail. 64 MiB leaves ample headroom.
export const MAX_BUFFER_BYTES = 64 * 1024 * 1024;

// Failure output is truncated per stream, keeping the tail of each, so a failing
// command can never dump megabytes into the terminal and a huge stdout cannot
// push the (usually short, more useful) stderr out of the message.
export const MAX_STDERR_CHARS = 1500;
export const MAX_STDOUT_CHARS = 500;

function tailOf(text, cap, stream) {
  if (!text || text.length <= cap) return text;
  return `...(truncated, last ${cap} characters of ${stream})\n${text.slice(-cap)}`;
}

export function run(command, args, cwd, options = {}) {
  const maxBuffer = options.maxBuffer ?? MAX_BUFFER_BYTES;
  try {
    return execFileSync(binary(command), args, {
      cwd,
      encoding: 'utf8',
      stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      maxBuffer,
    }).trim();
  } catch (error) {
    if (error.code === 'ENOBUFS' || /maxBuffer/i.test(error.message ?? '')) {
      throw new WorkflowError(`${command} ${args.join(' ')} failed: output exceeded the ${maxBuffer} byte buffer limit`);
    }
    const details = [tailOf(error.stderr, MAX_STDERR_CHARS, 'stderr'), tailOf(error.stdout, MAX_STDOUT_CHARS, 'stdout')]
      .filter(Boolean)
      .join('\n')
      .trim();
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

function runVisible(command, args, cwd) {
  try {
    const invocation = commandInvocation(command, args);
    execFileSync(invocation.command, invocation.args, {
      cwd,
      stdio: 'inherit',
      windowsHide: true,
    });
  } catch (error) {
    throw new WorkflowError(`${command} ${args.join(' ')} failed with exit code ${error.status ?? 'unknown'}`);
  }
}

function runShell(command, cwd) {
  if (WINDOWS) {
    runVisible('cmd.exe', ['/d', '/s', '/c', command], cwd);
  } else {
    runVisible('sh', ['-lc', command], cwd);
  }
}

function repoRoot(cwd = process.cwd()) {
  return resolve(run('git', ['rev-parse', '--show-toplevel'], cwd));
}

function commonRoot(cwd) {
  const commonDir = run('git', ['rev-parse', '--git-common-dir'], cwd);
  const absoluteCommonDir = resolve(cwd, commonDir);
  return dirname(absoluteCommonDir);
}

export function slugify(title) {
  return title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'task';
}

export function parseWorktrees(output) {
  const entries = [];
  let entry = null;

  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith('worktree ')) {
      if (entry) entries.push(entry);
      entry = { path: line.slice('worktree '.length) };
    } else if (entry && line.startsWith('branch ')) {
      entry.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
    } else if (entry && line === 'bare') {
      entry.bare = true;
    }
  }

  if (entry) entries.push(entry);
  return entries;
}

// Git reports worktree paths with forward slashes even on Windows, while
// `resolve()` returns backslashes there. Unify separators before and after
// resolving so the comparison does not depend on which platform is running --
// `resolve()` alone treats a backslash as an ordinary character on POSIX.
function normalizeComparablePath(value) {
  const toSlashes = (input) => input.split('\\').join('/');
  const trimmed = toSlashes(resolve(toSlashes(String(value)))).replace(/(?!^)\/+$/, '');
  // Windows drive letters are case-insensitive; the rest of the path is not.
  return trimmed.replace(/^([a-zA-Z]):\//, (_match, drive) => `${drive.toUpperCase()}:/`);
}

export function pathsMatch(left, right) {
  return normalizeComparablePath(left) === normalizeComparablePath(right);
}

function worktrees(cwd) {
  return parseWorktrees(run('git', ['worktree', 'list', '--porcelain'], cwd));
}

function defaultWorktree(cwd, config) {
  const root = commonRoot(cwd);
  const match = worktrees(cwd).find((item) => item.branch === config.defaultBranch);
  return match?.path ?? root;
}

// Branch prefixes name the lane that created the work (see CORE.md "Branching
// and isolation"), and the remote branch list is the live coordination registry
// -- so a Claude session must not create `codex/...` branches just because it
// used this helper. The lane is a *creation-time* choice only: the worktree path
// is lane-independent, so any lane can resume work another lane started.
export function lanePrefixes(config) {
  const configured = config.branchPrefixes ?? {};
  const fallback = config.branchPrefix ?? 'codex/issue-';
  return Object.keys(configured).length ? configured : { default: fallback };
}

export function resolveLanePrefix(config, lane) {
  const prefixes = lanePrefixes(config);
  const requested = lane ?? process.env.ISSUE_WORKFLOW_LANE ?? config.defaultLane;
  if (!requested) return config.branchPrefix ?? Object.values(prefixes)[0];
  const prefix = prefixes[requested];
  if (!prefix) {
    throw new WorkflowError(
      `Unknown lane "${requested}". Configured lanes: ${Object.keys(prefixes).join(', ')}.`
    );
  }
  return prefix;
}

// True when `branch` is this issue's branch under *some* configured lane. Used
// to adopt an existing worktree's branch rather than insisting it match the
// prefix the current session happens to be running under.
export function isIssueBranch(config, issueNumber, branch) {
  if (!branch) return false;
  return Object.values(lanePrefixes(config))
    .some((prefix) => branch.startsWith(`${prefix}${issueNumber}-`));
}

function issueWorktree(cwd, config, issue, lane) {
  const root = commonRoot(cwd);
  const branch = `${resolveLanePrefix(config, lane)}${issue.number}-${slugify(issue.title)}`;
  const path = resolve(root, config.worktreeDirectory, `issue-${issue.number}`);
  return { branch, path };
}

function issueDetails(config, cwd, issueNumber) {
  if (!/^\d+$/.test(String(issueNumber))) {
    throw new WorkflowError(`Issue number must be numeric; received "${issueNumber}".`);
  }

  const issue = runJson('gh', [
    'issue', 'view', String(issueNumber),
    '--repo', config.repository,
    '--json', 'number,title,state,url',
  ], cwd);

  if (!issue.number || !issue.title || !issue.state) {
    throw new WorkflowError(`Issue #${issueNumber} returned incomplete issue data.`);
  }

  return issue;
}

export function lifecycleComment(config, issue, transition, details = {}) {
  const marker = config.lifecycleCommentMarker ?? LIFECYCLE_COMMENT_MARKER;
  const lines = [
    marker,
    `Issue #${issue.number} lifecycle transition: ${transition}`,
    `Timestamp: ${details.timestamp ?? new Date().toISOString()}`,
    `Branch: ${details.branch ?? 'not-applicable'}`,
    `Worktree: ${details.worktree ?? 'not-applicable'}`,
    `Verification: ${details.verification ?? 'not-run'}`,
    `Integration: ${details.integration ?? 'not-applicable'}`,
  ];
  return lines.join('\n');
}

function commentIssue(config, cwd, issue, body) {
  run('gh', [
    'issue', 'comment', String(issue.number),
    '--repo', config.repository,
    '--body', body,
  ], cwd);
}

function projectDetails(config, cwd) {
  const project = runJson('gh', [
    'project', 'view', String(config.project.number),
    '--owner', config.project.owner,
    '--format', 'json',
  ], cwd);

  if (!project.id) {
    throw new WorkflowError('Project response did not include a node ID. Ensure gh is authenticated with the project scope.');
  }

  return project;
}

function projectFields(config, cwd) {
  const result = runJson('gh', [
    'project', 'field-list', String(config.project.number),
    '--owner', config.project.owner,
    '--format', 'json',
  ], cwd);

  const fields = result.fields ?? result;
  const status = fields.find((field) => field.name === config.statusField);
  if (!status) {
    throw new WorkflowError(`Project ${config.project.number} has no "${config.statusField}" field.`);
  }

  return status;
}

function projectItems(config, cwd) {
  const result = runJson('gh', [
    'project', 'item-list', String(config.project.number),
    '--owner', config.project.owner,
    '--format', 'json',
    '--limit', '1000',
  ], cwd);
  return result.items ?? result;
}

function projectItem(config, cwd, issueNumber) {
  const item = projectItems(config, cwd).find((candidate) => Number(candidate.content?.number) === Number(issueNumber));
  if (!item) {
    throw new WorkflowError(`Issue #${issueNumber} is not in Project ${config.project.number}. Wait for the add-to-project workflow, then retry.`);
  }
  return item;
}

export function findStatusOption(field, statusName) {
  const option = (field.options ?? []).find((candidate) => candidate.name === statusName);
  if (!option) {
    const available = (field.options ?? []).map((candidate) => candidate.name).join(', ') || 'none';
    throw new WorkflowError(`Project Status is missing "${statusName}". Available options: ${available}.`);
  }
  return option;
}

function statusOption(config, key, field) {
  const statusName = config.statuses[key];
  if (!statusName) throw new WorkflowError(`Unknown configured status key "${key}".`);
  return findStatusOption(field, statusName);
}

function setStatus(config, cwd, issueNumber, key) {
  const project = projectDetails(config, cwd);
  const field = projectFields(config, cwd);
  const item = projectItem(config, cwd, issueNumber);
  const option = statusOption(config, key, field);

  run('gh', [
    'project', 'item-edit',
    '--id', item.id,
    '--project-id', project.id,
    '--field-id', field.id,
    '--single-select-option-id', option.id,
  ], cwd);
}

export function statusName(item, statusField = 'Status') {
  if (typeof item.status === 'string') return item.status;
  if (item.status?.name) return item.status.name;
  return item.fields?.find((field) => field.name === statusField)?.value ?? null;
}

function currentStatus(config, cwd, issueNumber) {
  const item = projectItem(config, cwd, issueNumber);
  return statusName(item, config.statusField);
}

function matchingWorktree(cwd, config, issue, lane) {
  const expected = issueWorktree(cwd, config, issue, lane);
  const listed = worktrees(cwd).find((item) => pathsMatch(item.path, expected.path)
    || item.branch === expected.branch
    || isIssueBranch(config, issue.number, item.branch));
  if (listed && !pathsMatch(listed.path, expected.path)) {
    throw new WorkflowError(`Issue #${issue.number} already uses branch ${listed.branch} at ${listed.path}, not ${expected.path}.`);
  }

  // Adopt the existing worktree's own branch. Without this, an issue started in
  // one lane could not be resumed, reviewed or finished from another -- the
  // ensureBranch check below would reject it for carrying the "wrong" prefix.
  if (listed?.branch && listed.branch !== expected.branch) {
    if (!isIssueBranch(config, issue.number, listed.branch)) {
      throw new WorkflowError(
        `${listed.path} is on ${listed.branch}, which is not a branch for issue #${issue.number} `
        + `under any configured lane (${Object.keys(lanePrefixes(config)).join(', ')}).`
      );
    }
    return { ...expected, branch: listed.branch, listed };
  }

  return { ...expected, listed };
}

function ensureClean(cwd, label) {
  const status = run('git', ['status', '--porcelain'], cwd);
  if (status) throw new WorkflowError(`${label} is dirty. Commit or stash changes before continuing.`);
}

function ensureBranch(cwd, expectedBranch, label) {
  const branch = run('git', ['branch', '--show-current'], cwd);
  if (branch !== expectedBranch) {
    throw new WorkflowError(`${label} is on ${branch || 'detached HEAD'}, expected ${expectedBranch}.`);
  }
}

function createOrReuseWorktree(cwd, config, issue, lane) {
  const target = matchingWorktree(cwd, config, issue, lane);
  if (target.listed) {
    ensureBranch(target.path, target.branch, `Issue #${issue.number} worktree`);
    return target;
  }

  if (existsSync(target.path)) {
    throw new WorkflowError(`${target.path} exists but is not a registered Git worktree.`);
  }

  const root = commonRoot(cwd);
  const defaultPath = defaultWorktree(cwd, config);
  // Fetch first so we branch from the current remote state, not a stale local master.
  run('git', ['fetch', 'origin', config.defaultBranch], defaultPath);
  run('git', ['worktree', 'add', target.path, '-b', target.branch, `origin/${config.defaultBranch}`], defaultPath);
  return { ...target, root };
}

// Pull `--lane <name>` out before checksFromArgs sees it -- that function
// rejects every option except --check, by design.
export function laneFromArgs(args) {
  const rest = [];
  let lane;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== '--lane') { rest.push(args[index]); continue; }
    lane = args[index + 1];
    if (!lane || lane.startsWith('--')) throw new WorkflowError('--lane requires a lane name.');
    index += 1;
  }
  return { lane, rest };
}

function checksFromArgs(args) {
  const checks = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== '--check') throw new WorkflowError(`Unknown option "${args[index]}". Use --check "command" for an issue-specific check.`);
    const command = args[index + 1];
    if (!command) throw new WorkflowError('--check requires a command string.');
    checks.push(command);
    index += 1;
  }
  return checks;
}

function loadEnvFile(cwd) {
  const candidates = [
    resolve(cwd, '.env.local'),
    resolve(commonRoot(cwd), '.env.local'),
    resolve(commonRoot(cwd), '.env'),
  ];
  for (const envPath of candidates) {
    if (!existsSync(envPath)) continue;
    try {
      const content = readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (!(key in process.env)) process.env[key] = value;
      }
      console.log(`Loaded env from ${envPath}`);
      break;
    } catch {}
  }
}

function runChecks(config, cwd, extraChecks) {
  loadEnvFile(cwd);
  for (const check of config.checks) {
    console.log(`\n==> ${check.label}`);
    runVisible(check.command, check.args ?? [], cwd);
  }
  for (const command of extraChecks) {
    console.log(`\n==> ${command}`);
    runShell(command, cwd);
  }
}

function start(config, cwd, issueNumber, lane) {
  const issue = issueDetails(config, cwd, issueNumber);
  if (issue.state !== 'OPEN') throw new WorkflowError(`Issue #${issue.number} is ${issue.state}; only open issues can start.`);
  const target = createOrReuseWorktree(cwd, config, issue, lane);
  setStatus(config, cwd, issue.number, 'inProgress');
  commentIssue(config, cwd, issue, lifecycleComment(config, issue, config.statuses.inProgress, {
    branch: target.branch,
    worktree: target.path,
    verification: 'not-run',
  }));
  console.log(`Issue #${issue.number} is In progress at ${target.path}`);
}

function review(config, cwd, issueNumber, args, lane) {
  const issue = issueDetails(config, cwd, issueNumber);
  if (issue.state !== 'OPEN') throw new WorkflowError(`Issue #${issue.number} is ${issue.state}; only open issues can enter review.`);
  const target = matchingWorktree(cwd, config, issue, lane);
  if (!target.listed) throw new WorkflowError(`Issue #${issue.number} has no registered worktree. Run start first.`);
  ensureClean(target.path, `Issue #${issue.number} worktree`);
  setStatus(config, cwd, issue.number, 'inReview');
  commentIssue(config, cwd, issue, lifecycleComment(config, issue, config.statuses.inReview, {
    branch: target.branch,
    worktree: target.path,
    verification: 'running',
  }));
  try {
    runChecks(config, target.path, checksFromArgs(args));
  } catch (error) {
    commentIssue(config, cwd, issue, lifecycleComment(config, issue, config.statuses.inReview, {
      branch: target.branch,
      worktree: target.path,
      verification: 'failed',
    }));
    throw new WorkflowError(`Issue #${issue.number} remains In review because verification failed. ${error.message}`);
  }
  commentIssue(config, cwd, issue, lifecycleComment(config, issue, config.statuses.inReview, {
    branch: target.branch,
    worktree: target.path,
    verification: 'passed',
  }));
  console.log(`Issue #${issue.number} verification passed; it remains In review until finish.`);
}

function resume(config, cwd, issueNumber, lane) {
  const issue = issueDetails(config, cwd, issueNumber);
  if (issue.state !== 'OPEN') throw new WorkflowError(`Issue #${issue.number} is ${issue.state}; only open issues can resume.`);
  const target = matchingWorktree(cwd, config, issue, lane);
  if (!target.listed) throw new WorkflowError(`Issue #${issue.number} has no registered worktree.`);
  setStatus(config, cwd, issue.number, 'inProgress');
  commentIssue(config, cwd, issue, lifecycleComment(config, issue, config.statuses.inProgress, {
    branch: target.branch,
    worktree: target.path,
    verification: 'failed',
  }));
  console.log(`Issue #${issue.number} is back In progress at ${target.path}`);
}

const MIGRATIONS_DIR = 'supabase/migrations/';

// Migrations the branch adds: present at the branch head, absent on the base
// ref. Takes two file lists (`git ls-tree -r --name-only`) so it is pure.
// CORE.md section 11 rule 1: diff the base ref, never hard-code one.
export function migrationsAdded(baseFiles, headFiles) {
  const base = new Set(baseFiles.map((file) => file.trim()).filter(Boolean));
  return [...new Set(headFiles.map((file) => file.trim()).filter(Boolean))]
    .filter((file) => file.startsWith(MIGRATIONS_DIR) && !base.has(file))
    .sort();
}

// Migration paths among the files a merged PR touched.
export function migrationsFromPaths(paths) {
  return [...new Set(paths.map((file) => file.trim()).filter((file) => file.startsWith(MIGRATIONS_DIR)))].sort();
}

// Which phase finish is in. A merged PR means phase 2 (Done and cleanup).
// Otherwise phase 1: reuse an open PR, or create one. A closed-unmerged PR is
// ignored, because the branch can be published again as a new PR.
export function decidePhase(prs) {
  const list = prs ?? [];
  const merged = list.find((pr) => pr.state === 'MERGED' || pr.mergedAt);
  if (merged) return { phase: 'merged', pr: merged };
  const open = list.find((pr) => pr.state === 'OPEN');
  if (open) return { phase: 'publish', pr: open };
  return { phase: 'publish', pr: null };
}

// Phase 1 needs the issue In review. Done with the PR not merged is an error.
export function publishStatusProblem(status, statuses) {
  if (status === statuses.inReview) return null;
  if (status === statuses.done) {
    return `is marked ${statuses.done} but its PR is not merged; reconcile the board before finishing`;
  }
  return `is currently "${status ?? 'unset'}"; finish requires ${statuses.inReview}`;
}

// The PR body names the issue as "Part of #N" only. No closing keyword (a
// merge would close the issue, or a parent, unreviewed; see the keyword trap)
// and no attribution footer (CORE.md section 14).
export function buildPrBody({ issue, defaultBranch, migrations }) {
  const lines = [
    '## Summary',
    '',
    `Part of #${issue.number}: ${issue.title}`,
    '',
    '## Migrations',
    '',
  ];
  if (migrations.length) {
    lines.push(`This branch adds these migrations. Apply them to Residio_Stage after the merge into \`${defaultBranch}\`, and verify by name (CORE.md section 11):`, '');
    for (const file of migrations) lines.push(`- \`${file}\``);
  } else {
    lines.push('None added by this branch.');
  }
  lines.push('');
  return lines.join('\n');
}

// Whether finish may remove the worktree and local branch after a merge.
// Every condition must hold; the reasons explain each refusal.
export function cleanupDecision({ branch, defaultBranch, currentBranch, tipInPrHead, dirty }) {
  const reasons = [];
  if (!tipInPrHead) reasons.push('the branch tip is not contained in the merged PR head (unpushed commits would be lost)');
  if (dirty) reasons.push('the worktree has uncommitted or untracked changes');
  const protectedBranches = new Set([defaultBranch, 'master', 'main']);
  if (protectedBranches.has(branch)) reasons.push(`${branch} is a default or main branch`);
  if (currentBranch && currentBranch === branch) reasons.push('the branch is checked out where finish is running');
  return { ok: reasons.length === 0, reasons };
}

function listFiles(ref, cwd) {
  const out = run('git', ['ls-tree', '-r', '--name-only', ref, '--', 'supabase/migrations'], cwd);
  return out ? out.split(/\r?\n/) : [];
}

function printMigrations(files, defaultBranch) {
  if (!files.length) {
    console.log('Migrations: none added.');
    return;
  }
  console.log(`Migrations added (apply to the ${defaultBranch} database, Residio_Stage, after the merge; verify by name; CORE.md section 11):`);
  for (const file of files) console.log(`  - ${file}`);
}

function findPrs(config, cwd, branch) {
  return runJson('gh', [
    'pr', 'list', '--repo', config.repository, '--head', branch, '--state', 'all',
    '--json', 'number,url,state,mergedAt,headRefOid', '--limit', '20',
  ], cwd);
}

function finish(config, cwd, issueNumber, args, lane) {
  const issue = issueDetails(config, cwd, issueNumber);
  const target = matchingWorktree(cwd, config, issue, lane);
  if (!target.listed) throw new WorkflowError(`Issue #${issue.number} has no registered worktree.`);

  const { phase, pr } = decidePhase(findPrs(config, cwd, target.branch));
  if (phase === 'merged') {
    finishMerged(config, cwd, issue, target, pr);
  } else {
    finishPublish(config, cwd, issue, target, pr, args);
  }
}

// Phase 1: verify, publish the branch, open or reuse the PR, stop. Never merges.
function finishPublish(config, cwd, issue, target, existingPr, args) {
  ensureClean(target.path, `Issue #${issue.number} worktree`);
  const problem = publishStatusProblem(currentStatus(config, cwd, issue.number), config.statuses);
  if (problem) throw new WorkflowError(`Issue #${issue.number} ${problem}.`);

  runChecks(config, target.path, checksFromArgs(args));

  run('git', ['fetch', 'origin', config.defaultBranch], target.path);
  const migrations = migrationsAdded(
    listFiles(`origin/${config.defaultBranch}`, target.path),
    listFiles('HEAD', target.path),
  );

  run('git', ['push', '-u', 'origin', target.branch], target.path);

  let pr = existingPr;
  if (!pr) {
    const dir = mkdtempSync(join(tmpdir(), 'issue-workflow-'));
    const bodyFile = join(dir, 'pr-body.md');
    try {
      writeFileSync(bodyFile, buildPrBody({ issue, defaultBranch: config.defaultBranch, migrations }));
      const url = run('gh', [
        'pr', 'create', '--repo', config.repository,
        '--base', config.defaultBranch, '--head', target.branch,
        '--title', `${issue.title} (#${issue.number})`,
        '--body-file', bodyFile,
      ], target.path);
      pr = { url };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  setStatus(config, cwd, issue.number, 'inReview');
  commentIssue(config, cwd, issue, lifecycleComment(config, issue, config.statuses.inReview, {
    branch: target.branch,
    worktree: target.path,
    verification: 'passed',
    integration: `PR ${pr.url} into ${config.defaultBranch} (not merged)`,
  }));

  console.log(`Issue #${issue.number} is In review: ${pr.url}`);
  printMigrations(migrations, config.defaultBranch);
  console.log('finish stops here and does not merge. After the PR merges, rerun finish to mark Done and clean up.');
}

// Phase 2: the PR is merged. Mark Done, report migrations, clean up if safe.
function finishMerged(config, cwd, issue, target, pr) {
  const files = runJson('gh', ['pr', 'view', String(pr.number), '--repo', config.repository, '--json', 'files'], cwd).files ?? [];
  const migrations = migrationsFromPaths(files.map((file) => file.path));

  setStatus(config, cwd, issue.number, 'done');
  commentIssue(config, cwd, issue, lifecycleComment(config, issue, config.statuses.done, {
    branch: target.branch,
    worktree: target.path,
    verification: 'passed',
    integration: `merged via PR #${pr.number}`,
  }));
  console.log(`Issue #${issue.number} is Done (PR #${pr.number} merged).`);
  printMigrations(migrations, config.defaultBranch);
  if (issue.state === 'OPEN') {
    console.log(`Issue #${issue.number} is still OPEN. finish does not close issues; the owner closes it.`);
  }

  const root = commonRoot(cwd);
  let tipInPrHead = false;
  try {
    const headOid = pr.headRefOid;
    run('git', ['fetch', 'origin', `refs/pull/${pr.number}/head`], root);
    const tip = run('git', ['rev-parse', target.branch], root);
    if (headOid) {
      try {
        run('git', ['merge-base', '--is-ancestor', tip, headOid], root);
        tipInPrHead = true;
      } catch {
        tipInPrHead = false;
      }
    }
  } catch {
    tipInPrHead = false;
  }
  const decision = cleanupDecision({
    branch: target.branch,
    defaultBranch: config.defaultBranch,
    currentBranch: run('git', ['branch', '--show-current'], cwd),
    tipInPrHead,
    dirty: Boolean(run('git', ['status', '--porcelain'], target.path)),
  });
  if (!decision.ok) {
    console.log(`Worktree ${target.path} and branch ${target.branch} left in place: ${decision.reasons.join('; ')}.`);
    return;
  }
  run('git', ['worktree', 'remove', target.path], root);
  run('git', ['branch', '-D', target.branch], root);
  console.log(`Removed worktree ${target.path} and local branch ${target.branch}.`);
}

function doctor(config, cwd) {
  projectDetails(config, cwd);
  const field = projectFields(config, cwd);
  for (const key of Object.keys(config.statuses)) statusOption(config, key, field);
  console.log(`Project ${config.project.number} is configured with ${config.statusField}: ${Object.values(config.statuses).join(', ')}`);
}

function usage() {
  console.log([
    'Usage: node scripts/issue-workflow.mjs <command> [issue-number] [options]',
    '',
    'Commands:',
    '  doctor              Validate Project and status configuration.',
    '  start <issue>       Create/reuse the issue worktree and set In progress.',
    '  review <issue>      Set In review and run verification checks.',
    '  resume <issue>      Set an issue back to In progress after failed review.',
    '  finish <issue>      Verify, push, open/reuse the PR, set In review; never merges.',
    '                      Rerun after the PR merges to set Done and clean up.',
    '',
    'Options:',
    '  --check "command"   Add an issue-specific shell check (repeatable).',
    '  --lane <name>       Branch prefix lane for a NEW worktree (codex|claude|opencode).',
    '                      Defaults to ISSUE_WORKFLOW_LANE, then defaultLane in config.',
    '                      An existing worktree keeps its own branch regardless of lane.',
  ].join('\n'));
}

export { checksFromArgs, issueWorktree, matchingWorktree };

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const [command, issueNumber, ...rawArgs] = process.argv.slice(2);
  const config = loadConfig();
  const cwd = repoRoot();

  try {
    const { lane, rest: args } = laneFromArgs(rawArgs);
    if (command === 'doctor') doctor(config, cwd);
    else if (command === 'start') start(config, cwd, issueNumber, lane);
    else if (command === 'review') review(config, cwd, issueNumber, args, lane);
    else if (command === 'resume') resume(config, cwd, issueNumber, lane);
    else if (command === 'finish') finish(config, cwd, issueNumber, args, lane);
    else usage();
  } catch (error) {
    console.error(`\nIssue workflow stopped: ${error.message}`);
    process.exitCode = 1;
  }
}
