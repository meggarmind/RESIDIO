import { describe, expect, it } from 'vitest';
import { checksFromArgs, commandInvocation, findStatusOption, isIssueBranch, laneFromArgs, lanePrefixes, lifecycleComment, MAX_ERROR_DETAILS_CHARS, parseWorktrees, pathsMatch, resolveLanePrefix, run, slugify, statusName, WorkflowError } from '../../../scripts/issue-workflow.mjs';

// Mirrors .github/issue-workflow.json. Kept literal so a config change that
// drops a lane fails here rather than silently narrowing branch matching.
const laneConfig = {
  branchPrefix: 'codex/issue-',
  defaultLane: 'codex',
  branchPrefixes: {
    codex: 'codex/issue-',
    claude: 'feat/issue-',
    opencode: 'opencode/issue-',
  },
};

describe('issue workflow helpers', () => {
  it('creates stable issue slugs for branch names', () => {
    expect(slugify('Billing: Generate Invoices & History')).toBe('billing-generate-invoices-history');
    expect(slugify('')).toBe('task');
  });

  it('parses linked worktree porcelain output', () => {
    const output = [
      'worktree C:/repo',
      'HEAD abc123',
      'branch refs/heads/master',
      '',
      'worktree C:/repo/.worktrees/issue-64',
      'HEAD def456',
      'branch refs/heads/codex/issue-64-example',
    ].join('\n');

    expect(parseWorktrees(output)).toEqual([
      { path: 'C:/repo', branch: 'master' },
      { path: 'C:/repo/.worktrees/issue-64', branch: 'codex/issue-64-example' },
    ]);
  });

  it('matches Windows worktree paths regardless of slash style', () => {
    expect(pathsMatch('C:/repo/.worktrees/issue-64', 'C:\\repo\\.worktrees\\issue-64')).toBe(true);
  });

  it('runs npm checks through cmd.exe on Windows', () => {
    expect(commandInvocation('npm', ['run', 'lint'], true)).toEqual({
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', 'npm.cmd run lint'],
    });
  });

  it('resolves status options by exact name', () => {
    const field = { options: [{ id: '1', name: 'Backlog' }, { id: '2', name: 'In review' }] };
    expect(findStatusOption(field, 'In review')).toEqual({ id: '2', name: 'In review' });
    expect(() => findStatusOption(field, 'Done')).toThrow('missing "Done"');
  });

  it('reads status values from the GitHub CLI item shapes', () => {
    expect(statusName({ status: 'In review' })).toBe('In review');
    expect(statusName({ status: { name: 'Done' } })).toBe('Done');
    expect(statusName({ fields: [{ name: 'Status', value: 'Backlog' }] })).toBe('Backlog');
  });

  it('parses repeatable issue-specific checks', () => {
    expect(checksFromArgs(['--check', 'npm run test:e2e', '--check', 'npm run lint -- --fix=false']))
      .toEqual(['npm run test:e2e', 'npm run lint -- --fix=false']);
    expect(() => checksFromArgs(['--unknown'])).toThrow('Unknown option');
  });

  it('renders durable lifecycle evidence comments', () => {
    expect(lifecycleComment({ lifecycleCommentMarker: '<!-- lifecycle -->' }, { number: 67 }, 'In review', {
      timestamp: '2026-08-13T12:00:00.000Z',
      branch: 'codex/issue-67-example',
      worktree: '.worktrees/issue-67',
      verification: 'passed',
      integration: 'not-applicable',
    })).toContain('Verification: passed');
    expect(lifecycleComment({ lifecycleCommentMarker: '<!-- lifecycle -->' }, { number: 67 }, 'In review', {}).startsWith('<!-- lifecycle -->')).toBe(true);
  });
});

describe('branch lanes', () => {
  it('resolves a lane to its branch prefix, defaulting to codex', () => {
    expect(resolveLanePrefix(laneConfig)).toBe('codex/issue-');
    expect(resolveLanePrefix(laneConfig, 'claude')).toBe('feat/issue-');
    expect(resolveLanePrefix(laneConfig, 'opencode')).toBe('opencode/issue-');
  });

  it('rejects an unconfigured lane rather than inventing a prefix', () => {
    expect(() => resolveLanePrefix(laneConfig, 'bogus')).toThrow('Unknown lane');
  });

  it('falls back to branchPrefix when no lanes are configured', () => {
    const legacy = { branchPrefix: 'codex/issue-' };
    expect(lanePrefixes(legacy)).toEqual({ default: 'codex/issue-' });
    expect(resolveLanePrefix(legacy)).toBe('codex/issue-');
  });

  // The point of the lane split: a worktree started by one harness must be
  // resumable by another. isIssueBranch is what lets matchingWorktree adopt an
  // existing branch instead of rejecting it for carrying the "wrong" prefix.
  it('recognises an issue branch under any configured lane', () => {
    expect(isIssueBranch(laneConfig, 187, 'codex/issue-187-part-b')).toBe(true);
    expect(isIssueBranch(laneConfig, 187, 'feat/issue-187-part-b')).toBe(true);
    expect(isIssueBranch(laneConfig, 187, 'opencode/issue-187-part-b')).toBe(true);
  });

  it('does not mistake another issue, or an unrelated branch, for this one', () => {
    expect(isIssueBranch(laneConfig, 187, 'feat/issue-1870-other')).toBe(false);
    expect(isIssueBranch(laneConfig, 187, 'feat/issue-88-other')).toBe(false);
    expect(isIssueBranch(laneConfig, 187, 'chore/unify-agent-instructions')).toBe(false);
    expect(isIssueBranch(laneConfig, 187, undefined)).toBe(false);
  });

  it('extracts --lane without disturbing the --check arguments', () => {
    expect(laneFromArgs(['--check', 'npm test', '--lane', 'claude', '--check', 'npm run lint']))
      .toEqual({ lane: 'claude', rest: ['--check', 'npm test', '--check', 'npm run lint'] });
    expect(laneFromArgs(['--check', 'npm test'])).toEqual({ lane: undefined, rest: ['--check', 'npm test'] });
  });

  it('rejects --lane without a value instead of swallowing the next flag', () => {
    expect(() => laneFromArgs(['--lane'])).toThrow('--lane requires a lane name');
    expect(() => laneFromArgs(['--lane', '--check'])).toThrow('--lane requires a lane name');
  });
});

describe('run output buffering', () => {
  const MIB = 1024 * 1024;
  const emit = (bytes: number) => ['-e', `process.stdout.write('x'.repeat(${bytes}))`];

  it('returns output larger than the 1 MiB Node default', () => {
    const output = run('node', emit(2 * MIB), process.cwd());
    expect(output.length).toBe(2 * MIB);
  });

  it('truncates huge output when a command fails', () => {
    const script = `process.stdout.write('x'.repeat(${2 * MIB})); process.stderr.write('boom'); process.exit(1)`;
    let message = '';
    try {
      run('node', ['-e', script], process.cwd());
    } catch (error) {
      expect(error).toBeInstanceOf(WorkflowError);
      message = (error as Error).message;
    }
    expect(message).toContain('failed');
    expect(message).toContain('boom');
    expect(message).toContain('truncated');
    expect(message.length).toBeLessThan(MAX_ERROR_DETAILS_CHARS + 500);
  });

  it('reports a clear error when output exceeds the buffer', () => {
    let message = '';
    try {
      run('node', emit(4096), process.cwd(), { maxBuffer: 1024 });
    } catch (error) {
      expect(error).toBeInstanceOf(WorkflowError);
      message = (error as Error).message;
    }
    expect(message).toContain('exceeded the 1024 byte buffer limit');
    expect(message).not.toContain('xxxx');
  });
});
