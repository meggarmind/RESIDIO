import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(SCRIPT_DIR, '..', '.github', 'issue-workflow.json');
const WINDOWS = process.platform === 'win32';

export class WorkflowError extends Error {}

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

function run(command, args, cwd, options = {}) {
  try {
    return execFileSync(binary(command), args, {
      cwd,
      encoding: 'utf8',
      stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
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

function runVisible(command, args, cwd) {
  try {
    execFileSync(binary(command), args, {
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

function worktrees(cwd) {
  return parseWorktrees(run('git', ['worktree', 'list', '--porcelain'], cwd));
}

function defaultWorktree(cwd, config) {
  const root = commonRoot(cwd);
  const match = worktrees(cwd).find((item) => item.branch === config.defaultBranch);
  return match?.path ?? root;
}

function issueWorktree(cwd, config, issue) {
  const root = commonRoot(cwd);
  const branch = `${config.branchPrefix}${issue.number}-${slugify(issue.title)}`;
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

function matchingWorktree(cwd, config, issue) {
  const expected = issueWorktree(cwd, config, issue);
  const listed = worktrees(cwd).find((item) => item.path === expected.path || item.branch === expected.branch);
  if (listed && listed.path !== expected.path) {
    throw new WorkflowError(`Issue #${issue.number} already uses branch ${expected.branch} at ${listed.path}, not ${expected.path}.`);
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

function createOrReuseWorktree(cwd, config, issue) {
  const target = matchingWorktree(cwd, config, issue);
  if (target.listed) {
    ensureBranch(target.path, target.branch, `Issue #${issue.number} worktree`);
    return target;
  }

  if (existsSync(target.path)) {
    throw new WorkflowError(`${target.path} exists but is not a registered Git worktree.`);
  }

  const root = commonRoot(cwd);
  const defaultPath = defaultWorktree(cwd, config);
  run('git', ['worktree', 'add', target.path, '-b', target.branch, config.defaultBranch], defaultPath);
  return { ...target, root };
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

function runChecks(config, cwd, extraChecks) {
  for (const check of config.checks) {
    console.log(`\n==> ${check.label}`);
    runVisible(check.command, check.args ?? [], cwd);
  }
  for (const command of extraChecks) {
    console.log(`\n==> ${command}`);
    runShell(command, cwd);
  }
}

function start(config, cwd, issueNumber) {
  const issue = issueDetails(config, cwd, issueNumber);
  if (issue.state !== 'OPEN') throw new WorkflowError(`Issue #${issue.number} is ${issue.state}; only open issues can start.`);
  const target = createOrReuseWorktree(cwd, config, issue);
  setStatus(config, cwd, issue.number, 'inProgress');
  console.log(`Issue #${issue.number} is In progress at ${target.path}`);
}

function review(config, cwd, issueNumber, args) {
  const issue = issueDetails(config, cwd, issueNumber);
  if (issue.state !== 'OPEN') throw new WorkflowError(`Issue #${issue.number} is ${issue.state}; only open issues can enter review.`);
  const target = matchingWorktree(cwd, config, issue);
  if (!target.listed) throw new WorkflowError(`Issue #${issue.number} has no registered worktree. Run start first.`);
  ensureClean(target.path, `Issue #${issue.number} worktree`);
  setStatus(config, cwd, issue.number, 'inReview');
  try {
    runChecks(config, target.path, checksFromArgs(args));
  } catch (error) {
    throw new WorkflowError(`Issue #${issue.number} remains In review because verification failed. ${error.message}`);
  }
  console.log(`Issue #${issue.number} verification passed; it remains In review until finish.`);
}

function resume(config, cwd, issueNumber) {
  const issue = issueDetails(config, cwd, issueNumber);
  if (issue.state !== 'OPEN') throw new WorkflowError(`Issue #${issue.number} is ${issue.state}; only open issues can resume.`);
  const target = matchingWorktree(cwd, config, issue);
  if (!target.listed) throw new WorkflowError(`Issue #${issue.number} has no registered worktree.`);
  setStatus(config, cwd, issue.number, 'inProgress');
  console.log(`Issue #${issue.number} is back In progress at ${target.path}`);
}

function finish(config, cwd, issueNumber, args) {
  const issue = issueDetails(config, cwd, issueNumber);
  const target = matchingWorktree(cwd, config, issue);
  if (!target.listed) throw new WorkflowError(`Issue #${issue.number} has no registered worktree.`);
  ensureClean(target.path, `Issue #${issue.number} worktree`);

  const integrationPath = defaultWorktree(cwd, config);
  ensureBranch(integrationPath, config.defaultBranch, 'Integration worktree');
  ensureClean(integrationPath, 'Integration worktree');

  const status = currentStatus(config, cwd, issue.number);
  if (status && status !== config.statuses.inReview && status !== config.statuses.done) {
    throw new WorkflowError(`Issue #${issue.number} is currently "${status}"; finish requires In review.`);
  }

  if (status !== config.statuses.done) {
    setStatus(config, cwd, issue.number, 'inReview');
    runChecks(config, target.path, checksFromArgs(args));

    const ancestor = (() => {
      try {
        execFileSync(binary('git'), ['merge-base', '--is-ancestor', target.branch, config.defaultBranch], { cwd: integrationPath, stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    })();

    if (!ancestor) {
      try {
        run('git', ['merge', '--no-ff', target.branch, '-m', `Merge issue #${issue.number}: ${issue.title}`], integrationPath);
      } catch (error) {
        try { run('git', ['merge', '--abort'], integrationPath); } catch {}
        throw new WorkflowError(`Issue #${issue.number} was not integrated because the merge failed. ${error.message}`);
      }
    }

    if (issue.state === 'OPEN') {
      run('gh', [
        'issue', 'close', String(issue.number),
        '--repo', config.repository,
        '--comment', `Completed and integrated into ${config.defaultBranch} by the issue workflow.`,
      ], cwd);
    }
    setStatus(config, cwd, issue.number, 'done');
  } else if (issue.state === 'OPEN') {
    throw new WorkflowError(`Issue #${issue.number} is marked Done in Project 1 but is still open; close it before cleanup.`);
  }

  run('git', ['worktree', 'remove', target.path], integrationPath);
  try { run('git', ['branch', '-d', target.branch], integrationPath); } catch (error) {
    throw new WorkflowError(`Issue #${issue.number} is Done, but branch cleanup failed: ${error.message}`);
  }
  console.log(`Issue #${issue.number} is Done, closed, merged into ${config.defaultBranch}, and cleaned up.`);
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
    '  finish <issue>      Verify, merge, close, set Done, and clean up.',
    '',
    'Options:',
    '  --check "command"   Add an issue-specific shell check (repeatable).',
  ].join('\n'));
}

export { checksFromArgs, issueWorktree };

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const [command, issueNumber, ...args] = process.argv.slice(2);
  const config = loadConfig();
  const cwd = repoRoot();

  try {
    if (command === 'doctor') doctor(config, cwd);
    else if (command === 'start') start(config, cwd, issueNumber);
    else if (command === 'review') review(config, cwd, issueNumber, args);
    else if (command === 'resume') resume(config, cwd, issueNumber);
    else if (command === 'finish') finish(config, cwd, issueNumber, args);
    else usage();
  } catch (error) {
    console.error(`\nIssue workflow stopped: ${error.message}`);
    process.exitCode = 1;
  }
}
