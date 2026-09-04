import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Ratchet: no *new* migration may reference the legacy `profiles.role` column.
 *
 * Residio carries two role vocabularies (ADR-0007). `profiles.role` is the dead
 * one — `get_my_role()` stopped reading it, `handle_new_user()` writes NULL to it,
 * and epic #182 drops it. Yet migrations were still being written against it days
 * after that retirement started: the newest migration in the repo when this test
 * was added, `20260902102528_create_whatsapp_provider_credentials.sql`, guards a
 * table its own comment describes as holding decryptable secrets with
 * `profiles.role IN ('admin','chairman')`.
 *
 * Whatever else happens, the set must stop growing. Existing offenders are
 * allowlisted **by filename**, so the list can only shrink: a file that no longer
 * references the column must be dropped from the allowlist, and a file that is not
 * on it may not start referencing the column.
 *
 * Modelled on `settings-nav-coverage.test.ts` — this repo's pattern for a
 * structural test over configuration that has drifted before.
 *
 * Two deliberate non-targets:
 *
 * - `get_my_role()` is **not** flagged. It reads `role_id`, not this column, and is
 *   currently the correct thing for a policy to use. Flagging it now would fight the
 *   codebase; it is retargeted to `get_my_role_name()` in #190.
 * - DDL that *removes* the column — `ALTER TABLE profiles RENAME/DROP COLUMN role`,
 *   and `COMMENT ON COLUMN profiles.role` — is exempt. The ratchet forbids depending
 *   on the column, not retiring it, and #193/#194 must be able to land without
 *   growing this allowlist.
 */

const migrationsDir = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));

/**
 * Migrations that referenced `profiles.role` when this ratchet was installed.
 *
 * This list is the deliverable as much as the test: it is the authoritative set of
 * files that #186 and #187 must clear, and it reached this file by scanning the
 * directory, not by transcription from an issue. **Only ever remove entries.**
 *
 * Note that it is a list of *files*, not of live policies: several of these
 * migrations were later superseded, and some policies in the live database were
 * applied without a file here at all. The database, not this list, is ground truth
 * for what #186/#187 must rewrite.
 */
const ALLOWLIST = new Set<string>([
  '20251206223732_create_profiles_table.sql',
  '20251207000000_fix_rls_recursion.sql',
  '20251208000200_create_payment_records.sql',
  '20251209000100_fix_null_profile_roles.sql',
  '20251213200000_create_audit_logs.sql',
  '20251222000000_create_rbac_system.sql',
  '20251226100000_create_report_schedules_and_history.sql',
  '20251231120000_create_announcements_system.sql',
  '20260101_fix_report_subscriptions_rls.sql',
  '20260106110000_harmonize_role_systems.sql',
  '20260107100000_create_email_import_schema.sql',
  '20260121000001_create_search_logs.sql',
  '20260812223209_create_wallet_payment_batches.sql',
  '20260812235852_invoice_generation_redesign.sql',
  '20260813045937_harden_invoice_generation_rpc_authorization.sql',
  '20260813051135_harden_invoice_generation_database_contract.sql',
  '20260813092000_harden_invoice_generation_rpc_authorization.sql',
  '20260829100100_backfill_profile_role_ids.sql',
  '20260829100300_relax_legacy_profile_role.sql',
  '20260829100400_harden_handle_new_user.sql',
  '20260902102528_create_whatsapp_provider_credentials.sql',
]);

/**
 * `auth.role()` is Supabase's JWT-claim function, not our column. Every other
 * qualifier reaching `.role` in these migrations resolves to `profiles`.
 */
const NON_PROFILE_QUALIFIERS = new Set(['auth']);

/**
 * Blanks out `--` comments, block comments and quoted text, replacing each removed
 * character with a space so that byte offsets — and therefore line numbers — are
 * unchanged.
 *
 * Single-quoted literals go because `COMMENT ON` prose and rollback SQL parked in a
 * comment block are documentation, not references. Double-quoted identifiers go
 * because policy names like `"Allow insert for role managers"` otherwise read as
 * references; a bare `"role"` is kept, since that one really is the column.
 *
 * Dollar-quoted bodies (`$$ ... $$`) are deliberately *not* treated as strings: they
 * hold executable plpgsql, and `create_generated_invoice()` reads the legacy column
 * from inside one. Only the delimiters are dropped, so the body is scanned under the
 * same rules as top-level SQL.
 */
export function stripSqlNoise(sql: string): string {
  const out: string[] = [];
  let i = 0;

  /** Blank a span, keeping newlines so line numbers survive. */
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) out.push(sql[k] === '\n' ? '\n' : ' ');
  };

  while (i < sql.length) {
    const two = sql.slice(i, i + 2);

    if (two === '--') {
      const end = sql.indexOf('\n', i);
      const stop = end === -1 ? sql.length : end;
      blank(i, stop);
      i = stop;
      continue;
    }

    if (two === '/*') {
      const end = sql.indexOf('*/', i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }

    const dollarTag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
    if (dollarTag) {
      blank(i, i + dollarTag[0].length);
      i += dollarTag[0].length;
      continue;
    }

    if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") {
            j += 2;
            continue;
          }
          j += 1;
          break;
        }
        j += 1;
      }
      blank(i, j);
      i = j;
      continue;
    }

    if (sql[i] === '"') {
      const end = sql.indexOf('"', i + 1);
      const stop = end === -1 ? sql.length : end + 1;
      if (sql.slice(i, stop).toLowerCase() !== '"role"') {
        blank(i, stop);
        i = stop;
        continue;
      }
    }

    out.push(sql[i]);
    i += 1;
  }

  return out.join('');
}

/** Table aliases bound to `profiles` anywhere in the file, e.g. `FROM profiles p`. */
function profileAliases(code: string): Set<string> {
  const aliases = new Set<string>();
  const binding =
    /\b(?:FROM|JOIN|UPDATE|INTO)\s+(?:public\.)?profiles\s+(?:AS\s+)?([a-z_][a-z0-9_]*)/gi;

  const reserved = new Set([
    'set',
    'where',
    'on',
    'using',
    'values',
    'select',
    'as',
    'left',
    'right',
    'inner',
    'join',
    'group',
    'order',
    'limit',
    'returning',
  ]);

  for (const match of code.matchAll(binding)) {
    const alias = match[1].toLowerCase();
    if (!reserved.has(alias)) aliases.add(alias);
  }

  return aliases;
}

/** Statements that retire the column rather than depend on it. */
function retiresTheColumn(statement: string): boolean {
  return (
    /\bALTER\s+TABLE\s+(?:public\.)?profiles\b[\s\S]*\b(?:RENAME|DROP)\s+COLUMN\b/i.test(statement) ||
    /\bCOMMENT\s+ON\s+COLUMN\s+(?:public\.)?profiles\.role\b/i.test(statement)
  );
}

/**
 * Every executable reference to the legacy column in one migration, as
 * `line: source` strings.
 *
 * Detection is statement-scoped rather than line-scoped because the most common
 * shape spans lines:
 *
 *   USING (auth.uid() IN (
 *     SELECT id FROM profiles
 *     WHERE role IN ('admin', 'chairman')
 *   ))
 *
 * `profiles.role` is the only bare `role` column in the schema, so inside a
 * statement that names `profiles` an unqualified `role` token can only be it.
 */
export function legacyRoleReferences(sql: string): string[] {
  const code = stripSqlNoise(sql);
  const original = sql.split('\n');
  const aliases = profileAliases(code);
  const hitLines = new Set<number>();

  const lineAt = (offset: number) => code.slice(0, offset).split('\n').length;

  let cursor = 0;
  for (const statement of code.split(';')) {
    const base = cursor;
    cursor += statement.length + 1;

    if (retiresTheColumn(statement)) continue;

    const namesProfiles = /\b(?:public\.)?profiles\b/i.test(statement);

    for (const match of statement.matchAll(/(?:\b([a-z_][a-z0-9_]*)\.)?\brole\b/gi)) {
      const qualifier = match[1]?.toLowerCase();

      if (qualifier) {
        if (NON_PROFILE_QUALIFIERS.has(qualifier)) continue;
        if (qualifier !== 'profiles' && !aliases.has(qualifier)) continue;
      } else if (!namesProfiles) {
        continue;
      }

      hitLines.add(lineAt(base + (match.index ?? 0)));
    }
  }

  return [...hitLines]
    .sort((a, b) => a - b)
    .map((line) => `${line}: ${(original[line - 1] ?? '').trim()}`);
}

function migrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

function offenders(): Map<string, string[]> {
  const found = new Map<string, string[]>();

  for (const name of migrationFiles()) {
    const refs = legacyRoleReferences(readFileSync(path.join(migrationsDir, name), 'utf8'));
    if (refs.length > 0) found.set(name, refs);
  }

  return found;
}

describe('legacy role migration ratchet', () => {
  it('finds no reference to profiles.role outside the allowlist', () => {
    const unexpected = [...offenders().entries()]
      .filter(([name]) => !ALLOWLIST.has(name))
      .map(([name, refs]) => `${name}\n    ${refs.join('\n    ')}`);

    expect(unexpected).toEqual([]);
  });

  it('keeps the allowlist shrinking — every entry still names a real offender', () => {
    const current = offenders();
    const stale = [...ALLOWLIST].filter((name) => !current.has(name)).sort();

    expect(stale).toEqual([]);
  });

  describe('the detector', () => {
    it('ignores comments, including rollback SQL parked in a comment block', () => {
      expect(legacyRoleReferences("-- AND profiles.role IN ('admin')")).toEqual([]);
      expect(legacyRoleReferences('/* SELECT role FROM profiles */')).toEqual([]);
    });

    it('ignores prose in string literals such as COMMENT ON', () => {
      expect(legacyRoleReferences("COMMENT ON TABLE x IS 'deprecated, see profiles.role';")).toEqual(
        []
      );
    });

    it('ignores the word role inside a quoted policy name', () => {
      expect(
        legacyRoleReferences('DROP POLICY IF EXISTS "Allow insert for role managers" ON profiles;')
      ).toEqual([]);
    });

    it('ignores role_id, the column that replaced it', () => {
      expect(legacyRoleReferences('SELECT profiles.role_id FROM profiles;')).toEqual([]);
      expect(legacyRoleReferences('SELECT p.role_id FROM profiles p;')).toEqual([]);
    });

    it("ignores Supabase's auth.role() claim function", () => {
      expect(legacyRoleReferences("SELECT 1 FROM profiles WHERE auth.role() = 'x';")).toEqual([]);
    });

    it('does not flag get_my_role(), which reads role_id', () => {
      expect(
        legacyRoleReferences("CREATE POLICY a ON t USING (get_my_role() IN ('admin'));")
      ).toEqual([]);
    });

    it('catches a direct reference', () => {
      expect(
        legacyRoleReferences("SELECT 1 FROM profiles WHERE profiles.role IN ('admin');")
      ).toHaveLength(1);
    });

    it('catches an aliased reference', () => {
      expect(
        legacyRoleReferences("SELECT 1 FROM profiles p WHERE p.role IN ('admin','chairman');")
      ).toHaveLength(1);
    });

    it('catches an unqualified reference split across lines', () => {
      const sql = [
        'CREATE POLICY "x" ON payment_records FOR ALL USING (',
        '  auth.uid() IN (',
        '    SELECT id FROM profiles',
        "    WHERE role IN ('admin', 'chairman')",
        '  )',
        ');',
      ].join('\n');

      expect(legacyRoleReferences(sql)).toEqual(["4: WHERE role IN ('admin', 'chairman')"]);
    });

    it('catches a reference inside a dollar-quoted function body', () => {
      const sql = [
        'CREATE FUNCTION f() RETURNS boolean AS $$',
        'BEGIN',
        "  RETURN EXISTS (SELECT 1 FROM public.profiles p WHERE p.role = 'admin');",
        'END;',
        '$$ LANGUAGE plpgsql;',
      ].join('\n');

      expect(legacyRoleReferences(sql)).toHaveLength(1);
    });

    it('catches an unqualified write to the column', () => {
      expect(
        legacyRoleReferences('INSERT INTO public.profiles (id, email, role) VALUES (1, 2, 3);')
      ).toHaveLength(1);
    });

    it('exempts the DDL that retires the column, so #193/#194 need no allowlist entry', () => {
      expect(
        legacyRoleReferences('ALTER TABLE public.profiles RENAME COLUMN role TO role__removed;')
      ).toEqual([]);
      expect(legacyRoleReferences('ALTER TABLE public.profiles DROP COLUMN role;')).toEqual([]);
      expect(legacyRoleReferences("COMMENT ON COLUMN public.profiles.role IS 'DEPRECATED';")).toEqual(
        []
      );
    });
  });
});
