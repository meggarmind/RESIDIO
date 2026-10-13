#!/usr/bin/env node
/**
 * Release version calculator (#397 Part 2).
 *
 * A release PR (`stage` -> `master`, or a hotfix into `master`) carries one label saying
 * what the release means for an operator (#269):
 *
 *   release:major  not a drop-in upgrade (new required env var, non-backward-compatible
 *                  migration, access-control API change)
 *   release:minor  new capability, drop-in
 *   release:patch  fixes
 *   release:none   merged deliberately without a release (docs-only and the like)
 *
 * On merge, `.github/workflows/release.yml` runs this script, which prints the next
 * `vX.Y.Z` tag computed from the LAST version tag, or nothing. No label, or a label that
 * is not one of the four, means no tag: deliberately, so an unlabelled merge never mints
 * a version by accident. Nothing is ever written back to `master`; the tag is the version.
 *
 * Usage (the workflow sets these):
 *   PR_LABELS='["release:minor"]' node scripts/release-version.mjs
 *
 * Writes `tag=<vX.Y.Z or empty>` and `reason=<text>` to $GITHUB_OUTPUT when set, and
 * always to stdout. Exits non-zero only when the labels contradict each other or the
 * version state is unreadable; a failed run never tags.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const RELEASE_LABELS = {
  'release:major': 'major',
  'release:minor': 'minor',
  'release:patch': 'patch',
  'release:none': 'none',
};

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** `[major, minor, patch]` for a plain `X.Y.Z`, or null. No prerelease or build parts. */
export function parseVersion(version) {
  const match = SEMVER.exec(version);
  return match ? match.slice(1).map(Number) : null;
}

/**
 * The version a `vX.Y.Z` tag names, or null for any other tag. The repo also carries
 * `archive/*` tags, which must never be read as versions.
 */
export function versionFromTag(tag) {
  return tag.startsWith('v') && parseVersion(tag.slice(1)) ? tag.slice(1) : null;
}

function compareVersions(a, b) {
  const [pa, pb] = [parseVersion(a), parseVersion(b)];
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

/**
 * The highest version among `vX.Y.Z` tags, compared numerically (so 0.10.0 > 0.9.0).
 * With no version tag yet, `fallback` (package.json's version) is the baseline, so the
 * first `release:minor` from 0.4.0 produces v0.5.0.
 */
export function latestVersion(tags, fallback) {
  const versions = tags.map(versionFromTag).filter(Boolean);
  if (versions.length === 0) {
    if (!parseVersion(fallback)) throw new Error(`No version tags, and fallback "${fallback}" is not X.Y.Z`);
    return fallback;
  }
  return versions.sort(compareVersions).at(-1);
}

/**
 * The bump the PR's labels ask for: 'major' | 'minor' | 'patch' | 'none', or null when no
 * release label is present (unknown `release:*` labels count as absent). Two different
 * release labels are a contradiction and throw rather than guessing.
 */
export function bumpFromLabels(labels) {
  const bumps = [...new Set(labels.map((label) => RELEASE_LABELS[label]).filter(Boolean))];
  if (bumps.length > 1) {
    throw new Error(`Conflicting release labels: ${bumps.map((b) => `release:${b}`).join(', ')}`);
  }
  return bumps[0] ?? null;
}

/** Applies a 'major' | 'minor' | 'patch' bump to `X.Y.Z`. */
export function nextVersion(current, bump) {
  const parsed = parseVersion(current);
  if (!parsed) throw new Error(`Not an X.Y.Z version: "${current}"`);
  const [major, minor, patch] = parsed;
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Unknown bump "${bump}"`);
}

/**
 * The whole decision, pure: `{ tag, reason }`, where `tag` is '' when nothing should be
 * tagged.
 */
export function decideRelease({ labels, tags, packageVersion }) {
  const bump = bumpFromLabels(labels);
  if (bump === null) return { tag: '', reason: 'no release:* label; nothing to tag' };
  if (bump === 'none') return { tag: '', reason: 'release:none; nothing to tag' };
  const current = latestVersion(tags, packageVersion);
  const next = nextVersion(current, bump);
  return { tag: `v${next}`, reason: `release:${bump} from ${current}` };
}

function main() {
  let labels;
  try {
    labels = JSON.parse(process.env.PR_LABELS ?? '[]');
    if (!Array.isArray(labels)) throw new Error('not an array');
  } catch (error) {
    console.error(`release-version: PR_LABELS must be a JSON array of label names (${error.message}).`);
    process.exitCode = 1;
    return;
  }

  let decision;
  try {
    const tags = execFileSync('git', ['tag', '--list', 'v*'], { cwd: repoRoot, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
    const packageVersion = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version;
    decision = decideRelease({ labels, tags, packageVersion });
  } catch (error) {
    console.error(`release-version: ${error.message}. Nothing was tagged.`);
    process.exitCode = 1;
    return;
  }

  console.log(decision.tag ? `Next release: ${decision.tag} (${decision.reason})` : `No release: ${decision.reason}`);
  if (process.env.GITHUB_OUTPUT) {
    // `bump` is the label's verdict (major|minor|patch|none), empty without a release label.
    // release.yml uses it to deploy Stage for a release:major.
    const bump = bumpFromLabels(labels) ?? '';
    appendFileSync(process.env.GITHUB_OUTPUT, `tag=${decision.tag}\nreason=${decision.reason}\nbump=${bump}\n`);
  }
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main();
}
