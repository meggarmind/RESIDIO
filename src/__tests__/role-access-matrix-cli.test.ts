import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');
const DIFF = path.join(ROOT, 'scripts', 'diff-role-access-matrix.mjs');
const BUILD = path.join(ROOT, 'scripts', 'build-role-access-matrix.mjs');

// Neither script imports a sibling, so a lone copy in a spaced directory resolves everything.
let dir: string;
let spacedDiff: string;
let spacedBuild: string;
let baseline: string;
let same: string;
let narrowed: string;
let captures: string;

const run = (script: string, ...args: string[]) =>
  spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', cwd: ROOT });

const matrix = (verdict: string) => ({
  capturedAt: '2026-01-01',
  roles: ['chairman'],
  verdicts: { chairman: { houses: verdict, streets: 'allow' } },
});

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'matrix-cli-'));
  const spaced = path.join(dir, 'with space', 'scripts');
  mkdirSync(spaced, { recursive: true });
  spacedDiff = path.join(spaced, 'diff-role-access-matrix.mjs');
  spacedBuild = path.join(spaced, 'build-role-access-matrix.mjs');
  cpSync(DIFF, spacedDiff);
  cpSync(BUILD, spacedBuild);

  baseline = path.join(dir, 'baseline.json');
  same = path.join(dir, 'same.json');
  narrowed = path.join(dir, 'narrowed.json');
  captures = path.join(dir, 'captures.json');
  writeFileSync(baseline, JSON.stringify(matrix('allow')));
  writeFileSync(same, JSON.stringify(matrix('allow')));
  writeFileSync(narrowed, JSON.stringify(matrix('deny')));
  writeFileSync(
    captures,
    JSON.stringify([
      { role_name: 'chairman', by_verdict: { allow: ['houses'], deny: ['streets'] }, read_nonempty: ['houses'] },
    ])
  );
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe.each([
  ['normal', () => DIFF, () => BUILD],
  ['spaced', () => spacedDiff, () => spacedBuild],
])('role-access-matrix CLIs from the %s path', (label, diffScript, buildScript) => {
  it('diff: exits 0 and reports no movement when fresh matches baseline', () => {
    const r = run(diffScript(), same, baseline);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('No cell moved');
  });

  it('diff: exits 1 and names the narrowed cell on divergence', () => {
    const r = run(diffScript(), narrowed, baseline);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('NARROWED');
    expect(r.stdout).toContain('allow -> deny');
  });

  it('diff: prints usage and exits 2 with no arguments', () => {
    const r = run(diffScript());
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('usage:');
  });

  it('build: prints usage and exits 2 with no arguments', () => {
    const r = run(buildScript());
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('usage:');
  });

  it('build: writes the matrix for a valid capture', () => {
    const out = path.join(dir, `out-${label}.json`);
    const r = run(buildScript(), captures, out, '2026-02-02');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('1 roles x 2 tables');
    expect(existsSync(out)).toBe(true);
    const built = JSON.parse(readFileSync(out, 'utf8'));
    expect(built.capturedAt).toBe('2026-02-02');
    expect(built.verdicts.chairman).toEqual({ houses: 'allow', streets: 'deny' });
  });
});
