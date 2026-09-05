import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { PERMISSIONS } from '@/lib/auth/action-roles';

/**
 * Issue #181 (epic #180, wave 4d) replaced three legacy `profiles.role IN
 * ('admin', 'chairman')` checks in `src/actions/audit/get-audit-logs.ts` and
 * added a first-ever guard to `src/actions/notifications/queue.ts` with
 * `authorizePermission(PERMISSIONS.NOTIFICATIONS_MANAGE)`. It also replaced
 * the `audit_logs` SELECT RLS policy, which had the same two defects: it read
 * `profiles.role` directly and it admitted `chairman`, which ADR-0006 says
 * must not read audit logs.
 *
 * A subset-style assertion ("does this function require at least X") cannot
 * catch a *narrowing* of who holds a permission, or a swap to the wrong
 * permission constant -- the same class of gap called out as D21 in the nav
 * coverage tests and D26 in #164's quick-action-permissions.test.ts. These
 * tests pin the exact mapping with `toEqual` instead, following that file's
 * shape, so any change here is deliberate and reviewed rather than silently
 * passing a "contains" check.
 *
 * No database connection: reads source and migration files off disk, the same
 * approach as permission-catalog.test.ts and legacy-role-rls-boundary.test.ts.
 */

const auditLogsSource = readFileSync(
  fileURLToPath(new URL('../actions/audit/get-audit-logs.ts', import.meta.url)),
  'utf8'
);

const queueSource = readFileSync(
  fileURLToPath(new URL('../actions/notifications/queue.ts', import.meta.url)),
  'utf8'
);

const migrationsDir = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));

/**
 * Strips `//` and `/* *\/`-style comments from TypeScript source, leaving
 * string and template literals untouched.
 *
 * Without this, `extractPermissionGuards` below is fooled by its own
 * boundary logic: splitting the file into per-export slices means a JSDoc
 * block sitting just above export N+1 lands at the END of export N's slice
 * (the slice runs up to the next export's start, comment included). This
 * file's own style is long prose JSDoc that names
 * `authorizePermission(PERMISSIONS.NOTIFICATIONS_MANAGE)` directly above
 * several exports -- exactly the shape that would let a real guard be
 * deleted from export N while its sibling's doc comment keeps N looking
 * guarded. Comments are gone before any matching happens, so this cannot
 * occur.
 */
function stripComments(src: string): string {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === '/' && c2 === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && c2 === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i = Math.min(i + 2, n);
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      out += c;
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\' && i + 1 < n) {
          out += src[i] + src[i + 1];
          i += 2;
          continue;
        }
        out += src[i];
        i++;
      }
      if (i < n) {
        out += src[i];
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Maps every top-level `export` (async function, plain function, or const
 * assignment/arrow function) in a server-action file to the
 * `PERMISSIONS.<KEY>` its body passes to a *qualifying*
 * `authorizePermission(...)` call, or `null` if there is no qualifying guard.
 *
 * A call only qualifies if BOTH hold:
 *
 *  1. It is the first `await` anywhere in the export's own body (its slice
 *     runs from this export's start to the next export's start). A guard
 *     moved after a database call -- so the query already ran before the
 *     caller is checked -- has some other `await` earlier in the body and
 *     fails this, reporting `null` instead of the permission the misplaced
 *     call still names.
 *  2. It is followed, within a short window, by `if (!x.authorized) { ...
 *     return ... }`. A guard whose early return was deleted (so the check's
 *     result is computed and discarded) fails this too.
 *
 * Every export is enumerated, not just `async function` ones, so a new
 * export written as `export const x = async () => {}` or a plain
 * `export function x()` shows up as an unexpected key in the returned map
 * and breaks a `toEqual` pin instead of silently passing unseen.
 *
 * House style in both files under test (see CLAUDE.md's "Required Pattern")
 * puts the guard as the literal first statement, before even client
 * construction -- so rule 1 does not need to special-case
 * `createServerSupabaseClient()` / `createAdminClient()` as "harmless setup"
 * awaits; there are none before the guard in a compliant function.
 */
function extractPermissionGuards(rawSource: string): Record<string, string | null> {
  const source = stripComments(rawSource);
  const exportRe = /^export\s+(?:async\s+function\s+(\w+)\s*\(|function\s+(\w+)\s*\(|const\s+(\w+)\s*=)/gm;
  const matches = [...source.matchAll(exportRe)];

  const map: Record<string, string | null> = {};

  for (let idx = 0; idx < matches.length; idx++) {
    const m = matches[idx];
    const name = (m[1] ?? m[2] ?? m[3])!;
    const start = m.index!;
    const end = idx + 1 < matches.length ? matches[idx + 1].index! : source.length;
    const body = source.slice(start, end);

    const firstAwait = body.match(/\bawait\b/);
    const permCall = body.match(/await\s+authorizePermission\(PERMISSIONS\.(\w+)\)/);

    if (!permCall || !firstAwait) {
      map[name] = null;
      continue;
    }

    const isFirstAwait = firstAwait.index === permCall.index;

    const afterPerm = body.slice(permCall.index!, permCall.index! + 300);
    const hasEarlyReturn = /if\s*\(\s*!\s*\w+\.authorized\s*\)\s*\{?[\s\S]{0,150}?\breturn\b/.test(afterPerm);

    map[name] = isFirstAwait && hasEarlyReturn ? permCall[1] : null;
  }

  return map;
}

describe('get-audit-logs.ts permission guards', () => {
  it('pins which permission each export requires', () => {
    expect(extractPermissionGuards(auditLogsSource)).toEqual({
      getAuditLogs: 'SETTINGS_VIEW_AUDIT_LOGS',
      // Delegates to getAuditLogs() and inherits its guard -- must NOT carry
      // a second, independently-driftable check.
      getEntityAuditLogs: null,
      getAuditStats: 'SETTINGS_VIEW_AUDIT_LOGS',
      getAuditActors: 'SETTINGS_VIEW_AUDIT_LOGS',
    });
  });

  it('no longer reads the legacy profiles.role column for authorization', () => {
    expect(auditLogsSource).not.toContain("profile.role");
    expect(auditLogsSource).not.toContain("['admin', 'chairman']");
  });

  it('the pinned permission constant resolves to settings.view_audit_logs', () => {
    expect(PERMISSIONS.SETTINGS_VIEW_AUDIT_LOGS).toBe('settings.view_audit_logs');
  });
});

describe('notifications/queue.ts permission guards', () => {
  it('pins which permission every export requires -- all nine, not just getQueueStatistics', () => {
    expect(extractPermissionGuards(queueSource)).toEqual({
      getNotificationQueue: 'NOTIFICATIONS_MANAGE',
      getQueueItem: 'NOTIFICATIONS_MANAGE',
      getQueueStatistics: 'NOTIFICATIONS_MANAGE',
      queueNotificationFromTemplate: 'NOTIFICATIONS_MANAGE',
      queueDirectNotification: 'NOTIFICATIONS_MANAGE',
      cancelNotification: 'NOTIFICATIONS_MANAGE',
      retryNotification: 'NOTIFICATIONS_MANAGE',
      processNotificationQueue: 'NOTIFICATIONS_MANAGE',
      getQueueForResident: 'NOTIFICATIONS_MANAGE',
    });
  });

  it('the pinned permission constant resolves to notifications.manage', () => {
    expect(PERMISSIONS.NOTIFICATIONS_MANAGE).toBe('notifications.manage');
  });
});

describe('audit_logs RLS policy (ADR-0006 boundary, expressed as a test)', () => {
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));

  const seedMigration = readFileSync(
    path.join(migrationsDir, '20251222000000_create_rbac_system.sql'),
    'utf8'
  );
  const excludeMigration = readFileSync(
    path.join(migrationsDir, '20260830100200_chairman_excludes_settings_module.sql'),
    'utf8'
  );
  const regainMigration = readFileSync(
    path.join(migrationsDir, '20260902103000_chairman_regains_settings_view.sql'),
    'utf8'
  );
  const policyMigrationFile = files.find((f) =>
    f.endsWith('_audit_logs_select_follows_view_audit_logs_permission.sql')
  );

  it('#181 migration exists, drops the legacy policy and replaces it with a has_permission() check', () => {
    expect(policyMigrationFile, 'expected the #181 audit_logs RLS migration to exist').toBeDefined();
    const policyMigration = readFileSync(path.join(migrationsDir, policyMigrationFile!), 'utf8');

    expect(policyMigration).toContain(
      'DROP POLICY IF EXISTS "Admins and chairman can view audit logs" ON audit_logs;'
    );
    // F5: TO authenticated is required -- has_permission(text) has EXECUTE
    // revoked from anon (20260829100200), so a policy with no TO clause
    // would apply to PUBLIC including anon and turn an unauthenticated
    // SELECT into a 500 ("permission denied for function has_permission")
    // instead of an empty result set.
    expect(policyMigration).toContain(
      "CREATE POLICY \"Users with settings.view_audit_logs can view audit logs\"\n  ON audit_logs FOR SELECT TO authenticated\n  USING (public.has_permission('settings.view_audit_logs'));"
    );
    // No longer reads profiles.role directly in the active (non-commented)
    // migration body -- the rollback block below COMMIT is allowed to
    // mention it, since it is the original policy preserved verbatim as a
    // SQL comment, not executable here.
    const activeSql = policyMigration.match(/^BEGIN;[\s\S]*?^COMMIT;/m)?.[0] ?? '';
    expect(activeSql).not.toBe('');
    expect(activeSql).not.toContain('profiles.role');

    // The insert policy is the logging path and must be untouched by this
    // migration -- the active SQL may only DROP/CREATE the SELECT policy,
    // never touch "Authenticated users can insert audit logs".
    expect(activeSql).not.toContain('Authenticated users can insert audit logs');
    // F4: re-runnable -- the new policy name is also dropped with IF EXISTS
    // before its CREATE POLICY, so a second apply does not abort with 42710
    // (duplicate policy). That means two DROP POLICY statements now (the
    // legacy name and the new name), and exactly one CREATE POLICY.
    expect((activeSql.match(/DROP POLICY IF EXISTS/g) ?? []).length).toBe(2);
    expect((activeSql.match(/CREATE POLICY/g) ?? []).length).toBe(1);
    expect(activeSql.indexOf('DROP POLICY IF EXISTS "Users with settings.view_audit_logs can view audit logs"')).toBeLessThan(
      activeSql.indexOf('CREATE POLICY "Users with settings.view_audit_logs can view audit logs"')
    );
  });

  it('F1: the access-change comment is corrected -- vice_chairman is a new grant, not "unaffected", and the false LEGACY_ROLE_MAP claim is gone', () => {
    const policyMigration = readFileSync(path.join(migrationsDir, policyMigrationFile!), 'utf8');

    // The corrected claim: vice_chairman has no legacy profiles.role bucket
    // (assign-role.ts's LEGACY_ROLE_MAP has no vice_chairman entry -- it maps
    // to null), so the old policy (which read profiles.role directly) never
    // admitted vice_chairman. The new policy is therefore a grant for
    // vice_chairman as well as a revoke for chairman.
    expect(policyMigration).toContain('vice_chairman has no legacy equivalent');
    // The retracted claim -- that LEGACY_ROLE_MAP collapses vice_chairman
    // into the legacy 'chairman' bucket -- must not survive anywhere in the
    // file; assign-role.ts's LEGACY_ROLE_MAP has no vice_chairman key at all.
    expect(policyMigration).not.toContain("vice_chairman's legacy `profiles.role` column as\n--           'chairman'");
    // The retracted "unaffected" claim must not survive anywhere in the file.
    expect(policyMigration).not.toContain('vice_chairman` are unaffected');
    // The corrected table names all three outcomes explicitly.
    expect(policyMigration).toContain('REVOKED -- the intent');
    expect(policyMigration).toContain('ADMITTED -- a new grant');
  });

  it('vice_chairman and super_admin were seeded holding settings.view_audit_logs; chairman was not left holding it', () => {
    // Original seed: super_admin gets every permission; vice_chairman gets
    // every non-system permission (which includes the `settings` category,
    // and therefore settings.view_audit_logs).
    expect(seedMigration).toContain(
      "SELECT assign_permissions_to_role('super_admin', ARRAY(SELECT name FROM app_permissions));"
    );
    expect(seedMigration).toMatch(
      /assign_permissions_to_role\('vice_chairman',\s*ARRAY\(\s*SELECT name FROM app_permissions\s*WHERE category != 'system'\s*\)\);/
    );

    // Chairman's entire settings+system category grant (including
    // settings.view_audit_logs) was revoked, and vice_chairman was explicitly
    // left out of that revoke.
    expect(excludeMigration).toContain("AND ar.name = 'chairman'");
    expect(excludeMigration).toContain("AND ap.category IN ('settings', 'system');");
    expect(excludeMigration).not.toMatch(/'vice_chairman'/);

    // Chairman's later regrant is scoped to settings.view only -- not
    // settings.view_audit_logs, and not the whole settings category.
    expect(regainMigration).toContain("AND p.name = 'settings.view'");
    expect(regainMigration).not.toContain('view_audit_logs');
    expect(regainMigration).not.toContain("ap.category = 'settings'");
  });

  it('no migration grants settings.view_audit_logs back to chairman', () => {
    // `view_audit_logs` should appear in exactly these places in migration
    // history: the seed that declares the app_permissions row, this issue's
    // own policy migration, and #187's policy migration (both of which
    // reference the permission name in an RLS USING clause and a comment
    // block, not in a role_permissions grant). Any other file naming it is a
    // deliberate change this test should force a reviewer to update.
    const expectedFiles = new Set([
      '20251222000000_create_rbac_system.sql',
      policyMigrationFile,
      // #187 reuses settings.view_audit_logs as the RLS gate for search_logs,
      // aligning the policy with getSearchAnalytics() (which already checks
      // this permission). It names the permission in a USING clause, not a
      // role_permissions grant, so it does not hand it back to chairman.
      '20260905002000_policies_part_b_follow_permissions.sql',
    ]);

    const offenders = files.filter(
      (f) => !expectedFiles.has(f) && readFileSync(path.join(migrationsDir, f), 'utf8').includes('view_audit_logs')
    );

    expect(offenders).toEqual([]);
  });
});
