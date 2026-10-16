#!/usr/bin/env node
/**
 * Diffs a fresh capture of live `pg_policies` against the committed baseline (#228).
 *
 * A policy that is edited, dropped or added outside a reviewed migration shows up
 * here. It does NOT run in CI (CI has no database credentials): capture by hand or
 * through an agent with the Supabase MCP, then:
 *
 *   npm run rbac:policies:diff -- capture.txt [baseline.json]
 *
 * Exit 0 = identical, 1 = diverged, 2 = usage or parse error.
 */

import { readFileSync } from 'node:fs';
import { comparePolicies, parseCapture, PolicyParseError } from './lib/policy-definitions.mjs';

const DEFAULT_BASELINE = 'docs/validation/policy-definitions.baseline.json';

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));

if (isMain) {
  const [capturePath, baselinePath = DEFAULT_BASELINE] = process.argv.slice(2).filter((a) => !a.startsWith('--'));

  if (!capturePath) {
    console.error('usage: npm run rbac:policies:diff -- <capture.txt|capture.json> [baseline.json]');
    process.exit(2);
  }

  let baseline;
  let fresh;
  try {
    baseline = parseCapture(readFileSync(baselinePath, 'utf8'));
    fresh = parseCapture(readFileSync(capturePath, 'utf8'));
  } catch (e) {
    if (e instanceof PolicyParseError || e.code === 'ENOENT') {
      console.error(`error: ${e.message}`);
      process.exit(2);
    }
    throw e;
  }

  const { added, removed, changed, diverged } = comparePolicies(baseline, fresh);

  console.log(`baseline ${baselinePath} (${baseline.length} policies)`);
  console.log(`fresh    ${capturePath} (${fresh.length} policies)\n`);

  const byTable = new Map();
  const bucket = (t) => {
    if (!byTable.has(t)) byTable.set(t, []);
    return byTable.get(t);
  };
  for (const p of added) bucket(p.tablename).push(`  + ADDED    ${p.policyname} (${p.cmd}, ${p.permissive}, ${p.roles})`);
  for (const p of removed) bucket(p.tablename).push(`  - REMOVED  ${p.policyname} (${p.cmd}, ${p.permissive}, ${p.roles})`);
  for (const c of changed) {
    const detail = c.fields.map((f) => `${f.field}: ${f.from} -> ${f.to}`).join('; ');
    bucket(c.tablename).push(`  ~ CHANGED  ${c.policyname}  ${detail}`);
  }

  for (const table of [...byTable.keys()].sort()) {
    console.log(table);
    for (const line of byTable.get(table)) console.log(line);
  }

  if (!diverged) {
    console.log('No divergence. Live policies match the baseline.');
  } else {
    console.log(`\n${added.length} added, ${removed.length} removed, ${changed.length} changed.`);
  }
  process.exit(diverged ? 1 : 0);
}
