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
  'select version from supabase_migrations.schema_migrations order by version';

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
 * Pure comparison: local (Map<version, filename[]>) vs. applied (version[] from the
 * database). No I/O — this is what the unit tests exercise directly.
 *
 * Returns both directions of drift, plus any version with more than one file on disk.
 */
export function compareMigrations(localByVersion, appliedVersions) {
  const localVersions = new Set(localByVersion.keys());
  const appliedSet = new Set(appliedVersions);

  const appliedNotOnDisk = [...appliedSet].filter((v) => !localVersions.has(v)).sort();
  const fileNotApplied = [...localVersions].filter((v) => !appliedSet.has(v)).sort();
  const duplicateVersions = [...localByVersion.entries()]
    .filter(([, files]) => files.length > 1)
    .sort(([a], [b]) => a.localeCompare(b));

  return { appliedNotOnDisk, fileNotApplied, duplicateVersions };
}

/** True when nothing diverges (duplicates are a warning, not drift on their own). */
export function isClean(result) {
  return result.appliedNotOnDisk.length === 0 && result.fileNotApplied.length === 0;
}

async function fetchAppliedVersions({ accessToken, projectRef }) {
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

  return rows.map((row) => String(row.version));
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

  let appliedVersions;
  try {
    appliedVersions = await fetchAppliedVersions({ accessToken, projectRef });
  } catch (error) {
    console.error(`\nmigration-drift: failed to fetch applied migrations.\n${error.message}\n`);
    process.exitCode = 1;
    return;
  }

  const result = compareMigrations(localByVersion, appliedVersions);
  const clean = isClean(result);

  console.log(
    `\nMigration drift — ${localByVersion.size} versions on disk, ${appliedVersions.length} applied in the database\n`,
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
        `All ${localByVersion.size} migration files on disk match the ${appliedVersions.length} applied in the database.`,
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
