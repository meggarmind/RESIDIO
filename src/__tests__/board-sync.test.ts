import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import {
  addItemArgs,
  assertNoGraphqlErrors,
  commit,
  decideLinked,
  decideParent,
  decideTransition,
  prEventType,
  issueNumberFromBranch,
  mapProjectItems,
  mergeConfig,
  missingReadiness,
  parseArgs,
  parseLinkedIssues,
  projectNode,
  projectQueryArgs,
  reconcileIssue,
  setStatusArgs,
} from '../../scripts/board-sync.mjs';

/**
 * Pure-function tests for the board sync engine (#1104). No network, no gh: the state machine
 * takes plain objects, so every rule in scripts/board-sync.mjs is exercised against fixtures.
 */

const read = (name: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../.github/${name}`, import.meta.url)), 'utf8'));
const config = mergeConfig(read('issue-workflow.json'), read('board-automation.json'));
const noStage = { ...config, stageBranch: undefined };

type Issue = Record<string, unknown>;
const issue = (over: Issue = {}) => ({
  number: 7,
  state: 'OPEN',
  stateReason: null,
  labels: [] as string[],
  status: null as string | null,
  body: '',
  hasOpenPr: false,
  hasBranch: false,
  ...over,
});
const fullBody = '## Scope\nx\n## Required Change\ny\n## Validation\nz';
const STAGE_PR = { base: 'stage', head: 'claude/issue-7-x', title: 'Thing (#7)' };

describe('exempt issues', () => {
  it('leaves a pinned issue untouched for every event', () => {
    const pinned = issue({ labels: ['pinned', 'needs-triage'], status: 'Backlog' });
    for (const event of [
      { type: 'issue.opened' },
      { type: 'issue.labeled', label: 'ready-for-agent' },
      { type: 'issue.closed' },
      { type: 'pr.merged', pr: STAGE_PR },
    ]) {
      expect(decideTransition(event, pinned, config)).toEqual({ addLabels: [], removeLabels: [] });
    }
    expect(decideParent({ ...pinned, children: [{ state: 'CLOSED', status: 'Done' }] }, config)).toEqual({
      addLabels: [],
      removeLabels: [],
    });
    expect(reconcileIssue(pinned, config)).toEqual({ addLabels: [], removeLabels: [] });
  });
});

describe('rule 2: issue opened', () => {
  it('adds backlog and sets Backlog when there is no triage label', () => {
    expect(decideTransition({ type: 'issue.opened' }, issue(), config)).toMatchObject({
      addLabels: ['backlog'],
      removeLabels: [],
      status: 'Backlog',
    });
  });

  it('swaps needs-triage for backlog', () => {
    expect(decideTransition({ type: 'issue.opened' }, issue({ labels: ['needs-triage'] }), config)).toMatchObject({
      addLabels: ['backlog'],
      removeLabels: ['needs-triage'],
      status: 'Backlog',
    });
  });

  it('honours a ready label already present at creation: Ready, backlog/needs-* stripped', () => {
    const d = decideTransition({ type: 'issue.opened' }, issue({ labels: ['ready-for-agent', 'backlog', 'needs-info', 'needs-triage'] }), config);
    expect(d.status).toBe('Ready');
    expect(d.addLabels).toEqual([]);
    expect(d.removeLabels.sort()).toEqual(['backlog', 'needs-info', 'needs-triage']);
    expect(decideTransition({ type: 'issue.opened' }, issue({ labels: ['ready-for-human'], status: 'Backlog' }), config).status).toBe('Ready');
  });
});

describe('rule 3: needs-info', () => {
  it('drops backlog and ready labels and returns to Backlog', () => {
    const d = decideTransition(
      { type: 'issue.labeled', label: 'needs-info' },
      issue({ labels: ['needs-info', 'backlog', 'ready-for-agent'], status: 'Ready' }),
      config,
    );
    expect(d.removeLabels.sort()).toEqual(['backlog', 'ready-for-agent']);
    expect(d.status).toBe('Backlog');
  });

  it('does not drag started work back to Backlog', () => {
    const d = decideTransition({ type: 'issue.labeled', label: 'needs-info' }, issue({ labels: ['needs-info'], status: 'In progress' }), config);
    expect(d.status).toBeUndefined();
  });
});

describe('rule 4: ready labels', () => {
  const labeled = { type: 'issue.labeled', label: 'ready-for-agent' };

  it('sets Ready and strips the other triage labels', () => {
    const d = decideTransition(
      labeled,
      issue({ labels: ['ready-for-agent', 'backlog', 'needs-triage', 'needs-info'], status: 'Backlog', body: fullBody }),
      config,
    );
    expect(d.status).toBe('Ready');
    expect(d.removeLabels.sort()).toEqual(['backlog', 'needs-info', 'needs-triage']);
    expect(d.comment).toBeUndefined();
  });

  it('warns about missing readiness headings without reverting', () => {
    const d = decideTransition(labeled, issue({ labels: ['ready-for-agent'], status: 'Backlog', body: '## Scope\nonly' }), config);
    expect(d.status).toBe('Ready');
    expect(d.comment).toContain(config.readinessCommentMarker);
    expect(d.comment).toContain('Required Change');
    expect(d.comment).toContain('Validation');
    expect(d.comment).not.toContain('`## Scope`');
  });

  it('does not repeat the warning when already commented', () => {
    const d = decideTransition({ ...labeled, alreadyCommented: true }, issue({ labels: ['ready-for-agent'], body: '' }), config);
    expect(d.comment).toBeUndefined();
  });

  it('does not regress an In review issue (labels only)', () => {
    const d = decideTransition(labeled, issue({ labels: ['ready-for-human', 'backlog'], status: 'In review', body: fullBody }), config);
    expect(d.status).toBeUndefined();
    expect(d.removeLabels).toEqual(['backlog']);
  });

  it('accepts alternative heading names case-insensitively', () => {
    expect(missingReadiness('### scope\n## acceptance criteria\n## VERIFICATION', config)).toEqual([]);
  });
});

describe('rule 5: branch created', () => {
  it.each([null, 'Backlog', 'Ready'])('moves %s to In progress', (status) => {
    const d = decideTransition({ type: 'branch.created', branch: 'claude/issue-7-slug' }, issue({ status }), config);
    expect(d.status).toBe('In progress');
  });

  it('does not move an In review issue, nor a foreign branch', () => {
    expect(decideTransition({ type: 'branch.created', branch: 'claude/issue-7-slug' }, issue({ status: 'In review' }), config).status).toBeUndefined();
    expect(decideTransition({ type: 'branch.created', branch: 'claude/issue-8-slug' }, issue({ status: 'Ready' }), config).status).toBeUndefined();
    expect(decideTransition({ type: 'branch.created', branch: 'feat/thing' }, issue({ status: 'Ready' }), config).status).toBeUndefined();
  });

  it('parses the issue number under every lane prefix', () => {
    expect(issueNumberFromBranch(config, 'opencode/issue-12-a')).toBe(12);
    expect(issueNumberFromBranch(config, 'fix/issue-3-b')).toBe(3);
    expect(issueNumberFromBranch(config, 'feat/issue-3-b')).toBeNull();
  });
});

describe('rule 6: PR opened', () => {
  it('draft -> In progress, ready -> In review', () => {
    expect(decideTransition({ type: 'pr.draft' }, issue({ status: 'Ready' }), config).status).toBe('In progress');
    expect(decideTransition({ type: 'pr.ready' }, issue({ status: 'In progress' }), config).status).toBe('In review');
  });

  it('converted_to_draft pulls In review back to In progress', () => {
    expect(decideTransition({ type: 'pr.draft' }, issue({ status: 'In review' }), config).status).toBe('In progress');
  });

  it('never goes beyond In review', () => {
    expect(decideTransition({ type: 'pr.draft' }, issue({ status: 'On stage' }), config).status).toBeUndefined();
    expect(decideTransition({ type: 'pr.ready' }, issue({ status: 'Done' }), config).status).toBeUndefined();
  });
});

describe('rule 7: merged into stage', () => {
  it('moves to On stage, adds on-stage, strips triage labels and closes', () => {
    const d = decideTransition(
      { type: 'pr.merged', pr: STAGE_PR },
      issue({ labels: ['ready-for-agent', 'backlog'], status: 'In review' }),
      config,
    );
    expect(d).toMatchObject({ status: 'On stage', close: true, addLabels: ['on-stage'] });
    expect(d.removeLabels.sort()).toEqual(['backlog', 'ready-for-agent']);
  });

  it('does not re-close or regress a Done issue', () => {
    const d = decideTransition({ type: 'pr.merged', pr: STAGE_PR }, issue({ state: 'CLOSED', status: 'Done', labels: [] }), config);
    expect(d).toEqual({ addLabels: [], removeLabels: [] });
  });

  it('a merge for an issue already On stage stays On stage; Done is never regressed', () => {
    const onStage = decideTransition({ type: 'pr.merged', pr: STAGE_PR }, issue({ status: 'On stage', labels: ['on-stage'] }), config);
    expect(onStage.status).toBeUndefined();
    expect(onStage.addLabels).toEqual([]);
    expect(onStage.close).toBe(true);
    const done = decideTransition({ type: 'pr.merged', pr: STAGE_PR }, issue({ status: 'Done', labels: ['ready-for-agent'] }), config);
    expect(done.status).toBeUndefined();
    expect(done.addLabels).toEqual([]);
  });

  it('a master-into-stage sync PR marks linked issues Done', () => {
    const sync = { base: 'stage', head: 'chore/sync-master-into-stage', title: 'Chore: sync master into stage' };
    expect(decideTransition({ type: 'pr.merged', pr: sync }, issue({ status: 'On stage', labels: ['on-stage'] }), config)).toMatchObject({
      status: 'Done',
      close: true,
      removeLabels: ['on-stage'],
    });
    const byHead = { base: 'stage', head: 'master', title: 'whatever' };
    expect(decideTransition({ type: 'pr.merged', pr: byHead }, issue(), config).status).toBe('Done');
  });
});

describe('rules 8-10: merged to production', () => {
  const release = { base: 'master', head: 'stage' };

  it('release marks released issues Done, strips on-stage, comments with the version', () => {
    const d = decideTransition(
      { type: 'pr.merged', pr: release, released: true, version: 'v1.4.0' },
      issue({ state: 'CLOSED', status: 'On stage', labels: ['on-stage'] }),
      config,
    );
    expect(d.status).toBe('Done');
    expect(d.removeLabels).toEqual(['on-stage']);
    expect(d.comment).toContain('Released in v1.4.0');
    expect(d.comment).toContain(config.releaseCommentMarker);
  });

  it('does not comment twice', () => {
    const d = decideTransition(
      { type: 'pr.merged', pr: release, released: true, version: 'v1.4.0', alreadyCommented: true },
      issue({ state: 'CLOSED', status: 'On stage', labels: ['on-stage'] }),
      config,
    );
    expect(d.comment).toBeUndefined();
    expect(d.status).toBe('Done');
  });

  it('ignores a release PR for an issue the caller did not confirm as released', () => {
    expect(decideTransition({ type: 'pr.merged', pr: release }, issue({ status: 'On stage' }), config)).toEqual({ addLabels: [], removeLabels: [] });
  });

  it('a hotfix straight to master is Done and closed', () => {
    const d = decideTransition(
      { type: 'pr.merged', pr: { base: 'master', head: 'fix/issue-7-x', title: 'Fix' } },
      issue({ labels: ['ready-for-agent'], status: 'In review' }),
      config,
    );
    expect(d).toMatchObject({ status: 'Done', close: true, removeLabels: ['ready-for-agent'] });
  });

  it('with no stage branch, a merge into the default branch is Done', () => {
    const d = decideTransition(
      { type: 'pr.merged', pr: { base: 'master', head: 'feat/x', title: 'x' } },
      issue({ labels: ['backlog'], status: 'In review' }),
      noStage,
    );
    expect(d).toMatchObject({ status: 'Done', close: true, removeLabels: ['backlog'] });
  });

  it('ignores merges into unrelated branches', () => {
    expect(decideTransition({ type: 'pr.merged', pr: { base: 'feat/other', head: 'x', title: 'x' } }, issue({ status: 'In review' }), config)).toEqual({ addLabels: [], removeLabels: [] });
  });
});

describe('rule 11: PR closed unmerged', () => {
  it('returns In review to In progress when no other PR is open', () => {
    expect(decideTransition({ type: 'pr.closed' }, issue({ status: 'In review', hasOpenPr: false }), config).status).toBe('In progress');
  });

  it('keeps In review while another PR is open, and ignores other statuses', () => {
    expect(decideTransition({ type: 'pr.closed' }, issue({ status: 'In review', hasOpenPr: true }), config).status).toBeUndefined();
    expect(decideTransition({ type: 'pr.closed' }, issue({ status: 'Ready' }), config).status).toBeUndefined();
  });
});

describe('rule 12: reopened', () => {
  const closed = { state: 'CLOSED', status: 'On stage', labels: ['on-stage'] };

  it('goes to In progress when work exists, else Ready; drops on-stage', () => {
    const withBranch = decideTransition({ type: 'issue.reopened' }, issue({ ...closed, hasBranch: true }), config);
    expect(withBranch).toMatchObject({ status: 'In progress', reopen: true, removeLabels: ['on-stage'] });
    expect(decideTransition({ type: 'issue.reopened' }, issue({ ...closed, hasOpenPr: true }), config).status).toBe('In progress');
    expect(decideTransition({ type: 'issue.reopened' }, issue(closed), config).status).toBe('Ready');
  });
});

describe('rules 13-14: closed', () => {
  it('not_planned, duplicate and wontfix close to Done, stripping triage but keeping wontfix', () => {
    const cases = [
      { stateReason: 'NOT_PLANNED', labels: ['backlog', 'ready-for-agent'] },
      { stateReason: 'not_planned', labels: ['backlog', 'ready-for-agent'] },
      { stateReason: 'DUPLICATE', labels: ['backlog', 'ready-for-agent'] },
      { stateReason: 'COMPLETED', labels: ['backlog', 'ready-for-agent', 'wontfix'] },
    ];
    for (const over of cases) {
      const d = decideTransition({ type: 'issue.closed' }, issue({ state: 'CLOSED', status: 'Backlog', ...over }), config);
      expect(d.status).toBe('Done');
      expect(d.removeLabels.sort()).toEqual(['backlog', 'ready-for-agent']);
    }
  });

  it('a duplicate close is Done even when a merged PR exists', () => {
    const d = decideTransition({ type: 'issue.closed' }, issue({ state: 'CLOSED', stateReason: 'DUPLICATE', status: 'In review', hasMergedPr: true }), config);
    expect(d.status).toBe('Done');
  });

  it('a manual completed close with no merged PR goes to Done', () => {
    expect(decideTransition({ type: 'issue.closed' }, issue({ state: 'CLOSED', stateReason: 'COMPLETED', status: 'In progress', hasMergedPr: false }), config).status).toBe('Done');
  });

  it('leaves the transition to the PR handler when a merged PR exists, and leaves On stage alone', () => {
    expect(decideTransition({ type: 'issue.closed' }, issue({ state: 'CLOSED', stateReason: 'COMPLETED', status: 'In review', hasMergedPr: true }), config).status).toBeUndefined();
    expect(decideTransition({ type: 'issue.closed' }, issue({ state: 'CLOSED', stateReason: 'COMPLETED', status: 'On stage' }), config).status).toBeUndefined();
  });
});

describe('rule 15: parent rollup', () => {
  const child = (state: string, status: string | null) => ({ state, status });
  const parent = (over: Issue = {}) => issue({ number: 1, status: 'Backlog', ...over });

  it('one started child moves the parent to In progress', () => {
    const d = decideParent(parent({ children: [child('OPEN', 'In progress'), child('OPEN', 'Backlog')] }), config);
    expect(d.status).toBe('In progress');
    expect(d.close).toBeUndefined();
  });

  it('untouched children leave the parent alone', () => {
    expect(decideParent(parent({ children: [child('OPEN', 'Backlog'), child('OPEN', 'Ready')] }), config).status).toBeUndefined();
  });

  it('all children closed -> On stage, never closed or reopened', () => {
    const d = decideParent(parent({ children: [child('CLOSED', 'On stage'), child('CLOSED', 'Done')] }), config);
    expect(d.status).toBe('On stage');
    expect(d.close).toBeUndefined();
    expect(decideParent(parent({ state: 'CLOSED', children: [child('CLOSED', 'On stage')] }), config).reopen).toBeUndefined();
  });

  it('all children Done -> parent Done and closed', () => {
    expect(decideParent(parent({ status: 'On stage', children: [child('CLOSED', 'Done'), child('CLOSED', 'Done')] }), config)).toMatchObject({ status: 'Done', close: true });
  });

  it('without a stage branch, all children closed -> Done', () => {
    expect(decideParent(parent({ children: [child('CLOSED', null)] }), noStage)).toMatchObject({ status: 'Done', close: true });
  });

  it('parent is never closed while a child is open', () => {
    expect(decideParent(parent({ children: [child('CLOSED', 'Done'), child('OPEN', 'In review')] }), config).close).toBeUndefined();
  });

  it('parents never carry on-stage', () => {
    expect(decideParent(parent({ labels: ['on-stage'], children: [child('OPEN', 'Backlog')] }), config).removeLabels).toEqual(['on-stage']);
  });

  it('a Done parent with all children closed but not all Done stays Done', () => {
    const d = decideParent(parent({ state: 'CLOSED', status: 'Done', children: [child('CLOSED', 'On stage'), child('CLOSED', 'Done')] }), config);
    expect(d.status).toBeUndefined();
    expect(d.close).toBeUndefined();
  });

  it('does not regress a parent that is further along', () => {
    expect(decideParent(parent({ status: 'In review', children: [child('OPEN', 'In progress')] }), config).status).toBeUndefined();
  });
});

describe('reconcileIssue', () => {
  it('backfills an open on-stage issue whose PR merged into stage: close + On stage', () => {
    const d = reconcileIssue(issue({ labels: ['on-stage', 'ready-for-agent'], status: 'In review', mergedPrBase: 'stage', released: false }), config);
    expect(d).toMatchObject({ status: 'On stage', close: true, removeLabels: ['ready-for-agent'] });
    expect(d.addLabels).toEqual([]);
  });

  it('strips on-stage from an open issue with no merged PR and reports it', () => {
    const d = reconcileIssue(issue({ labels: ['on-stage'], status: 'In progress' }), config);
    expect(d.removeLabels).toEqual(['on-stage']);
    expect(d.status).toBeUndefined();
    expect(d.notes?.[0]).toMatch(/no merged PR/);
  });

  it('closed + released issue: Done, strips on-stage and stale ready-for-agent', () => {
    const d = reconcileIssue(
      issue({ state: 'CLOSED', stateReason: 'COMPLETED', labels: ['on-stage', 'ready-for-agent'], status: 'On stage', mergedPrBase: 'stage', released: true }),
      config,
    );
    expect(d.status).toBe('Done');
    expect(d.removeLabels.sort()).toEqual(['on-stage', 'ready-for-agent']);
  });

  it('closed + merged to stage, unreleased: On stage with the label', () => {
    const d = reconcileIssue(issue({ state: 'CLOSED', labels: ['ready-for-agent'], status: 'Ready', mergedPrBase: 'stage', released: false }), config);
    expect(d).toMatchObject({ status: 'On stage', addLabels: ['on-stage'], removeLabels: ['ready-for-agent'] });
  });

  it('closed on a repo with no stage: Done', () => {
    expect(reconcileIssue(issue({ state: 'CLOSED', status: 'In review', mergedPrBase: 'master' }), noStage).status).toBe('Done');
  });

  it('open issue lanes: PR, draft PR, branch, ready label, nothing', () => {
    expect(reconcileIssue(issue({ hasOpenPr: true, openPrIsDraft: false, labels: ['backlog'] }), config).status).toBe('In review');
    expect(reconcileIssue(issue({ hasOpenPr: true, openPrIsDraft: true, labels: ['backlog'] }), config).status).toBe('In progress');
    expect(reconcileIssue(issue({ hasBranch: true, labels: ['backlog'] }), config).status).toBe('In progress');
    expect(reconcileIssue(issue({ labels: ['ready-for-agent', 'backlog'], status: 'Backlog' }), config)).toMatchObject({ status: 'Ready', removeLabels: ['backlog'] });
    expect(reconcileIssue(issue(), config)).toMatchObject({ status: 'Backlog', addLabels: ['backlog'] });
  });

  it('swaps needs-triage for backlog', () => {
    expect(reconcileIssue(issue({ labels: ['needs-triage'], status: 'Backlog' }), config)).toMatchObject({ addLabels: ['backlog'], removeLabels: ['needs-triage'] });
  });

  it('never moves started work backwards; with no evidence it only reports', () => {
    const d = reconcileIssue(issue({ labels: ['backlog'], status: 'In review', hasOpenPr: true, openPrIsDraft: true }), config);
    expect(d.status).toBeUndefined();
    const orphan = reconcileIssue(issue({ labels: ['ready-for-agent'], status: 'In progress' }), config);
    expect(orphan.status).toBeUndefined();
    expect(orphan.notes?.[0]).toMatch(/reported only/);
  });

  it('is idempotent: a settled issue yields an empty diff', () => {
    expect(reconcileIssue(issue({ labels: ['backlog'], status: 'Backlog' }), config)).toEqual({ addLabels: [], removeLabels: [] });
  });
});

describe('parseLinkedIssues', () => {
  it('yields one number per issue from closing references, body keywords and the branch, de-duplicated', () => {
    const numbers = parseLinkedIssues({
      closingIssuesReferences: [{ number: 5 }, { number: 9 }],
      body: 'Closes #5: Title\nFixes #12 and Resolves #14, #15\nPart of #20\nSee also #99',
      headRefName: 'claude/issue-9-slug',
      config,
      selfNumber: 200,
    });
    expect(numbers).toEqual([5, 9, 12, 14, 15]);
  });

  it('"Part of #epic" is not a link', () => {
    expect(parseLinkedIssues({ body: 'Part of #50: Epic\nCloses #51', config })).toEqual([51]);
  });

  it('one PR closing several issues produces a transition per issue', () => {
    const linked = parseLinkedIssues({ body: 'Closes #3, #4', headRefName: 'feat/x', config });
    const results = linked.map((n: number) => decideTransition({ type: 'pr.merged', pr: STAGE_PR }, issue({ number: n, status: 'In review' }), config));
    expect(linked).toEqual([3, 4]);
    expect(results.every((r: { status?: string }) => r.status === 'On stage')).toBe(true);
  });

  it('ignores other repositories and the PR itself', () => {
    expect(
      parseLinkedIssues({
        closingIssuesReferences: [{ number: 1, repository: { owner: { login: 'other' }, name: 'repo' } }],
        body: 'Closes other/repo#2, Closes meggarmind/RESIDIO#3, Closes #77',
        config,
        selfNumber: 77,
      }),
    ).toEqual([3]);
  });
});

describe('parseArgs', () => {
  it('parses modes and flags, rejects unknown input', () => {
    expect(parseArgs(['--reconcile', '--dry-run'])).toMatchObject({ mode: 'reconcile', dryRun: true });
    expect(parseArgs(['--event', '--ci'])).toMatchObject({ mode: 'event', ci: true });
    expect(parseArgs(['--help']).help).toBe(true);
    expect(() => parseArgs([])).toThrow();
    expect(() => parseArgs(['--bogus'])).toThrow();
  });
});

describe('prEventType', () => {
  it('detects a merge from mergedAt or state, not a nonexistent `merged` field', () => {
    expect(prEventType('closed', { mergedAt: '2026-10-01T00:00:00Z', state: 'MERGED' })).toBe('pr.merged');
    expect(prEventType('closed', { mergedAt: '2026-10-01T00:00:00Z' })).toBe('pr.merged');
    expect(prEventType('closed', { state: 'MERGED' })).toBe('pr.merged');
    expect(prEventType('closed', { mergedAt: null, state: 'CLOSED' })).toBe('pr.closed');
  });

  it('maps draft and ready transitions and ignores other actions', () => {
    expect(prEventType('opened', { isDraft: true })).toBe('pr.draft');
    expect(prEventType('reopened', { isDraft: true })).toBe('pr.draft');
    expect(prEventType('converted_to_draft', { isDraft: true })).toBe('pr.draft');
    expect(prEventType('opened', { isDraft: false })).toBe('pr.ready');
    expect(prEventType('ready_for_review', { isDraft: false })).toBe('pr.ready');
    expect(prEventType('synchronize', { isDraft: false })).toBeNull();
  });
});

describe('decideLinked: parents are rolled up, not transitioned', () => {
  it('uses decideParent for an issue with sub-issues, even on a stage merge', () => {
    const parent = issue({ number: 50, status: 'Backlog', labels: ['on-stage'], children: [{ state: 'OPEN', status: 'In progress' }] });
    const d = decideLinked({ type: 'pr.merged', pr: STAGE_PR }, parent, config);
    expect(d.status).toBe('In progress');
    expect(d.close).toBeUndefined();
    expect(d.addLabels).toEqual([]);
    expect(d.removeLabels).toEqual(['on-stage']);
  });

  it('uses decideTransition for a leaf issue', () => {
    expect(decideLinked({ type: 'pr.merged', pr: STAGE_PR }, issue({ status: 'In review', children: [] }), config).status).toBe('On stage');
  });
});

describe('commit (dry-run write gate)', () => {
  const decision = { addLabels: ['x'], removeLabels: [], status: 'Ready' };

  it('calls the writer for a live non-empty diff', () => {
    let calls = 0;
    expect(commit(issue(), decision, { dryRun: false }, () => { calls += 1; })).toBe(true);
    expect(calls).toBe(1);
  });

  it('never calls the writer on a dry run or an empty diff', () => {
    let calls = 0;
    const writer = () => { calls += 1; };
    expect(commit(issue(), decision, { dryRun: true }, writer)).toBe(false);
    expect(commit(issue(), { addLabels: [], removeLabels: [] }, { dryRun: false }, writer)).toBe(false);
    expect(calls).toBe(0);
  });
});

describe('GraphQL project mapping (#1104)', () => {
  const REPO = 'meggarmind/RESIDIO';
  const page = (nodes: unknown[], root = 'user') => ({ data: { [root]: { projectV2: { id: 'PVT_x', items: { nodes } } } } });
  const url = (kind: string, n: number, repo = REPO) => `https://github.com/${repo}/${kind}/${n}`;

  it('maps an Issue node with a Status', () => {
    const items = mapProjectItems(
      page([{ id: 'PVTI_1', content: { __typename: 'Issue', number: 7, url: url('issues', 7) }, fieldValueByName: { name: 'In progress' } }]),
      REPO,
    );
    expect(items).toEqual([{ id: 'PVTI_1', content: { type: 'Issue', number: 7, url: url('issues', 7) }, status: 'In progress' }]);
  });

  it('gives a node with no Status a null status', () => {
    const [item] = mapProjectItems(
      page([{ id: 'PVTI_2', content: { __typename: 'Issue', number: 8, url: url('issues', 8) }, fieldValueByName: null }]),
      REPO,
    );
    expect(item.status).toBeNull();
  });

  it('maps a PullRequest node and tags its type', () => {
    const [item] = mapProjectItems(
      page([{ id: 'PVTI_3', content: { __typename: 'PullRequest', number: 9, url: url('pull', 9) }, fieldValueByName: { name: 'In review' } }]),
      REPO,
    );
    expect(item.content.type).toBe('PullRequest');
    expect(item.content.number).toBe(9);
  });

  it('skips draft issues that have no content', () => {
    const items = mapProjectItems(page([{ id: 'PVTI_4', content: {}, fieldValueByName: null }, { id: 'PVTI_5', content: null }]), REPO);
    expect(items).toEqual([]);
  });

  it('filters out items from another repository', () => {
    const items = mapProjectItems(
      page([
        { id: 'a', content: { __typename: 'Issue', number: 1, url: url('issues', 1, 'someone/else') }, fieldValueByName: null },
        { id: 'b', content: { __typename: 'Issue', number: 2, url: url('issues', 2) }, fieldValueByName: null },
      ]),
      REPO,
    );
    expect(items.map((i: { id: string }) => i.id)).toEqual(['b']);
  });

  it('reads the project from user or organization, and null when neither resolves', () => {
    expect(projectNode(page([], 'user'))?.id).toBe('PVT_x');
    expect(projectNode(page([], 'organization'))?.id).toBe('PVT_x');
    expect(projectNode({ data: { user: null } })).toBeNull();
    expect(mapProjectItems({ data: { user: null } }, REPO)).toEqual([]);
  });

  it('surfaces GraphQL errors as a thrown message', () => {
    expect(() => assertNoGraphqlErrors({ errors: [{ message: 'boom' }, { message: 'bang' }] })).toThrow(/boom; bang/);
    expect(assertNoGraphqlErrors({ data: {} })).toEqual({ data: {} });
  });

  it('passes values as variables, never in the query, and omits cursor on page one', () => {
    const base = { owner: 'meggarmind', number: 1, statusField: 'Status' };
    const first = projectQueryArgs('user', base);
    expect(first.some((a: string) => a.startsWith('cursor='))).toBe(false);
    expect(first).toContain('owner=meggarmind');
    expect(first).toContain('number=1');
    const query = first.find((a: string) => a.startsWith('query=')) as string;
    expect(query).toContain('user(login: $owner)');
    expect(query).not.toContain('meggarmind');
    expect(projectQueryArgs('organization', { ...base, cursor: 'abc' })).toContain('cursor=abc');
    expect(() => projectQueryArgs('x', base)).toThrow();
  });

  it('builds the mutation arguments with variables', () => {
    const set = setStatusArgs('P', 'I', 'F', 'O');
    expect(set).toEqual(expect.arrayContaining(['p=P', 'i=I', 'f=F', 'o=O']));
    expect(set.find((a: string) => a.startsWith('query='))).toContain('updateProjectV2ItemFieldValue');
    const add = addItemArgs('P', 'C');
    expect(add).toEqual(expect.arrayContaining(['p=P', 'c=C']));
    expect(add.find((a: string) => a.startsWith('query='))).toContain('addProjectV2ItemById');
  });
});
