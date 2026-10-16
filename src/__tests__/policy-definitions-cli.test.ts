import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(ROOT, 'scripts', 'diff-policy-definitions.mjs');

const line = (table: string, policy: string, qual = 'aaaaaaaaaaaa') =>
  `${table}|${policy}|SELECT|PERMISSIVE|authenticated|${qual}|bbbbbbbbbbbb`;

let dir: string;
let baseline: string;
let same: string;
let diverged: string;
let malformed: string;

const run = (script: string, ...args: string[]) =>
  spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', cwd: ROOT });

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'policy-cli-'));
  baseline = path.join(dir, 'baseline.txt');
  same = path.join(dir, 'same.txt');
  diverged = path.join(dir, 'diverged.txt');
  malformed = path.join(dir, 'malformed.txt');

  const rows = [line('houses', 'h1'), line('streets', 's1'), line('zones', 'z1')];
  writeFileSync(baseline, rows.join('\n'));
  writeFileSync(same, rows.reverse().join('\n'));
  // zones changed, houses removed, aaa_new added, streets untouched.
  writeFileSync(
    diverged,
    [line('zones', 'z1', 'cccccccccccc'), line('streets', 's1'), line('aaa_new', 'n1')].join('\n')
  );
  writeFileSync(malformed, 'not a policy row');
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('diff-policy-definitions CLI', () => {
  it('exits 0 when the capture matches the baseline', () => {
    const r = run(SCRIPT, same, baseline);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('No divergence');
  });

  it('exits 1 on divergence and names each kind', () => {
    const r = run(SCRIPT, diverged, baseline);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('ADDED    n1');
    expect(r.stdout).toContain('REMOVED  h1');
    expect(r.stdout).toContain('CHANGED  z1');
    expect(r.stdout).toContain('1 added, 1 removed, 1 changed.');
  });

  it('groups output by table, tables in sorted order', () => {
    const out = run(SCRIPT, diverged, baseline).stdout;
    const at = (s: string) => out.indexOf(`\n${s}\n`);
    expect(at('aaa_new')).toBeGreaterThan(-1);
    expect(at('houses')).toBeGreaterThan(at('aaa_new'));
    expect(at('zones')).toBeGreaterThan(at('houses'));
    expect(at('streets')).toBe(-1); // unchanged table is not listed
    // each finding sits directly under its table heading
    expect(out).toMatch(/\nhouses\n {2}- REMOVED {2}h1/);
    expect(out).toMatch(/\nzones\n {2}~ CHANGED {2}z1/);
  });

  it('exits 2 on a malformed capture', () => {
    const r = run(SCRIPT, malformed, baseline);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('error:');
  });

  it('exits 2 when the capture file does not exist', () => {
    expect(run(SCRIPT, path.join(dir, 'nope.txt'), baseline).status).toBe(2);
  });

  it('exits 2 with no arguments', () => {
    const r = run(SCRIPT);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('usage:');
  });

  it('still runs (and does not fail open) from a path containing a space', () => {
    const spaced = path.join(dir, 'with space', 'scripts');
    mkdirSync(path.join(spaced, 'lib'), { recursive: true });
    cpSync(SCRIPT, path.join(spaced, 'diff-policy-definitions.mjs'));
    cpSync(path.join(ROOT, 'scripts', 'lib', 'policy-definitions.mjs'), path.join(spaced, 'lib', 'policy-definitions.mjs'));
    const copy = path.join(spaced, 'diff-policy-definitions.mjs');

    const ok = run(copy, same, baseline);
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain('No divergence');

    const bad = run(copy, diverged, baseline);
    expect(bad.status).toBe(1);
    expect(bad.stdout).toContain('REMOVED');
  });
});
