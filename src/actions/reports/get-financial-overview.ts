'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
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

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      summary: { totalCredits: 0, totalDebits: 0, netBalance: 0, transactionCount: 0 },
      byTag: [],
      error: 'Unauthorized',
    };
  }

  // Check user role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const allowedRoles = ['admin', 'chairman', 'financial_secretary'];
  if (!profile || !allowedRoles.includes(profile.role)) {
    return {
      summary: { totalCredits: 0, totalDebits: 0, netBalance: 0, transactionCount: 0 },
      byTag: [],
      error: 'Forbidden',
    };
  }

  try {
    // Build query for bank statement rows
    let query = supabase
      .from('bank_statement_rows')
      .select(`
        id,
        amount,
        transaction_type,
        tag_id,
        transaction_tags (
          id,
          name,
          color,
          transaction_type
        ),
        bank_statement_imports!inner (
          id,
          bank_account_id,
          status
        )
      `)
      .gte('transaction_date', params.startDate)
      .lte('transaction_date', params.endDate)
      .eq('bank_statement_imports.status', 'completed');

    // Filter by bank account if specified
    if (params.bankAccountId) {
      query = query.eq('bank_statement_imports.bank_account_id', params.bankAccountId);
    }

    // Filter by transaction type if specified
    if (params.transactionType && params.transactionType !== 'all') {
      query = query.eq('transaction_type', params.transactionType);
    }

    const { data: rows, error } = await query;

    if (error) {
      console.error('Error fetching financial overview:', error);
      return {
        summary: { totalCredits: 0, totalDebits: 0, netBalance: 0, transactionCount: 0 },
        byTag: [],
        error: error.message,
      };
    }

    // Calculate summary
    let totalCredits = 0;
    let totalDebits = 0;
    const tagTotals: Map<
      string | null,
      { tagName: string; tagColor: string; transactionType: TransactionTagType; count: number; total: number }
    > = new Map();

    for (const row of rows || []) {
      const amount = Number(row.amount) || 0;

      if (row.transaction_type === 'credit') {
        totalCredits += amount;
      } else if (row.transaction_type === 'debit') {
        totalDebits += amount;
      }

      // Group by tag
      const tagId = row.tag_id || null;
      // The join returns an object or null (not array) because it's a single relation
      const tag = row.transaction_tags as unknown as { id: string; name: string; color: string; transaction_type: TransactionTagType } | null;
      const tagName = tag?.name || 'Untagged';
      const tagColor = tag?.color || 'gray';
      const transactionType = (row.transaction_type || 'credit') as TransactionTagType;

      const existing = tagTotals.get(tagId);
      if (existing) {
        existing.count += 1;
        existing.total += amount;
      } else {
        tagTotals.set(tagId, {
          tagName,
          tagColor,
          transactionType,
          count: 1,
          total: amount,
        });
      }
    }

    // Convert map to array
    const byTag: TagBreakdown[] = Array.from(tagTotals.entries()).map(([tagId, data]) => ({
      tagId,
      tagName: data.tagName,
      tagColor: data.tagColor,
      transactionType: data.transactionType,
      count: data.count,
      total: data.total,
    }));

    // Sort by total (descending)
    byTag.sort((a, b) => b.total - a.total);

    return {
      summary: {
        totalCredits,
        totalDebits,
        netBalance: totalCredits - totalDebits,
        transactionCount: rows?.length || 0,
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
