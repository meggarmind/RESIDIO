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

// Exported so a test can assert this still selects `name`, not just `version` — a
// revert to version-only selection here silently resurrects the pre-#374 double-
// counting bug with a query the comparison logic would happily accept (#374 M1).
export const MANAGEMENT_API_QUERY =
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
 * Matching is a ONE-TO-ONE PAIRING, not set membership (#374 follow-up, "D1"). An
 * earlier version of this function matched by "does this version exist anywhere in
 * the applied set OR does this name exist anywhere in the disk set" — set
 * membership lets a single applied row satisfy arbitrarily many disk files (or
 * vice versa) just because they share a normalized name. Verified live against the
 * database: two unrelated pairs of disk files normalize to the same name apiece
 * (`revoke_anon_invoice_generation_rpc`, `harden_invoice_generation_rpc_authorization`),
 * each pair backed by only ONE applied row. Set-membership matching let that one
 * applied row "cover" both files, silently hiding a genuinely unapplied migration
 * in each pair — a false negative in a BLOCKING guard, worse than the
 * over-reporting #283 built this script to fix.
 *
 * The pairing runs in two passes, each consuming what it matches so nothing is
 * used twice:
 *   1. VERSION pass (the stronger signal) — pair a disk version with an applied
 *      row recording that exact version, if one is not already spoken for.
 *   2. NAME pass, over whatever remains unconsumed on both sides — pair a
 *      still-unmatched disk version with a still-unconsumed applied row sharing a
 *      normalized name (the rewritten-version case; see `normalizeMigrationName`).
 * Only a disk version left unmatched after both passes is real "file, not
 * applied" drift; only an applied row left unconsumed after both passes is real
 * "applied, no file" drift.
 *
 * Returns both directions of drift, plus any version with more than one file on disk.
 */
export function compareMigrations(localByVersion, appliedEntries) {
  const localVersions = [...localByVersion.keys()];

  // Wrap each applied row with a `consumed` flag so a pass can claim it and take
  // it out of consideration for every subsequent lookup — the mechanism that
  // makes the pairing one-to-one instead of set membership.
  const applied = appliedEntries.map((entry) => ({ ...entry, consumed: false }));

  // Disk filenames' normalized names, grouped by version, for the name pass.
  const normalizedNamesByVersion = new Map();
  for (const [version, files] of localByVersion) {
    normalizedNamesByVersion.set(version, files.map(normalizeMigrationName));
  }

  // Index of still-available applied rows by normalized name. Entries are
  // removed from consideration via their own `consumed` flag, not by mutating
  // this index, so a row consumed in the version pass is correctly invisible
  // here even though it was indexed before that pass ran.
  const appliedByName = new Map();
  for (const entry of applied) {
    if (!entry.name) continue;
    const name = normalizeMigrationName(entry.name);
    if (!appliedByName.has(name)) appliedByName.set(name, []);
    appliedByName.get(name).push(entry);
  }

  const matchedVersions = new Set();

  // Pass 1 — version match. One applied row per disk version; first unconsumed
  // row with that exact version wins (ties are not expected in practice).
  for (const version of localVersions) {
    const entry = applied.find((e) => !e.consumed && e.version === version);
    if (entry) {
      entry.consumed = true;
      matchedVersions.add(version);
    }
  }

  // Pass 2 — name match, over what pass 1 left unconsumed. One file's name
  // matching is enough to clear the whole version (a duplicate-version group
  // needs only one of its files accounted for), so stop at the first hit.
  for (const version of localVersions) {
    if (matchedVersions.has(version)) continue;
    for (const name of normalizedNamesByVersion.get(version)) {
      const candidates = appliedByName.get(name);
      const entry = candidates && candidates.find((e) => !e.consumed);
      if (entry) {
        entry.consumed = true;
        matchedVersions.add(version);
        break;
      }
    }
  }

  const fileNotApplied = localVersions.filter((v) => !matchedVersions.has(v)).sort();

  // Dedupe by version: two applied rows could theoretically share one (unexpected,
  // but harmless to collapse rather than double-report).
  const appliedNotOnDisk = [
    ...new Set(applied.filter((e) => !e.consumed).map((e) => e.version)),
  ].sort();

  const duplicateVersions = [...localByVersion.entries()]
    .filter(([, files]) => files.length > 1)
    .sort(([a], [b]) => a.localeCompare(b));

  return { appliedNotOnDisk, fileNotApplied, duplicateVersions };
}

/** True when nothing diverges (duplicates are a warning, not drift on their own). */
export function isClean(result) {
  return result.appliedNotOnDisk.length === 0 && result.fileNotApplied.length === 0;
}

/**
 * Shapes one raw Management API row into `{ version, name }`. Pulled out as its
 * own export so a test can assert `name` survives the trip — inlined in the
 * fetch function, a mutation hardcoding `name: null` here would pass every
 * existing test silently (#374 M14), since none of them exercised the mapping
 * itself with a real name present.
 */
export function mapAppliedRow(row) {
  return {
    version: String(row.version),
    name: row.name != null ? String(row.name) : null,
  };
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

  return rows.map(mapAppliedRow);
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
