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

/**
 * Flattens `results` into the exact sequence the palette renders: grouped by
 * type, in `groupOrder`'s order, preserving each group's internal order.
 *
 * - A type absent from `results` contributes nothing (no gap in numbering).
 * - A result whose type is not listed in `groupOrder` is dropped, mirroring
 *   the palette's render loop, which only ever walks `groupOrder`.
 *
 * This is the single source of truth for "rendered order" — both the badge
 * numbers and the keyboard handler must index into this array (or the
 * shortcut map built from it via `buildSearchShortcutIndex`), never into the
 * raw `results` array in its original (e.g. API response) order.
 */
export function buildOrderedSearchResults<T extends OrderableSearchResult>(
  results: readonly T[],
  groupOrder: readonly string[]
): T[] {
  const byType = new Map<string, T[]>();
  for (const result of results) {
    const bucket = byType.get(result.type);
    if (bucket) {
      bucket.push(result);
    } else {
      byType.set(result.type, [result]);
    }
  }

  const ordered: T[] = [];
  for (const type of groupOrder) {
    const bucket = byType.get(type);
    if (bucket) ordered.push(...bucket);
  }
  return ordered;
}

/**
 * Maps each of the first `MAX_SEARCH_SHORTCUTS` items in `orderedResults`
 * (the array returned by `buildOrderedSearchResults`) to its 1-based
 * shortcut number, so the render loop can look up a badge number without
 * re-walking or re-numbering anything itself.
 *
 * Keyed by `href`, not by `${type}-${id}`. `href` is already what selection
 * resolves on -- `handleSelect(href)` and the `results.find(r => r.href ===
 * href)` beside it -- and it is unique by construction across sources, since
 * two rows pointing at the same page are the same destination. A composite of
 * type and id would collapse silently if two sources ever shared a type label
 * or an id scheme, showing a wrong number rather than failing. #179 is about
 * to add settings and system entries keyed on route slugs, which is exactly
 * the shape that would collide.
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
