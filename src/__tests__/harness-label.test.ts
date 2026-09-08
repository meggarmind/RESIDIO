import { describe, expect, it } from 'vitest';
import {
  HARNESS_LANES,
  decideLabelAction,
  labelForLane,
} from '../../scripts/harness-label.mjs';

/**
 * Unit tests for the harness label backstop (#324). Fixture-driven, no filesystem or network
 * access — every exported function here is pure, matching pr-claim-check.test.ts's approach of
 * testing the rules rather than the I/O (the GraphQL/REST calls live in the script's `main()`).
 *
 * The lane -> harness distinction is the load-bearing part: `fix` is a lane in
 * `.github/issue-workflow.json`'s `branchPrefixes`, but it is not a harness, and a branch whose
 * prefix names no harness must be left unlabelled rather than guessed at
 * (docs/agents/project-board.md, "Harness labels").
 */

describe('labelForLane — lanes that name a harness', () => {
  it('maps the claude lane to harness:claude', () => {
    expect(labelForLane('claude')).toBe('harness:claude');
  });

  it('maps the codex lane to harness:codex', () => {
    expect(labelForLane('codex')).toBe('harness:codex');
  });

  it('maps the opencode lane to harness:opencode', () => {
    expect(labelForLane('opencode')).toBe('harness:opencode');
  });

  it('covers exactly the three harness lanes and no more', () => {
    expect(HARNESS_LANES).toEqual(['claude', 'codex', 'opencode']);
  });
});

describe('labelForLane — lanes that name no harness', () => {
  it('returns null for the fix lane, which is a lane but not a harness', () => {
    // A fix/issue- branch says nothing about which harness produced it. Labelling it
    // `harness:fix` would invent a harness that does not exist; guessing one of the real
    // three would be worse. The script exits 0 without labelling on this path.
    expect(labelForLane('fix')).toBeNull();
  });

  it('returns null when no lane was resolved at all', () => {
    // What laneFromBranch returns for a feat/ or chore/ branch.
    expect(labelForLane(null)).toBeNull();
  });

  it('returns null for an empty lane name', () => {
    expect(labelForLane('')).toBeNull();
  });

  it('returns null for an unrecognised lane a future config might add', () => {
    expect(labelForLane('gemini')).toBeNull();
  });
});

describe('decideLabelAction — add only when absent', () => {
  it('adds the label when the issue does not carry it', () => {
    const decision = decideLabelAction({
      number: 324,
      existingLabels: ['enhancement', 'harness:codex'],
      label: 'harness:claude',
    });

    expect(decision.action).toBe('add');
    expect(decision.label).toBe('harness:claude');
    expect(decision.number).toBe(324);
  });

  it('skips when the label is already present', () => {
    const decision = decideLabelAction({
      number: 324,
      existingLabels: ['enhancement', 'harness:claude'],
      label: 'harness:claude',
    });

    expect(decision.action).toBe('skip');
    expect(decision.message).toContain('already present');
  });

  it('adds without disturbing another harness\'s label — two harnesses is simply two labels', () => {
    // The decision names only the one label to add; the caller POSTs exactly that to
    // /issues/{n}/labels, which appends. Nothing here can express a removal.
    const decision = decideLabelAction({
      number: 324,
      existingLabels: ['harness:opencode'],
      label: 'harness:claude',
    });

    expect(decision.action).toBe('add');
    expect(decision.label).toBe('harness:claude');
  });

  it('treats an issue with no labels at all as an add', () => {
    expect(decideLabelAction({ number: 1, existingLabels: [], label: 'harness:claude' }).action).toBe(
      'add',
    );
    expect(
      decideLabelAction({ number: 1, existingLabels: undefined, label: 'harness:claude' }).action,
    ).toBe('add');
  });
});
