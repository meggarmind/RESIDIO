import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { PERMISSIONS } from '@/lib/auth/action-roles';

/**
 * Issue #186 (epic #180) rewrites fourteen RLS policies that authorized by
 * reading the legacy `profiles.role` column so each instead calls
 * `has_permission()`. `profiles.role` is the dead vocabulary per ADR-0007 --
 * `handle_new_user()` writes NULL to it and epic #182 drops it -- so a policy
 * still reading it changes meaning without anyone editing it.
 *
 * These are structural assertions over the migration file, not behavioural
 * ones: nothing here connects to a database, the same approach as
 * `audit-queue-permission-guards.test.ts` and
 * `legacy-role-migration-ratchet.test.ts`. What it can prove is that the
 * migration as written is the migration that was reviewed -- exact policy
 * names, exact commands, exact permission per table -- which is what a later
 * reader diffing the live policy set against the #185 baseline needs.
 *
 * The pin is `toEqual`-style rather than "contains a has_permission call",
 * because the failure mode worth catching is a *swap* -- the right shape with
 * the wrong permission name, e.g. `payments.view` where `payments.update` was
 * chosen. A subset assertion passes that silently; see D26 in #164's
 * quick-action-permissions.test.ts for the same reasoning.
 */

const migrationsDir = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));

const MIGRATION_FILE = '20260905000000_policies_part_a_follow_permissions.sql';

/**
 * Normalised to LF because the assertions below match multi-line CREATE POLICY
 * blocks literally, and a CRLF checkout on Windows would otherwise fail every
 * one of them for a reason that has nothing to do with the policy.
 */
const migration = readFileSync(path.join(migrationsDir, MIGRATION_FILE), 'utf8').replace(
  /\r\n/g,
  '\n'
);

/**
 * The executable body only. Everything above `BEGIN;` is the header and the
 * rollback block, and the rollback block legitimately quotes the old
 * `profiles.role` predicates -- so a check for legacy references that scanned
 * the whole file could never pass, and one that scanned nothing would never
 * fail. The `^`-anchored `BEGIN;` skips the commented `-- BEGIN;` that opens
 * the rollback block.
 */
const activeSql = migration.match(/^BEGIN;[\s\S]*?^COMMIT;/m)?.[0] ?? '';

/** Active SQL with `--` comments removed, so section prose cannot satisfy a check. */
const activeStatements = activeSql.replace(/--[^\n]*/g, '');

/**
 * The fourteen policies, as `[table, policy name, command, permission]`.
 *
 * The permission column is the decision this slice actually makes, and it was
 * verified against `role_permissions` before the migration was written. It is
 * restated here rather than derived from the migration so that changing the
 * migration alone cannot make this file agree with it.
 */
const POLICIES: ReadonlyArray<{
  table: string;
  policy: string;
  cmd: 'ALL' | 'SELECT';
  permission: string;
}> = [
  {
    table: 'estate_bank_account_passwords',
    policy: 'Admin access for bank account passwords',
    cmd: 'ALL',
    permission: 'email_imports.manage_passwords',
  },
  {
    table: 'gmail_oauth_credentials',
    policy: 'Admin access for gmail oauth credentials',
    cmd: 'ALL',
    permission: 'email_imports.configure',
  },
  {
    table: 'whatsapp_provider_credentials',
    policy: 'Admin access for whatsapp provider credentials',
    cmd: 'ALL',
    permission: 'whatsapp.manage',
  },
  {
    table: 'email_imports',
    policy: 'Admin access for email imports',
    cmd: 'ALL',
    permission: 'email_imports.view',
  },
  {
    table: 'email_messages',
    policy: 'Admin access for email messages',
    cmd: 'ALL',
    permission: 'email_imports.view',
  },
  {
    table: 'email_transactions',
    policy: 'Admin access for email transactions',
    cmd: 'ALL',
    permission: 'email_imports.view',
  },
  {
    table: 'payment_records',
    policy: 'Admins and FinSec can manage all payments',
    cmd: 'ALL',
    permission: 'payments.update',
  },
  {
    table: 'wallet_payment_batches',
    policy: 'Admin finance can manage wallet payment batches',
    cmd: 'ALL',
    permission: 'billing.manage_wallets',
  },
  {
    table: 'wallet_payment_batch_items',
    policy: 'Admin finance can manage wallet payment batch items',
    cmd: 'ALL',
    permission: 'billing.manage_wallets',
  },
  {
    table: 'billing_profile_versions',
    policy: 'Finance may read billing profile versions',
    cmd: 'SELECT',
    permission: 'billing.manage_profiles',
  },
  {
    table: 'billing_profile_version_items',
    policy: 'Finance may read billing profile version items',
    cmd: 'SELECT',
    permission: 'billing.manage_profiles',
  },
  {
    table: 'invoice_generation_runs',
    policy: 'Finance may read invoice generation runs',
    cmd: 'SELECT',
    permission: 'billing.create_invoice',
  },
  {
    table: 'invoice_generation_candidates',
    policy: 'Finance may read invoice generation candidates',
    cmd: 'SELECT',
    permission: 'billing.create_invoice',
  },
  {
    table: 'invoice_generation_approvals',
    policy: 'Finance may read invoice generation approvals',
    cmd: 'SELECT',
    permission: 'billing.create_invoice',
  },
];

/**
 * Policies on the same three tables that this migration must leave alone.
 *
 * They are resident-scoped SELECT policies, not legacy-vocabulary readers.
 * Dropping one would remove a resident's access to their own payment history
 * with no error anywhere -- the exact failure this list exists to prevent,
 * since a `DROP POLICY IF EXISTS` on a name nobody meant to touch succeeds
 * silently.
 */
const MUST_NOT_TOUCH = [
  'Residents can view own payments',
  'Residents can view own wallet payment batches',
  'Residents can view own wallet payment batch items',
];

/** The exact `CREATE POLICY` text the migration is pinned to, per command. */
function expectedCreate(entry: (typeof POLICIES)[number]): string {
  const call = `public.has_permission('${entry.permission}')`;
  const head = `CREATE POLICY "${entry.policy}"\n  ON public.${entry.table} FOR ${entry.cmd} TO authenticated\n  USING (${call})`;

  // A FOR ALL policy governs writes as well as reads. Postgres defaults
  // WITH CHECK to the USING expression when omitted, so omitting it is not a
  // bug today -- but it leaves the write side implicit, and a later edit of
  // USING alone would then silently move both. Both clauses are stated.
  return entry.cmd === 'ALL' ? `${head}\n  WITH CHECK (${call});` : `${head};`;
}

describe('#186 part A: legacy profiles.role policies follow has_permission()', () => {
  it('the migration exists under the agreed filename', () => {
    // Pinned by exact name, not by suffix match: the applied-migrations record
    // is keyed on the filename, and a rename after review is how a migration
    // ends up applied twice or not at all.
    expect(readdirSync(migrationsDir)).toContain(MIGRATION_FILE);
  });

  it('wraps its work in a single transaction', () => {
    // All fourteen policies land or none do. A partial apply would leave some
    // tables gated on a column the next migration in epic #182 removes.
    expect(activeSql).not.toBe('');
    expect((migration.match(/^BEGIN;$/gm) ?? []).length).toBe(1);
    expect((migration.match(/^COMMIT;$/gm) ?? []).length).toBe(1);
  });

  it.each(POLICIES)('rewrites "$policy" on $table onto $permission', (entry) => {
    // The DROP must name the same policy as the CREATE. Recreating under a
    // new name would leave the legacy policy live alongside the new one, and
    // RLS policies are OR-ed -- the old role check would still admit callers.
    expect(activeSql).toContain(
      `DROP POLICY IF EXISTS "${entry.policy}" ON public.${entry.table};`
    );
    expect(activeSql).toContain(expectedCreate(entry));
  });

  it('names exactly these fourteen policies and no others', () => {
    // Counting is what makes the per-policy checks above sufficient: without
    // it, a fifteenth DROP POLICY for something outside this slice's scope
    // would pass every other assertion in this file.
    const dropped = [...activeSql.matchAll(/DROP POLICY IF EXISTS "([^"]+)" ON public\.(\w+);/g)].map(
      (m) => `${m[2]}.${m[1]}`
    );
    const created = [...activeSql.matchAll(/CREATE POLICY "([^"]+)"\n  ON public\.(\w+) /g)].map(
      (m) => `${m[2]}.${m[1]}`
    );
    const expected = POLICIES.map((p) => `${p.table}.${p.policy}`);

    expect(dropped).toEqual(expected);
    expect(created).toEqual(expected);
    expect((activeSql.match(/DROP POLICY/g) ?? []).length).toBe(14);
    expect((activeSql.match(/CREATE POLICY/g) ?? []).length).toBe(14);
  });

  it('every DROP is re-runnable and precedes its own CREATE', () => {
    // Same policy names in and out, so `IF EXISTS` is what keeps a second
    // apply from aborting with 42710 (duplicate policy) instead of being a
    // no-op. Ordering matters because CREATE on an existing name fails.
    for (const entry of POLICIES) {
      const dropAt = activeSql.indexOf(`DROP POLICY IF EXISTS "${entry.policy}"`);
      const createAt = activeSql.indexOf(`CREATE POLICY "${entry.policy}"`);
      expect(dropAt, `${entry.policy}: DROP not found`).toBeGreaterThan(-1);
      expect(dropAt, `${entry.policy}: DROP must precede CREATE`).toBeLessThan(createAt);
    }
  });

  it('no executable statement reads the legacy profiles.role column', () => {
    // The whole point of the slice. Checked against comment-stripped active
    // SQL so that neither the header nor the rollback block can mask a real
    // reference that survived in the body.
    expect(activeStatements).not.toContain('profiles.role');
    expect(activeStatements).not.toMatch(/\brole\s+(?:IN|=\s*ANY)\b/i);
    expect(activeStatements).not.toContain('user_role');
  });

  it('scopes every policy to authenticated', () => {
    // Not cosmetic: has_permission(text) has EXECUTE revoked from anon
    // (20260829100200), so a policy with no TO clause applies to PUBLIC
    // including anon and turns an unauthenticated query into a 500
    // ("permission denied for function has_permission") rather than an empty
    // result set.
    expect((activeSql.match(/ TO authenticated\n/g) ?? []).length).toBe(14);
  });

  it('leaves the resident-scoped policies on the same tables untouched', () => {
    for (const name of MUST_NOT_TOUCH) {
      expect(activeSql, `${name} must not be named in this migration`).not.toContain(name);
    }
  });

  it('does not touch audit_logs (#181) or the storage schema (#206)', () => {
    // audit_logs was migrated by #181 and rewriting it here would double-apply
    // that decision. The three unguarded storage.objects policies on the
    // email-imports bucket read bucket_id and nothing else -- they are a
    // security fix (#206), not a legacy-vocabulary rewrite, and folding them
    // into a refactor slice would hide them.
    expect(activeSql).not.toContain('audit_logs');
    expect(activeSql).not.toContain('storage.');
  });

  it('carries a rollback block covering all fourteen policies', () => {
    const rollback = migration.slice(0, migration.indexOf('\nBEGIN;'));

    expect(rollback).toContain('-- ROLLBACK:');
    for (const entry of POLICIES) {
      expect(rollback, `${entry.policy} missing from the rollback block`).toContain(
        `-- CREATE POLICY "${entry.policy}"`
      );
    }
    // The rollback is only useful if it restores the predicates it replaced,
    // so it must still quote the legacy column -- inside comments, where the
    // ratchet's comment-stripping leaves it harmless.
    expect(rollback).toContain('profiles.role');
  });

  it('every permission it names is a real entry in the permission catalogue', () => {
    // Guards against a typo'd permission string, which would produce a policy
    // that compiles, applies, and denies everyone forever -- has_permission()
    // returns false for a name no role can hold.
    const catalogue = new Set<string>(Object.values(PERMISSIONS));
    const unknown = [...new Set(POLICIES.map((p) => p.permission))].filter(
      (p) => !catalogue.has(p)
    );

    expect(unknown).toEqual([]);
  });
});
