import { ROUTE_PERMISSIONS, type Permission } from '@/lib/auth/action-roles';
import { flattenSettingsNav, settingsConfig, type SettingsGroup, type SettingsItem } from '@/config/settings-nav';
import { oversightConfig } from '@/config/oversight-nav';

/**
 * Settings/Oversight entries for the global search command palette
 * (`global-search-command.tsx`). Generated from `settingsConfig` and
 * `oversightConfig` so the palette cannot drift from
 * the sidebars the way it drifted from `/api/search` (#179): typing "email
 * import" previously returned nothing because Settings/System were not
 * indexed at all.
 */
export interface SettingsSearchEntry {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  /** 'system' is an Oversight page (#1272); the key is kept, the palette labels it "Oversight". */
  type: 'settings' | 'system';
  permissions: Permission[];
  /**
   * Hand-picked search aliases for a vocabulary gap no title/description/
   * group closes -- see `SETTINGS_SEARCH_KEYWORDS` below. Folded into
   * `searchText` at construction, which is what `matchSettingsEntries`
   * actually reads; nothing re-reads `keywords` itself afterwards. Kept on
   * the entry anyway (not just consumed and discarded) so a reviewer or a
   * future test can see WHY an entry is findable by a word that appears in
   * none of its displayed text, without reverse-engineering it out of
   * `searchText`. Never displayed.
   */
  keywords?: string[];
  /**
   * Precomputed, lowercased haystack `matchSettingsEntries` matches query
   * tokens against: group title + parent item title (if nested) + this
   * entry's title + subtitle + keywords. Deliberately WIDER than what the
   * palette displays (title + subtitle only) -- a row titled just
   * "Levies" is only findable by "billing" because its parent item's
   * title, "Billing Rules", carries the meaning the row's own text
   * doesn't. Never render this field.
   */
  searchText: string;
}

/** `/settings/estate-info` -> `settings-estate-info`. Mirrors the route-slug
 * shape `buildSearchShortcutIndex`'s doc comment describes these entries as
 * having (as opposed to Quick Actions' hand-picked ids). */
function idFromHref(href: string): string {
  return href.replace(/^\//, '').replace(/[/?=&]/g, '-');
}

/**
 * Hand-picked aliases for entries whose group + parent + title + subtitle
 * still miss the word a user would actually type. Kept deliberately small --
 * only where the gap is real, not bulk-annotated across all 37 entries.
 *
 * `/settings/email-integration` is the motivating case (the issue's own
 * acceptance criterion): its group is "Connections", not "Messages & Reminders",
 * and every label on the page says "Gmail", never "email" or "import" as a
 * literal pair a user would type for an inbox-import feature -- "Gmail
 * Import" contains "import" but not "email", so a token match still misses
 * "email import" without an explicit alias.
 */
const SETTINGS_SEARCH_KEYWORDS: Record<string, string[]> = {
  '/settings/email-integration': ['email', 'imap', 'inbox', 'mailbox'],
  '/system/cron-status': ['cron', 'jobs', 'status'],
  '/system/whatsapp-monitoring': ['monitoring'],
  '/system/whatsapp-bot-health': ['health', 'delivery problems', 'undelivered', 'survey', 'statement flags'],
};

/**
 * A config entry's own `permissions` wins. Failing that, fall back to the
 * permission `ROUTE_PERMISSIONS` gates that exact route on (never invented) --
 * this only actually applies to the "Estate" container item in
 * `settingsConfig`, which has no `permissions` of its own (its `/settings`
 * href is otherwise carried by its "Overview" child, see `dedupeByHref`
 * below). Anything with neither is visible to everyone who can open the
 * palette, matching how the sidebars treat a missing `permissions` array.
 */
function resolvePermissions(href: string, permissions?: Permission[]): Permission[] {
  if (permissions) return permissions;
  return (ROUTE_PERMISSIONS as Record<string, Permission[]>)[href] ?? [];
}

/** Lowercased, whitespace-joined haystack from every part that isn't empty. */
function buildSearchText(parts: Array<string | undefined | string[]>): string {
  return parts
    .flatMap((part) => (Array.isArray(part) ? part : [part]))
    .filter((part): part is string => Boolean(part && part.trim().length > 0))
    .join(' ')
    .toLowerCase();
}

/**
 * Recursively flattens a `SettingsItem` tree (parents AND children -- a
 * parent that is only a container for its children still becomes a
 * candidate here; see `dedupeByHref` for why that is safe to do).
 *
 * `groupTitle` and `parentTitle` are carried down so a child's `searchText`
 * still contains the context that gives its own title meaning -- e.g.
 * "Levies" (a child of "Billing Rules", in the "Money" group) is only
 * findable by "billing" because that group/parent context is
 * folded in; its own title and description say nothing of the kind.
 */
export function flattenSettingsItems(
  items: SettingsItem[],
  groupTitle: string,
  parentTitle?: string
): SettingsSearchEntry[] {
  const out: SettingsSearchEntry[] = [];
  for (const item of items) {
    const keywords = SETTINGS_SEARCH_KEYWORDS[item.href];
    out.push({
      id: idFromHref(item.href),
      title: item.title,
      subtitle: item.description,
      href: item.href,
      type: 'settings',
      permissions: resolvePermissions(item.href, item.permissions),
      keywords,
      searchText: buildSearchText([groupTitle, parentTitle, item.title, item.description, keywords]),
    });
    for (const section of item.sections ?? []) {
      for (const row of section.rows) {
        out.push({
          id: `settings-row-${row.id}`,
          title: row.label,
          subtitle: `${item.title} › ${section.title}`,
          href: `${item.href}?row=${row.id}#${section.id}`,
          type: 'settings',
          permissions: section.permissions ?? resolvePermissions(item.href, item.permissions),
          keywords: row.keywords,
          searchText: buildSearchText([groupTitle, item.title, section.title, row.label, row.help, row.keywords]),
        });
      }
    }
    if (item.children) {
      out.push(...flattenSettingsItems(item.children, groupTitle, item.title));
    }
  }
  return out;
}

function buildOversightEntries(): SettingsSearchEntry[] {
  return oversightConfig.flatMap((group) =>
    group.items.map((item) => ({
      id: idFromHref(item.href),
      title: item.title,
      subtitle: item.description,
      href: item.href,
      type: 'system' as const,
      permissions: resolvePermissions(item.href, item.permissions),
      keywords: SETTINGS_SEARCH_KEYWORDS[item.href],
      searchText: buildSearchText(['Oversight', group.title, item.title, item.description, SETTINGS_SEARCH_KEYWORDS[item.href]]),
    }))
  );
}

/**
 * Dedupes by `href`, keeping the entry with the most useful title+subtitle --
 * in practice, whichever candidate has a `subtitle` first. `/settings` is the
 * sharpest example: it is the "Estate" group's container item (no
 * description), that same container's "Overview" child (has a description),
 * AND the System nav's own `/settings` entry (no description) -- three
 * candidates for one destination. Processing settingsConfig before the
 * System section, and keeping the first entry that has a subtitle, means
 * "Overview" (description: "Estate information and basics") wins over both
 * of the description-less entries pointing at the same page.
 *
 * The same shape happens for `/settings/billing`, `/settings/notifications`,
 * `/settings/email` and `/settings/security`: each is a parent item with no
 * description of its own alongside an index child that has one, and the
 * child wins for the same reason.
 *
 * This is a correctness requirement, not cosmetic: `buildSearchShortcutIndex`
 * keys its map by `href`, so a duplicate href would silently overwrite an
 * earlier badge/shortcut assignment.
 */
function dedupeByHref(entries: SettingsSearchEntry[]): SettingsSearchEntry[] {
  const byHref = new Map<string, SettingsSearchEntry>();
  for (const entry of entries) {
    const existing = byHref.get(entry.href);
    if (!existing) {
      byHref.set(entry.href, entry);
      continue;
    }
    // Keep whichever of the two has a subtitle; first-with-a-subtitle wins,
    // so a later description-less duplicate (e.g. the System nav's own
    // `/settings` entry, processed after settingsConfig) never displaces it.
    if (!existing.subtitle && entry.subtitle) {
      byHref.set(entry.href, entry);
    }
  }
  return [...byHref.values()];
}

/**
 * Flattened, deduped, permission-carrying Settings + System entries for the
 * command palette. Static/local, like `QUICK_ACTIONS` -- not routed through
 * `/api/search`.
 *
 * Each `settingsConfig` group is flattened separately (not via a single
 * `settingsConfig.flatMap((g) => g.items)` before flattening) specifically
 * so each item's `searchText` carries its OWN group's title -- collapsing
 * groups first would lose that context.
 */
export const SETTINGS_SEARCH_ENTRIES: SettingsSearchEntry[] = dedupeByHref([
  ...settingsConfig.flatMap((group) => flattenSettingsItems(group.items, group.title)),
  ...buildOversightEntries(),
]);

/**
 * Splits `query` on whitespace and requires EVERY token to appear somewhere
 * in an entry's `searchText`, in any order. Word order independence is the
 * point: "email import" and "import email" must return the same rows,
 * because a user reaching for a page has no reason to guess the palette's
 * internal title order.
 *
 * An empty (or all-whitespace) query matches nothing -- callers that want
 * "show everything" (e.g. an unfiltered browse view) should special-case
 * that themselves rather than relying on this function's behaviour at the
 * boundary.
 */
export function matchSettingsEntries<T extends { searchText: string }>(
  entries: readonly T[],
  query: string
): T[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  return entries.filter((entry) => tokens.every((token) => entry.searchText.includes(token)));
}

/**
 * The entries one admin can act on from the Settings nav and Overview: a page entry whose
 * href the permission-filtered `groups` link to (`/settings` itself excluded), plus a row
 * entry whose page is linked and whose section permission `canSee` accepts.
 *
 * Nothing here widens access: pages come only from the filtered nav, rows only from pages
 * already in it.
 */
export function matchVisibleSettingsEntries(
  groups: SettingsGroup[],
  query: string,
  canSee: (permissions: Permission[]) => boolean
): SettingsSearchEntry[] {
  const pages = new Set(flattenSettingsNav(groups).map((item) => item.href));
  pages.delete('/settings');
  const visible = SETTINGS_SEARCH_ENTRIES.filter((entry) => {
    if (pages.has(entry.href)) return true;
    return entry.id.startsWith('settings-row-') && pages.has(entry.href.split(/[?#]/)[0]) && canSee(entry.permissions);
  });
  return matchSettingsEntries(visible, query);
}
