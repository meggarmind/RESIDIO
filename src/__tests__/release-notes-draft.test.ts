import { describe, expect, it } from 'vitest';
import {
  INDEX_END,
  INDEX_START,
  longDate,
  pageSlug,
  prNumbersFromSubjects,
  previousTag,
  releasePrFromAnnotation,
  releaseType,
  renderDraft,
  upsertIndexRow,
} from '../../scripts/release-notes-draft.mjs';

/**
 * Unit tests for the release notes drafter (#1236). Pure functions only: no git, no network.
 * `.github/workflows/release-notes.yml` runs the script after each release tag.
 */

const INDEX = [
  '# Release notes',
  '',
  INDEX_START,
  '',
  '| Release | Date | Type | What changed |',
  '| --- | --- | --- | --- |',
  '| [v1.10.0](./v1-10-0.md) | 22 October 2026 | Minor | Ten. |',
  '| [v1.9.0](./v1-9-0.md) | 21 October 2026 | Minor | Nine. |',
  '',
  INDEX_END,
  '',
  'Footer.',
].join('\n');

describe('previousTag', () => {
  it('orders by version number, not by text', () => {
    const tags = ['v1.9.0', 'v1.10.0', 'v1.2.0', 'v2.0.0', 'archive/main'];
    expect(previousTag('v1.11.0', tags)).toBe('v1.10.0');
    expect(previousTag('v1.10.0', tags)).toBe('v1.9.0');
  });

  it('returns null for the first release', () => {
    expect(previousTag('v0.4.1', ['v0.4.1', 'v1.0.0'])).toBeNull();
  });
});

describe('releaseType', () => {
  it('reads the release label from the tag annotation', () => {
    expect(releaseType('v2.0.0', 'v1.11.0', 'Release v2.0.0 (#1132, release:patch from 1.11.0)')).toBe('patch');
  });

  it('reads a fast-forward annotation', () => {
    expect(releaseType('v2.1.0', 'v2.0.0', 'Release v2.1.0 (fast-forward, major from 2.0.0)')).toBe('major');
  });

  it('falls back to the version change', () => {
    expect(releaseType('v2.0.0', 'v1.11.0')).toBe('major');
    expect(releaseType('v1.11.0', 'v1.10.0')).toBe('minor');
    expect(releaseType('v0.4.2', 'v0.4.1')).toBe('patch');
  });
});

describe('subjects and annotations', () => {
  it('finds squash and merge PR numbers once each', () => {
    const subjects = [
      'feat(houses): add arrows (#1231)',
      'Merge pull request #1132 from meggarmind/stage',
      'fix: mention #99 in the middle is not a PR ref',
      'chore: again (#1231)',
    ];
    expect(prNumbersFromSubjects(subjects)).toEqual([1132, 1231]);
  });

  it('reads the release PR number', () => {
    expect(releasePrFromAnnotation('Release v1.9.0 (#1001, release:minor from 1.8.0)')).toBe(1001);
    expect(releasePrFromAnnotation('Release v2.1.0 (fast-forward, minor from 2.0.0)')).toBeNull();
  });
});

describe('formatting', () => {
  it('names the month (CORE.md section 4)', () => {
    expect(longDate('2026-10-04')).toBe('4 October 2026');
  });

  it('makes a dash slug', () => {
    expect(pageSlug('v1.10.0')).toBe('v1-10-0');
  });
});

describe('renderDraft', () => {
  const draft = renderDraft({
    tag: 'v1.12.0',
    date: '2026-10-30',
    type: 'minor',
    releasePr: 1300,
    releasePrBody: 'What ships {x} <b>\n```js\ncode\n```',
    items: [{ number: 1290, title: 'Add a thing', labels: ['enhancement'] }],
    subjects: [],
  });

  it('marks the page as a draft with the right front matter', () => {
    expect(draft).toContain('id: v1-12-0');
    expect(draft).toContain("residio_release_date: '2026-10-30'");
    expect(draft).toContain('residio_release_draft: true');
    expect(draft).toContain('**Release date:** 30 October 2026.');
  });

  it('keeps raw PR text inside one fenced block so MDX cannot parse it', () => {
    const fences = draft.match(/^```/gm) ?? [];
    expect(fences.length).toBe(4);
    expect(draft).toContain("'''js");
    expect(draft).toContain('#1290 Add a thing [enhancement]');
  });
});

describe('upsertIndexRow', () => {
  it('adds a newer release at the top and keeps the rest', () => {
    const out = upsertIndexRow(INDEX, { tag: 'v1.11.0', date: '2026-10-23', type: 'minor', summary: 'Eleven.' });
    const rows = out.split('\n').filter((line) => line.startsWith('| ['));
    expect(rows.map((row) => /\[(v[\d.]+)\]/.exec(row)?.[1])).toEqual(['v1.11.0', 'v1.10.0', 'v1.9.0']);
    expect(out).toContain('| [v1.11.0](./v1-11-0.md) | 23 October 2026 | Minor | Eleven. |');
    expect(out.endsWith('Footer.')).toBe(true);
  });

  it('replaces the row of a release that is already listed', () => {
    const out = upsertIndexRow(INDEX, { tag: 'v1.9.0', date: '2026-10-21', type: 'minor', summary: 'New text.' });
    expect(out).not.toContain('Nine.');
    expect(out.match(/\[v1\.9\.0\]/g)).toHaveLength(1);
  });

  it('refuses an index without the markers', () => {
    expect(() => upsertIndexRow('# No markers', { tag: 'v1.0.0', date: '2026-10-13', type: 'major', summary: 'x' })).toThrow();
  });
});
