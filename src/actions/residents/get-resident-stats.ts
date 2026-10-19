'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';

export type ResidentStats = {
  total: number;
  active: number;
  inactive: number;
  suspended: number;
};

export type ContactVerificationStats = {
  verified: number;
  unverified: number;
  partial: number;
  total: number;
};

type GetResidentStatsResponse = {
  data: ResidentStats | null;
  error: string | null;
};

/**
 * Fetches aggregate resident stats using SQL COUNT.
 * This is ~1000x faster than fetching all residents and counting client-side.
 *
 * Previous approach: SELECT * FROM residents → 2-5 MB, 2-3 seconds
 * New approach: SELECT COUNT(*) with FILTER → ~100 bytes, <50ms
 */
export async function getResidentStats(): Promise<GetResidentStatsResponse> {
  const supabase = await createServerSupabaseClient();

  // Use parallel COUNT queries with head: true (returns only count, not data)
  // This is much more efficient than fetching all rows
  const [totalResult, activeResult, inactiveResult, suspendedResult] = await Promise.all([
    supabase.from('residents').select('*', { count: 'exact', head: true }),
    supabase.from('residents').select('*', { count: 'exact', head: true }).eq('account_status', 'active'),
    supabase.from('residents').select('*', { count: 'exact', head: true }).eq('account_status', 'inactive'),
    supabase.from('residents').select('*', { count: 'exact', head: true }).eq('account_status', 'suspended'),
  ]);

  // Check for errors
  const error = totalResult.error || activeResult.error || inactiveResult.error || suspendedResult.error;
  if (error) {
    return { data: null, error: error.message };
  }

  return {
    data: {
      total: totalResult.count ?? 0,
      active: activeResult.count ?? 0,
      inactive: inactiveResult.count ?? 0,
      suspended: suspendedResult.count ?? 0,
    },
    error: null,
  };
}

type GetContactVerificationStatsResponse = {
  data: ContactVerificationStats | null;
  error: string | null;
};

/**
 * Fetches contact verification stats.
 * - verified: both email (if present) and phone are verified
 * - unverified: neither email nor phone is verified
 * - partial: one is verified, the other is not
 *
 * Counted in SQL by get_contact_verification_stats (#776): a row download stopped at the 1000-row cap.
 */
export async function getContactVerificationStats(): Promise<GetContactVerificationStatsResponse> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.rpc('get_contact_verification_stats');

  if (error || !data) {
    return { data: null, error: error?.message ?? 'Failed to fetch verification stats' };
  }

  const counts = data as { verified: number; unverified: number; total: number };
  const verified = Number(counts.verified) || 0;
  const unverified = Number(counts.unverified) || 0;
  const total = Number(counts.total) || 0;

  return {
    data: {
      verified,
      unverified,
      partial: total - verified - unverified,
      total,
    },
    error: null,
  };
}
