#!/usr/bin/env node
/**
 * Admin-guide drift checker.
 *
 * Each wiki page under `website/docs` declares the app surface it documents
 * (`residio_sources`) and the commit it was last verified against
 * (`residio_verified_commit`). Drift is simply: has anything touched those
 * paths since that commit?
 *
 * Git is the version store here on purpose — a content hash tells you only
 * that something changed, whereas `git log` hands the reviewer the commits and
 * diffs that need reading. Nothing has to be bumped by hand, so nothing can be
 * forgotten.
 *
 * Reports only. Always exits 0 — see docs/agents/doc-drift.md.
 *
 * Usage:
 *   node scripts/docs-drift.mjs [--ci] [--verbose]
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, appendFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsRoot = path.join(repoRoot, 'website', 'docs');

const ci = process.argv.includes('--ci');
const verbose = process.argv.includes('--verbose');

const STATUS = {
  FRESH: 'FRESH',
  DRIFT: 'DRIFT',
  RESTAMP: 'NEEDS RESTAMP',
  UNMAPPED: 'UNMAPPED',
};

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', options.quiet ? 'ignore' : 'pipe'],
  }).trim();
}

function tryGit(args) {
  try {
    return git(args, { quiet: true });
  } catch {
    return null;
  }
}

/**
 * Minimal front-matter reader for the subset the wiki uses: `key: value`
 * scalars and `- item` string lists. Deliberately dependency-free — the repo
 * has no YAML parser and this does not warrant adding one.
 */
export function parseFrontMatter(raw) {
  const text = raw.replace(/^﻿/, '');
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) return {};

  const data = {};
  let listKey = null;

  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const listItem = /^\s*-\s+(.*)$/.exec(line);
    if (listItem && listKey) {
      data[listKey].push(unquote(listItem[1]));
      continue;
    }

    const pair = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!pair) continue;

    const [, key, value] = pair;
    if (value.trim() === '') {
      listKey = key;
      data[key] = [];
    } else {
      listKey = null;
      data[key] = unquote(value);
    }
  }

  return data;
}

function unquote(value) {
  const trimmed = value.trim();
  const quoted = /^(['"])([\s\S]*)\1$/.exec(trimmed);
  return quoted ? quoted[2] : trimmed;
}

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
 * `:(glob)` opts into wildmatch, so `**` spans directories the way the globs
 * in front matter read. Without it git treats `**` as a single `*`.
 */
function pathspec(source) {
  return `:(glob)${source}`;
}

function inspect(docPath) {
  const relDoc = path.relative(repoRoot, docPath).split(path.sep).join('/');
  const frontMatter = parseFrontMatter(readFileSync(docPath, 'utf8'));

  const sources = Array.isArray(frontMatter.residio_sources)
    ? frontMatter.residio_sources.filter(Boolean)
    : [];
  const commit = frontMatter.residio_verified_commit;

  if (!sources.length || !commit) {
    return { doc: relDoc, status: STATUS.UNMAPPED, sources, commit: commit ?? null };
  }

  // `cat-file -e` prints nothing and signals via exit code, so compare against
  // null — an empty string here means the commit resolved fine.
  if (tryGit(['cat-file', '-e', `${commit}^{commit}`]) === null) {
    return { doc: relDoc, status: STATUS.RESTAMP, sources, commit };
  }

  const spec = sources.map(pathspec);
  const log = tryGit(['log', '--oneline', '--no-merges', `${commit}..HEAD`, '--', ...spec]);

  if (log === null) {
    return { doc: relDoc, status: STATUS.RESTAMP, sources, commit };
  }
  if (!log) {
    return { doc: relDoc, status: STATUS.FRESH, sources, commit };
  }

  const commits = log.split('\n').filter(Boolean);
  const diffstat = tryGit(['diff', '--stat', `${commit}..HEAD`, '--', ...spec]) ?? '';

  return { doc: relDoc, status: STATUS.DRIFT, sources, commit, commits, diffstat };
}

const results = walk(docsRoot).sort().map(inspect);

const drift = results.filter((r) => r.status === STATUS.DRIFT);
const restamp = results.filter((r) => r.status === STATUS.RESTAMP);
const unmapped = results.filter((r) => r.status === STATUS.UNMAPPED);
const fresh = results.filter((r) => r.status === STATUS.FRESH);

// ---------------------------------------------------------------- terminal

const label = {
  [STATUS.DRIFT]: '\x1b[33mDRIFT\x1b[0m',
  [STATUS.RESTAMP]: '\x1b[35mRESTAMP\x1b[0m',
  [STATUS.UNMAPPED]: '\x1b[36mUNMAPPED\x1b[0m',
  [STATUS.FRESH]: '\x1b[32mfresh\x1b[0m',
};

console.log(`\nAdmin guide drift — ${results.length} pages, HEAD ${git(['rev-parse', '--short', 'HEAD'])}\n`);

for (const result of drift) {
  console.log(`${label[STATUS.DRIFT]}  ${result.doc}`);
  console.log(`       verified at ${result.commit}, ${result.commits.length} commit(s) since:`);
  for (const line of result.commits) console.log(`         ${line}`);
  if (verbose && result.diffstat) {
    for (const line of result.diffstat.split('\n')) console.log(`         ${line}`);
  }
  console.log('');
}

for (const result of restamp) {
  console.log(`${label[STATUS.RESTAMP]}  ${result.doc}`);
  console.log(`       commit ${result.commit} is unreachable — rebased or squashed away.`);
  console.log(`       Review the page, then re-stamp it.\n`);
}

for (const result of unmapped) {
  const reason = result.sources.length ? 'no residio_verified_commit' : 'no residio_sources';
  console.log(`${label[STATUS.UNMAPPED]}  ${result.doc} (${reason})`);
}
if (unmapped.length) console.log('');

console.log(
  `${fresh.length} fresh, ${drift.length} drifted, ${restamp.length} need re-stamping, ${unmapped.length} unmapped.`,
);

if (drift.length || restamp.length) {
  console.log('\nReview a page, update it if the change is user-visible, then:');
  console.log('  npm run docs:verify -- <path/to/doc.md>\n');
} else {
  console.log('');
}

// ------------------------------------------------------------ CI summary

if (ci && process.env.GITHUB_STEP_SUMMARY) {
  const lines = ['## Admin guide drift', ''];

  if (!drift.length && !restamp.length) {
    lines.push(`All ${fresh.length} mapped pages are current with \`${git(['rev-parse', '--short', 'HEAD'])}\`.`, '');
  } else {
    lines.push('| Page | Status | Detail |', '| --- | --- | --- |');
    for (const r of drift) {
      lines.push(`| \`${r.doc}\` | Drifted | ${r.commits.length} commit(s) since \`${r.commit}\` |`);
    }
    for (const r of restamp) {
      lines.push(`| \`${r.doc}\` | Needs re-stamp | \`${r.commit}\` unreachable |`);
    }
    lines.push('');

    for (const r of drift) {
      lines.push(`<details><summary><code>${r.doc}</code></summary>`, '', '```');
      lines.push(...r.commits);
      if (r.diffstat) lines.push('', r.diffstat);
      lines.push('```', '</details>', '');
    }

    lines.push('Re-stamp a reviewed page with `npm run docs:verify -- <path>`.', '');
  }

  if (unmapped.length) {
    lines.push(`<sub>${unmapped.length} page(s) not yet mapped to app sources.</sub>`, '');
  }

  appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'));
}

// Report-only by design: drift is a prompt to look, not a build failure.
process.exit(0);
