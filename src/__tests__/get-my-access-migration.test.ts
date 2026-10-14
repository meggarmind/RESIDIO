import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static checks on the get_my_access() migration (#534). The SQL gate cannot be
 * exercised without a database, so this only pins the text of the migration:
 * the security attributes, the approval gate, and the join shape that makes a
 * role with no permissions still return one row. Behaviour is measured by the
 * owner against the real database, not here.
 */

const root = fileURLToPath(new URL('../..', import.meta.url));
const sql = readFileSync(
  path.join(root, 'supabase/migrations/20261014130000_get_my_access.sql'),
  'utf8',
)
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')
  .replace(/\s+/g, ' ')
  .trim();

describe('get_my_access migration (static)', () => {
  it('defines the function with CREATE OR REPLACE and never drops it', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_my_access()');
    expect(sql).not.toContain('DROP FUNCTION');
  });

  it('is SECURITY DEFINER, STABLE, with the pinned search_path', () => {
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain('STABLE');
    expect(sql).toContain('SET search_path = public, auth, extensions, pg_temp');
  });

  it('gates on the signed-in, approved user', () => {
    expect(sql).toContain('pr.id = auth.uid()');
    expect(sql).toContain("pr.approval_status = 'active'");
  });

  it('left-joins role_permissions and app_permissions so an empty role still returns a row', () => {
    expect(sql).toContain('LEFT JOIN role_permissions rp ON rp.role_id = pr.role_id');
    expect(sql).toContain('LEFT JOIN app_permissions ap');
  });

  it('filters inactive permissions in the join condition, not the WHERE clause', () => {
    expect(sql).toContain('ap.id = rp.permission_id AND ap.is_active = TRUE');
    const where = sql.slice(sql.indexOf('WHERE'));
    expect(where).not.toContain('ap.is_active');
  });

  it('inner-joins app_roles to profiles', () => {
    expect(sql).toContain('JOIN app_roles ar ON ar.id = pr.role_id');
    expect(sql).not.toContain('LEFT JOIN app_roles');
  });

  it('does not filter on app_roles.is_active', () => {
    expect(sql).not.toContain('ar.is_active');
    expect(sql).not.toMatch(/app_roles\.is_active/);
  });

  it('revokes from PUBLIC and anon and grants to authenticated and service_role', () => {
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.get_my_access() FROM PUBLIC, anon;');
    expect(sql).toContain(
      'GRANT EXECUTE ON FUNCTION public.get_my_access() TO authenticated, service_role;',
    );
  });
});
