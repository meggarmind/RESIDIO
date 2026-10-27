#!/usr/bin/env node
/**
 * Drafts the release notes page for one release tag (#1236).
 *
 * Writes `website/docs/release-notes/vX-Y-Z.md` as a DRAFT and adds the release's row to
 * `website/docs/release-notes/index.md`. The draft carries the raw material (the release PR
 * body and the PRs in the release) for a session to rewrite in ASD-STE100, from a product
 * view. Style guide and process: docs/agents/release-notes.md.
 *
 * Run by .github/workflows/release-notes.yml after a tag is pushed, or by hand:
 *   node scripts/release-notes-draft.mjs v1.12.0 [--repo owner/name] [--force]
 *
 * The PR titles come from the GitHub REST API when GH_TOKEN or GITHUB_TOKEN is set; without
 * one, the draft lists the commit subjects only. An existing finished page is never
 * overwritten unless --force is given.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const notesDir = path.join(repoRoot, 'website', 'docs', 'release-notes');
const indexPath = path.join(notesDir, 'index.md');

export const INDEX_START = '{/* release-notes:index:start */}';
export const INDEX_END = '{/* release-notes:index:end */}';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const TYPE_WORDS = {
  major: 'Major (upgrade steps are necessary)',
  minor: 'Minor (new features, no upgrade steps)',
  patch: 'Patch (fixes only)',
};

/** `v1.10.0` -> [1, 10, 0], or null when the tag is not a release tag. */
export function parseTag(tag) {
  const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag);
  return match ? match.slice(1).map(Number) : null;
}

export function compareTags(a, b) {
  const [pa, pb] = [parseTag(a), parseTag(b)];
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

/** The highest release tag below `tag`, or null for the first release. */
export function previousTag(tag, tags) {
  const lower = tags.filter((t) => parseTag(t) && compareTags(t, tag) < 0).sort(compareTags);
  return lower.length ? lower[lower.length - 1] : null;
}

/** `v1.10.0` -> `v1-10-0`: the page file name and doc id. */
export function pageSlug(tag) {
  return tag.replace(/\./g, '-');
}

/** The release size: from the tag annotation's `release:<bump>` when present, else from the versions. */
export function releaseType(tag, prev, annotation = '') {
  const labelled = /release:(major|minor|patch)/.exec(annotation);
  if (labelled) return labelled[1];
  const fast = /fast-forward, (major|minor|patch)/.exec(annotation);
  if (fast) return fast[1];
  if (!prev) return 'minor';
  const [a, b] = [parseTag(prev), parseTag(tag)];
  if (b[0] !== a[0]) return 'major';
  if (b[1] !== a[1]) return 'minor';
  return 'patch';
}

/** The release PR number from a tag annotation such as `Release v1.9.0 (#1001, release:minor from 1.8.0)`. */
export function releasePrFromAnnotation(annotation) {
  const match = /\(#(\d+),/.exec(annotation);
  return match ? Number(match[1]) : null;
}

/** PR numbers named by squash subjects (`Title (#123)`) and merge subjects (`Merge pull request #123`). */
export function prNumbersFromSubjects(subjects) {
  const found = new Set();
  for (const subject of subjects) {
    const merge = /^Merge pull request #(\d+)/.exec(subject);
    if (merge) found.add(Number(merge[1]));
    const squash = /\(#(\d+)\)\s*$/.exec(subject);
    if (squash) found.add(Number(squash[1]));
  }
  return [...found].sort((a, b) => a - b);
}

/** `2026-10-24` -> `24 October 2026` (CORE.md section 4: month as a name). */
export function longDate(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Text that cannot break out of a fenced block or the MDX parser. */
function fenceSafe(text) {
  return String(text ?? '').replace(/```/g, "'''").trim();
}

export function renderDraft({ tag, date, type, releasePr, releasePrBody, items, subjects }) {
  const slug = pageSlug(tag);
  const lines = [
    '---',
    `id: ${slug}`,
    `title: Release ${tag}`,
    `sidebar_label: ${tag}`,
    `description: What is new and what changed in Residio ${tag}.`,
    `residio_release: ${tag}`,
    `residio_release_date: '${date}'`,
    `residio_release_type: ${type}`,
    'residio_release_draft: true',
    '---',
    '',
    `# Release ${tag}`,
    '',
    `**Release date:** ${longDate(date)}. **Release type:** ${TYPE_WORDS[type]}.`,
    '',
    ':::caution Draft',
    '',
    'This page is a draft that the release workflow made. Rewrite it in ASD-STE100 from a product',
    'view, as docs/agents/release-notes.md tells you. Then remove this box, the "Draft input"',
    'section and the `residio_release_draft` line.',
    '',
    ':::',
    '',
    '## Summary',
    '',
    'To be written.',
    '',
    '## New features',
    '',
    '## Changes',
    '',
    '## Fixed problems',
    '',
    '## Draft input',
    '',
  ];

  if (releasePr) {
    lines.push(`Release PR #${releasePr}:`, '', '```text', fenceSafe(releasePrBody) || '(no body)', '```', '');
  }

  if (items.length) {
    lines.push('PRs in this release:', '', '```text');
    for (const item of items) {
      const labels = item.labels?.length ? ` [${item.labels.join(', ')}]` : '';
      lines.push(`#${item.number} ${fenceSafe(item.title)}${labels}`);
    }
    lines.push('```', '');
  } else {
    lines.push('Commits in this release:', '', '```text', ...subjects.map(fenceSafe), '```', '');
  }

  return `${lines.join('\n')}`;
}

/** Adds or replaces the release's row in the index table, newest first. */
export function upsertIndexRow(indexText, { tag, date, type, summary }) {
  const start = indexText.indexOf(INDEX_START);
  const end = indexText.indexOf(INDEX_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`index.md has no ${INDEX_START} ... ${INDEX_END} block`);
  }

  const block = indexText.slice(start + INDEX_START.length, end);
  const tableLines = block.split('\n').filter((line) => line.trim());
  const [header, separator, ...rows] = tableLines;
  const typeWord = type[0].toUpperCase() + type.slice(1);
  const row = `| [${tag}](./${pageSlug(tag)}.md) | ${longDate(date)} | ${typeWord} | ${summary} |`;

  const tagOf = (line) => /^\|\s*\[(v\d+\.\d+\.\d+)\]/.exec(line)?.[1];
  const kept = rows.filter((line) => tagOf(line) !== tag);
  kept.push(row);
  kept.sort((a, b) => compareTags(tagOf(b), tagOf(a)));

  const table = [header, separator, ...kept].join('\n');
  return `${indexText.slice(0, start + INDEX_START.length)}\n\n${table}\n\n${indexText.slice(end)}`;
}

function git(args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

async function github(repo, apiPath) {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token || !repo) return null;
  const response = await fetch(`https://api.github.com/repos/${repo}/${apiPath}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) {
    console.warn(`GitHub API ${apiPath}: HTTP ${response.status}`);
    return null;
  }
  return response.json();
}

async function main() {
  const args = process.argv.slice(2);
  const tag = args.find((arg) => !arg.startsWith('--') && parseTag(arg));
  const repoIndex = args.indexOf('--repo');
  const repo = repoIndex !== -1 ? args[repoIndex + 1] : process.env.GITHUB_REPOSITORY;
  const force = args.includes('--force');

  if (!tag) {
    console.error('Usage: node scripts/release-notes-draft.mjs vX.Y.Z [--repo owner/name] [--force]');
    process.exit(2);
  }

  const pagePath = path.join(notesDir, `${pageSlug(tag)}.md`);
  if (existsSync(pagePath) && !force && !readFileSync(pagePath, 'utf8').includes('residio_release_draft: true')) {
    console.log(`${path.relative(repoRoot, pagePath)} is already written. Not changed (use --force).`);
    return;
  }

  const tags = git(['tag', '--list', 'v*']).split('\n').filter(Boolean);
  if (!tags.includes(tag)) throw new Error(`Tag ${tag} does not exist here. Fetch the tags first.`);

  const prev = previousTag(tag, tags);
  const annotation = git(['for-each-ref', `refs/tags/${tag}`, '--format=%(contents:subject)']);
  const date = git(['log', '-1', '--format=%cs', tag]);
  const type = releaseType(tag, prev, annotation);
  const releasePr = releasePrFromAnnotation(annotation);

  const range = prev ? `${prev}..${tag}` : tag;
  const subjects = git(['log', '--format=%s', range]).split('\n').filter(Boolean);
  const numbers = prNumbersFromSubjects(subjects).filter((n) => n !== releasePr);

  const items = [];
  for (const number of numbers) {
    const issue = await github(repo, `issues/${number}`);
    if (issue) items.push({ number, title: issue.title, labels: (issue.labels ?? []).map((l) => l.name) });
  }
  const releasePrBody = releasePr ? (await github(repo, `pulls/${releasePr}`))?.body : null;

  writeFileSync(pagePath, renderDraft({ tag, date, type, releasePr, releasePrBody, items, subjects }));
  const index = readFileSync(indexPath, 'utf8');
  writeFileSync(indexPath, upsertIndexRow(index, { tag, date, type, summary: 'Draft: to be written.' }));

  console.log(`Drafted ${path.relative(repoRoot, pagePath)} (${type}, ${date}, ${items.length || subjects.length} entries).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
