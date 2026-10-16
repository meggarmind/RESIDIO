import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  comparePolicies,
  formatRow,
  parseCapture,
  parseRow,
  PolicyParseError,
} from '../../scripts/lib/policy-definitions.mjs';

const BASELINE_PATH = path.resolve(__dirname, '../../docs/validation/policy-definitions.baseline.json');
const baselineText = readFileSync(BASELINE_PATH, 'utf8');

const row = (over: Partial<Record<string, string>> = {}) =>
  formatRow({
    tablename: 'houses',
    policyname: 'p1',
    cmd: 'SELECT',
    permissive: 'PERMISSIVE',
    roles: 'authenticated',
    qualHash: 'aaaaaaaaaaaa',
    withCheckHash: 'bbbbbbbbbbbb',
    ...over,
  });

const base = () => parseCapture([row(), row({ tablename: 'streets', policyname: 'p2' })].join('\n'));

describe('committed baseline', () => {
  it('parses, has 256 policies, and matches its declared count', () => {
    const policies = parseCapture(baselineText);
    expect(policies).toHaveLength(256);
    expect(JSON.parse(baselineText).count).toBe(256);
    expect(JSON.parse(baselineText).postgresMajor).toBe(17);
  });

  it('reproduces the Stage capture checksum', () => {
    const joined = parseCapture(baselineText).map(formatRow).join('\n');
    expect(createHash('md5').update(joined).digest('hex')).toBe('10a66b390ffb115722c85a66ec1a17cb');
  });

  it('is identical to itself', () => {
    const p = parseCapture(baselineText);
    expect(comparePolicies(p, p).diverged).toBe(false);
  });
});

describe('comparePolicies', () => {
  it('reports no divergence for an identical capture', () => {
    expect(comparePolicies(base(), base())).toMatchObject({ added: [], removed: [], changed: [], diverged: false });
  });

  it('tolerates ordering, blank lines, CRLF and padding', () => {
    const messy = `\r\n  ${row({ tablename: 'streets', policyname: 'p2' })}  \r\n\r\n${row()}\r\n`;
    expect(comparePolicies(base(), parseCapture(messy)).diverged).toBe(false);
  });

  it('detects an added policy', () => {
    const fresh = parseCapture([row(), row({ tablename: 'streets', policyname: 'p2' }), row({ policyname: 'new' })].join('\n'));
    const r = comparePolicies(base(), fresh);
    expect(r.diverged).toBe(true);
    expect(r.added.map((p) => p.policyname)).toEqual(['new']);
    expect(r.removed).toEqual([]);
  });

  it('detects a removed policy', () => {
    const r = comparePolicies(base(), parseCapture(row()));
    expect(r.diverged).toBe(true);
    expect(r.removed.map((p) => p.policyname)).toEqual(['p2']);
  });

  it.each([
    ['qualHash', { qualHash: 'cccccccccccc' }],
    ['withCheckHash', { withCheckHash: 'cccccccccccc' }],
    ['cmd', { cmd: 'ALL' }],
    ['permissive', { permissive: 'RESTRICTIVE' }],
    ['roles', { roles: 'public' }],
  ])('detects a changed %s', (field, over) => {
    const fresh = parseCapture([row(over), row({ tablename: 'streets', policyname: 'p2' })].join('\n'));
    const r = comparePolicies(base(), fresh);
    expect(r.diverged).toBe(true);
    expect(r.changed).toHaveLength(1);
    expect(r.changed[0].fields.map((f: { field: string }) => f.field)).toEqual([field]);
    expect(r.added).toEqual([]);
    expect(r.removed).toEqual([]);
  });

  it('treats a rename as one removal plus one addition', () => {
    const r = comparePolicies(base(), parseCapture([row({ policyname: 'renamed' }), row({ tablename: 'streets', policyname: 'p2' })].join('\n')));
    expect(r.added).toHaveLength(1);
    expect(r.removed).toHaveLength(1);
  });
});

describe('parsing', () => {
  it('keeps a policy name that contains the delimiter', () => {
    const p = parseRow(row({ policyname: 'a|b' }));
    expect(p.policyname).toBe('a|b');
    expect(p.tablename).toBe('houses');
  });

  it('accepts raw MCP JSON ({row}) and row-string arrays', () => {
    const r = row();
    expect(parseCapture(JSON.stringify([{ row: r }]))).toEqual(parseCapture(r));
    expect(parseCapture(JSON.stringify([r]))).toEqual(parseCapture(r));
  });

  it.each([
    ['empty input', ''],
    ['too few fields', 'houses|p1|SELECT'],
    ['bad hash', row({ qualHash: 'xyz' })],
    ['bad permissive', row({ permissive: 'MAYBE' })],
    ['broken JSON', '[{"row": '],
    ['JSON object without policies', '{"a":1}'],
    ['empty JSON array', '[]'],
    ['unrecognised JSON entry', '[42]'],
    ['duplicate policy', `${row()}\n${row({ qualHash: 'cccccccccccc' })}`],
  ])('rejects %s', (_label, input) => {
    expect(() => parseCapture(input)).toThrow(PolicyParseError);
  });
});
