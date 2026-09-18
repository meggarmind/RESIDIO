#!/usr/bin/env node
/**
 * Migration drift checker.
 *
 * CORE.md §5 requires applying migrations through the Supabase MCP tools (cloud-only,
 * never the local CLI). Applying a migration and committing its file are two separate
 * acts, and only the first was ever enforced — as of 2026-09-07 the database has 206
 * applied migrations against 145 distinct versions on disk, a gap of 61 applied-but-
 * uncommitted migrations. This script closes that gap by comparing the database's
 * applied migration list against `supabase/migrations/` directly, so drift is caught
 * automatically instead of by hand-auditing the database.
 *
 * Unlike `docs-drift.mjs`, this check is BLOCKING (see the workflow file for why).
 *
 * Reached via the Supabase Management API (`POST /v1/projects/{ref}/database/query`),
 * not the Supabase CLI — CORE.md §5 forbids the local CLI in this repo, in CI included.
 *
 * Usage:
 *   node scripts/migration-drift.mjs [--ci]
 *
 * Requires SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF in the environment. Fails
 * loudly (non-zero exit, clear message) rather than silently passing when either is
 * missing — a fork PR without secrets must NOT read as "no drift".
 */

import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(repoRoot, 'supabase', 'migrations');

const ci = process.argv.includes('--ci');

const MANAGEMENT_API_QUERY =
  'select version, name from supabase_migrations.schema_migrations order by version';

/**
 * The version is the leading timestamp of a migration filename — the same value
 * stored in `supabase_migrations.schema_migrations.version`. Filenames after the
 * timestamp are not part of identity: several applied entries carry a *second*,
 * different timestamp embedded further into the recorded name (e.g. an applied
 * entry named `20260813160000_add_invoice_generation_run_claims` was actually
 * applied under version `20260815055719`). Comparing by filename would silently
 * match the wrong pair or miss real drift; comparing by this prefix is exact.
 */
export function versionOf(filename) {
  const match = /^(\d{8,})_/.exec(filename);
  return match ? match[1] : null;
}

/**
 * Identity for matching a disk file to an applied row, once the leading timestamp
 * is no longer trustworthy as a shared key (#374). Some migrations were applied
 * under a REWRITTEN version — the database's `version` no longer equals the
 * timestamp in the filename — while the recorded `name` still carries the
 * original filename verbatim. Stripping the leading timestamp from both sides
 * (and the disk-only `.sql` extension) collapses that pair to the same string
 * even though their versions disagree. Comparing raw filenames without this
 * strip would never match at all; comparing only by version (the old behaviour)
 * double-counted every rewritten pair as drift in BOTH directions.
 */
export function normalizeMigrationName(identifier) {
  return identifier.replace(/\.sql$/, '').replace(/^[0-9]{8,}_/, '');
}

/**
 * Reads `supabase/migrations/` and groups filenames by version. Two files can
 * legitimately share a version prefix (a duplicate-timestamp typo, or two migrations
 * authored in the same second) — the repo has 147 files across 145 distinct versions
 * today. Callers must not crash on that; it is surfaced as its own warning instead.
 */
export function readLocalMigrations(dir) {
  const byVersion = new Map();

  for (const name of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const version = versionOf(name);
    if (!version) continue; // not a versioned migration filename; not this check's concern
    if (!byVersion.has(version)) byVersion.set(version, []);
    byVersion.get(version).push(name);
  }

  return byVersion;
}

/**
 * Pure comparison: local (Map<version, filename[]>) vs. applied
 * (`{ version, name }[]` from the database). No I/O — this is what the unit tests
 * exercise directly.
 *
 * A disk file and an applied row are the SAME migration when either their versions
 * match (the common case) OR their normalized names match (the rewritten-version
 * case — see `normalizeMigrationName`). Only when NEITHER matches is it real drift.
 * Matching on version alone — the pre-#374 behaviour — counted every
 * rewritten-version pair twice: once as "applied, no file" (its new version isn't
 * on disk) and once as "file, not applied" (its on-disk version isn't the one
 * recorded). Name-matching collapses that pair back into one non-drift entry.
 *
 * Returns both directions of drift, plus any version with more than one file on disk.
 */
export function compareMigrations(localByVersion, appliedEntries) {
  const localVersions = new Set(localByVersion.keys());

  // Every disk filename's normalized name, both flattened (for "does this name
  // exist anywhere on disk" lookups) and grouped by version (for "does this
  // disk version's name match some applied row" lookups).
  const normalizedNamesByVersion = new Map();
  const allDiskNormalizedNames = new Set();
  for (const [version, files] of localByVersion) {
    const names = files.map(normalizeMigrationName);
    normalizedNamesByVersion.set(version, names);
    for (const name of names) allDiskNormalizedNames.add(name);
  }

  const appliedVersions = new Set(appliedEntries.map((e) => e.version));
  const appliedNormalizedNames = new Set(
    appliedEntries.filter((e) => e.name).map((e) => normalizeMigrationName(e.name)),
  );

  // Applied-without-file: unmatched by version AND unmatched by name. Dedupe by
  // version since two applied rows could theoretically share one (unexpected,
  // but harmless to collapse rather than double-report).
  const appliedNotOnDisk = [
    ...new Set(
      appliedEntries
        .filter((e) => {
          const matchesVersion = localVersions.has(e.version);
          const matchesName = Boolean(e.name) && allDiskNormalizedNames.has(normalizeMigrationName(e.name));
          return !matchesVersion && !matchesName;
        })
        .map((e) => e.version),
    ),
  ].sort();

  // File-without-applied: mirror image, keyed by disk version. A version with
  // multiple files (a duplicate) counts as applied if ANY of its files' names
  // matches an applied row.
  const fileNotApplied = [...localVersions]
    .filter((version) => {
      const matchesVersion = appliedVersions.has(version);
      const matchesName = normalizedNamesByVersion
        .get(version)
        .some((name) => appliedNormalizedNames.has(name));
      return !matchesVersion && !matchesName;
    })
    .sort();

  const duplicateVersions = [...localByVersion.entries()]
    .filter(([, files]) => files.length > 1)
    .sort(([a], [b]) => a.localeCompare(b));

  return { appliedNotOnDisk, fileNotApplied, duplicateVersions };
}

/** True when nothing diverges (duplicates are a warning, not drift on their own). */
export function isClean(result) {
  return result.appliedNotOnDisk.length === 0 && result.fileNotApplied.length === 0;
}

/** Fetches applied migrations as `{ version, name }`, never echoing the access token. */
async function fetchAppliedMigrations({ accessToken, projectRef }) {
  const url = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: MANAGEMENT_API_QUERY, read_only: true }),
    });
  } catch (cause) {
    throw new Error(`Could not reach the Supabase Management API: ${cause.message}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    // Never echo the token; the body from this endpoint does not contain it, but
    // truncate defensively in case of a proxy error page.
    throw new Error(
      `Supabase Management API returned ${response.status} ${response.statusText}: ${body.slice(0, 500)}`,
    );
  }

  const payload = await response.json();
  const rows = Array.isArray(payload) ? payload : (payload?.result ?? payload?.rows ?? null);

  if (!Array.isArray(rows)) {
    throw new Error(
      `Unexpected response shape from the Management API run-a-query endpoint: ${JSON.stringify(payload).slice(0, 500)}`,
    );
  }

  return rows.map((row) => ({
    version: String(row.version),
    name: row.name != null ? String(row.name) : null,
  }));
}

async function main() {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  const projectRef = process.env.SUPABASE_PROJECT_REF;

  if (!accessToken || !projectRef) {
    const missing = [
      !accessToken && 'SUPABASE_ACCESS_TOKEN',
      !projectRef && 'SUPABASE_PROJECT_REF',
    ].filter(Boolean);

    // Loud, non-zero failure — never a silent pass. Secrets are unavailable to PRs
    // from forks, so those runs must fail distinguishably from "checked, no drift".
    console.error(
      `\nmigration-drift: missing required environment variable(s): ${missing.join(', ')}.\n` +
        'This check cannot run without them — it is failing loudly rather than passing silently.\n' +
        'If this is a pull request from a fork, secrets are withheld by GitHub; that is expected ' +
        'and this job is expected to fail there rather than report a false "no drift".\n',
    );
    process.exitCode = 1;
    return;
  }

  const localByVersion = readLocalMigrations(migrationsDir);

  let appliedMigrations;
  try {
    appliedMigrations = await fetchAppliedMigrations({ accessToken, projectRef });
  } catch (error) {
    console.error(`\nmigration-drift: failed to fetch applied migrations.\n${error.message}\n`);
    process.exitCode = 1;
    return;
  }

  const result = compareMigrations(localByVersion, appliedMigrations);
  const clean = isClean(result);

  console.log(
    `\nMigration drift — ${localByVersion.size} versions on disk, ${appliedMigrations.length} applied in the database\n`,
  );

  if (result.appliedNotOnDisk.length) {
    console.log(`Applied in the database but no file on disk (${result.appliedNotOnDisk.length}):`);
    for (const v of result.appliedNotOnDisk) console.log(`  ${v}`);
    console.log('');
  }

  if (result.fileNotApplied.length) {
    console.log(`File on disk but not applied in the database (${result.fileNotApplied.length}):`);
    for (const v of result.fileNotApplied) console.log(`  ${v}`);
    console.log('');
  }

  if (result.duplicateVersions.length) {
    console.log(`Warning — duplicate version prefixes on disk (${result.duplicateVersions.length}):`);
    for (const [version, files] of result.duplicateVersions) {
      console.log(`  ${version}: ${files.join(', ')}`);
    }
    console.log('');
  }

  if (clean) {
    console.log('No drift. Every applied migration has a file, and every file is applied.\n');
  } else {
    console.log(
      `DRIFT DETECTED: ${result.appliedNotOnDisk.length} applied-without-file, ` +
        `${result.fileNotApplied.length} file-without-applied.\n`,
    );
  }

  if (ci && process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs');
    const lines = ['## Migration drift', ''];

    if (clean) {
      lines.push(
        `All ${localByVersion.size} migration files on disk match the ${appliedMigrations.length} applied in the database.`,
        '',
      );
    } else {
      if (result.appliedNotOnDisk.length) {
        lines.push('### Applied in the database, no file on disk', '');
        for (const v of result.appliedNotOnDisk) lines.push(`- \`${v}\``);
        lines.push('');
      }
      if (result.fileNotApplied.length) {
        lines.push('### File on disk, not applied in the database', '');
        for (const v of result.fileNotApplied) lines.push(`- \`${v}\``);
        lines.push('');
      }
    }

    if (result.duplicateVersions.length) {
      lines.push('### Duplicate version prefixes on disk', '');
      for (const [version, files] of result.duplicateVersions) {
        lines.push(`- \`${version}\`: ${files.map((f) => `\`${f}\``).join(', ')}`);
      }
      lines.push('');
    }

    appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'));
  }

  // Blocking by design — see the module docstring for why this differs from
  // docs-drift.mjs, which always exits 0.
  process.exitCode = clean ? 0 : 1;
}

// Only run when executed directly, so the comparison functions above stay importable
// (and network-free) for tests.
const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  await main();
}
