import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Issue #383 part B. Structural assertions over the migration: nothing here
 * connects to a database. The migration adds two RESTRICTIVE SELECT policies
 * (documents table and storage.objects) and leaves the live permissive
 * policies alone.
 */

const FILE = '20261014110000_private_documents_access.sql';
const migration = readFileSync(
  path.join(fileURLToPath(new URL('../../supabase/migrations', import.meta.url)), FILE),
  'utf8'
).replace(/\r\n/g, '\n');

const activeSql = migration.match(/^BEGIN;[\s\S]*?^COMMIT;/m)?.[0] ?? '';
const active = activeSql.replace(/--[^\n]*/g, '');
const rollback = migration.slice(migration.indexOf('-- ROLLBACK'), migration.indexOf('\nBEGIN;'));

function policyBlock(name: string): string {
  const start = active.indexOf(`CREATE POLICY "${name}"`);
  if (start === -1) return '';
  return active.slice(start, active.indexOf(';', start) + 1);
}

function fnBlock(name: string): string {
  const start = active.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  if (start === -1) return '';
  const end = active.indexOf('$$;', active.indexOf('$$', start) + 2);
  return active.slice(start, end + 3);
}

const DOC_POLICY = 'Private documents visible to linked resident or editors';
const STORAGE_POLICY = 'Document files follow document visibility';
const LIVE_POLICIES = [
  'Users can view documents based on permissions',
  'Users can download documents from storage',
];

describe('#383 part B private documents migration', () => {
  it('runs in a transaction', () => {
    expect(activeSql).not.toBe('');
  });

  it.each([
    [DOC_POLICY, 'public.documents'],
    [STORAGE_POLICY, 'storage.objects'],
  ])('adds RESTRICTIVE SELECT policy "%s" on %s idempotently', (policy, table) => {
    expect(active).toContain(`DROP POLICY IF EXISTS "${policy}" ON ${table};`);
    expect(policyBlock(policy)).toContain(`ON ${table} AS RESTRICTIVE FOR SELECT TO authenticated`);
  });

  it('documents restriction calls the private-visibility helper', () => {
    expect(policyBlock(DOC_POLICY)).toContain(
      'USING (public.can_view_private_document(resident_id, house_id))'
    );
  });

  it('storage restriction lets other buckets through and gates the documents bucket', () => {
    expect(policyBlock(STORAGE_POLICY)).toContain(
      "USING (bucket_id <> 'documents' OR public.can_read_document_file(name))"
    );
  });

  it.each(LIVE_POLICIES)('does not drop or recreate the live policy "%s"', (live) => {
    expect(active).not.toContain(live);
    expect(active).not.toMatch(/DROP POLICY[^;]*Users can (view|download)/);
  });

  it('only creates restrictive policies', () => {
    const creates = active.match(/CREATE POLICY[^;]*;/g) ?? [];
    expect(creates).toHaveLength(2);
    for (const c of creates) expect(c).toContain('AS RESTRICTIVE');
  });

  it('private helper encodes linked resident, active house and documents.update', () => {
    const fn = fnBlock('can_view_private_document');
    expect(fn).toContain('pr.resident_id = p_resident_id');
    expect(fn).toContain('rh.house_id = p_house_id');
    expect(fn).toContain('rh.is_active = true');
    expect(fn).toContain("pr.approval_status = 'active'");
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

  it('names no roles at all in executable SQL', () => {
    expect(active).not.toContain('security_officer');
    expect(active).not.toMatch(/app_roles|\bar\.name|get_my_role|\br\.name/);
  });

  it('rollback drops both restrictive policies and both helpers', () => {
    expect(rollback).toContain(
      `DROP POLICY IF EXISTS "${DOC_POLICY}" ON public.documents;`
    );
    expect(rollback).toContain(
      `DROP POLICY IF EXISTS "${STORAGE_POLICY}" ON storage.objects;`
    );
    expect(rollback).toContain('DROP FUNCTION IF EXISTS public.can_read_document_file(text);');
    expect(rollback).toContain(
      'DROP FUNCTION IF EXISTS public.can_view_private_document(uuid, uuid);'
    );
  });
});
