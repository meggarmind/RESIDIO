import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Residio's bootstrap invariant (ADR-0007, issue #184, epic #182): at least one
 * active profile must always hold `super_admin`.
 *
 * The boundary is a pair of deferred constraint triggers, not the server
 * actions — administrators on this project have historically been created and
 * modified by direct database access, which no action can intercept. These
 * tests therefore pin the migration's shape as well as the application checks,
 * and they pin the *second* trigger hardest, because it is the one that is easy
 * to miss: `profiles.role_id` is `ON DELETE SET NULL`, so deleting the
 * super_admin row from `app_roles` nulls every holder's role without any
 * trigger on `profiles` ever observing a violating state.
 *
 * No database connection: reads source and migration files off disk, following
 * `audit-queue-permission-guards.test.ts` and `permission-catalog.test.ts`.
 */

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

const migration = read(
  '../../supabase/migrations/20260904230000_require_active_super_admin.sql'
);

const assignRoleSource = read('../actions/roles/assign-role.ts');
const rolesIndexSource = read('../actions/roles/index.ts');
const accountApprovalSource = read('../actions/auth/account-approval.ts');

/** Position of the first match, or -1. Used to prove a guard precedes a write. */
function indexOf(source: string, pattern: RegExp): number {
  return source.search(pattern);
}

describe('super_admin invariant — the database boundary', () => {
  it('refuses to install itself onto data that already violates the invariant', () => {
    expect(migration).toMatch(/RAISE EXCEPTION\s*\n?\s*'Cannot install the super_admin invariant/);
  });

  it('does not grant super_admin to satisfy itself', () => {
    // A migration that grants super_admin is the privilege-escalation shape
    // 20260829100400 hardened handle_new_user() against. It must fail loudly
    // instead, so no statement here may write role_id or insert a profile.
    expect(migration).not.toMatch(/\bUPDATE\s+(?:public\.)?profiles\b/i);
    expect(migration).not.toMatch(/\bINSERT\s+INTO\s+(?:public\.)?profiles\b/i);
  });

  it('guards profiles against deletion, demotion and deactivation', () => {
    expect(migration).toMatch(
      /CREATE CONSTRAINT TRIGGER profiles_require_active_super_admin\s+AFTER DELETE OR UPDATE OF role_id, approval_status ON public\.profiles/
    );
  });

  it('guards app_roles against deletion of the super administrator role', () => {
    expect(migration).toMatch(
      /CREATE CONSTRAINT TRIGGER app_roles_require_active_super_admin\s+AFTER DELETE ON public\.app_roles/
    );
  });

  it('defers both triggers to COMMIT so handing the role over in one transaction works', () => {
    const undeferred = [...migration.matchAll(/CREATE CONSTRAINT TRIGGER (\w+)([\s\S]*?);/g)]
      .filter(([statement]) => !/DEFERRABLE INITIALLY DEFERRED/.test(statement))
      .map(([, name]) => name);

    expect(undeferred).toEqual([]);
    expect(migration.match(/CREATE CONSTRAINT TRIGGER/g)).toHaveLength(2);
  });

  it('counts holders with the service role, so RLS cannot fake a violation', () => {
    expect(migration).toMatch(/SECURITY DEFINER/);
    expect(migration).toMatch(/SET search_path = public, pg_temp/);
  });

  it('defines "active" as approval_status active plus the super_admin role', () => {
    expect(migration).toMatch(
      /WHERE p\.approval_status = 'active'\s*\n\s*AND ar\.name = 'super_admin'/
    );
  });

  it('carries its rollback SQL as a comment block, per epic #182', () => {
    expect(migration).toMatch(/-- ROLLBACK:/);
    expect(migration).toMatch(
      /--\s+DROP TRIGGER IF EXISTS app_roles_require_active_super_admin ON public\.app_roles;/
    );
    expect(migration).toMatch(
      /--\s+DROP TRIGGER IF EXISTS profiles_require_active_super_admin ON public\.profiles;/
    );
    expect(migration).toMatch(
      /--\s+DROP FUNCTION IF EXISTS public\.assert_active_super_admin_exists\(\);/
    );
  });
});

describe('super_admin invariant — the readable error', () => {
  /**
   * Every application path that can move an account off `super_admin`, clear its
   * role or take it out of 'active'. Each must consult the invariant *before* it
   * writes, or the administrator gets a raw Postgres exception instead of a
   * sentence.
   *
   * `removeRoleFromProfile` is absent deliberately — it already refuses to strip
   * `super_admin` from anyone, which is strictly stronger than this check, and is
   * pinned separately below.
   */
  const guardedPaths: Array<{ name: string; source: string; write: RegExp }> = [
    {
      name: 'assignRoleToProfile',
      source: assignRoleSource,
      write: /\.update\(\{\s*\n\s*role_id: roleId,/,
    },
    {
      name: 'assignRoleToUser',
      source: rolesIndexSource,
      write: /\.update\(\{ role_id: roleId \}\)/,
    },
    {
      name: 'rejectAccount',
      source: accountApprovalSource,
      write: /approval_status: 'rejected',/,
    },
  ];

  for (const { name, source, write } of guardedPaths) {
    it(`${name} checks the invariant before it writes`, () => {
      const guard = indexOf(source, /await isLastActiveSuperAdmin\(/);
      const writeAt = indexOf(source, write);

      expect(guard, `${name}: no isLastActiveSuperAdmin() call`).toBeGreaterThan(-1);
      expect(writeAt, `${name}: write not found — this test needs updating`).toBeGreaterThan(-1);
      expect(guard).toBeLessThan(writeAt);
    });

    it(`${name} returns the shared message rather than its own wording`, () => {
      expect(source).toContain('LAST_SUPER_ADMIN_ERROR');
    });
  }

  it('removeRoleFromProfile still refuses to strip super_admin outright', () => {
    expect(assignRoleSource).toMatch(
      /currentRole\?\.name === 'super_admin'[\s\S]{0,120}Cannot remove the Super Administrator role/
    );
  });

  it('deleteRole still refuses system roles, which is what covers super_admin', () => {
    // super_admin is is_system_role = true in the live database (verified
    // 2026-09-04), so the app path to deleting it is already closed. The
    // app_roles trigger exists for the direct-database path, not this one.
    expect(rolesIndexSource).toMatch(
      /role\?\.is_system_role[\s\S]{0,80}Cannot delete system roles/
    );
  });
});
