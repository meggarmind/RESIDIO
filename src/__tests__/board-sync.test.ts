import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import {
  decideTransition,
  parseReleases,
  rawFromNode,
  releaseTagForClose,
  missingReadySections,
  parseIssueRefs,
  planPullRequest,
  rollupStatus,
  runEach,
  shouldWriteStatus,
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
  closedAt: null as string | null,
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

  describe('closed by hand, against the last release (24 October 2026)', () => {
    const released = '2026-10-20T12:00:00Z';
    const handClosed = (closedAt: string | null, over: Over = {}, extra: Over = {}) =>
      decide('reconcile', { state: 'closed', status: 'Backlog', closedAt, ...over }, { lastReleaseAt: released, ...extra });

    it('is Done when closed before the last release', () => {
      expect(handClosed('2026-10-19T12:00:00Z').status).toBe('Done');
    });

    it('is Done when closed exactly at the last release', () => {
      expect(handClosed(released).status).toBe('Done');
    });

    it('is On stage, with the label, when closed after the last release', () => {
      const d = handClosed('2026-10-21T12:00:00Z', { labels: ['backlog'] });
      expect(d.status).toBe('On stage');
      expect(d.addLabels).toEqual(['on-stage']);
      expect(d.removeLabels).toEqual(['backlog']);
    });

    it('stays On stage on a later pass', () => {
      const d = handClosed('2026-10-21T12:00:00Z', { status: 'On stage', labels: ['on-stage'] });
      expect(d).toMatchObject({ status: null, addLabels: [], removeLabels: [], comment: null });
    });

    it('is Done when no release tag is known', () => {
      expect(handClosed('2026-10-21T12:00:00Z', {}, { lastReleaseAt: null }).status).toBe('Done');
    });

    it('is Done when closed not planned after the release', () => {
      expect(handClosed('2026-10-21T12:00:00Z', { stateReason: 'NOT_PLANNED' }).status).toBe('Done');
    });

    it('is Done in a repo without a stage branch', () => {
      const noStage = { ...cfg, stageBranch: null };
      const d = decideTransition(
        { trigger: 'reconcile', lastReleaseAt: released, issue: issue({ state: 'closed', status: 'Backlog', closedAt: '2026-10-21T12:00:00Z' }) },
        noStage,
      );
      expect(d.status).toBe('Done');
    });

    const onStageClosed = { state: 'closed', status: 'On stage', labels: ['on-stage'], closedAt: '2026-10-19T12:00:00Z' };

    it('does not put a closed parent On stage, before or after the release', () => {
      const children = [{ state: 'closed', status: 'Done' }];
      for (const closedAt of ['2026-10-19T12:00:00Z', '2026-10-21T12:00:00Z']) {
        const d = handClosed(closedAt, { status: 'Done', children });
        expect(d).toMatchObject({ status: null, addLabels: [] });
      }
    });

    it('posts no Released comment for a not-planned or wontfix On stage issue', () => {
      for (const over of [{ stateReason: 'NOT_PLANNED' }, { labels: ['on-stage', 'wontfix'] }]) {
        const d = decide('release', { ...onStageClosed, ...over }, { lastReleaseAt: released });
        expect(d.status).toBe('Done');
        expect(d.comment).toBeNull();
      }
    });

    it('posts no Released comment when no release is known', () => {
      const d = decide('release', onStageClosed, { lastReleaseAt: null });
      expect(d.comment).toBeNull();
    });

    it('posts no Released comment for a hotfix merged straight into the release branch', () => {
      const d = decide('pr-merged', { status: 'On stage', labels: ['on-stage'] }, { pr: { base: 'master', merged: true }, lastReleaseAt: released });
      expect(d.status).toBe('Done');
      expect(d.comment).toBeNull();
    });

    it('changes nothing for a hand-closed issue when the release list is unavailable', () => {
      for (const status of ['Backlog', 'On stage', 'Done']) {
        const d = decide('reconcile', { state: 'closed', status, labels: ['backlog', 'on-stage'], closedAt: '2026-10-21T12:00:00Z' }, { lastReleaseAt: null, releasesUnavailable: true });
        expect(d).toMatchObject({ status: null, addLabels: [], removeLabels: [], comment: null });
      }
    });

    it('still decides a PR-closed issue when the release list is unavailable', () => {
      const d = decide('issue-closed', { state: 'closed', status: 'In review', closedBy: stage }, { releasesUnavailable: true });
      expect(d.status).toBe('On stage');
    });

    it('moves an On stage issue closed before the release merge to Done with the Released comment', () => {
      const d = decide(
        'release',
        { state: 'closed', status: 'On stage', labels: ['on-stage'], closedAt: '2026-10-19T12:00:00Z' },
        { lastReleaseAt: released, releaseTag: 'v1.13.0' },
      );
      expect(d.status).toBe('Done');
      expect(d.removeLabels).toEqual(['on-stage']);
      expect(d.comment?.body).toContain('Released in v1.13.0');
    });

    it('leaves an On stage issue closed after the release merge On stage', () => {
      const d = decide(
        'release',
        { state: 'closed', status: 'On stage', labels: ['on-stage'], closedAt: '2026-10-21T12:00:00Z' },
        { lastReleaseAt: released, releaseTag: 'v1.13.0' },
      );
      expect(d).toMatchObject({ status: null, addLabels: [], removeLabels: [], comment: null });
    });
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
    expect(plan.map((d) => [d.number, d.status])).toEqual([[12, 'On stage'], [13, 'On stage']]);
  });

  it('an opened PR moves linked issues to In review, including Part of links', () => {
    const issues = new Map([[14, issue({ number: 14, status: 'In progress' })]]);
    const plan = planPullRequest('opened', { body: 'Part of #14', base: 'stage' }, issues, cfg);
    expect(plan[0].status).toBe('In review');
  });
});

describe('release tag helpers', () => {
  const row = (at: string, tag: string, peeled: string, plain = '') => [at, tag, peeled, plain].join('\t');
  const lines = [
    row('2026-09-01T00:00:00+00:00', 'v1.1.0', '', 'Merge pull request #734 from meggarmind/stage'),
    row('2026-10-20T12:00:00+00:00', 'v1.3.0', 'Merge pull request #1001 from meggarmind/stage', 'Release 1.3.0 tag message'),
    row('2026-10-01T00:00:00+00:00', 'nightly-1', '', 'Release v9'),
    '',
    row('2026-10-10T00:00:00+00:00', 'v1.2.0', '', 'Release v1.2.0 (#831)'),
    row('2026-10-22T00:00:00+00:00', 'v1.3.1', '', 'Merge pull request #1092 from meggarmind/fm/residio-1090'),
  ];

  it('keeps only stage release tags (both merge forms, annotated or not), newest first', () => {
    expect(parseReleases(lines, 'stage').map((r: { tag: string }) => r.tag)).toEqual(['v1.3.0', 'v1.2.0', 'v1.1.0']);
  });

  it('drops a hotfix tag, so a newer hotfix does not move the last release', () => {
    const rel = parseReleases(lines, 'stage');
    expect(rel[0]).toEqual({ at: '2026-10-20T12:00:00+00:00', tag: 'v1.3.0' });
    expect(rel.some((r: { tag: string }) => r.tag === 'v1.3.1')).toBe(false);
  });

  it('reads an annotated tag subject from the peeled commit, not the tag message', () => {
    const annotated = row('2026-10-20T12:00:00+00:00', 'v2.0.0', 'Merge pull request #5 from o/stage', 'tag message');
    const hotfixAnnotated = row('2026-10-21T12:00:00+00:00', 'v2.0.1', 'Merge pull request #6 from o/fix', 'Release v2.0.1');
    expect(parseReleases([annotated, hotfixAnnotated], 'stage').map((r: { tag: string }) => r.tag)).toEqual(['v2.0.0']);
  });

  it('picks the oldest release at or after the close, including an equal time', () => {
    const rel = parseReleases(lines, 'stage');
    expect(releaseTagForClose(rel, '2026-10-05T00:00:00Z')).toBe('v1.2.0');
    expect(releaseTagForClose(rel, '2026-10-10T00:00:00Z')).toBe('v1.2.0');
    expect(releaseTagForClose(rel, '2026-10-10T00:00:01Z')).toBe('v1.3.0');
    expect(releaseTagForClose(rel, '2026-10-21T00:00:00Z')).toBeNull();
    expect(releaseTagForClose(rel, null)).toBeNull();
  });
});

describe('rawFromNode', () => {
  const node = (closedAt?: string | null) => ({
    id: 'I_1', number: 7, state: 'CLOSED', stateReason: 'COMPLETED', body: null, closedAt,
    labels: { nodes: [] }, parent: null, subIssues: { nodes: [] }, projectItems: { nodes: [] },
    closedByPullRequestsReferences: { nodes: [] },
  });

  it('maps closedAt, null when absent', () => {
    expect(rawFromNode(node('2026-10-21T12:00:00Z'), cfg).closedAt).toBe('2026-10-21T12:00:00Z');
    expect(rawFromNode(node(undefined), cfg).closedAt).toBeNull();
  });
});

describe('archived cards and per-issue error isolation (#1104)', () => {
  const raw = (over: Over = {}) => ({ itemId: 'PVTI_1', itemArchived: false, state: 'open', ...over });
  const d = (over: Over = {}) => ({ status: 'In review', ...over });

  it('writes Status on a normal card', () => {
    expect(shouldWriteStatus(raw(), d())).toBe(true);
  });
  it('skips Status on an archived card', () => {
    expect(shouldWriteStatus(raw({ itemArchived: true }), d())).toBe(false);
  });
  it('skips a closed, off-board issue that ends Done', () => {
    expect(shouldWriteStatus(raw({ itemId: null, state: 'closed' }), d({ status: 'Done' }))).toBe(false);
  });
  it('skips when there is no status change', () => {
    expect(shouldWriteStatus(raw(), d({ status: null }))).toBe(false);
  });

  it('rawFromNode maps isArchived onto itemArchived', () => {
    const node = (isArchived: boolean) => ({
      id: 'I', number: 1, state: 'OPEN', stateReason: null, closedAt: null, body: '',
      labels: { nodes: [] }, parent: null, subIssues: { nodes: [] },
      projectItems: { nodes: [{ id: 'PVTI_1', isArchived, project: { number: cfg.project.number }, fieldValueByName: null }] },
      closedByPullRequestsReferences: { nodes: [] },
    });
    expect(rawFromNode(node(true), cfg).itemArchived).toBe(true);
    expect(rawFromNode(node(false), cfg).itemArchived).toBe(false);
  });

  it('runEach continues past a throwing item and counts it', () => {
    const seen: number[] = [];
    const { errors } = runEach([1, 2, 3], (n: number) => {
      if (n === 2) throw new Error('boom');
      seen.push(n);
    });
    expect(seen).toEqual([1, 3]);
    expect(errors).toBe(1);
  });
});
