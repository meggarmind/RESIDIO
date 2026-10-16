import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { scanLine, scanDiff, forbiddenFiles, filterGitleaksFindings, ALLOW_MARKER } from '../../scripts/secret-scan.mjs';

const root = path.resolve(__dirname, '..', '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

// Fixtures are assembled at runtime so this file never contains a literal that a scanner
// (this one, or gitleaks in CI) would flag.
const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (role: string) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ role, iss: 'supabase' })}.${'s'.repeat(30)}`;
const aws = 'AKIA' + 'ABCDEFGHIJKLMNOP';
const ghp = 'ghp_' + 'a'.repeat(36);
const pem = '-----BEGIN ' + 'RSA PRIVATE KEY-----';

describe('secret-scan (pre-commit)', () => {
  it('flags the well-known credential shapes', () => {
    expect(scanLine(`key = "${aws}"`)).toContain('aws-access-key');
    expect(scanLine(`token: ${ghp}`)).toContain('github-token');
    expect(scanLine(pem)).toContain('private-key');
    expect(scanLine('const k = "sk_' + 'live_' + 'a1B2c3D4e5F6g7H8i9"')).toContain('stripe-or-paystack-live-key');
  });

  it('flags a service_role JWT but not a public anon JWT', () => {
    expect(scanLine(`SUPABASE_KEY=${jwt('service_role')}`)).toContain('supabase-service-role-jwt');
    expect(scanLine(`NEXT_PUBLIC_SUPABASE_ANON_KEY=${jwt('anon')}`)).not.toContain('supabase-service-role-jwt');
  });

  it('flags a literal credential assignment but not env references or placeholders', () => {
    expect(scanLine(`const apiKey = "${'x9'.repeat(12)}"`)).toContain('generic-credential-assignment');
    expect(scanLine('const apiKey = process.env.API_KEY')).toEqual([]);
    expect(scanLine('RESEND_API_KEY="your-resend-api-key-goes-here"')).toEqual([]);
    expect(scanLine('const password = "short"')).toEqual([]);
  });

  it('honours the allow marker on the same line only', () => {
    expect(scanLine(`key = "${aws}" // ${ALLOW_MARKER}`)).toEqual([]);
    expect(scanLine(`key = "${aws}"`)).not.toEqual([]);
  });

  it('scans only added lines and reports file and line, never the value', () => {
    const diff = [
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1 +10,2 @@',
      `-removed ${aws}`,
      '+const ok = 1;',
      `+const bad = "${aws}";`,
    ].join('\n');
    const findings = scanDiff(diff);
    expect(findings).toEqual([{ file: 'src/a.ts', line: 11, rule: 'aws-access-key' }]);
    expect(JSON.stringify(findings)).not.toContain(aws);
  });

  it('skips lockfiles and example env files', () => {
    const mk = (f: string) => `+++ b/${f}\n@@ -0,0 +1 @@\n+key = "${aws}"`;
    expect(scanDiff(mk('package-lock.json'))).toEqual([]);
    expect(scanDiff(mk('.env.example'))).toEqual([]);
    expect(scanDiff(mk('src/b.ts'))).not.toEqual([]);
  });

  it('flags Slack, Resend and Supabase secret keys', () => {
    expect(scanLine('t = "xox' + 'b-' + '1234567890-abcdefghij"')).toContain('slack-token');
    expect(scanLine('k = re_' + 'abcdefgh_' + 'A1b2C3d4E5f6G7h8')).toContain('resend-api-key');
    expect(scanLine('k = sb_' + 'secret_' + 'A1b2C3d4E5f6G7h8I9j0K1')).toContain('supabase-secret-key');
  });

  it('does not read an added line starting with "++" as a file header', () => {
    const diff = [
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -0,0 +1,2 @@',
      `+++ k = "${aws}"`,
      '+const fine = 1;',
      '--- a/src/b.ts',
      '+++ b/src/b.ts',
      '@@ -0,0 +5 @@',
      `+const k = "${aws}";`,
    ].join('\n');
    expect(scanDiff(diff)).toEqual([
      { file: 'src/a.ts', line: 1, rule: 'aws-access-key' },
      { file: 'src/b.ts', line: 5, rule: 'aws-access-key' },
    ]);
  });

  it('strips the tab git appends to a path with spaces before matching skip rules', () => {
    const diff = `+++ b/my config.env.example\t\n@@ -0,0 +1 @@\n+key = "${aws}"`;
    expect(scanDiff(diff)).toEqual([]);
  });

  it('filters gitleaks findings the way the built-in engine would', () => {
    const lines: Record<string, string> = {
      'a.ts:1': `key = "${aws}" // ${ALLOW_MARKER}`,
      'b.ts:1': `NEXT_PUBLIC_SUPABASE_ANON_KEY=${jwt('anon')}`,
      'c.ts:1': `SUPABASE_KEY=${jwt('service_role')}`,
      'd.ts:1': `key = "${aws}"`,
    };
    const f = (file: string, rule: string) => ({ File: file, StartLine: 1, RuleID: rule });
    const kept = filterGitleaksFindings(
      [f('a.ts', 'aws-access-token'), f('b.ts', 'jwt'), f('c.ts', 'jwt'), f('d.ts', 'aws-access-token')],
      (file: string, line: number) => lines[`${file}:${line}`],
    );
    expect(kept.map((k: { File: string }) => k.File)).toEqual(['c.ts', 'd.ts']);
  });

  it('refuses real env files but allows examples', () => {
    expect(forbiddenFiles(['.env', '.env.local', 'apps/x/.env.production', '.env.example', 'src/env.ts'])).toEqual([
      '.env',
      '.env.local',
      'apps/x/.env.production',
    ]);
  });

  it('is wired: npm scripts and an executable-intent hook call the scanner', () => {
    expect(pkg.scripts['secret-scan']).toContain('scripts/secret-scan.mjs');
    expect(pkg.scripts['hooks:install']).toContain('core.hooksPath .githooks');
    expect(readFileSync(path.join(root, '.githooks', 'pre-commit'), 'utf8')).toContain('scripts/secret-scan.mjs');
  });
});
