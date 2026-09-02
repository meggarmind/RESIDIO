import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { PERMISSIONS } from '@/lib/auth/action-roles';
import { PERMISSION_CATEGORY_LABELS } from '@/config/permission-categories';

/**
 * Static contract between the TypeScript permission catalog and the SQL that
 * seeds it.
 *
 * The two drifted badly before this existed: twelve `PERMISSIONS` constants had
 * no `app_permissions` row at all, and because `authorizePermission()` is pure
 * set-membership with no super-admin bypass, every check against them failed for
 * every user — silently killing the impersonation module, the two-factor admin
 * screens and the late-fee-waiver workflow. Three seeded categories were also
 * missing from the picker's hardcoded list, so their permissions could not be
 * granted to a new role.
 *
 * Reads the migrations off disk like `database-hardening.test.ts` does; no
 * database connection.
 */

const migrationsDir = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));

const migrationSql = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(path.join(migrationsDir, f), 'utf8'))
  .join('\n');

/**
 * Permission names seeded anywhere in the migration history, mapped to their
 * category.
 *
 * Scoped to `INSERT INTO app_permissions … VALUES` blocks — matching bare
 * 4-tuples across the whole migration history picks up seed rows for every
 * other table too. Grants (`assign_permissions_to_role`, `INSERT INTO
 * role_permissions`) only reference names that must already exist, so they are
 * not a source of truth here.
 */
const APP_PERMISSIONS_INSERT =
  /INSERT\s+INTO\s+(?:public\.)?app_permissions\s*\(([^)]*)\)\s*VALUES([\s\S]*?)(?:ON\s+CONFLICT|;)/gi;

/**
 * One `(...)` row. Fields are read positionally against the insert's column
 * list, because the seeds are not uniform: some are
 * `(name, display_name, description, category, is_active)` and others omit the
 * description. `(?:[^']|'')*` keeps a doubled quote inside a description from
 * ending the literal.
 */
const VALUE_ROW = /\(((?:'(?:[^']|'')*'|[^)'])*)\)/g;
const FIELD = /'((?:[^']|'')*)'|([^,\s][^,]*)/g;

function splitRow(row: string): string[] {
  return [...row.matchAll(FIELD)].map(([, quoted, bare]) =>
    quoted !== undefined ? quoted.replace(/''/g, "'") : bare.trim()
  );
}

const seeded = new Map<string, string>();
for (const [, columnList, valuesBlock] of migrationSql.matchAll(APP_PERMISSIONS_INSERT)) {
  const columns = columnList.split(',').map((c) => c.trim().toLowerCase());
  const nameAt = columns.indexOf('name');
  const categoryAt = columns.indexOf('category');
  if (nameAt === -1 || categoryAt === -1) continue;

  for (const [, row] of valuesBlock.matchAll(VALUE_ROW)) {
    const fields = splitRow(row);
    const name = fields[nameAt];
    const category = fields[categoryAt];
    if (name && category) seeded.set(name, category);
  }
}

/** Enum values the migrations add to `permission_category`, plus the ten created with the type. */
const declaredCategories = new Set<string>([
  'residents',
  'houses',
  'payments',
  'billing',
  'security',
  'reports',
  'settings',
  'imports',
  'approvals',
  'system',
]);
for (const [, value] of migrationSql.matchAll(
  /ALTER TYPE\s+(?:public\.)?permission_category\s+ADD VALUE(?:\s+IF NOT EXISTS)?\s+'([a-z_]+)'/gi
)) {
  declaredCategories.add(value);
}

describe('permission catalog contract', () => {
  it('seeds every permission the application checks against', () => {
    const missing = Object.values(PERMISSIONS)
      .filter((name) => !seeded.has(name))
      .sort();

    // A constant with no row can never be granted, so authorizePermission()
    // denies it for everyone — including super_admin, which has no bypass.
    expect(missing).toEqual([]);
  });

  it('only seeds permissions into declared permission_category values', () => {
    const undeclared = [...new Set(seeded.values())]
      .filter((category) => !declaredCategories.has(category))
      .sort();

    expect(undeclared).toEqual([]);
  });

  it('gives every seeded category a display label', () => {
    const unlabelled = [...new Set(seeded.values())]
      .filter((category) => !(category in PERMISSION_CATEGORY_LABELS))
      .sort();

    // Without a label the category still renders (the picker title-cases a
    // fallback), but an unlabelled category means a module shipped without
    // anyone naming it for admins.
    expect(unlabelled).toEqual([]);
  });

  it('labels only categories that exist', () => {
    const orphaned = Object.keys(PERMISSION_CATEGORY_LABELS)
      .filter((category) => !declaredCategories.has(category))
      .sort();

    expect(orphaned).toEqual([]);
  });
});
