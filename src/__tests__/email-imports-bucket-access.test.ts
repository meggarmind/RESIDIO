import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Issue #206. Structural assertions over the migration: nothing here connects
 * to a database. The migration drops the open INSERT policy on the
 * email-imports bucket and replaces the open SELECT policy with one gated on
 * email_imports.view. The service-role policy is left alone.
 */

const FILE = '20261014150000_email_imports_bucket_access.sql';
const migration = readFileSync(
  path.join(fileURLToPath(new URL('../../supabase/migrations', import.meta.url)), FILE),
  'utf8'
).replace(/\r\n/g, '\n');

const activeSql = migration.match(/^BEGIN;[\s\S]*?^COMMIT;/m)?.[0] ?? '';
const active = activeSql.replace(/--[^\n]*/g, '');
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const rollback = norm(
  migration
    .slice(migration.indexOf('-- ROLLBACK'), migration.indexOf('\nBEGIN;'))
    .split('\n')
    .map((l) => l.replace(/^--\s?/, ''))
    .join('\n')
);

const UPLOAD = 'Allow authenticated uploads to email-imports';
const READ = 'Allow authenticated reads from email-imports';
const SERVICE = 'Allow service role full access to email-imports';

function createBlock(name: string): string {
  const start = active.indexOf(`CREATE POLICY "${name}"`);
  if (start === -1) return '';
  return norm(active.slice(start, active.indexOf(';', start) + 1));
}

describe('#206 email-imports bucket access migration', () => {
  it('runs in a transaction', () => {
    expect(activeSql).not.toBe('');
  });

  it('drops the open upload policy and does not recreate it', () => {
    expect(active).toContain(`DROP POLICY IF EXISTS "${UPLOAD}" ON storage.objects;`);
    expect(active).not.toContain(`CREATE POLICY "${UPLOAD}"`);
    expect(active).not.toMatch(/FOR INSERT/i);
  });

  it('recreates the read policy idempotently', () => {
    expect(active).toContain(`DROP POLICY IF EXISTS "${READ}" ON storage.objects;`);
    expect(createBlock(READ)).not.toBe('');
  });

  it('read policy is SELECT TO authenticated on storage.objects', () => {
    expect(createBlock(READ)).toContain('ON storage.objects FOR SELECT TO authenticated');
  });

  it('read policy requires the bucket AND email_imports.view', () => {
    expect(createBlock(READ)).toContain(
      "USING (bucket_id = 'email-imports' AND public.has_permission('email_imports.view'))"
    );
  });

  it('creates exactly one policy', () => {
    expect(active.match(/CREATE POLICY/g) ?? []).toHaveLength(1);
  });

  it('does not name or touch the service-role policy', () => {
    expect(active).not.toContain(SERVICE);
    expect(active).not.toMatch(/service_role/);
  });

  it('touches only storage.objects and only the email-imports bucket', () => {
    const tables = [...active.matchAll(/\bON\s+([\w.]+)/g)].map((m) => m[1]);
    expect(tables.length).toBeGreaterThan(0);
    for (const t of tables) expect(t).toBe('storage.objects');
    const buckets = [...active.matchAll(/bucket_id\s*=\s*'([^']+)'/g)].map((m) => m[1]);
    expect(buckets.length).toBeGreaterThan(0);
    for (const b of buckets) expect(b).toBe('email-imports');
    expect(active).not.toMatch(/\b(ALTER|INSERT INTO|UPDATE|DELETE FROM|GRANT|REVOKE)\b/i);
  });

  it('names no roles in executable SQL', () => {
    expect(active).not.toMatch(/app_roles|get_my_role|\br\.name|\bar\.name/);
    for (const role of ['super_admin', 'chairman', 'financial_officer', 'resident', 'secretary']) {
      expect(active).not.toContain(role);
    }
  });

  it('rollback restores the permissive read predicate verbatim', () => {
    expect(rollback).toContain(
      `DROP POLICY IF EXISTS "${READ}" ON storage.objects; CREATE POLICY "${READ}" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'email-imports');`
    );
  });

  it('rollback restores the upload policy verbatim', () => {
    expect(rollback).toContain(
      `CREATE POLICY "${UPLOAD}" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'email-imports');`
    );
  });

  it('rollback does not touch the service-role policy', () => {
    expect(rollback).not.toContain(SERVICE);
  });
});
