import { describe, expect, it } from 'vitest';
import {
  alertActions,
  belongsToRepository,
  detectFindings,
  hoursSince,
  isMonitorComment,
  matchingBranches,
  mergedIssueNumbers,
  monitorComment,
  parseArgs,
  qualifyingActivity,
  recentAlertComment,
} from '../../../scripts/issue-monitor.mjs';

const now = new Date('2026-08-13T12:00:00.000Z');
const config = {
  branchPrefix: 'codex/issue-',
  branchPrefixes: {
    codex: 'codex/issue-',
    claude: 'feat/issue-',
    opencode: 'opencode/issue-',
  },
  statuses: { inProgress: 'In progress', inReview: 'In review', done: 'Done' },
  monitor: {
    staleAfterHours: 24,
    alertCooldownHours: 24,
    attentionLabel: 'needs-attention',
    pausedLabel: 'workflow:paused',
    commentMarker: '<!-- issue-workflow-monitor -->',
  },
};

function issue(overrides = {}) {
  return {
    number: 64,
    title: 'Monitor issue',
    state: 'OPEN',
    labels: [],
    comments: [],
    ...overrides,
  };
}

describe('issue monitor helpers', () => {
  it('matches only the issue branch naming pattern', () => {
    expect(matchingBranches(config, 64, ['codex/issue-64-monitor', 'codex/issue-640-other', 'feature/64'])).toEqual(['codex/issue-64-monitor']);
  });

  // Keying the pattern off a single branchPrefix made the monitor blind to
  // branches from any lane but codex, so it reported those issues as having no
  // work in flight.
  it('matches the issue branch under every configured lane', () => {
    expect(matchingBranches(config, 64, [
      'codex/issue-64-a',
      'feat/issue-64-b',
      'opencode/issue-64-c',
      'feat/issue-640-other',
      'chore/unrelated',
    ])).toEqual(['codex/issue-64-a', 'feat/issue-64-b', 'opencode/issue-64-c']);
  });

  it('still honours a legacy config that has only branchPrefix', () => {
    const legacy = { branchPrefix: 'codex/issue-' };
    expect(matchingBranches(legacy, 64, ['codex/issue-64-a', 'feat/issue-64-b'])).toEqual(['codex/issue-64-a']);
  });

  it('excludes monitor comments from qualifying activity', () => {
    const activity = qualifyingActivity(issue({ comments: [
      { createdAt: '2026-08-13T11:59:00.000Z', body: '<!-- issue-workflow-monitor -->\ncondition=stale-active' },
      { createdAt: '2026-08-13T10:00:00.000Z', body: '<!-- issue-workflow-lifecycle -->\nVerification: passed' },
    ] }), { marker: config.monitor.commentMarker });
    expect(isMonitorComment({ body: '<!-- issue-workflow-monitor -->' })).toBe(true);
    expect(activity.timestamp).toBe('2026-08-13T10:00:00.000Z');
  });

  it('uses the newest commit and PR evidence when it is newer than comments', () => {
    const activity = qualifyingActivity(issue({ comments: [{ createdAt: '2026-08-13T08:00:00.000Z', body: 'started' }] }), {
      commits: [{ branch: 'codex/issue-64-monitor', sha: 'abcdef123', timestamp: '2026-08-13T09:00:00.000Z' }],
      pullRequests: [{ number: 70, updatedAt: '2026-08-13T11:00:00.000Z' }],
    });
    expect(activity.source).toBe('PR #70');
  });

  it('flags exactly at the stale threshold', () => {
    const result = detectFindings({
      issue: issue({ comments: [{ createdAt: '2026-08-12T12:00:00.000Z', body: 'started' }] }),
      status: 'In progress',
      config,
      now,
    });
    expect(hoursSince(result.lastActivity, now)).toBe(24);
    expect(result.findings.map((finding) => finding.condition)).toContain('stale-active');
  });

  it('detects branch/PR evidence inconsistencies and closed/done mismatches', () => {
    const progress = detectFindings({ issue: issue(), status: 'In progress', config, now });
    expect(progress.findings.map((finding) => finding.condition)).toEqual(expect.arrayContaining(['stale-active', 'in-progress-missing-evidence']));

    const review = detectFindings({ issue: issue(), status: 'In review', config, branchNames: ['codex/issue-64-review'], now });
    expect(review.findings.map((finding) => finding.condition)).not.toContain('in-review-missing-evidence');

    const closed = detectFindings({ issue: issue({ state: 'CLOSED' }), status: 'In review', config, branchNames: ['codex/issue-64-review'], now });
    expect(closed.findings.map((finding) => finding.condition)).toContain('closed-not-done');

    const doneOpen = detectFindings({ issue: issue(), status: 'Done', config, now });
    expect(doneOpen.findings.map((finding) => finding.condition)).toEqual(expect.arrayContaining(['done-still-open', 'done-no-integration']));
  });

  it('suppresses all findings for workflow:paused issues', () => {
    const result = detectFindings({ issue: issue({ labels: [{ name: 'workflow:paused' }] }), status: 'In progress', config, now });
    expect(result.suppressed).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.suppressedConditions).toContain('stale-active');
  });

  it('honors the duplicate-alert cooldown and keeps dry runs write-free', () => {
    const existing = issue({ comments: [{ createdAt: '2026-08-13T08:30:00.000Z', body: '<!-- issue-workflow-monitor -->\ncondition=stale-active' }] });
    expect(recentAlertComment(existing, 'stale-active', config, now)).toBe(true);
    const result = { issue: 64, suppressed: false, findings: [{ condition: 'stale-active' }] };
    expect(alertActions(result, true)).toEqual([]);
    expect(alertActions(result, false)).toEqual([{ issue: 64, condition: 'stale-active' }]);
    expect(monitorComment(config, { issue: 64, condition: 'stale-active', status: 'In progress', recommendation: 'check it', lastActivity: null, evidence: 'none' }, 'local monitor run', now)).toContain('condition=stale-active');
  });

  it('parses dry-run and issue filters', () => {
    expect(parseArgs(['--dry-run', '--issue', '64'])).toEqual({ dryRun: true, issue: '64' });
    expect(() => parseArgs(['--issue', 'x'])).toThrow('numeric');
  });

  it('does not count future-dated activity as negative age', () => {
    expect(hoursSince('2026-08-13T13:00:00.000Z', now)).toBe(0);
  });

  it('keeps only board cards belonging to the configured repository', () => {
    const repository = 'meggarmind/RESIDIO';
    const card = (url: string) => ({ content: { number: 13, url } });

    expect(belongsToRepository(card('https://github.com/meggarmind/RESIDIO/issues/13'), repository)).toBe(true);
    expect(belongsToRepository(card('https://github.com/meggarmind/RESIDIO/pull/13'), repository)).toBe(true);

    // The board is shared, so another repository's #13 must not be mistaken for ours.
    expect(belongsToRepository(card('https://github.com/meggarmind/tomtracker/issues/13'), repository)).toBe(false);
    expect(belongsToRepository(card('https://github.com/meggarmind/CMBVsaq/issues/13'), repository)).toBe(false);

    // A draft card carries no URL, and a look-alike host or path must not pass.
    expect(belongsToRepository({ content: { number: 13 } }, repository)).toBe(false);
    expect(belongsToRepository(card('https://github.com/evil/meggarmind/RESIDIO/issues/13'), repository)).toBe(false);
  });
});

// #162: done-no-integration fired on cleanly closed issues. Each case below is a shape
// measured on the live board, not an invented one.
describe('done-no-integration evidence (#162)', () => {
  const done = (overrides = {}, extra = {}) =>
    detectFindings({ issue: issue({ number: 64, state: 'CLOSED', ...overrides }), status: 'Done', config, now, ...extra });
  const conditions = (result: { findings: Array<{ condition: string }> }) => result.findings.map((finding) => finding.condition);
  const mergedPr = (number: number, headRefName: string) => ({ number, headRefName, state: 'MERGED', mergedAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z' });

  it('counts a merged PR whose head branch has since been deleted', () => {
    // branchNames is the LIVE remote list; a merged branch is gone from it. #383 was
    // flagged because PRs were only paired to an issue through live branches.
    const result = done({}, { branchNames: [], pullRequests: [mergedPr(544, 'codex/issue-64-document-download-guard')] });
    expect(conditions(result)).not.toContain('done-no-integration');
    expect(result.pullRequests).toEqual([544]);
  });

  it('does not pair a merged PR from a different issue whose number shares a prefix', () => {
    const result = done({}, { pullRequests: [mergedPr(9, 'codex/issue-640-other')] });
    expect(conditions(result)).toContain('done-no-integration');
    expect(result.pullRequests).toEqual([]);
  });

  it('does not count an unmerged PR as integration', () => {
    const open = { number: 9, headRefName: 'codex/issue-64-wip', state: 'OPEN', mergedAt: null, updatedAt: '2026-08-01T00:00:00Z' };
    expect(conditions(done({}, { pullRequests: [open] }))).toContain('done-no-integration');
  });

  it('accepts integration shown by the default branch history', () => {
    expect(conditions(done({}, { mergedIssues: new Set([64]) }))).not.toContain('done-no-integration');
    expect(conditions(done({}, { mergedIssues: new Set([65]) }))).toContain('done-no-integration');
  });

  it.each(['NOT_PLANNED', 'DUPLICATE'])('does not expect integration when the issue was closed as %s', (stateReason) => {
    expect(conditions(done({ stateReason }))).not.toContain('done-no-integration');
  });

  it('still flags a COMPLETED closure with no evidence of any kind', () => {
    expect(conditions(done({ stateReason: 'COMPLETED' }))).toContain('done-no-integration');
  });
});

describe('mergedIssueNumbers (#162)', () => {
  it('reads the three subject forms this repository writes', () => {
    const found = mergedIssueNumbers([
      'Merge #164: scope global search to what the caller may actually see',
      'feat(db): add db:reconcile-version to restore authored migration version (#305)',
      'fix(#225): assert the migration sorts after its predecessors',
      'Merge pull request #528 from meggarmind/claude/issue-344-claim-check-harness-labels-v2',
      'Merge pull request #12 from meggarmind/fix/issue-77-thing',
    ]);
    expect([...found].sort((a, b) => a - b)).toEqual([77, 164, 225, 305, 344]);
  });

  it('does not treat a PR number in a merge subject as an issue reached through the branch', () => {
    // "#198" here is the PR; the issue is 344. 198 is in the set only via the PR's own
    // number, which is harmless because issues and PRs never share a number.
    const found = mergedIssueNumbers(['Merge pull request #198 from meggarmind/feature-without-issue-number']);
    expect(found.has(198)).toBe(false);
  });

  it('ignores bare mentions, reverts and look-alike numbers', () => {
    const found = mergedIssueNumbers([
      'docs: drop stale #306 pointer from ApprovalRequestType comment',
      'test: flaky drop-has-security-permission test (pre-existing #255)',
      'Revert "fix(ci): gate PR claim check on harness labels (#344)"',
      'fix: something (#1640)',
      'docs: note about Merge #7 in prose',
    ]);
    expect(found.has(306)).toBe(false);
    expect(found.has(255)).toBe(false);
    expect(found.has(344)).toBe(false);
    expect(found.has(164)).toBe(false);
    expect(found.has(7)).toBe(false);
    expect(found.has(1640)).toBe(true);
  });
});
