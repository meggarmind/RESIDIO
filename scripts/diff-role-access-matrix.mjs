#!/usr/bin/env node
/**
 * Diffs a fresh role-access matrix against the committed baseline.
 *
 * This is how the ~130 policy rewrites in #186, #187 and #190 are proven not to
 * have changed who can read what. Any cell that moves is either intended or a
 * bug, and the diff forces someone to say which — it exits non-zero on a
 * narrowing so that "nothing looked wrong" is not an available answer.
 *
 *   npm run rbac:matrix:diff -- fresh.json
 *   npm run rbac:matrix:diff -- fresh.json --expect vice_chairman:search_logs=allow
 *
 * `--expect role:table=verdict` records a cell that is *meant* to move in this
 * slice. Expected moves are reported separately and do not fail the run; an
 * expectation that does not match what happened does.
 *
 * The narrowing to watch for is bucket collapse. `get_my_role()` maps
 * vice_chairman onto chairman and financial_officer onto financial_secretary, so
 * a rewrite that renames literals instead of expanding buckets silently revokes
 * a whole role across dozens of tables and leaves well-formed policies behind.
 * That shows up here as a wall of allow -> deny on one role and nowhere else.
 */

import { readFileSync } from 'node:fs';

/** Ordered from most to least access. A move down this list is a narrowing. */
const RANK = {
  allow: 3,
  'row-dependent': 2,
  deny: 1,
  'no-policy': 1,
  'no-grant': 0,
};

export function diffMatrices(baseline, fresh, expectations = new Map()) {
  const changes = [];
  const structural = [];

  const baseRoles = new Set(baseline.roles);
  const freshRoles = new Set(fresh.roles);

  for (const role of baseline.roles) {
    if (!freshRoles.has(role)) structural.push(`role missing from the fresh capture: ${role}`);
  }
  for (const role of fresh.roles) {
    if (!baseRoles.has(role)) structural.push(`role not in the baseline: ${role}`);
  }

  for (const role of baseline.roles) {
    if (!freshRoles.has(role)) continue;

    const before = baseline.verdicts[role];
    const after = fresh.verdicts[role];

    for (const table of Object.keys(before)) {
      if (!(table in after)) {
        structural.push(`${role}: ${table} missing from the fresh capture`);
        continue;
      }
      if (before[table] === after[table]) continue;

      const key = `${role}:${table}`;
      changes.push({
        role,
        table,
        from: before[table],
        to: after[table],
        narrowing: RANK[after[table]] < RANK[before[table]],
        expected: expectations.get(key) === after[table],
      });
      expectations.delete(key);
    }

    for (const table of Object.keys(after)) {
      if (!(table in before)) structural.push(`${role}: ${table} is new — add it to the baseline`);
    }
  }

  const unmet = [...expectations.entries()].map(([key, verdict]) => `${key}=${verdict}`);

  return { changes, structural, unmet };
}

function parseExpectations(args) {
  const map = new Map();
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== '--expect') continue;
    const spec = args[++i];
    const match = /^([a-z_]+):([a-z0-9_]+)=([a-z-]+)$/.exec(spec ?? '');
    if (!match) throw new Error(`bad --expect "${spec}"; want role:table=verdict`);
    map.set(`${match[1]}:${match[2]}`, match[3]);
  }
  return map;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));

if (isMain) {
  const args = process.argv.slice(2);
  const files = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--expect');

  const [freshPath, baselinePath = 'docs/validation/role-access-matrix.baseline.json'] = files;

  if (!freshPath) {
    console.error('usage: npm run rbac:matrix:diff -- <fresh.json> [baseline.json] [--expect role:table=verdict]');
    process.exit(2);
  }

  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  const fresh = JSON.parse(readFileSync(freshPath, 'utf8'));

  const { changes, structural, unmet } = diffMatrices(
    baseline,
    fresh,
    parseExpectations(args)
  );

  console.log(`baseline ${baselinePath} (captured ${baseline.capturedAt})`);
  console.log(`fresh    ${freshPath} (captured ${fresh.capturedAt})\n`);

  for (const problem of structural) console.log(`  STRUCTURE  ${problem}`);

  const unexpectedNarrowing = changes.filter((c) => c.narrowing && !c.expected);
  const widening = changes.filter((c) => !c.narrowing && !c.expected);
  const expected = changes.filter((c) => c.expected);

  const show = (label, list) => {
    if (list.length === 0) return;
    console.log(`\n${label} (${list.length})`);
    for (const c of list) console.log(`  ${c.role.padEnd(18)} ${c.table.padEnd(34)} ${c.from} -> ${c.to}`);
  };

  show('NARROWED — access lost', unexpectedNarrowing);
  show('WIDENED — access gained', widening);
  show('expected, as declared', expected);

  for (const spec of unmet) console.log(`\n  UNMET EXPECTATION  ${spec} — the cell did not move`);

  if (changes.length === 0 && structural.length === 0 && unmet.length === 0) {
    console.log('No cell moved. Access is unchanged.');
  }

  const failed =
    structural.length > 0 || unexpectedNarrowing.length > 0 || unmet.length > 0;

  if (widening.length > 0 && !failed) {
    console.log('\nAccess widened but nothing narrowed. Confirm each line is intended.');
  }

  process.exit(failed ? 1 : 0);
}
