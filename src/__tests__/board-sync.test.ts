import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import {
  decideTransition,
  missingReadySections,
  parseIssueRefs,
  planPullRequest,
  rollupStatus,
} from '../../scripts/board-sync.mjs';

/**
 * Unit tests for the board automation rules (#1104). `decideTransition` is pure, so every row of
 * the lifecycle is tested from facts to decision with no network. The config is the real
 * `.github/board-automation.json`, so a renamed label there fails here.
 */

const cfg = JSON.parse(readFileSync(new URL('../../.github/board-automation.json', import.meta.url), 'utf8'));

type Over = Record<string, unknown>;
const issue = (over: Over = {}) => ({
  number: 50,
  state: 'open',
  stateReason: null,
  body: '',
  labels: [] as string[],
  status: null as string | null,
  children: [] as { status: string | null; state: string }[],
  hasOpenPr: false,
  closedBy: null as null | Record<string, unknown>,
  ...over,
});
const decide = (trigger: string, i: Over = {}, extra: Over = {}) =>
  decideTransition({ trigger, issue: issue(i), ...extra }, cfg);

describe('open issues: triage labels and Backlog / Ready', () => {
  it('adds backlog to a new issue with no triage label', () => {
    const d = decide('issue-opened');
    expect(d.addLabels).toEqual(['backlog']);
    expect(d.status).toBe('Backlog');
  });

  it('replaces needs-triage with backlog', () => {
    const d = decide('issue-opened', { labels: ['needs-triage'], status: 'Backlog' });
    expect(d.removeLabels).toEqual(['needs-triage']);
    expect(d.addLabels).toEqual(['backlog']);
  });

  it('keeps needs-info alone and in Backlog without adding backlog', () => {
    const d = decide('reconcile', { labels: ['needs-info'], status: 'Backlog' });
    expect(d).toMatchObject({ status: null, addLabels: [], removeLabels: [] });
  });

  it('moves Backlog to Ready on ready-for-agent and drops the backlog label', () => {
    const d = decide('issue-labeled', { labels: ['backlog', 'ready-for-agent'], status: 'Backlog' }, { label: 'ready-for-agent' });
    expect(d.status).toBe('Ready');
    expect(d.removeLabels).toEqual(['backlog']);
  });

  it('treats backlog added after ready-for-agent as the owner veto', () => {
    const d = decide('issue-labeled', { labels: ['backlog', 'ready-for-agent'], status: 'Ready' }, { label: 'backlog' });
    expect(d.status).toBe('Backlog');
    expect(d.removeLabels).toEqual(['ready-for-agent']);
  });

  it('lets ready win when reconciling a conflicting pair (#1096)', () => {
    const d = decide('reconcile', { labels: ['needs-triage', 'ready-for-agent'], status: 'Backlog' });
    expect(d.removeLabels).toEqual(['needs-triage']);
    expect(d.status).toBe('Ready');
  });

  it('does not pull an In progress issue back to Backlog', () => {
    expect(decide('reconcile', { labels: ['backlog'], status: 'In progress' }).status).toBeNull();
  });
});

describe('ready-for-agent check', () => {
  const body = '## Summary\nx\n## Scope\ny\n## Validation\nz';
  it('warns about the missing section, once per marker', () => {
    const d = decide('issue-labeled', { labels: ['ready-for-agent'], status: 'Ready', body }, { label: 'ready-for-agent' });
    expect(d.comment?.body).toContain('Success criteria');
    expect(d.comment?.marker).toBe(cfg.readyCheck.marker);
  });

  it('stays quiet when all three sections exist', () => {
    const full = `${body}\n## Acceptance criteria\nw`;
    expect(missingReadySections(full, cfg)).toEqual([]);
    const d = decide('issue-labeled', { labels: ['ready-for-agent'], status: 'Ready', body: full }, { label: 'ready-for-agent' });
    expect(d.comment).toBeNull();
  });

  it('does not run on ready-for-human', () => {
    const d = decide('issue-labeled', { labels: ['ready-for-human'], status: 'Ready' }, { label: 'ready-for-human' });
    expect(d.comment).toBeNull();
  });
});

describe('work in flight', () => {
  it('moves Ready to In progress when a branch for the issue is created', () => {
    expect(decide('branch-created', { labels: ['ready-for-agent'], status: 'Ready' }).status).toBe('In progress');
  });

  it('does not move an In review issue back when a branch is created', () => {
    expect(decide('branch-created', { status: 'In review', hasOpenPr: true }).status).toBeNull();
  });

  it('moves to In review when a PR opens', () => {
    expect(decide('pr-opened', { status: 'In progress' }).status).toBe('In review');
  });

  it('moves In review back to In progress when the PR closes unmerged', () => {
    expect(decide('pr-closed-unmerged', { status: 'In review' }).status).toBe('In progress');
  });

  it('keeps In review while another open PR still links the issue', () => {
    expect(decide('pr-closed-unmerged', { status: 'In review', hasOpenPr: true }).status).toBeNull();
  });

  it('sends a reopened issue to Ready when labelled ready, else In progress, and drops on-stage', () => {
    const ready = decide('issue-reopened', { labels: ['ready-for-agent', 'on-stage'], status: 'On stage' });
    expect(ready.status).toBe('Ready');
    expect(ready.removeLabels).toContain('on-stage');
    expect(decide('issue-reopened', { status: 'Done' }).status).toBe('In progress');
  });
});

describe('closed issues', () => {
  const stage = { base: 'stage', merged: true, onRelease: false };

  it('puts an issue closed by a PR merged into stage On stage with the label', () => {
    const d = decide('issue-closed', { state: 'closed', status: 'In review', labels: ['ready-for-agent'], closedBy: stage });
    expect(d.status).toBe('On stage');
    expect(d.addLabels).toEqual(['on-stage']);
    expect(d.removeLabels).toEqual(['ready-for-agent']);
  });

  it('acts on the merge event even before GitHub reports the issue closed', () => {
    const d = decide('pr-merged', { status: 'In review' }, { pr: stage });
    expect(d.status).toBe('On stage');
    expect(d.addLabels).toEqual(['on-stage']);
  });

  it('moves On stage to Done with a Released comment once the release contains the closing PR', () => {
    const d = decide(
      'release',
      { state: 'closed', status: 'On stage', labels: ['on-stage'], closedBy: { ...stage, onRelease: true } },
      { releaseTag: 'v1.12.0' },
    );
    expect(d.status).toBe('Done');
    expect(d.removeLabels).toEqual(['on-stage']);
    expect(d.comment?.body).toContain('Released in v1.12.0');
  });

  it('leaves On stage alone while the closing PR is not on the release branch', () => {
    const d = decide('release', { state: 'closed', status: 'On stage', labels: ['on-stage'], closedBy: stage });
    expect(d).toMatchObject({ status: null, addLabels: [], removeLabels: [], comment: null });
  });

  it('marks wontfix and not-planned closes Done', () => {
    expect(decide('issue-closed', { state: 'closed', status: 'Backlog', labels: ['wontfix', 'backlog'] }).status).toBe('Done');
    expect(decide('issue-closed', { state: 'closed', stateReason: 'NOT_PLANNED', status: 'Ready' }).status).toBe('Done');
  });

  it('marks an issue closed by hand, with no closing PR, Done and strips stale labels', () => {
    const d = decide('reconcile', { state: 'closed', status: 'Backlog', labels: ['needs-triage', 'on-stage'] });
    expect(d.status).toBe('Done');
    expect(d.removeLabels.sort()).toEqual(['needs-triage', 'on-stage']);
  });

  it('marks a PR merged straight into the release branch (hotfix) Done', () => {
    expect(decide('pr-merged', { status: 'In review' }, { pr: { base: 'master', merged: true } }).status).toBe('Done');
  });

  it('goes straight to Done in a repo without a stage branch', () => {
    const noStage = { ...cfg, stageBranch: null };
    const d = decideTransition({ trigger: 'pr-merged', pr: { base: 'main', merged: true }, issue: issue({ status: 'In review' }) }, noStage);
    expect(d.status).toBe('Done');
    expect(d.addLabels).toEqual([]);
  });
});

describe('parents and umbrellas', () => {
  const child = (status: string | null, state = 'open') => ({ status, state });

  it('rolls up from children', () => {
    expect(rollupStatus(['Done', 'Done'])).toBe('Done');
    expect(rollupStatus(['On stage', 'Done'])).toBe('On stage');
    expect(rollupStatus(['Done', 'Backlog'])).toBe('In progress');
    expect(rollupStatus(['In review', 'Ready'])).toBe('In progress');
    expect(rollupStatus(['Ready', 'Ready'])).toBe('Ready');
    expect(rollupStatus(['Ready', 'Backlog'])).toBe('Backlog');
    expect(rollupStatus([])).toBeNull();
  });

  it('takes its Status from its children and never closes', () => {
    const d = decide('child-changed', { status: 'Backlog', children: [child('On stage', 'closed'), child('In review')] });
    expect(d.status).toBe('In progress');
  });

  it('syncs on-stage to the rolled-up Status (the #290 / #1093 drift)', () => {
    const wrong = decide('reconcile', { labels: ['on-stage'], status: 'On stage', children: [child('Backlog'), child('Ready')] });
    expect(wrong.status).toBe('Backlog');
    expect(wrong.removeLabels).toEqual(['on-stage']);
    const right = decide('reconcile', { status: 'In progress', children: [child('On stage', 'closed'), child('On stage', 'closed')] });
    expect(right.status).toBe('On stage');
    expect(right.addLabels).toEqual(['on-stage']);
  });

  it('is not moved by a PR event that names it', () => {
    const d = decide('pr-opened', { status: 'Backlog', children: [child('Backlog')] });
    expect(d.status).toBeNull();
  });
});

describe('exemptions and drift flags', () => {
  it('never touches pinned issues, by label or by number', () => {
    // An untriaged Backlog issue would otherwise get `backlog`, so any change here means the exemption failed.
    for (const over of [{ labels: ['pinned'] }, { number: 412 }, { number: 1006 }]) {
      expect(decide('reconcile', { status: 'Backlog', ...over })).toMatchObject({ status: null, addLabels: [], removeLabels: [], comment: null });
    }
  });

  it('flags an open issue that carries on-stage instead of rewriting it', () => {
    const d = decide('reconcile', { labels: ['on-stage'], status: 'On stage' });
    expect(d.status).toBeNull();
    expect(d.removeLabels).toEqual([]);
    expect(d.flags.length).toBeGreaterThan(0);
  });
});

describe('pull request links', () => {
  it('parses closing keywords and Part of / Refs separately, ignoring cross-repo refs', () => {
    const refs = parseIssueRefs('Closes #12, fixes #13\nPart of #14\nRefs #15\nCloses other/repo#16');
    expect(refs.closes).toEqual([12, 13]);
    expect(refs.refs).toEqual([14, 15]);
  });

  it('one merged PR that closes several issues moves each one', () => {
    const issues = new Map([
      [12, issue({ number: 12, status: 'In review' })],
      [13, issue({ number: 13, status: 'In review' })],
      [14, issue({ number: 14, status: 'In review' })],
    ]);
    const plan = planPullRequest('merged', { body: 'Closes #12\nCloses #13\nPart of #14', base: 'stage' }, issues, cfg);
    expect(plan.map((d: { number: number; status: string }) => [d.number, d.status])).toEqual([[12, 'On stage'], [13, 'On stage']]);
  });

  it('an opened PR moves linked issues to In review, including Part of links', () => {
    const issues = new Map([[14, issue({ number: 14, status: 'In progress' })]]);
    const plan = planPullRequest('opened', { body: 'Part of #14', base: 'stage' }, issues, cfg);
    expect(plan[0].status).toBe('In review');
  });
});
