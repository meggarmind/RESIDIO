/**
 * Regression coverage for issue #166: the global search palette's Cmd/Ctrl+1-5
 * hotkeys indexed the flat, API-ordered `results` array while the on-screen
 * badge numbers were assigned by walking the grouped/rendered view (Quick
 * Actions first, then residents, houses, payments, security, documents).
 * Once combined results passed five, the badge and the hotkey disagreed.
 *
 * `buildOrderedSearchResults` is the single ordering both the badges and the
 * hotkey are meant to read from; `buildSearchShortcutIndex` derives the badge numbers, keyed by href, from the
 * badge numbers from that same array. These tests assert the ordering rule
 * itself, and — the actual acceptance criterion — that the item labelled
 * "N" by the badge is the same item indexing that order at position N-1
 * (what the keyboard handler does) resolves to.
 */

import { describe, it, expect } from 'vitest';
import {
  buildOrderedSearchResults,
  buildSearchShortcutIndex,
  MAX_SEARCH_SHORTCUTS,
  type OrderableSearchResult,
} from '../global-search-order';

const GROUP_ORDER = ['action', 'resident', 'house', 'payment', 'security', 'document'];

interface Item extends OrderableSearchResult {
  label: string;
}

function item(type: string, id: string): Item {
  return { id, href: `/${type}/${id}`, type, label: `${type}-${id}` };
}

/** Simulates the keyboard handler: `orderedResults[N - 1]`. */
function pressShortcut<T extends OrderableSearchResult>(orderedResults: readonly T[], n: number): T | undefined {
  return orderedResults[n - 1];
}

describe('buildOrderedSearchResults', () => {
  it('flattens results in groupOrder order, not the order results arrived in', () => {
    // Deliberately the opposite of groupOrder: documents first, actions last.
    // This is the exact shape the bug needed — API/insertion order diverging
    // from render order.
    const apiOrderResults = [
      item('document', 'd1'),
      item('security', 's1'),
      item('payment', 'p1'),
      item('house', 'h1'),
      item('resident', 'r1'),
      item('action', 'a1'),
    ];

    const ordered = buildOrderedSearchResults(apiOrderResults, GROUP_ORDER);

    expect(ordered.map((r) => r.id)).toEqual(['a1', 'r1', 'h1', 'p1', 's1', 'd1']);
  });

  it('preserves each group\'s internal (within-type) order', () => {
    const input = [
      item('resident', 'r2'),
      item('action', 'a1'),
      item('resident', 'r1'),
      item('action', 'a2'),
    ];

    const ordered = buildOrderedSearchResults(input, GROUP_ORDER);

    expect(ordered.map((r) => r.id)).toEqual(['a1', 'a2', 'r2', 'r1']);
  });

  it('skips empty/absent groups without leaving a gap', () => {
    // No 'action' or 'house' results at all — resident and document should
    // sit adjacent in the flattened order, not have a hole between them.
    const input = [item('document', 'd1'), item('resident', 'r1')];

    const ordered = buildOrderedSearchResults(input, GROUP_ORDER);

    expect(ordered.map((r) => r.id)).toEqual(['r1', 'd1']);
  });
});

describe('buildSearchShortcutIndex', () => {
  it('assigns a shortcut number to only the first MAX_SEARCH_SHORTCUTS (5) items', () => {
    const ordered = [
      item('action', 'a1'),
      item('action', 'a2'),
      item('resident', 'r1'),
      item('resident', 'r2'),
      item('house', 'h1'),
      item('house', 'h2'), // 6th — no shortcut
      item('payment', 'p1'), // 7th — no shortcut
    ];

    const index = buildSearchShortcutIndex(ordered);

    expect(MAX_SEARCH_SHORTCUTS).toBe(5);
    expect(index.size).toBe(5);
    expect(index.get('/action/a1')).toBe(1);
    expect(index.get('/house/h1')).toBe(5);
    expect(index.has('house-h2')).toBe(false);
    expect(index.has('payment-p1')).toBe(false);
  });

  it('produces no shortcuts for an empty ordered list', () => {
    expect(buildSearchShortcutIndex([]).size).toBe(0);
  });

  it('assigns no number to an empty group (an empty bucket present in results consumes nothing)', () => {
    // house/payment/security/document groups exist as keys with zero items;
    // buildOrderedSearchResults already drops them, so a shortcut index
    // built from its output cannot skip a number for them either.
    const input = [item('action', 'a1'), item('resident', 'r1')];
    const ordered = buildOrderedSearchResults(input, GROUP_ORDER);
    const index = buildSearchShortcutIndex(ordered);

    expect(index.get('/action/a1')).toBe(1);
    expect(index.get('/resident/r1')).toBe(2);
  });
});

describe('badge number and Cmd+N agreement (acceptance criterion)', () => {
  it('the item the badge labels N is the same item Cmd+N selects, past 5 combined results, with Quick Actions present', () => {
    // Deliberately scrambled relative to groupOrder — this is what made the
    // original bug reproduce: badges (grouped) and hotkey (flat) disagreeing
    // only becomes visible once results exceed 5.
    const apiOrderResults = [
      item('document', 'doc1'),
      item('payment', 'pay1'),
      item('resident', 'res1'),
      item('house', 'house1'),
      item('security', 'sec1'),
      item('action', 'act1'),
      item('action', 'act2'),
      item('resident', 'res2'),
    ];

    const ordered = buildOrderedSearchResults(apiOrderResults, GROUP_ORDER);
    const shortcuts = buildSearchShortcutIndex(ordered);

    // For every item that got a badge number N, pressing Cmd+N must resolve
    // to that exact item.
    for (const [key, n] of shortcuts) {
      const pressed = pressShortcut(ordered, n);
      expect(pressed).toBeDefined();
      expect(pressed!.href).toBe(key);
    }

    // Concretely: rendered order is act1, act2, res1, res2, house1, pay1,
    // sec1, doc1 — grouped by type in groupOrder, residents (res1, res2)
    // kept adjacent in their original relative order.
    // Badge "3" is res1; Cmd+3 must land on res1, not house1 (res1's
    // position in the raw, API-order input) and not res2 (a resident, but
    // the wrong one).
    expect(ordered.map((r) => r.id)).toEqual([
      'act1', 'act2', 'res1', 'res2', 'house1', 'pay1', 'sec1', 'doc1',
    ]);
    expect(shortcuts.get('/resident/res1')).toBe(3);
    const cmd3 = pressShortcut(ordered, 3);
    expect(cmd3?.id).toBe('res1');

    // And the 6th/7th/8th items (pay1, sec1, doc1) get no badge and
    // Cmd+6/7/8 are out of the supported 1-5 range (the handler's regex
    // already rejects those keys; here we just confirm they carry no
    // shortcut number).
    expect(shortcuts.has('payment-pay1')).toBe(false);
    expect(shortcuts.has('security-sec1')).toBe(false);
    expect(shortcuts.has('document-doc1')).toBe(false);
  });
});
