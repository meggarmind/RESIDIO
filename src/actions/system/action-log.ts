'use server';

import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * Read-only access to the System Action Log (#538). Uses the session client so the table's
 * RLS policy (`has_permission('system.view_system_log')`) applies on top of the check below.
 */

export type SystemActionOutcome = 'success' | 'partial' | 'failure';

export interface SystemActionLogRow {
  id: string;
  occurred_at: string;
  source: string;
  action: string;
  outcome: SystemActionOutcome;
  summary: Record<string, unknown> | null;
  error_message: string | null;
  duration_ms: number | null;
}

export interface SystemActionLogFilters {
  source?: string;
  outcome?: SystemActionOutcome;
  /** ISO timestamp, inclusive. */
  startDate?: string;
  /** ISO timestamp, inclusive. */
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface SystemActionLogPage {
  data: SystemActionLogRow[];
  total: number;
  page: number;
  limit: number;
}

const OUTCOMES = new Set<string>(['success', 'partial', 'failure']);
const MAX_LIMIT = 100;

// The table is not in database.generated.ts until db:types is rerun, so the cast is confined
// to these types (same approach as createSystemLogSink in @/lib/system-log/recorder).
interface LogQuery
  extends PromiseLike<{
    data: SystemActionLogRow[] | null;
    count: number | null;
    error: { message: string } | null;
  }> {
  order: (column: string, opts: { ascending: boolean }) => LogQuery;
  range: (from: number, to: number) => LogQuery;
  eq: (column: string, value: string) => LogQuery;
  ilike: (column: string, pattern: string) => LogQuery;
  gte: (column: string, value: string) => LogQuery;
  lte: (column: string, value: string) => LogQuery;
}
type UntypedClient = {
  from: (table: string) => {
    select: (columns: string, opts: { count: 'exact' }) => LogQuery;
  };
};

export async function getSystemActionLog(
  filters: SystemActionLogFilters = {}
): Promise<{ data: SystemActionLogPage | null; error: string | null }> {
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_VIEW_SYSTEM_LOG);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(filters.limit ?? 25)));
  const from = (page - 1) * limit;

  const supabase = (await createServerSupabaseClient()) as unknown as UntypedClient;
  let query = supabase
    .from('system_action_log')
    .select('id, occurred_at, source, action, outcome, summary, error_message, duration_ms', {
      count: 'exact',
    })
    .order('occurred_at', { ascending: false })
    .range(from, from + limit - 1);

  const source = filters.source?.trim();
  if (source) {
    // Escape LIKE wildcards so the filter is a plain substring match.
    query = query.ilike('source', `%${source.replace(/[\\%_]/g, '\\$&')}%`);
  }
  if (filters.outcome && OUTCOMES.has(filters.outcome)) query = query.eq('outcome', filters.outcome);
  if (filters.startDate) query = query.gte('occurred_at', filters.startDate);
  if (filters.endDate) query = query.lte('occurred_at', filters.endDate);

  const { data, count, error } = await query;
  if (error) {
    console.error('[getSystemActionLog] query failed', { error: error.message, filters });
    return { data: null, error: error.message };
  }

  return { data: { data: data ?? [], total: count ?? 0, page, limit }, error: null };
}
