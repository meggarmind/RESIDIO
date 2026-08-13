import { describe, expect, it } from 'vitest';
import { checksFromArgs, findStatusOption, parseWorktrees, slugify, statusName } from '../../../scripts/issue-workflow.mjs';

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

  it('resolves status options by exact name', () => {
    const field = { options: [{ id: '1', name: 'Todo' }, { id: '2', name: 'In review' }] };
    expect(findStatusOption(field, 'In review')).toEqual({ id: '2', name: 'In review' });
    expect(() => findStatusOption(field, 'Done')).toThrow('missing "Done"');
  });

  it('reads status values from the GitHub CLI item shapes', () => {
    expect(statusName({ status: 'In review' })).toBe('In review');
    expect(statusName({ status: { name: 'Done' } })).toBe('Done');
    expect(statusName({ fields: [{ name: 'Status', value: 'Todo' }] })).toBe('Todo');
  });

  it('parses repeatable issue-specific checks', () => {
    expect(checksFromArgs(['--check', 'npm run test:e2e', '--check', 'npm run lint -- --fix=false']))
      .toEqual(['npm run test:e2e', 'npm run lint -- --fix=false']);
    expect(() => checksFromArgs(['--unknown'])).toThrow('Unknown option');
  });
});
