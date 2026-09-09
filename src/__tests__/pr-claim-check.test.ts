import { describe, expect, it } from 'vitest';
import {
  decideOutcome,
  evaluateIssueOverlap,
  evaluateOverlaps,
  foreignHarnessLabels,
  formatWarningAnnotation,
  issueNumberFromBranch,
  laneFromBranch,
  resolveIssueNumbers,
} from '../../scripts/pr-claim-check.mjs';

/**
 * Unit tests for the PR claim check (#297, rescoped to harness labels by #344). Fixture-driven, no filesystem or network
 * access — every exported function here is pure. `readBranchPrefixes` (the one function
 * that touches the filesystem) is exercised indirectly by passing its output shape
 * directly into these functions, mirroring migration-drift.test.ts's approach of testing
 * the comparison logic rather than the I/O.
 */

// The lane -> prefix map from .github/issue-workflow.json's `branchPrefixes`, inlined here
// as a fixture rather than read from disk — the point of the test is the matching logic, not
// the config file (that wiring is a one-line call in the script itself).
const PREFIX_MAP = {
  codex: 'codex/issue-',
  claude: 'claude/issue-',
  opencode: 'opencode/issue-',
  fix: 'fix/issue-',
};

// The same prefixes flattened, which is the shape `readBranchPrefixes` returns and the shape
// `issueNumberFromBranch` / `resolveIssueNumbers` take.
const PREFIXES = Object.values(PREFIX_MAP);

describe('issueNumberFromBranch', () => {
  it('resolves an issue number from the codex/ lane prefix', () => {
    expect(issueNumberFromBranch('codex/issue-107-fix-thing', PREFIXES)).toBe(107);
  });

  it('resolves an issue number from the claude/ lane prefix', () => {
    expect(issueNumberFromBranch('claude/issue-297-pr-claim-check', PREFIXES)).toBe(297);
  });

  it('resolves an issue number from the opencode/ lane prefix', () => {
    expect(issueNumberFromBranch('opencode/issue-42-something', PREFIXES)).toBe(42);
  });

  it('resolves an issue number from the fix/ lane prefix', () => {
    expect(issueNumberFromBranch('fix/issue-88-hotfix', PREFIXES)).toBe(88);
  });

  it('returns null when the branch matches no prefix', () => {
    expect(issueNumberFromBranch('chore/board-wayfinder-map-structure', PREFIXES)).toBeNull();
  });

  it('returns null when the branch name is missing', () => {
    expect(issueNumberFromBranch(null, PREFIXES)).toBeNull();
  });

  it('returns null when nothing follows the matched prefix', () => {
    expect(issueNumberFromBranch('claude/issue-not-a-number', PREFIXES)).toBeNull();
  });
});

describe('laneFromBranch', () => {
  // Unlike issueNumberFromBranch, this takes the lane -> prefix *map*: the caller
  // (scripts/harness-label.mjs) needs to know which lane matched, not just that one did.
  it('resolves the claude lane', () => {
    expect(laneFromBranch('claude/issue-324-harness-labels', PREFIX_MAP)).toBe('claude');
  });

  it('resolves the codex lane', () => {
    expect(laneFromBranch('codex/issue-107-fix-thing', PREFIX_MAP)).toBe('codex');
  });

  it('resolves the opencode lane', () => {
    expect(laneFromBranch('opencode/issue-42-something', PREFIX_MAP)).toBe('opencode');
  });

  it('resolves the fix lane', () => {
    // `fix` is a lane like any other here. That it names no *harness* is harness-label.mjs's
    // rule (labelForLane), not this function's.
    expect(laneFromBranch('fix/issue-88-hotfix', PREFIX_MAP)).toBe('fix');
  });

  it('returns null when the branch matches no prefix', () => {
    expect(laneFromBranch('chore/board-wayfinder-map-structure', PREFIX_MAP)).toBeNull();
  });

  it('returns null when the branch name is missing', () => {
    expect(laneFromBranch(null, PREFIX_MAP)).toBeNull();
  });

  it('picks the longest matching prefix when one prefix is a prefix of another', () => {
    // A config carrying both `fix/` and `fix/issue-` must not resolve by enumeration order.
    // Both orderings are asserted so the rule cannot pass by accident of key order.
    const overlapping = { hotfix: 'fix/', fix: 'fix/issue-' };
    const reversed = { fix: 'fix/issue-', hotfix: 'fix/' };

    expect(laneFromBranch('fix/issue-88-hotfix', overlapping)).toBe('fix');
    expect(laneFromBranch('fix/issue-88-hotfix', reversed)).toBe('fix');
    // The shorter prefix still wins the branches only it matches.
    expect(laneFromBranch('fix/something-else', overlapping)).toBe('hotfix');
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
      branchName: 'claude/issue-107-fix-thing',
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


describe('foreignHarnessLabels', () => {
  it('ignores the PR\'s own harness label', () => {
    // The branch prefix already implies this label, so it carries no information — and
    // ignoring it is what makes the check independent of whether harness-label.yml has
    // finished writing it on this same PR event.
    expect(foreignHarnessLabels(['harness:claude'], 'claude')).toEqual([]);
  });

  it('reports another harness that has also worked the issue', () => {
    expect(foreignHarnessLabels(['harness:claude', 'harness:codex'], 'claude')).toEqual([
      'harness:codex',
    ]);
  });

  it('reports a foreign harness even when our own label is absent', () => {
    // harness-label.yml adds our label on this same event and may not have run yet.
    expect(foreignHarnessLabels(['harness:codex'], 'claude')).toEqual(['harness:codex']);
  });

  it('reports every foreign harness, sorted, when more than one has worked the issue', () => {
    const labels = ['harness:opencode', 'bug', 'harness:codex', 'harness:claude'];
    expect(foreignHarnessLabels(labels, 'claude')).toEqual(['harness:codex', 'harness:opencode']);
  });

  it('ignores non-harness labels entirely', () => {
    expect(foreignHarnessLabels(['bug', 'ready-for-agent', 'P0'], 'claude')).toEqual([]);
  });

  it('ignores a harness:-prefixed label naming no known harness', () => {
    // Never invent a harness from a label someone typed by hand.
    expect(foreignHarnessLabels(['harness:cursor'], 'claude')).toEqual([]);
  });

  it('returns nothing when the issue carries no labels at all', () => {
    expect(foreignHarnessLabels([], 'claude')).toEqual([]);
    expect(foreignHarnessLabels(undefined, 'claude')).toEqual([]);
  });
});

describe('evaluateIssueOverlap — the rule table', () => {
  it('is clean when the issue carries only our own harness label', () => {
    const result = evaluateIssueOverlap({ number: 107, labels: ['harness:claude'] }, 'claude');

    expect(result.overlap).toBe(false);
    expect(result.foreignHarnesses).toEqual([]);
  });

  it('is clean when the issue carries no harness label yet', () => {
    const result = evaluateIssueOverlap({ number: 107, labels: ['ready-for-agent'] }, 'claude');
    expect(result.overlap).toBe(false);
  });

  it('flags an overlap naming the other harness and the issue', () => {
    const result = evaluateIssueOverlap(
      { number: 107, labels: ['harness:claude', 'harness:codex'] },
      'claude',
    );

    expect(result.overlap).toBe(true);
    expect(result.foreignHarnesses).toEqual(['harness:codex']);
    expect(result.message).toContain('#107');
    expect(result.message).toContain('harness:codex');
  });

  it('names every other harness when two have worked the issue', () => {
    const result = evaluateIssueOverlap(
      { number: 107, labels: ['harness:codex', 'harness:opencode'] },
      'claude',
    );

    expect(result.message).toContain('harness:codex');
    expect(result.message).toContain('harness:opencode');
  });
});

describe('evaluateOverlaps', () => {
  it('is clean only when every resolved issue is clean', () => {
    const evaluation = evaluateOverlaps(
      [
        { number: 1, labels: ['harness:claude'] },
        { number: 2, labels: [] },
      ],
      'claude',
    );

    expect(evaluation.clean).toBe(true);
    expect(evaluation.overlaps).toEqual([]);
  });

  it('reports every overlapping issue when one of several overlaps', () => {
    const evaluation = evaluateOverlaps(
      [
        { number: 1, labels: ['harness:claude'] },
        { number: 2, labels: ['harness:codex'] },
      ],
      'claude',
    );

    expect(evaluation.clean).toBe(false);
    expect(evaluation.overlaps).toHaveLength(1);
    expect(evaluation.overlaps[0].number).toBe(2);
  });
});

describe('decideOutcome — advisory by design', () => {
  // Every row below returns warnings or none; none of them can fail the job. The only
  // non-zero exits left in this script are the loud ones (missing env, API failure), which
  // live in main() rather than here.
  it('skips with a note when the branch matches no lane', () => {
    const outcome = decideOutcome({ lane: null, issueNumbers: [107], evaluation: null });

    expect(outcome.warnings).toEqual([]);
    expect(outcome.summary).toContain('no lane');
  });

  it('skips with a note when the lane names no harness', () => {
    // `fix` is a lane in branchPrefixes but not a harness — the same "never guess" rule
    // harness-label.mjs applies when deciding what to label.
    const outcome = decideOutcome({ lane: 'fix', issueNumbers: [107], evaluation: null });

    expect(outcome.warnings).toEqual([]);
    expect(outcome.summary).toContain('names no harness');
  });

  it('skips with a note when no issue could be resolved', () => {
    const outcome = decideOutcome({ lane: 'claude', issueNumbers: [], evaluation: null });

    expect(outcome.warnings).toEqual([]);
    expect(outcome.summary).toContain('No linked issue');
  });

  it('reports a clean result when no other harness has worked the linked issues', () => {
    const evaluation = evaluateOverlaps([{ number: 107, labels: ['harness:claude'] }], 'claude');
    const outcome = decideOutcome({ lane: 'claude', issueNumbers: [107], evaluation });

    expect(outcome.warnings).toEqual([]);
    expect(outcome.summary).toContain('#107');
  });

  it('surfaces one warning per overlapping issue', () => {
    const evaluation = evaluateOverlaps(
      [
        { number: 107, labels: ['harness:codex'] },
        { number: 88, labels: ['harness:claude'] },
      ],
      'claude',
    );
    const outcome = decideOutcome({ lane: 'claude', issueNumbers: [88, 107], evaluation });

    expect(outcome.warnings).toHaveLength(1);
    expect(outcome.warnings[0]).toContain('#107');
    expect(outcome.warnings[0]).toContain('harness:codex');
  });
});

describe('formatWarningAnnotation', () => {
  it('emits a GitHub warning annotation', () => {
    expect(formatWarningAnnotation('Issue #107 also worked by harness:codex.')).toBe(
      '::warning title=PR claim check::Issue #107 also worked by harness:codex.',
    );
  });

  it('escapes the characters that would truncate or break the annotation', () => {
    // A raw newline ends the workflow command, silently dropping the rest of the message.
    expect(formatWarningAnnotation('one\ntwo')).toContain('one%0Atwo');
    expect(formatWarningAnnotation('50%')).toContain('50%25');
    expect(formatWarningAnnotation('a\rb')).toContain('a%0Db');
  });
});
