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

  it('touches exactly two policies and leaves INSERT and own-row SELECT alone', () => {
    expect(sql).not.toContain('Users can create their own approval requests');
    expect(sql).not.toContain('Users can view their own approval requests');
    expect(sql.match(/CREATE POLICY/g)).toHaveLength(2);
    expect(sql.match(/DROP POLICY/g)).toHaveLength(2);
  });
});
