#!/usr/bin/env node
/**
 * Fails loudly for npm scripts that drive a LOCAL Supabase stack (#219).
 *
 * Supabase is cloud-only (CORE.md section 5). The script names are kept so muscle memory hits
 * an explanation rather than silently working or silently vanishing.
 *
 * Usage: node scripts/cloud-only-guard.mjs <script-name>
 */

import { pathToFileURL } from 'node:url';

export function guardMessage(name) {
  return [
    `"${name ?? 'this script'}" is disabled: Supabase is cloud-only (CORE.md section 5).`,
    'Never run the local Supabase CLI stack. Run queries and DDL through the Supabase MCP tools.',
    'Migrations are applied through the MCP tools after the PR merges (CORE.md section 11).',
    'To regenerate types from the cloud project, use: npm run db:types',
  ].join('\n');
}

function main() {
  console.error(guardMessage(process.argv[2]));
  process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
