import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Issue #383 part B. Structural assertions over the migration: nothing here
 * connects to a database. They prove the migration as written replaces both
 * the documents SELECT policy and the storage download policy, and that the
 * helpers are locked down.
 */

const FILE = '20261014100000_private_documents_access.sql';
const migration = readFileSync(
  path.join(fileURLToPath(new URL('../../supabase/migrations', import.meta.url)), FILE),
  'utf8'
).replace(/\r\n/g, '\n');

const activeSql = migration.match(/^BEGIN;[\s\S]*?^COMMIT;/m)?.[0] ?? '';
const active = activeSql.replace(/--[^\n]*/g, '');
const rollback = migration.slice(migration.indexOf('-- ROLLBACK:'), migration.indexOf('\nBEGIN;'));

function policyBlock(name: string): string {
  const start = active.indexOf(`CREATE POLICY "${name}"`);
  if (start === -1) return '';
  return active.slice(start, active.indexOf('\n  );', start) + 5);
}

function fnBlock(name: string): string {
  const start = active.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  if (start === -1) return '';
  const end = active.indexOf('$$;', active.indexOf('$$', start) + 2);
  return active.slice(start, end + 3);
}

const DOC_POLICY = 'Users can view documents based on permissions';
const STORAGE_POLICY = 'Users can download documents from storage';

describe('#383 part B private documents migration', () => {
  it('runs in a transaction', () => {
    expect(activeSql).not.toBe('');
  });

  it.each([
    [DOC_POLICY, 'public.documents'],
    [STORAGE_POLICY, 'storage.objects'],
  ])('replaces "%s" idempotently on %s', (policy, table) => {
    expect(active).toContain(`DROP POLICY IF EXISTS "${policy}" ON ${table};`);
    expect(policyBlock(policy)).toContain(`ON ${table} FOR SELECT TO authenticated`);
  });

  it('documents policy keeps the live predicate and adds the private check', () => {
    const block = policyBlock(DOC_POLICY);
    expect(block).toContain('is_archived = false');
    expect(block).toContain("ap.name = 'documents.view'");
    expect(block).toContain('is_resident_accessible = true');
    expect(block).toContain('can_view_private_document(documents.resident_id, documents.house_id)');
  });

  it('storage policy is scoped to the bucket and maps object to document', () => {
    const block = policyBlock(STORAGE_POLICY);
    expect(block).toContain("bucket_id = 'documents'");
    expect(block).toContain('can_read_document_file(name)');
  });

  it('private helper encodes linked resident, active house and documents.update', () => {
    const fn = fnBlock('can_view_private_document');
    expect(fn).toContain('pr.resident_id = p_resident_id');
    expect(fn).toContain('rh.house_id = p_house_id');
    expect(fn).toContain('rh.is_active = true');
    expect(fn).toContain("has_permission('documents.update')");
  });

  it('file helper joins on file_path and fails closed for orphans', () => {
    const fn = fnBlock('can_read_document_file');
    expect(fn).toContain('d.file_path = p_object_name');
    expect(fn).toContain('can_view_private_document(d.resident_id, d.house_id)');
    expect(fn).toContain("ELSE public.has_permission('documents.update')");
  });

  it.each(['can_view_private_document', 'can_read_document_file'])(
    '%s is SECURITY DEFINER STABLE with pinned search_path',
    (name) => {
      const fn = fnBlock(name);
      expect(fn).toContain('SECURITY DEFINER');
      expect(fn).toContain('STABLE');
      expect(fn).toContain("SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'");
    }
  );

  it('EXECUTE is revoked from PUBLIC and anon and never granted to them', () => {
    expect(active).toContain(
      'REVOKE EXECUTE ON FUNCTION public.can_view_private_document(uuid, uuid) FROM PUBLIC, anon;'
    );
    expect(active).toContain(
      'REVOKE EXECUTE ON FUNCTION public.can_read_document_file(text) FROM PUBLIC, anon;'
    );
    expect(active).toContain(
      'GRANT EXECUTE ON FUNCTION public.can_view_private_document(uuid, uuid) TO authenticated;'
    );
    expect(active).toContain(
      'GRANT EXECUTE ON FUNCTION public.can_read_document_file(text) TO authenticated;'
    );
    expect(active).not.toMatch(/GRANT[^;]*\sTO\s[^;]*\b(anon|PUBLIC)\b/i);
  });

  it('does not name security_officer or hardcode role names in the new logic', () => {
    expect(active).not.toContain('security_officer');
    const helpers = fnBlock('can_view_private_document') + fnBlock('can_read_document_file');
    expect(helpers).not.toMatch(/\bar\.name|app_roles|get_my_role/);
    expect(policyBlock(STORAGE_POLICY)).not.toMatch(/app_roles|\bar\.name/);
  });

  it('rollback restores both live policies and drops both helpers', () => {
    expect(rollback).toContain(`-- CREATE POLICY "${DOC_POLICY}"`);
    expect(rollback).toContain(`-- CREATE POLICY "${STORAGE_POLICY}"`);
    expect(rollback).toContain("ar.name <> 'resident'");
    expect(rollback).toContain("ap.name = 'documents.view'");
    expect(rollback).toContain('DROP FUNCTION IF EXISTS public.can_read_document_file(text);');
    expect(rollback).toContain(
      'DROP FUNCTION IF EXISTS public.can_view_private_document(uuid, uuid);'
    );
  });
});
