#!/usr/bin/env node
/**
 * Normalises raw role-access-matrix captures into the comparable matrix shape.
 *
 * Part of #185 (epic #182). The pipeline:
 *
 *   1. Run `supabase/probes/role-access-matrix.sql` once per role through the
 *      Supabase MCP, changing the two `-- PARAMETER` lines each time.
 *   2. Collect the seven result rows into a JSON array file, verbatim:
 *        [ { "role_name": "...", "by_verdict": {...}, "read_nonempty": [...] }, ... ]
 *   3. node scripts/build-role-access-matrix.mjs captures.json fresh.json
 *   4. npm run rbac:matrix:diff -- fresh.json
 *
 * The checks here are the reason this is a script rather than a copy-paste: a
 * capture that silently lost a table, or that claims a role was denied a table it
 * demonstrably read rows from, would otherwise become a baseline and make every
 * later diff meaningless.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const VERDICTS = ['allow', 'deny', 'row-dependent', 'no-grant', 'no-policy'];

/** @param {Array<{role_name: string, by_verdict: Record<string, string[]>, read_nonempty: string[] | null}>} captures */
export function buildMatrix(captures, capturedAt) {
  if (!Array.isArray(captures) || captures.length === 0) {
    throw new Error('expected a non-empty array of probe result rows');
  }

  const verdicts = {};
  const readNonEmpty = {};
  const roles = [];
  let expectedTables = null;

  for (const capture of captures) {
    const role = capture.role_name;
    if (!role) throw new Error('a capture has no role_name');
    if (roles.includes(role)) throw new Error(`${role}: captured twice`);
    roles.push(role);

    const flat = {};
    for (const [verdict, tables] of Object.entries(capture.by_verdict ?? {})) {
      if (!VERDICTS.includes(verdict)) {
        throw new Error(`${role}: unknown verdict "${verdict}"`);
      }
      for (const table of tables) {
        if (flat[table]) throw new Error(`${role}: ${table} appears under two verdicts`);
        flat[table] = verdict;
      }
    }

    const tables = Object.keys(flat).sort();
    if (tables.length === 0) throw new Error(`${role}: no tables captured`);

    if (expectedTables === null) {
      expectedTables = tables;
    } else if (JSON.stringify(tables) !== JSON.stringify(expectedTables)) {
      const missing = expectedTables.filter((t) => !tables.includes(t));
      const extra = tables.filter((t) => !expectedTables.includes(t));
      throw new Error(
        `${role}: table set differs from the other roles. missing=[${missing}] extra=[${extra}]`
      );
    }

    // The independent cross-check. `allow`/`row-dependent` come from evaluating
    // policy expressions; `read_nonempty` comes from actually reading rows. A
    // table in the second but denied by the first means the evaluation is wrong.
    const read = capture.read_nonempty ?? [];
    for (const table of read) {
      if (flat[table] === 'deny' || flat[table] === 'no-grant') {
        throw new Error(
          `${role}: read rows from ${table}, but the policy verdict is "${flat[table]}" — the capture contradicts itself`
        );
      }
    }

    verdicts[role] = Object.fromEntries(tables.map((t) => [t, flat[t]]));
    readNonEmpty[role] = [...read].sort();
  }

  return {
    $schema: 'role-access-matrix/v1',
    capturedAt,
    capturedBy: 'supabase/probes/role-access-matrix.sql, run once per role via the Supabase MCP',
    issue: 185,
    epic: 182,
    tableCount: expectedTables.length,
    roles,
    verdicts,
    readNonEmpty,
  };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));

if (isMain) {
  const [input, output, capturedAt] = process.argv.slice(2);

  if (!input || !output) {
    console.error(
      'usage: node scripts/build-role-access-matrix.mjs <captures.json> <out.json> [capturedAt]'
    );
    process.exit(2);
  }

  const matrix = buildMatrix(
    JSON.parse(readFileSync(input, 'utf8')),
    capturedAt ?? new Date().toISOString().slice(0, 10)
  );

  writeFileSync(output, JSON.stringify(matrix, null, 2) + '\n');

  console.log(`${output}: ${matrix.roles.length} roles x ${matrix.tableCount} tables`);
  for (const role of matrix.roles) {
    const counts = {};
    for (const v of Object.values(matrix.verdicts[role])) counts[v] = (counts[v] ?? 0) + 1;
    console.log(`  ${role.padEnd(18)} ${JSON.stringify(counts)}`);
  }
}
