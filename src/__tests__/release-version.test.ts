import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  bumpFromLabels,
  decideRelease,
  latestVersion,
  nextVersion,
  parseVersion,
  versionFromTag,
} from '../../scripts/release-version.mjs';

/**
 * Unit tests for the release version calculator (#397 Part 2). Pure functions only: no
 * git, no filesystem. `decideRelease` takes the PR's label names, the repo's tag names
 * and package.json's version, exactly as `.github/workflows/release.yml` supplies them.
 */

describe('nextVersion', () => {
  it.each([
    ['0.4.0', 'major', '1.0.0'],
    ['0.4.0', 'minor', '0.5.0'],
    ['0.4.0', 'patch', '0.4.1'],
    // Rollover cases named in #397: numeric, not string, increments.
    ['0.9.0', 'minor', '0.10.0'],
    ['0.4.9', 'patch', '0.4.10'],
    ['1.9.9', 'major', '2.0.0'],
    ['1.2.3', 'minor', '1.3.0'],
  ])('%s + %s -> %s', (current, bump, expected) => {
    expect(nextVersion(current, bump)).toBe(expected);
  });

  it('rejects an unknown bump and a malformed version', () => {
    expect(() => nextVersion('0.4.0', 'huge')).toThrow();
    expect(() => nextVersion('v0.4.0', 'patch')).toThrow();
  });
});

describe('versionFromTag / parseVersion', () => {
  it('reads vX.Y.Z tags only', () => {
    expect(versionFromTag('v0.5.0')).toBe('0.5.0');
    expect(versionFromTag('archive/main')).toBeNull();
    expect(versionFromTag('0.5.0')).toBeNull();
    expect(versionFromTag('v0.5')).toBeNull();
    expect(versionFromTag('v0.5.0-rc.1')).toBeNull();
  });

  it('rejects leading zeros', () => {
    expect(parseVersion('01.2.3')).toBeNull();
  });
});

describe('latestVersion', () => {
  it('picks the numerically highest tag, not the lexically highest', () => {
    expect(latestVersion(['v0.9.0', 'v0.10.0', 'v0.2.1'], '0.4.0')).toBe('0.10.0');
  });

  it('ignores non-version tags such as archive/*', () => {
    expect(latestVersion(['archive/main', 'v0.6.0', 'archive/qa'], '0.4.0')).toBe('0.6.0');
  });

  it('falls back to package.json when there is no version tag yet', () => {
    expect(latestVersion(['archive/main'], '0.4.0')).toBe('0.4.0');
  });

  it('throws when there is no tag and the fallback is not X.Y.Z', () => {
    expect(() => latestVersion([], 'banana')).toThrow();
  });
});

describe('bumpFromLabels', () => {
  it('maps each release label to its bump', () => {
    expect(bumpFromLabels(['release:major'])).toBe('major');
    expect(bumpFromLabels(['release:minor'])).toBe('minor');
    expect(bumpFromLabels(['release:patch'])).toBe('patch');
    expect(bumpFromLabels(['release:none'])).toBe('none');
  });

  it('ignores unrelated labels and returns null when no release label is present', () => {
    expect(bumpFromLabels(['harness:claude', 'ready-for-agent'])).toBeNull();
    expect(bumpFromLabels([])).toBeNull();
  });

  it('treats an unknown release:* label as absent', () => {
    expect(bumpFromLabels(['release:huge'])).toBeNull();
  });

  it('throws on two different release labels rather than guessing', () => {
    expect(() => bumpFromLabels(['release:minor', 'release:patch'])).toThrow(/Conflicting/);
  });
});

describe('decideRelease (the #397 acceptance criteria)', () => {
  const tags = ['archive/main', 'v0.4.0'];

  it('release:minor from v0.4.0 produces v0.5.0', () => {
    expect(decideRelease({ labels: ['release:minor'], tags, packageVersion: '0.4.0' }).tag).toBe('v0.5.0');
  });

  it('release:none produces no tag', () => {
    expect(decideRelease({ labels: ['release:none'], tags, packageVersion: '0.4.0' }).tag).toBe('');
  });

  it('no label produces no tag and does not throw', () => {
    expect(decideRelease({ labels: ['harness:claude'], tags, packageVersion: '0.4.0' }).tag).toBe('');
  });

  it('counts from the last tag, not from package.json, once a tag exists', () => {
    expect(
      decideRelease({ labels: ['release:patch'], tags: ['v0.7.2'], packageVersion: '0.4.0' }).tag,
    ).toBe('v0.7.3');
  });

  it('counts from package.json on the very first release', () => {
    expect(
      decideRelease({ labels: ['release:minor'], tags: ['archive/main'], packageVersion: '0.4.0' }).tag,
    ).toBe('v0.5.0');
  });
});

describe('release.yml label definitions', () => {
  // The labels job's first run failed with HTTP 422: GitHub caps a label description at
  // 100 characters, and `bash -e` stopped before any label was created.
  const workflow = readFileSync(
    fileURLToPath(new URL('../../.github/workflows/release.yml', import.meta.url)),
    'utf8',
  );
  const labels = [...workflow.matchAll(/gh label create "([^"]+)"[\s\S]*?--description "([^"]*)"/g)];

  it('defines all four release labels', () => {
    expect(labels.map(([, name]) => name).sort()).toEqual(
      ['release:major', 'release:minor', 'release:none', 'release:patch'],
    );
  });

  it.each(labels.map(([, name, description]) => [name, description]))(
    '%s has a description GitHub accepts (at most 100 characters)',
    (_name, description) => {
      expect(description.length).toBeGreaterThan(0);
      expect(description.length).toBeLessThanOrEqual(100);
    },
  );
});
