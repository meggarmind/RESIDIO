#!/usr/bin/env node
/**
 * Prints the SQL that restores a migration's authored version in the ledger (#305).
 *
 * The Supabase MCP `apply_migration` tool takes only a name and a query, and stamps
 * `supabase_migrations.schema_migrations.version` with its own execution timestamp.
 * `scripts/migration-drift.mjs` pairs disk and ledger strictly by version, so every
 * MCP apply otherwise yields two drift entries. Run this after every apply, then
 * execute the printed SQL on the SAME database via `mcp__supabase__execute_sql`.
 *
 * Usage:
 *   npm run db:reconcile-version -- <authored-version> <name>
 *   npm run db:reconcile-version -- 20260907010000 seed_billing_manage_profile_versions_permission
 *
 * It only prints. CORE.md §5 forbids the local CLI, and an agent holds the MCP, not a
 * connection string. It refuses when no matching file exists on disk, so a typo cannot
 * mint a ledger row that has no file.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function buildReconcileSql(version, name) {
  if (!/^\d{14}$/.test(version ?? '')) throw new Error(`version must be 14 digits, got "${version}"`);
  if (!/^[a-z0-9_]+$/.test(name ?? '')) throw new Error(`name must be snake_case, got "${name}"`);
  return [
    `-- 1. Confirm exactly one stamped row carries this name and the authored version is free.`,
    `SELECT version, name FROM supabase_migrations.schema_migrations`,
    `WHERE name = '${name}' OR version = '${version}';`,
    ``,
    `-- 2. Only if step 1 shows one row with a different version and none at ${version}:`,
    `UPDATE supabase_migrations.schema_migrations`,
    `SET version = '${version}'`,
    `WHERE name = '${name}' AND version <> '${version}'`,
    `  AND NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '${version}')`,
    `RETURNING version, name;`,
  ].join('\n');
}

function main() {
  const [version, name] = process.argv.slice(2);
  const file = path.join(repoRoot, 'supabase', 'migrations', `${version}_${name}.sql`);
  if (!existsSync(file)) {
    console.error(`No file supabase/migrations/${version}_${name}.sql — refusing.`);
    process.exit(1);
  }
  try {
    console.log(buildReconcileSql(version, name));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
