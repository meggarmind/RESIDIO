import { describe, expect, it } from 'vitest';
import { buildPrBody, checksFromArgs, cleanupDecision, commandInvocation, decidePhase, migrationsAdded, migrationsFromPaths, publishStatusProblem, findStatusOption, isIssueBranch, laneFromArgs, lanePrefixes, lifecycleComment, MAX_STDERR_CHARS, MAX_STDOUT_CHARS, parseWorktrees, pathsMatch, resolveLanePrefix, run, slugify, statusName, WorkflowError } from '../../../scripts/issue-workflow.mjs';

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

  it('keeps stderr and the stdout tail when a command fails with huge stdout', () => {
    // stderr text is built at runtime so it never appears in the command line,
    // which the error message embeds.
    const script = `process.stdout.write('a'.repeat(${2 * MIB}) + 'TAILEND'); process.stderr.write(['REAL', 'ERR'].join('')); process.exitCode = 1`;
    let message = '';
    try {
      run('node', ['-e', script], process.cwd());
    } catch (error) {
      expect(error).toBeInstanceOf(WorkflowError);
      message = (error as Error).message;
    }
    expect(message).toContain('failed: REALERR\n');
    expect(message).toContain(`(truncated, last ${MAX_STDOUT_CHARS} characters of stdout)`);
    expect(message.endsWith('a'.repeat(MAX_STDOUT_CHARS - 7) + 'TAILEND')).toBe(true);
    expect(message.indexOf('REALERR')).toBeLessThan(message.indexOf('characters of stdout'));
    // Literal bound, not derived from the constants, so raising a cap fails here.
    expect(message.length).toBeLessThan(3000);
  });

  it('truncates huge stderr to its tail with its own marker', () => {
    const script = `process.stderr.write('b'.repeat(${MAX_STDERR_CHARS * 4}) + 'STDERRTAIL'); process.exit(1)`;
    let message = '';
    try {
      run('node', ['-e', script], process.cwd());
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain(`(truncated, last ${MAX_STDERR_CHARS} characters of stderr)`);
    expect(message.endsWith('b'.repeat(MAX_STDERR_CHARS - 10) + 'STDERRTAIL')).toBe(true);
    expect(message).not.toContain('of stdout');
  });

  it('leaves short failure output untruncated in stderr-then-stdout order', () => {
    const script = `process.stdout.write(['OU', 'T'].join('')); process.stderr.write(['ER', 'R'].join('')); process.exit(1)`;
    let message = '';
    try {
      run('node', ['-e', script], process.cwd());
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe(`node -e ${script} failed: ERR\nOUT`);
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

describe('finish: PR-based delivery (#220)', () => {
  const M = 'supabase/migrations/';
  const statuses = { inReview: 'In review', done: 'Done' };
  const issue = { number: 220, title: 'finish opens the PR' };

  it('lists only migrations present on the branch and absent on the base', () => {
    const base = [`${M}20260101000000_a.sql`, `${M}20260102000000_b.sql`, 'src/x.ts'];
    const head = [`${M}20260101000000_a.sql`, `${M}20260102000000_b.sql`, `${M}20260301000000_new.sql`, 'src/y.ts'];
    expect(migrationsAdded(base, head)).toEqual([`${M}20260301000000_new.sql`]);
  });

  it('reports nothing when the branch adds none, and ignores base-only migrations', () => {
    const base = [`${M}20260101000000_a.sql`, `${M}20260201000000_only_on_base.sql`];
    const head = [`${M}20260101000000_a.sql`];
    expect(migrationsAdded(base, head)).toEqual([]);
  });

  it('ignores added files outside the migrations directory', () => {
    expect(migrationsAdded([], ['docs/supabase/migrations/x.sql', 'src/a.ts'])).toEqual([]);
  });

  it('extracts migrations from a merged PR file list', () => {
    expect(migrationsFromPaths(['src/a.ts', `${M}2_b.sql`, `${M}1_a.sql`])).toEqual([`${M}1_a.sql`, `${M}2_b.sql`]);
  });

  it('chooses the phase from PR state', () => {
    expect(decidePhase([]).phase).toBe('publish');
    expect(decidePhase([]).pr).toBeNull();
    const open = { number: 5, state: 'OPEN' };
    expect(decidePhase([open])).toEqual({ phase: 'publish', pr: open });
    const merged = { number: 6, state: 'MERGED', mergedAt: '2026-10-16T00:00:00Z' };
    expect(decidePhase([open, merged])).toEqual({ phase: 'merged', pr: merged });
    const closed = { number: 7, state: 'CLOSED', mergedAt: null };
    expect(decidePhase([closed])).toEqual({ phase: 'publish', pr: null });
  });

  it('requires In review to publish and rejects Done with an unmerged PR', () => {
    expect(publishStatusProblem('In review', statuses)).toBeNull();
    expect(publishStatusProblem('Done', statuses)).toMatch(/not merged/);
    expect(publishStatusProblem('In progress', statuses)).toMatch(/requires In review/);
  });

  it('builds a PR body with Part of #N, the migrations, no closing keyword and no footer', () => {
    const body = buildPrBody({ issue, defaultBranch: 'stage', migrations: [`${M}1_a.sql`] });
    expect(body).toContain('Part of #220');
    expect(body).toContain(`${M}1_a.sql`);
    expect(body).not.toMatch(/\b(close[sd]?|fix(e[sd])?|resolve[sd]?)\b[:\s]+#\d+/i);
    expect(body).not.toMatch(/Generated with|Co-Authored-By/i);
    expect(buildPrBody({ issue, defaultBranch: 'stage', migrations: [] })).toContain('None added');
  });

  const safe = { branch: 'claude/issue-220-x', defaultBranch: 'stage', currentBranch: 'stage', tipInPrHead: true, dirty: false };

  it('allows cleanup only when every safety check holds', () => {
    expect(cleanupDecision(safe)).toEqual({ ok: true, reasons: [] });
  });

  it('refuses cleanup when the tip is not in the PR head', () => {
    const d = cleanupDecision({ ...safe, tipInPrHead: false });
    expect(d.ok).toBe(false);
    expect(d.reasons.join(' ')).toMatch(/not contained in the merged PR head/);
  });

  it('refuses cleanup when the tree is dirty', () => {
    const d = cleanupDecision({ ...safe, dirty: true });
    expect(d.ok).toBe(false);
    expect(d.reasons.join(' ')).toMatch(/uncommitted or untracked/);
  });

  it('refuses cleanup of the default branch, master, or the checked-out branch', () => {
    expect(cleanupDecision({ ...safe, branch: 'stage' }).ok).toBe(false);
    expect(cleanupDecision({ ...safe, branch: 'master' }).ok).toBe(false);
    expect(cleanupDecision({ ...safe, currentBranch: safe.branch }).ok).toBe(false);
  });
});
