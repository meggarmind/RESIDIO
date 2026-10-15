#!/usr/bin/env node
/**
 * Regenerates src/types/database.generated.ts from the CLOUD Supabase project (#219).
 *
 * Never uses --local (CORE.md section 5). Output is captured in memory and only written over
 * the generated file when the CLI exits 0 and the text looks like a generated types file, so a
 * failed run cannot truncate the existing file.
 *
 * Requires SUPABASE_ACCESS_TOKEN. SUPABASE_PROJECT_REF selects the project
 * (default: Residio_Stage). Residio_Prod is miyeswqbwarvipdzwqnz.
 *
 * Usage: npm run db:types
 */

import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outFile = path.join(repoRoot, 'src', 'types', 'database.generated.ts');

export const DEFAULT_PROJECT_REF = 'kzugmyjjqttardhfejzc';

export function buildGenArgs(env = process.env) {
  if (!env.SUPABASE_ACCESS_TOKEN) {
    throw new Error(
      'SUPABASE_ACCESS_TOKEN is not set. Export a Supabase access token to generate types from the cloud project.',
    );
  }
  const ref = env.SUPABASE_PROJECT_REF || DEFAULT_PROJECT_REF;
  return ['supabase', 'gen', 'types', 'typescript', '--project-id', ref, '--schema', 'public'];
}

export function validateGeneratedTypes(text) {
  if (typeof text !== 'string' || text.trim() === '') return false;
  return text.includes('export type Database');
}

function main() {
  let args;
  try {
    args = buildGenArgs(process.env);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  const res = spawnSync('npx', args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.status !== 0 || !validateGeneratedTypes(res.stdout)) {
    console.error(res.stderr || 'Type generation failed.');
    console.error(`Generated output rejected; ${path.relative(repoRoot, outFile)} left untouched.`);
    process.exit(1);
  }
  writeFileSync(outFile, res.stdout);
  console.log(`Wrote ${path.relative(repoRoot, outFile)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
