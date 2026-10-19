'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import type { TransactionTagType } from '@/types/database';

type FinancialOverviewParams = {
  startDate: string;
  endDate: string;
  transactionType?: 'credit' | 'debit' | 'all';
  bankAccountId?: string;
}

type FinancialSummary = {
  totalCredits: number;
  totalDebits: number;
  netBalance: number;
  transactionCount: number;
}

type TagBreakdown = {
  tagId: string | null;
  tagName: string;
  tagColor: string;
  transactionType: TransactionTagType;
  count: number;
  total: number;
}

type FinancialOverviewResult = {
  summary: FinancialSummary;
  byTag: TagBreakdown[];
  error?: string;
}

export async function getFinancialOverview(
  params: FinancialOverviewParams
): Promise<FinancialOverviewResult> {
  const supabase = await createServerSupabaseClient();

  // Permission check (migrated off the legacy role-list check)
  const auth = await authorizePermission(PERMISSIONS.REPORTS_VIEW_FINANCIAL);
  if (!auth.authorized) {
    return {
      summary: { totalCredits: 0, totalDebits: 0, netBalance: 0, transactionCount: 0 },
      byTag: [],
      error: auth.error || 'Forbidden',
    };
  }

  try {
    // Aggregated in SQL by get_financial_overview (#776): a row download stopped at the 1000-row cap.
    const { data, error } = await supabase.rpc('get_financial_overview', {
      p_start_date: params.startDate,
      p_end_date: params.endDate,
      p_bank_account_id: params.bankAccountId || null,
      p_transaction_type: params.transactionType && params.transactionType !== 'all' ? params.transactionType : null,
    });

    if (error || !data) {
      console.error('Error fetching financial overview:', error);
      return {
        summary: { totalCredits: 0, totalDebits: 0, netBalance: 0, transactionCount: 0 },
        byTag: [],
        error: error?.message ?? 'Failed to fetch financial overview',
      };
    }

    const overview = data as {
      total_credits: number | string;
      total_debits: number | string;
      transaction_count: number;
      by_tag: Array<{
        tag_id: string | null;
        tag_name: string;
        tag_color: string;
        transaction_type: TransactionTagType;
        count: number;
        total: number | string;
      }>;
    };

    // Already sorted by total (descending) in SQL
    const byTag: TagBreakdown[] = (overview.by_tag ?? []).map((tag) => ({
      tagId: tag.tag_id,
      tagName: tag.tag_name,
      tagColor: tag.tag_color,
      transactionType: tag.transaction_type,
      count: Number(tag.count) || 0,
      total: Number(tag.total) || 0,
    }));

    const totalCredits = Number(overview.total_credits) || 0;
    const totalDebits = Number(overview.total_debits) || 0;

    return {
      summary: {
        totalCredits,
        totalDebits,
        netBalance: totalCredits - totalDebits,
        transactionCount: Number(overview.transaction_count) || 0,
      },
      byTag,
    };
  } catch (err) {
    console.error('Error in getFinancialOverview:', err);
    return {
      summary: { totalCredits: 0, totalDebits: 0, netBalance: 0, transactionCount: 0 },
      byTag: [],
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// Get bank accounts for filter dropdown
export async function getBankAccountsForFilter() {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('estate_bank_accounts')
    .select('id, account_number, account_name, bank_name')
    .eq('is_active', true)
    .order('account_name');

  if (error) {
    console.error('Error fetching bank accounts:', error);
    return [];
  }

  return data || [];
}
