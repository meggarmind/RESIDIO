/**
 * Shared ordering for the global search command palette
 * (`src/components/dashboard/global-search-command.tsx`).
 *
 * The on-screen number badges and the Cmd/Ctrl+1-5 hotkeys must agree on
 * which item is "third", "fourth", etc. Both derive from the functions in
 * this module rather than each re-deriving the order independently — that
 * duplication (badges walking the grouped/rendered view while the hotkey
 * indexed the flat, API-ordered array) is what let issue #166 happen: past
 * five combined results, `Cmd+3` could navigate somewhere other than the
 * item labelled "3".
 */

export interface OrderableSearchResult {
  id: string;
  href: string;
  type: string;
}

/** Number of items that get a Cmd/Ctrl+N shortcut. */
export const MAX_SEARCH_SHORTCUTS = 5;

/** One render group: a type's label-worthy bucket plus its items, in
 * `groupOrder`'s order. */
export interface GroupedSearchResults<T extends OrderableSearchResult> {
  type: string;
  items: T[];
}

/**
 * Groups `results` by type, in `groupOrder`'s order, preserving each group's
 * internal order. This is THE single traversal of "rendered order" — the
 * render loop, the badge numbers and the keyboard handler all derive from
 * this function (directly, or via the flat view `buildOrderedSearchResults`
 * returns) rather than each re-deriving their own view of "grouped by type".
 *
 * Before this, the component computed the same grouping twice independently
 * (a `reduce` the render loop walked, and this module's flattened order the
 * badges/hotkey read from) — agreeing only by convention. That divergence is
 * exactly what let issue #166 happen: past five combined results, `Cmd+3`
 * could navigate somewhere other than the item labelled "3".
 *
 * - A type absent from `results` contributes no entry (no empty group, no
 *   gap in numbering).
 * - A result whose type is not listed in `groupOrder` is dropped, mirroring
 *   the palette's render loop, which only ever walks `groupOrder`.
 */
export function buildGroupedSearchResults<T extends OrderableSearchResult>(
  results: readonly T[],
  groupOrder: readonly string[]
): GroupedSearchResults<T>[] {
  const byType = new Map<string, T[]>();
  for (const result of results) {
    const bucket = byType.get(result.type);
    if (bucket) {
      bucket.push(result);
    } else {
      byType.set(result.type, [result]);
    }
  }

  const grouped: GroupedSearchResults<T>[] = [];
  for (const type of groupOrder) {
    const bucket = byType.get(type);
    if (bucket) grouped.push({ type, items: bucket });
  }
  return grouped;
}

/**
 * Flattens `results` into the exact sequence the palette renders: grouped by
 * type, in `groupOrder`'s order, preserving each group's internal order.
 * Derived from `buildGroupedSearchResults`, which is now the actual single
 * source of truth for "rendered order" -- `buildGroupedSearchResults` is
 * what the component's render loop, badges and keyboard handler all consume
 * directly (grouped, then flattened inline with `.flatMap`). This function
 * is not itself called from the component; it is kept because it names and
 * tests the "flatten the grouped view" step in isolation, and other callers
 * (e.g. a future non-grouped consumer) can still reach for it instead of
 * re-deriving the same flattening.
 */
export function buildOrderedSearchResults<T extends OrderableSearchResult>(
  results: readonly T[],
  groupOrder: readonly string[]
): T[] {
  return buildGroupedSearchResults(results, groupOrder).flatMap((group) => group.items);
}

/**
 * Maps each of the first `MAX_SEARCH_SHORTCUTS` items in a flattened,
 * grouped-by-type sequence (`buildGroupedSearchResults(...).flatMap(...)`,
 * equivalently `buildOrderedSearchResults`'s return value) to its 1-based
 * shortcut number, so the render loop can look up a badge number without
 * re-walking or re-numbering anything itself.
 *
 * Keyed by `href`, not by `${type}-${id}`. `href` is already what selection
 * resolves on -- `handleSelect(href)` and the `results.find(r => r.href ===
 * href)` beside it -- and it is unique by construction across sources, since
 * two rows pointing at the same page are the same destination. A composite of
 * type and id would collapse silently if two sources ever shared a type label
 * or an id scheme, showing a wrong number rather than failing. #179 added
 * settings and system entries keyed on route slugs, which is exactly the
 * shape that would have collided under a composite key.
 */
export function buildSearchShortcutIndex<T extends OrderableSearchResult>(
  orderedResults: readonly T[]
): Map<string, number> {
  const index = new Map<string, number>();
  const limit = Math.min(orderedResults.length, MAX_SEARCH_SHORTCUTS);
  for (let i = 0; i < limit; i++) {
    const item = orderedResults[i];
    index.set(item.href, i + 1);
  }
  return index;
}
