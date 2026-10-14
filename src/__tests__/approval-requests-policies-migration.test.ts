import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static checks on the approval_requests policy migration (#577). The two
 * staff policies must follow the approvals permissions rather than a hardcoded
 * role-name list, so financial_officer (which holds both permissions) is no
 * longer denied by RLS. Only the migration text is pinned; nothing here
 * connects to a database.
 */

const root = fileURLToPath(new URL('../..', import.meta.url));
const sql = readFileSync(
  path.join(root, 'supabase/migrations/20261014160000_approval_requests_follow_permissions.sql'),
  'utf8',
)
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')
  .replace(/\s+/g, ' ')
  .trim();

const UPDATE_NAME = 'Admin and chairman can update approval requests';
const SELECT_NAME = 'Admin and chairman can view all approval requests';

function createStatement(name: string): string {
  const start = sql.indexOf(`CREATE POLICY "${name}"`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf(';', start);
  return sql.slice(start, end);
}

describe('approval_requests policies migration (static)', () => {
  it('rewrites the UPDATE policy to approvals.approve_reject in USING and WITH CHECK', () => {
    const stmt = createStatement(UPDATE_NAME);
    expect(stmt).toContain('ON public.approval_requests');
    expect(stmt).toContain('FOR UPDATE');
    expect(stmt).toContain("USING (public.has_permission('approvals.approve_reject'))");
    expect(stmt).toContain("WITH CHECK (public.has_permission('approvals.approve_reject'))");
    expect(sql).toContain(`DROP POLICY IF EXISTS "${UPDATE_NAME}" ON public.approval_requests`);
  });

  it('rewrites the SELECT policy to approvals.view', () => {
    const stmt = createStatement(SELECT_NAME);
    expect(stmt).toContain('FOR SELECT');
    expect(stmt).toContain("USING (public.has_permission('approvals.view'))");
    expect(sql).toContain(`DROP POLICY IF EXISTS "${SELECT_NAME}" ON public.approval_requests`);
  });

  it('keeps both policies TO authenticated', () => {
    expect(createStatement(UPDATE_NAME)).toContain('TO authenticated');
    expect(createStatement(SELECT_NAME)).toContain('TO authenticated');
  });

  it('carries no get_my_role_name call and no hardcoded role-name list', () => {
    expect(sql).not.toContain('get_my_role_name');
    expect(sql).not.toContain('ARRAY[');
    for (const role of ['super_admin', 'chairman', 'vice_chairman', 'financial_officer']) {
      expect(sql).not.toContain(`'${role}'`);
    }
  });

  it('drops each policy before creating it', () => {
    for (const name of [UPDATE_NAME, SELECT_NAME]) {
      const drop = sql.indexOf(`DROP POLICY IF EXISTS "${name}"`);
      const create = sql.indexOf(`CREATE POLICY "${name}"`);
      expect(drop).toBeGreaterThanOrEqual(0);
      expect(create).toBeGreaterThanOrEqual(0);
      expect(drop).toBeLessThan(create);
    }
  });

  it('keeps both policies PERMISSIVE on public.approval_requests', () => {
    const upd = createStatement(UPDATE_NAME);
    const sel = createStatement(SELECT_NAME);
    expect(upd).toContain('AS PERMISSIVE FOR UPDATE');
    expect(sel).toContain('AS PERMISSIVE FOR SELECT');
    expect(upd).toContain('ON public.approval_requests');
    expect(sel).toContain('ON public.approval_requests');
  });

  it('contains no grants, ALTERs or RLS changes, and exactly 2 DROP + 2 CREATE statements', () => {
    expect(sql).not.toMatch(/\bGRANT\b/i);
    expect(sql).not.toMatch(/\bREVOKE\b/i);
    expect(sql).not.toMatch(/\bALTER\b/i);
    expect(sql).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
    const statements = sql
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    expect(statements).toHaveLength(4);
    expect(statements.filter((s) => s.startsWith('DROP POLICY IF EXISTS'))).toHaveLength(2);
    expect(statements.filter((s) => s.startsWith('CREATE POLICY'))).toHaveLength(2);
  });

  it('touches exactly two policies and leaves INSERT and own-row SELECT alone', () => {
    expect(sql).not.toContain('Users can create their own approval requests');
    expect(sql).not.toContain('Users can view their own approval requests');
    expect(sql.match(/CREATE POLICY/g)).toHaveLength(2);
    expect(sql.match(/DROP POLICY/g)).toHaveLength(2);
  });
});
