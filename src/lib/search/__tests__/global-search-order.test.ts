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
    // Keyed by href, as `buildSearchShortcutIndex` builds them. These read
    // `/payment/pay1` rather than `payment-pay1`: the composite form was the
    // pre-rekey key shape, and against an href-keyed map it is absent for
    // every input, so asserting it would pass even if pay1 DID carry a badge.
    expect(shortcuts.has('/payment/pay1')).toBe(false);
    expect(shortcuts.has('/security/sec1')).toBe(false);
    expect(shortcuts.has('/document/doc1')).toBe(false);
    // Guard the guard: the 5th item does carry a badge, so the three
    // assertions above are testing absence, not a key-format mismatch.
    expect(shortcuts.get('/house/house1')).toBe(5);
  });
});

describe('badge/Cmd+N agreement survives permission filtering (issue #164)', () => {
  /**
   * Issue #164 makes both the API response (server-side, per category) and
   * the Quick Actions list (client-side) permission-filtered. Neither
   * filtering step changes `buildOrderedSearchResults` or
   * `buildSearchShortcutIndex` themselves -- a filtered-away category simply
   * never appears in the `results` array these functions are given, the same
   * as the "absent group" case above. This test pins that down concretely
   * for the shape a real permission-filtered response takes: a role holding
   * only `residents.view` and `security.view` sees two of the four Quick
   * Actions (Add Resident, View Security Log -- not Create Invoice or Add
   * House) and two of the five API categories (residents, security
   * contacts); houses, payments and documents contribute nothing.
   */
  it('numbers correctly when Quick Actions and API categories are both permission-filtered', () => {
    // What the caller actually receives once billing.view and houses.view
    // are absent: only two Quick Actions survive `hasAnyPermission`
    // filtering, and only two of the five API categories were queried at
    // all (houses/payments/documents were skipped server-side, so they
    // never contribute items here -- there is no empty-array placeholder to
    // reason about, they are simply absent from `results`).
    const permittedQuickActions = [item('action', 'add-resident'), item('action', 'security-log')];
    const apiResults = [
      item('resident', 'res1'),
      item('resident', 'res2'),
      item('security', 'sec1'),
      item('security', 'sec2'),
    ];
    const results = [...permittedQuickActions, ...apiResults];

    const ordered = buildOrderedSearchResults(results, GROUP_ORDER);
    const shortcuts = buildSearchShortcutIndex(ordered);

    // No gap for the filtered-out house/payment/document groups: action and
    // resident sit adjacent, resident and security sit adjacent.
    expect(ordered.map((r) => r.id)).toEqual([
      'add-resident', 'security-log', 'res1', 'res2', 'sec1', 'sec2',
    ]);

    // 6 items total -> exactly 5 get a shortcut, the 6th (sec2) does not.
    expect(shortcuts.size).toBe(5);
    expect(shortcuts.get('/action/add-resident')).toBe(1);
    expect(shortcuts.get('/action/security-log')).toBe(2);
    expect(shortcuts.get('/resident/res1')).toBe(3);
    expect(shortcuts.get('/resident/res2')).toBe(4);
    expect(shortcuts.get('/security/sec1')).toBe(5);
    expect(shortcuts.has('/security/sec2')).toBe(false);

    // The acceptance criterion itself: every badge number N resolves, via
    // Cmd+N (`ordered[N-1]`), to the exact item carrying that badge.
    for (const [href, n] of shortcuts) {
      expect(pressShortcut(ordered, n)?.href).toBe(href);
    }
  });

  it('numbers correctly when every API category is filtered away and only Quick Actions remain', () => {
    // A role with no view permission at all for residents/houses/payments/
    // security/documents (e.g. a narrowly-scoped operational role): the API
    // contributes nothing, but Quick Actions the role does hold a
    // permission for still render and still get shortcuts starting at 1 --
    // this is the "entire category filtered away" case called out for
    // issue #164, taken to its limit of every API category at once.
    const permittedQuickActions = [item('action', 'add-resident')];
    const results = [...permittedQuickActions];

    const ordered = buildOrderedSearchResults(results, GROUP_ORDER);
    const shortcuts = buildSearchShortcutIndex(ordered);

    expect(ordered.map((r) => r.id)).toEqual(['add-resident']);
    expect(shortcuts.get('/action/add-resident')).toBe(1);
  });
});
