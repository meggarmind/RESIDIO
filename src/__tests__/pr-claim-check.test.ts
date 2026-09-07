import { describe, expect, it } from 'vitest';
import {
  decideOutcome,
  evaluateClaims,
  evaluateIssueClaim,
  issueNumberFromBranch,
  resolveIssueNumbers,
} from '../../scripts/pr-claim-check.mjs';

/**
 * Unit tests for the PR claim check (#297). Fixture-driven, no filesystem or network
 * access — every exported function here is pure. `readBranchPrefixes` (the one function
 * that touches the filesystem) is exercised indirectly by passing its output shape
 * directly into these functions, mirroring migration-drift.test.ts's approach of testing
 * the comparison logic rather than the I/O.
 */

// The three lane prefixes from .github/issue-workflow.json's `branchPrefixes`, inlined
// here as a fixture rather than read from disk — the point of the test is the matching
// logic, not the config file (that wiring is a one-line call in the script itself).
const PREFIXES = ['codex/issue-', 'feat/issue-', 'opencode/issue-'];

describe('issueNumberFromBranch', () => {
  it('resolves an issue number from the codex/ lane prefix', () => {
    expect(issueNumberFromBranch('codex/issue-107-fix-thing', PREFIXES)).toBe(107);
  });

  it('resolves an issue number from the feat/ lane prefix', () => {
    expect(issueNumberFromBranch('feat/issue-297-pr-claim-check', PREFIXES)).toBe(297);
  });

  it('resolves an issue number from the opencode/ lane prefix', () => {
    expect(issueNumberFromBranch('opencode/issue-42-something', PREFIXES)).toBe(42);
  });

  it('returns null when the branch matches no prefix', () => {
    expect(issueNumberFromBranch('chore/board-wayfinder-map-structure', PREFIXES)).toBeNull();
  });

  it('returns null when the branch name is missing', () => {
    expect(issueNumberFromBranch(null, PREFIXES)).toBeNull();
  });

  it('returns null when nothing follows the matched prefix', () => {
    expect(issueNumberFromBranch('feat/issue-not-a-number', PREFIXES)).toBeNull();
  });
});

describe('resolveIssueNumbers', () => {
  it('resolves purely from a "Closes #n" body reference when the branch carries no issue number', () => {
    // closingIssueNumbers simulates what GitHub's own closingIssuesReferences connection
    // already parsed out of a PR body containing "Closes #212" — this script does not
    // re-implement that parsing itself.
    const result = resolveIssueNumbers({
      branchName: 'chore/tidy-something',
      prefixes: PREFIXES,
      closingIssueNumbers: [212],
    });

    expect(result).toEqual([212]);
  });

  it('resolves purely from the branch name when there is no closing reference', () => {
    const result = resolveIssueNumbers({
      branchName: 'codex/issue-107-fix-thing',
      prefixes: PREFIXES,
      closingIssueNumbers: [],
    });

    expect(result).toEqual([107]);
  });

  it('merges the branch-derived issue with multiple closing references, deduplicated and sorted', () => {
    const result = resolveIssueNumbers({
      branchName: 'feat/issue-107-fix-thing',
      prefixes: PREFIXES,
      // 107 also appears via a body reference; 88 and 3 are additional issues closed by the PR.
      closingIssueNumbers: [107, 88, 3],
    });

    expect(result).toEqual([3, 88, 107]);
  });

  it('returns an empty array when nothing can be resolved', () => {
    const result = resolveIssueNumbers({
      branchName: 'chore/tidy-something',
      prefixes: PREFIXES,
      closingIssueNumbers: [],
    });

    expect(result).toEqual([]);
  });
});

describe('evaluateIssueClaim — the rule table', () => {
  it('passes when the issue is assigned to the PR author', () => {
    const result = evaluateIssueClaim({ number: 107, assignees: ['meggarmind'] }, 'meggarmind');
    expect(result.ok).toBe(true);
  });

  it('fails with a claim instruction when the issue has no assignee', () => {
    const result = evaluateIssueClaim({ number: 107, assignees: [] }, 'meggarmind');

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unassigned');
    expect(result.message).toContain('#107');
    expect(result.message).toContain('gh issue edit 107 --add-assignee @me');
  });

  it('fails and names the assignee when the issue is claimed by someone else', () => {
    const result = evaluateIssueClaim({ number: 107, assignees: ['someone-else'] }, 'meggarmind');

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('assigned-to-other');
    expect(result.message).toContain('someone-else');
    expect(result.message).toContain('#107');
  });
});

describe('evaluateClaims', () => {
  it('passes overall only when every resolved issue passes', () => {
    const evaluation = evaluateClaims(
      [
        { number: 1, assignees: ['meggarmind'] },
        { number: 2, assignees: ['meggarmind'] },
      ],
      'meggarmind',
    );

    expect(evaluation.ok).toBe(true);
    expect(evaluation.failures).toEqual([]);
  });

  it('fails overall and reports every failing issue when one of several is unclaimed', () => {
    const evaluation = evaluateClaims(
      [
        { number: 1, assignees: ['meggarmind'] },
        { number: 2, assignees: [] },
      ],
      'meggarmind',
    );

    expect(evaluation.ok).toBe(false);
    expect(evaluation.failures).toHaveLength(1);
    expect(evaluation.failures[0].number).toBe(2);
  });
});

describe('decideOutcome — no-issue-resolved passes', () => {
  it('passes with a note when no issue could be resolved at all', () => {
    const outcome = decideOutcome([], { ok: true, results: [], failures: [] });

    expect(outcome.ok).toBe(true);
    expect(outcome.summary).toContain('No linked issue');
  });

  it('passes when every resolved issue is assigned to the author', () => {
    const evaluation = evaluateClaims([{ number: 107, assignees: ['meggarmind'] }], 'meggarmind');
    const outcome = decideOutcome([107], evaluation);

    expect(outcome.ok).toBe(true);
  });

  it('fails and surfaces the failure message when a resolved issue is unassigned', () => {
    const evaluation = evaluateClaims([{ number: 107, assignees: [] }], 'meggarmind');
    const outcome = decideOutcome([107], evaluation);

    expect(outcome.ok).toBe(false);
    expect(outcome.summary).toContain('#107');
  });

  it('fails and surfaces the failure message when a resolved issue is assigned to someone else', () => {
    const evaluation = evaluateClaims([{ number: 107, assignees: ['someone-else'] }], 'meggarmind');
    const outcome = decideOutcome([107], evaluation);

    expect(outcome.ok).toBe(false);
    expect(outcome.summary).toContain('someone-else');
  });
});
