import { describe, expect, it } from 'vitest';

import { ROUTE_PERMISSIONS, type Permission } from '@/lib/auth/action-roles';
import { settingsConfig, type SettingsItem } from '@/config/settings-nav';
import { SETTINGS_SEARCH_ENTRIES, matchSettingsEntries } from '@/lib/search/settings-search-entries';

/**
 * #179 adds Settings/System entries to the command palette, generated from
 * `settingsConfig` and the `system` section of `ADMIN_NAV_SECTIONS`. That
 * generation step is a hand-maintained dedupe (see `settings-search-entries.ts`
 * -- `/settings` alone is a candidate from three different sources), and
 * nothing else in the build would notice the mapping going stale.
 *
 * Modelled closely on `quick-action-permissions.test.ts`: a naive assertion
 * that "the entry's permissions are a subset of the route's" stays green
 * when someone silently narrows an entry (D21) -- a narrowing only ever
 * removes permissions, so it can't produce a permission the route doesn't
 * already require, and a subset check can't see it happen. That is exactly
 * the defect that hides a page from a role that can actually open it. These
 * assertions run the other way round and pin intent explicitly.
 */

/** The longest ROUTE_PERMISSIONS prefix matching a path — how middleware resolves. */
function guardFor(rawHref: string): string | undefined {
  const href = rawHref.split('?')[0];
  return Object.keys(ROUTE_PERMISSIONS)
    .sort((a, b) => b.length - a.length)
    .find((route) => href === route || route !== '/' && href.startsWith(route + '/'));
}

describe('Settings/System search entry permissions', () => {
  it('every entry\'s href resolves to a ROUTE_PERMISSIONS entry', () => {
    // No allowlist needed: every settingsConfig/system nav href in this
    // codebase has a ROUTE_PERMISSIONS entry, either exact or via a prefix
    // (e.g. `/settings/billing/late-fees` resolves through `/settings/billing`).
    // If a future page genuinely has no guard, add it to an explicit
    // allowlist here with a comment saying why -- do not loosen this to a
    // soft check.
    for (const entry of SETTINGS_SEARCH_ENTRIES) {
      const guard = guardFor(entry.href);
      expect(guard, `${entry.id} -> ${entry.href} matches no ROUTE_PERMISSIONS entry`).toBeDefined();
    }
  });

  it('every entry requires at least one of the permissions its route is actually gated on', () => {
    for (const entry of SETTINGS_SEARCH_ENTRIES) {
      const guard = guardFor(entry.href);
      const required = ROUTE_PERMISSIONS[guard as keyof typeof ROUTE_PERMISSIONS] as readonly string[];

      // A route with no required permissions (e.g. `/dashboard`) is open to
      // everyone; nothing in `SETTINGS_SEARCH_ENTRIES` resolves there today,
      // but guard against it meaning something different than "any entry
      // permission works".
      if (required.length === 0) {
        expect(entry.permissions, `${entry.id} -> ${entry.href} has permissions but its route requires none`).toEqual([]);
        continue;
      }

      const satisfies = required.some((p) => (entry.permissions as readonly string[]).includes(p));
      expect(satisfies, `${entry.id} (${entry.href}) does not require any of ${guard}'s permissions [${required.join(', ')}]`).toBe(true);
    }
  });

  it('hrefs are unique -- the dedupe regression test', () => {
    // `/settings` alone is a candidate from three sources (the "Estate"
    // group's container item, that container's "Overview" child, and the
    // System nav's own `/settings` entry); `/settings/billing`,
    // `/settings/notifications`, `/settings/email` and `/settings/security`
    // are each a candidate from two (a parent item and its index child).
    // `buildSearchShortcutIndex` keys its map by href, so a duplicate here
    // silently overwrites an earlier badge/shortcut assignment.
    const hrefs = SETTINGS_SEARCH_ENTRIES.map((e) => e.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('pins the full href -> permissions mapping, so a rename or a new page is a deliberate, reviewed change', () => {
    expect(
      Object.fromEntries(
        SETTINGS_SEARCH_ENTRIES.filter((e) => !e.id.startsWith('settings-row-')).map((e) => [e.href, [...e.permissions].sort()])
      )
    ).toEqual({
      '/settings': ['settings.view'],
      '/settings/estate-info': ['settings.manage_general'],
      '/settings/branding': ['settings.manage_general'],
      '/settings/appearance': ['settings.manage_general'],
      '/settings/streets': ['settings.manage_reference'],
      '/settings/house-types': ['settings.manage_reference'],
      '/settings/billing': ['settings.manage_billing'],
      '/settings/billing/late-fees': ['settings.manage_billing'],
      '/settings/billing/invoices': ['settings.manage_billing'],
      '/settings/billing/development-levies': ['settings.manage_billing'],
      '/settings/billing/profiles': ['billing.manage_profiles'],
      '/settings/bank-accounts': ['settings.manage_reference'],
      '/settings/transaction-tags': ['settings.manage_reference'],
      // Merged Messages task pages (#934): each is the OR of its sections' permissions.
      '/settings/reminders': ['notifications.manage', 'settings.manage_general'],
      '/settings/wording': ['notifications.manage'],
      '/settings/sending': ['settings.manage_general'],
      '/settings/announcements': ['announcements.manage_categories', 'announcements.manage_templates'],
      '/system/accounts?tab=roles': ['system.assign_roles'],
      '/settings/groups': ['groups.view'],
      // Merged Documents and Security rules task pages (#937): each is the OR of its sections' permissions.
      '/settings/documents': ['documents.manage_categories', 'documents.manage_custom_fields', 'documents.manage_tags'],
      '/settings/security': ['security.manage_categories', 'settings.manage_security', 'system.manage_maintenance'],
      '/settings/whatsapp': ['whatsapp.view'],
      '/settings/email-integration': ['email_imports.view'],
      '/settings/maintenance': ['system.manage_maintenance'],
      '/settings/data-retention': ['system.manage_data_retention'],
      '/system': ['system.view_all_settings'],
      '/system/audit-logs': ['settings.view_audit_logs'],
      '/system/accounts': ['system.assign_roles'],
      '/system/notification-queue': ['notifications.manage'],
      '/system/notification-history': ['notifications.manage'],
      '/system/data-tools': ['settings.manage_general'],
      '/system/cron-status': ['system.monitor'],
      '/system/action-log': ['system.view_system_log'],
    });
  });
});

describe('Settings row search entry permissions (#934, #937)', () => {
  const MANAGE_GENERAL = ['settings.manage_general'];
  const NOTIFICATIONS = ['notifications.manage'];

  it('pins each row of the merged task pages to the permission of its own section', () => {
    expect(
      Object.fromEntries(
        SETTINGS_SEARCH_ENTRIES.filter((e) => e.id.startsWith('settings-row-')).map((e) => [e.id.slice('settings-row-'.length), [...e.permissions].sort()])
      )
    ).toEqual({
      'reminders-enabled': NOTIFICATIONS,
      'reminder-steps': NOTIFICATIONS,
      'send-reminders-now': MANAGE_GENERAL,
      'email-wording': NOTIFICATIONS,
      'whatsapp-wording': NOTIFICATIONS,
      'email-enabled': MANAGE_GENERAL,
      'email-payment-reminders': MANAGE_GENERAL,
      'email-invoice-notifications': MANAGE_GENERAL,
      'email-welcome': MANAGE_GENERAL,
      'redirect-all': MANAGE_GENERAL,
      'override-contacts': MANAGE_GENERAL,
      'debug-mode': MANAGE_GENERAL,
      'test-email': MANAGE_GENERAL,
      'announcement-templates': ['announcements.manage_templates'],
      'announcement-categories': ['announcements.manage_categories'],
      // #937
      'document-categories': ['documents.manage_categories'],
      'document-tags': ['documents.manage_custom_fields', 'documents.manage_tags'],
      'document-custom-fields': ['documents.manage_custom_fields', 'documents.manage_tags'],
      'auto-expire-contacts': ['settings.manage_security'],
      'max-contacts-per-category': ['settings.manage_security'],
      'expiry-warning-days': ['settings.manage_security'],
      'reset-security-defaults': ['settings.manage_security'],
      'contact-category-rules': ['security.manage_categories'],
      'session-timeout-minutes': ['system.manage_maintenance'],
    });
  });

  it('a row is findable by an estate word kept in its keywords', () => {
    expect(matchSettingsEntries(SETTINGS_SEARCH_ENTRIES, 'dues').map((e) => e.id)).toEqual(
      expect.arrayContaining(['settings-row-reminders-enabled', 'settings-row-reminder-steps'])
    );
  });
});

/**
 * Coverage for the searchability contract itself, not just permissions:
 * matching goes through each entry's precomputed `searchText` (group title +
 * parent item title + own title + subtitle + keywords), tokenized so word
 * order doesn't matter -- see `matchSettingsEntries` and `buildSearchText`
 * in `settings-search-entries.ts`.
 */
describe('Settings/System search entry matching', () => {
  const hrefsFor = (query: string) => matchSettingsEntries(SETTINGS_SEARCH_ENTRIES, query).map((e) => e.href);

  it('finds /settings/email-integration for "email import" -- the issue\'s own acceptance criterion (#179)', () => {
    // The page is titled "Gmail Import"; neither its title, its subtitle,
    // nor its "Connections" group name contains the word "email" on their
    // own. Only the hand-picked keyword alias closes that gap.
    expect(hrefsFor('email import')).toContain('/settings/email-integration');
  });

  it('is word-order independent: "import email" finds the same thing as "email import"', () => {
    expect(hrefsFor('import email')).toEqual(hrefsFor('email import'));
    expect(hrefsFor('import email')).toContain('/settings/email-integration');
  });

  it('"email" alone finds both the email notification settings and the Gmail import page', () => {
    const hrefs = hrefsFor('email');
    expect(hrefs).toContain('/settings/sending');
    expect(hrefs).toContain('/settings/email-integration');
  });

  it('"setup overview" finds /settings -- group context recovers a generic title', () => {
    // The `/settings` entry is titled just "Overview"; it is only findable
    // by "setup" because its group title ("Setup") is folded into `searchText`.
    expect(hrefsFor('setup overview')).toContain('/settings');
  });

  it('a query matching nothing returns no entries', () => {
    expect(hrefsFor('xyzxyz-not-a-real-word')).toEqual([]);
  });

  it('matching is case-insensitive', () => {
    expect(hrefsFor('EMAIL IMPORT')).toEqual(hrefsFor('email import'));
    expect(hrefsFor('Setup Overview')).toEqual(hrefsFor('setup overview'));
  });

  it('an empty (or all-whitespace) query matches nothing', () => {
    expect(matchSettingsEntries(SETTINGS_SEARCH_ENTRIES, '')).toEqual([]);
    expect(matchSettingsEntries(SETTINGS_SEARCH_ENTRIES, '   ')).toEqual([]);
  });
});

/**
 * The palette/sidebar agreement invariant (QA finding F4).
 *
 * `useSettingsNavigation.filterItem` (the sidebar) drops an ENTIRE subtree
 * when a *parent's* own permission check fails -- children are never
 * evaluated once the parent is hidden. `flattenSettingsItems` (the palette,
 * `settings-search-entries.ts`) has no such cascade: it resolves each entry's
 * permissions independently off its own `permissions` field. Those two only
 * agree today because every parent that DOES declare `permissions` declares
 * a set that already covers everything its descendants need.
 *
 * Nothing enforces that. If a parent's permissions were narrowed later, the
 * sidebar would hide the whole subtree from a role holding only a child
 * permission, while the palette would keep surfacing those children --
 * silently, because `settings-search-permissions.test.ts`'s other
 * assertions check each entry against its OWN route guard, never against
 * its parent.
 */
describe('settingsConfig parent/child permission invariant (palette/sidebar agreement)', () => {
  /** Every permission declared anywhere in `item`'s subtree (children and
   * deeper), NOT including `item` itself. */
  function descendantPermissions(item: SettingsItem): Set<Permission> {
    const permissions = new Set<Permission>();
    for (const child of item.children ?? []) {
      for (const p of child.permissions ?? []) permissions.add(p);
      for (const p of descendantPermissions(child)) permissions.add(p);
    }
    return permissions;
  }

  /** Every `(path, item)` pair, at every depth, across every group. */
  function allItemsWithPath(): Array<{ path: string; item: SettingsItem }> {
    const out: Array<{ path: string; item: SettingsItem }> = [];
    const walk = (items: SettingsItem[], path: string) => {
      for (const item of items) {
        const itemPath = `${path} > ${item.title}`;
        out.push({ path: itemPath, item });
        if (item.children) walk(item.children, itemPath);
      }
    };
    for (const group of settingsConfig) walk(group.items, group.title);
    return out;
  }

  const parentsWithChildren = allItemsWithPath().filter(({ item }) => !!item.children?.length);

  it('found at least one parent-with-children to check (guards the test itself against a vacuous pass)', () => {
    expect(parentsWithChildren.length).toBeGreaterThan(0);
  });

  it.each(parentsWithChildren)('"$path" gates at least as much as its descendants require', ({ path, item }) => {
    // No `permissions` on the parent itself means the sidebar never gates
    // at this level at all -- `filterItem` only filters when
    // `item.permissions` is truthy (see `use-settings-navigation.ts`). An
    // ungated parent can never hide a subtree, so it trivially satisfies
    // this invariant regardless of what its children require.
    if (!item.permissions) return;

    const required = descendantPermissions(item);
    const missing = [...required].filter((p) => !item.permissions!.includes(p));

    expect(
      missing,
      `"${path}" requires [${item.permissions!.join(', ')}] but a descendant needs [${missing.join(', ')}] too -- ` +
        `a role holding only that permission would be shown the child in the palette but have the whole ` +
        `subtree hidden by the sidebar (useSettingsNavigation cascades on the parent's own check first).`
    ).toEqual([]);
  });
});
