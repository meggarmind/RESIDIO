import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static checks on the impersonation_sessions migration (#1063). The admin a
 * session records must not be able to UPDATE it directly; ending a session and
 * appending a page view go through two narrow functions. Only the migration
 * text is pinned; nothing here connects to a database.
 */

const root = fileURLToPath(new URL('../..', import.meta.url));
const sql = readFileSync(
  path.join(root, 'supabase/migrations/20261027120000_impersonation_sessions_no_self_edit.sql'),
  'utf8',
)
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')
  .replace(/\s+/g, ' ')
  .trim();

function fn(name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  return sql.slice(start, sql.indexOf('$$;', start));
}

describe('impersonation_sessions self-edit migration (static)', () => {
  it('drops the unrestricted self-update policy and creates no other UPDATE policy', () => {
    expect(sql).toContain(
      'DROP POLICY IF EXISTS "admins_update_own_impersonation_sessions" ON public.impersonation_sessions',
    );
    expect(sql).not.toMatch(/CREATE POLICY[^;]*FOR UPDATE/);
    expect(sql).not.toMatch(/GRANT UPDATE/i);
  });

  it('end_impersonation_session sets only is_active and ended_at on the caller\'s own active session', () => {
    const body = fn('end_impersonation_session');
    expect(body).toContain('SECURITY DEFINER');
    expect(body).toContain('SET search_path = public, pg_temp');
    expect(body).toContain('SET is_active = false, ended_at = now() WHERE');
    expect(body).toContain('admin_profile_id = (select auth.uid())');
    expect(body).toContain('is_active = true');
  });

  it('log_impersonation_page_view only appends to page_views on the caller\'s own active session', () => {
    const body = fn('log_impersonation_page_view');
    expect(body).toContain('SECURITY DEFINER');
    expect(body).toContain("SET page_views = coalesce(page_views, '[]'::jsonb) || jsonb_build_array(");
    expect(body).toContain('admin_profile_id = (select auth.uid())');
    expect(body).toContain('is_active = true');
  });

  it('lets only signed-in accounts run the two functions', () => {
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.end_impersonation_session(uuid) FROM PUBLIC, anon');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.log_impersonation_page_view(uuid, text) FROM PUBLIC, anon');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.end_impersonation_session(uuid) TO authenticated');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.log_impersonation_page_view(uuid, text) TO authenticated');
  });

  it('keeps the end-previous-sessions trigger working without the UPDATE policy', () => {
    expect(sql).toContain('ALTER FUNCTION public.end_previous_impersonation_sessions() SECURITY DEFINER');
  });
});
