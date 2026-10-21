import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * #992: get_frequent_visitors and get_visitor_history_summary must refuse callers without
 * security.view_logs (the permission their server actions check), and get_primary_occupier is
 * server-only. The migration text is pinned statically; the database behaviour is proved by
 * docs/security/probe-992-function-grants.sql. The server-action half runs with fakes.
 */

const authorizePermission = vi.fn();
const createServerSupabaseClient = vi.fn();

vi.mock('@/lib/auth/authorize', () => ({
  authorizePermission: (...a: unknown[]) => authorizePermission(...a),
}));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: () => createServerSupabaseClient() }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { getFrequentVisitors, getVisitorHistorySummary } from '@/actions/security/visitor-analytics';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');
const normalize = (s: string) =>
  s
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim();

const MIGRATION = 'supabase/migrations/20261024091200_contact_detail_functions_require_permission.sql';
const sql = normalize(read(MIGRATION));
const baseline = normalize(read('supabase/baseline/00000000000000_baseline.sql'));

/** The CREATE OR REPLACE statement for one function, up to its closing $function$. */
function definition(text: string, fn: string): string {
  const start = text.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
  expect(start, `${fn} definition`).toBeGreaterThanOrEqual(0);
  const bodyStart = text.indexOf('$function$', start);
  const end = text.indexOf('$function$', bodyStart + 1);
  return text.slice(start, end + '$function$'.length);
}

const VIEW_LOGS_GUARD =
  "IF NOT public.has_permission('security.view_logs') THEN RAISE EXCEPTION 'Permission denied: security.view_logs is required' USING ERRCODE = '42501'; END IF;";
const SERVER_ONLY_GUARD =
  "IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'Permission denied: get_primary_occupier is for server use only' USING ERRCODE = '42501'; END IF;";

const GUARDS: Record<string, string> = {
  get_frequent_visitors: VIEW_LOGS_GUARD,
  get_visitor_history_summary: VIEW_LOGS_GUARD,
  get_primary_occupier: SERVER_ONLY_GUARD,
};

describe('#992 migration (static)', () => {
  it.each(Object.entries(GUARDS))('%s checks the caller before returning any row', (fn, guard) => {
    const def = definition(sql, fn);
    expect(def).toContain(`BEGIN ${guard} RETURN QUERY`);
    expect(def).toContain('SECURITY DEFINER');
    expect(def).toContain("SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'");
  });

  it.each(Object.entries(GUARDS))('%s keeps the baseline body apart from the guard', (fn, guard) => {
    const guarded = definition(sql, fn);
    expect(guarded.replace(`${guard} `, '')).toBe(definition(baseline, fn));
  });

  it('gates the visitor functions on the permission their server actions check', () => {
    expect(PERMISSIONS.SECURITY_VIEW_LOGS).toBe('security.view_logs');
    const actions = read('src/actions/security/visitor-analytics.ts');
    for (const [action, rpc] of [
      ['getFrequentVisitors', 'get_frequent_visitors'],
      ['getVisitorHistorySummary', 'get_visitor_history_summary'],
    ]) {
      const start = actions.indexOf(`export async function ${action}(`);
      const body = actions.slice(start, actions.indexOf('\nexport async function', start + 1));
      expect(body).toContain('authorizePermission(PERMISSIONS.SECURITY_VIEW_LOGS)');
      expect(body).toContain(`supabase.rpc('${rpc}'`);
    }
  });

  it('revokes EXECUTE from PUBLIC and anon on all three, and from authenticated on get_primary_occupier', () => {
    expect(sql).toContain(
      'REVOKE EXECUTE ON FUNCTION public.get_frequent_visitors(integer, integer, integer) FROM PUBLIC, anon;'
    );
    expect(sql).toContain(
      'REVOKE EXECUTE ON FUNCTION public.get_visitor_history_summary(uuid, integer) FROM PUBLIC, anon;'
    );
    expect(sql).toContain(
      'REVOKE EXECUTE ON FUNCTION public.get_primary_occupier(uuid) FROM PUBLIC, anon, authenticated;'
    );
  });

  it('grants EXECUTE only where a caller needs it', () => {
    const grants = sql.match(/GRANT EXECUTE ON FUNCTION [^;]+;/g) ?? [];
    expect(grants).toEqual([
      'GRANT EXECUTE ON FUNCTION public.get_frequent_visitors(integer, integer, integer) TO authenticated, service_role;',
      'GRANT EXECUTE ON FUNCTION public.get_visitor_history_summary(uuid, integer) TO authenticated, service_role;',
      'GRANT EXECUTE ON FUNCTION public.get_primary_occupier(uuid) TO service_role;',
    ]);
  });

  it('has a rollback note in its header', () => {
    expect(read(MIGRATION)).toMatch(/^-- Rollback/m);
  });
});

describe('#992 callers', () => {
  it('no code in src/ calls get_primary_occupier (it is server-only now)', () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) {
          if (name !== '__tests__') walk(full);
        } else if (/\.(ts|tsx)$/.test(name) && !name.startsWith('database.generated')) {
          if (readFileSync(full, 'utf8').includes('get_primary_occupier')) hits.push(full);
        }
      }
    };
    walk(path.join(root, 'src'));
    expect(hits).toEqual([]);
  });
});

function fakeClient(result: { data: unknown; error: { code?: string; message: string } | null }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc }, rpc };
}

const allowed = { authorized: true, error: null };
const refused = { authorized: false, error: 'Unauthorized: Missing required permission: security.view_logs' };

describe('#992 visitor server actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('an allowed caller reaches get_frequent_visitors and gets its rows', async () => {
    const rows = [{ contact_id: 'c1', full_name: 'A Visitor' }];
    const { client, rpc } = fakeClient({ data: rows, error: null });
    createServerSupabaseClient.mockResolvedValue(client);
    authorizePermission.mockResolvedValue(allowed);

    const res = await getFrequentVisitors(5, 30, 10);

    expect(authorizePermission).toHaveBeenCalledWith('security.view_logs');
    expect(rpc).toHaveBeenCalledWith('get_frequent_visitors', { p_min_visits: 5, p_days: 30, p_limit: 10 });
    expect(res).toEqual({ data: rows, error: null });
  });

  it('a refused caller never reaches get_frequent_visitors', async () => {
    const { client, rpc } = fakeClient({ data: [], error: null });
    createServerSupabaseClient.mockResolvedValue(client);
    authorizePermission.mockResolvedValue(refused);

    const res = await getFrequentVisitors();

    expect(rpc).not.toHaveBeenCalled();
    expect(res).toEqual({ data: [], error: refused.error });
  });

  it('a database refusal of get_frequent_visitors is reported as an error, not as no visitors', async () => {
    const { client } = fakeClient({ data: null, error: { code: '42501', message: 'Permission denied' } });
    createServerSupabaseClient.mockResolvedValue(client);
    authorizePermission.mockResolvedValue(allowed);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await getFrequentVisitors();

    expect(res.data).toEqual([]);
    expect(res.error).toBe('Failed to fetch frequent visitors');
  });

  it('an allowed caller reaches get_visitor_history_summary and gets its row', async () => {
    const row = { total_visits: 3 };
    const { client, rpc } = fakeClient({ data: [row], error: null });
    createServerSupabaseClient.mockResolvedValue(client);
    authorizePermission.mockResolvedValue(allowed);

    const res = await getVisitorHistorySummary('contact-1', 30);

    expect(authorizePermission).toHaveBeenCalledWith('security.view_logs');
    expect(rpc).toHaveBeenCalledWith('get_visitor_history_summary', { p_contact_id: 'contact-1', p_days: 30 });
    expect(res).toEqual({ data: row, error: null });
  });

  it('a refused caller never reaches get_visitor_history_summary', async () => {
    const { client, rpc } = fakeClient({ data: [], error: null });
    createServerSupabaseClient.mockResolvedValue(client);
    authorizePermission.mockResolvedValue(refused);

    const res = await getVisitorHistorySummary('contact-1');

    expect(rpc).not.toHaveBeenCalled();
    expect(res).toEqual({ data: null, error: refused.error });
  });

  it('a database refusal of get_visitor_history_summary is reported as an error', async () => {
    const { client } = fakeClient({ data: null, error: { code: '42501', message: 'Permission denied' } });
    createServerSupabaseClient.mockResolvedValue(client);
    authorizePermission.mockResolvedValue(allowed);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await getVisitorHistorySummary('contact-1');

    expect(res).toEqual({ data: null, error: 'Failed to fetch history summary' });
  });
});
