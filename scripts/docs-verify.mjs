#!/usr/bin/env node
/**
 * Re-stamp an admin-guide page as verified against the current commit.
 *
 * Run this after reviewing a page the drift checker flagged — whether you
 * edited it or concluded the change was not user-visible. Both outcomes end
 * the same way: the page is now known-good at this commit.
 *
 * Usage:
 *   node scripts/docs-verify.mjs website/docs/integrations/whatsapp-operations.md [more...]
 *   node scripts/docs-verify.mjs --all
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsRoot = path.join(repoRoot, 'website', 'docs');

const args = process.argv.slice(2).filter((a) => a !== '--');
const all = args.includes('--all');
const targets = args.filter((a) => !a.startsWith('--'));

if (!all && !targets.length) {
  console.error('Usage: node scripts/docs-verify.mjs <doc.md> [...] | --all');
  process.exit(1);
}

const headSha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
  cwd: repoRoot,
  encoding: 'utf8',
}).trim();

const appVersion = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version;
const today = new Date().toISOString().slice(0, 10);

function walk(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...walk(full));
    else if (entry.endsWith('.md') || entry.endsWith('.mdx')) found.push(full);
  }
  return found;
}

/**
 * Rewrites the three stamp keys in place, adding them before the closing `---`
 * when absent. Line endings are preserved per file — the wiki holds a mix of
 * CRLF and LF, and normalising here would bury the stamp in a whole-file diff.
 */
function restamp(file) {
  const raw = readFileSync(file, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const match = /^(---\r?\n)([\s\S]*?)(\r?\n---)/.exec(raw);

  if (!match) {
    console.log(`  skipped ${path.relative(repoRoot, file)} — no front matter`);
    return false;
  }

  // Quoted on purpose. YAML coerces a bare 2026-08-29 into a Date, which
  // reaches the theme as a Date object and renders in the viewer's timezone —
  // shifting the displayed day. Quoting keeps it an inert string throughout.
  const stamps = {
    residio_verified_commit: headSha,
    residio_verified_at: `'${today}'`,
    residio_app_version: `'${appVersion}'`,
  };

  let body = match[2];
  const added = [];

  for (const [key, value] of Object.entries(stamps)) {
    const line = new RegExp(`^${key}:.*$`, 'm');
    if (line.test(body)) body = body.replace(line, `${key}: ${value}`);
    else added.push(`${key}: ${value}`);
  }

  if (added.length) body = `${body}${eol}${added.join(eol)}`;

  const updated = raw.replace(match[0], `${match[1]}${body}${match[3]}`);
  if (updated === raw) {
    console.log(`  unchanged ${path.relative(repoRoot, file)}`);
    return false;
  }

  writeFileSync(file, updated);
  console.log(`  stamped ${path.relative(repoRoot, file)}`);
  return true;
}

const files = all
  ? walk(docsRoot)
  : targets.map((t) => {
      const resolved = path.resolve(repoRoot, t);
      if (!existsSync(resolved)) {
        console.error(`Not found: ${t}`);
        process.exit(1);
      }
      return resolved;
    });

console.log(`\nVerifying against ${headSha} (Residio v${appVersion}, ${today})\n`);
const changed = files.filter(restamp).length;
console.log(`\n${changed} page(s) stamped.\n`);
