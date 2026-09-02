import { describe, expect, it } from 'vitest';
import {
  alertActions,
  belongsToRepository,
  detectFindings,
  hoursSince,
  isMonitorComment,
  matchingBranches,
  monitorComment,
  parseArgs,
  qualifyingActivity,
  recentAlertComment,
} from '../../../scripts/issue-monitor.mjs';

const now = new Date('2026-08-13T12:00:00.000Z');
const config = {
  branchPrefix: 'codex/issue-',
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
