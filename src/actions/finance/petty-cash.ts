'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit/logger';
import type { PettyCashAccount } from '@/types/database';

// ============================================================
// Petty Cash Metrics & Management
// Updated for Unified Expenditure Engine
// ============================================================

export interface PettyCashMetrics {
    accounts: PettyCashAccountSummary[];
    totalBalance: number;
    totalSpentThisMonth: number;
    pendingReconciliations: number;
    metrics: {
        totalSpentThisMonth: number;
        pendingReconciliations: number;
        averageDailySpend: number;
    };
    recentTransactions: PettyCashTransaction[];
}

export interface PettyCashAccountSummary {
    id: string;
    name: string;
    currentBalance: number;
    initialFloat: number;
    lastReplenishmentAt: string | null;
    isActive: boolean;
}

export interface PettyCashTransaction {
    id: string;
    description: string | null;
    amount: number;
    expenseDate: string;
    status: string;
    vendorName: string | null;
    isVerified: boolean;
    accountName: string | null;
}

export async function getPettyCashMetrics(): Promise<PettyCashMetrics> {
    const supabase = await createServerSupabaseClient();

    // 1. Get all active petty cash accounts
    const { data: accounts, error: accountError } = await supabase
        .from('petty_cash_accounts')
        .select('*')
        .eq('is_active', true)
        .order('name');

    if (accountError) {
        console.error('Error fetching petty cash accounts:', accountError);
    }

    const accountSummaries: PettyCashAccountSummary[] = (accounts || []).map((acc) => ({
        id: acc.id,
        name: acc.name,
        currentBalance: Number(acc.current_balance) || 0,
        initialFloat: Number(acc.initial_float) || 0,
        lastReplenishmentAt: acc.last_replenishment_at,
        isActive: acc.is_active,
    }));

    const totalBalance = accountSummaries.reduce((sum, acc) => sum + acc.currentBalance, 0);

    // 2. Get Petty Cash Expenses for this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: monthExpenses, error: expensesError } = await supabase
        .from('expenses')
        .select('amount, status, expense_date')
        .eq('source_type', 'petty_cash')
        .gte('expense_date', startOfMonth.toISOString());

    if (expensesError) {
        console.error('Error fetching petty cash expenses:', expensesError);
    }

    const totalSpentThisMonth = monthExpenses?.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0) || 0;

    // Calculate average daily spend
    const today = new Date();
    const daysInMonth = today.getDate();
    const averageDailySpend = daysInMonth > 0 ? totalSpentThisMonth / daysInMonth : 0;

    // 3. Get Pending Reconciliations (Petty cash expenses with status 'pending')
    const { count: pendingCount } = await supabase
        .from('expenses')
        .select('*', { count: 'exact', head: true })
        .eq('source_type', 'petty_cash')
        .eq('status', 'pending');

    // 4. Get Recent Petty Cash Transactions (last 10)
    const { data: recent } = await supabase
        .from('expenses')
        .select(`
            id,
            description,
            amount,
            expense_date,
            status,
            is_verified,
            vendor:vendors(name),
            petty_cash_account:petty_cash_accounts(name)
        `)
        .eq('source_type', 'petty_cash')
        .order('expense_date', { ascending: false })
        .limit(10);

    const recentTransactions: PettyCashTransaction[] = (recent || []).map((exp) => ({
        id: exp.id,
        description: exp.description,
        amount: Number(exp.amount) || 0,
        expenseDate: exp.expense_date,
        status: exp.status,
        isVerified: exp.is_verified,
        vendorName: (exp.vendor as unknown as { name: string } | null)?.name || null,
        accountName: (exp.petty_cash_account as unknown as { name: string } | null)?.name || null,
    }));

    return {
        accounts: accountSummaries,
        totalBalance,
        totalSpentThisMonth,
        pendingReconciliations: pendingCount || 0,
        metrics: {
            totalSpentThisMonth,
            pendingReconciliations: pendingCount || 0,
            averageDailySpend: Math.round(averageDailySpend * 100) / 100,
        },
        recentTransactions,
    };
}

// ============================================================
// Petty Cash Account Management
// ============================================================

export async function createPettyCashAccount(input: {
    name: string;
    initialFloat: number;
    notes?: string;
}): Promise<{ data: PettyCashAccount | null; error: string | null }> {
    const supabase = await createServerSupabaseClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { data: null, error: 'Unauthorized' };
    }

    const { data, error } = await supabase
        .from('petty_cash_accounts')
        .insert([{
            name: input.name,
            initial_float: input.initialFloat,
            current_balance: input.initialFloat, // Start with full float
            notes: input.notes,
            created_by: user.id,
        }])
        .select()
        .single();

    if (error) {
        console.error('Error creating petty cash account:', error);
        return { data: null, error: 'Failed to create petty cash account' };
    }

    await logAudit({
        action: 'CREATE',
        entityType: 'petty_cash_accounts',
        entityId: data.id,
        entityDisplay: `Petty Cash: ${input.name}`,
        newValues: {
            name: input.name,
            initial_float: input.initialFloat,
        },
    });

    revalidatePath('/expenditure');

    return { data: data as PettyCashAccount, error: null };
}

export async function replenishPettyCashAccount(
    accountId: string,
    amount: number,
    notes?: string
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createServerSupabaseClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { success: false, error: 'Unauthorized' };
    }

    // Fetch current account
    const { data: account, error: fetchError } = await supabase
        .from('petty_cash_accounts')
        .select('*')
        .eq('id', accountId)
        .single();

    if (fetchError || !account) {
        return { success: false, error: 'Petty cash account not found' };
    }

    const oldBalance = Number(account.current_balance) || 0;
    const newBalance = oldBalance + amount;

    // Update the account
    const { error: updateError } = await supabase
        .from('petty_cash_accounts')
        .update({
            current_balance: newBalance,
            last_replenishment_at: new Date().toISOString(),
            last_replenishment_amount: amount,
            last_replenishment_by: user.id,
            updated_at: new Date().toISOString(),
        })
        .eq('id', accountId);

    if (updateError) {
        console.error('Error replenishing petty cash:', updateError);
        return { success: false, error: 'Failed to replenish petty cash account' };
    }

    await logAudit({
        action: 'UPDATE',
        entityType: 'petty_cash_accounts',
        entityId: accountId,
        entityDisplay: `Petty Cash Replenishment: ${account.name}`,
        oldValues: { current_balance: oldBalance },
        newValues: {
            current_balance: newBalance,
            replenishment_amount: amount,
            notes,
        },
    });

    revalidatePath('/expenditure');

    return { success: true };
}

export async function recordCashCollection(
    accountId: string,
    amount: number,
    description: string
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createServerSupabaseClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { success: false, error: 'Unauthorized' };
    }

    // Fetch current account
    const { data: account, error: fetchError } = await supabase
        .from('petty_cash_accounts')
        .select('*')
        .eq('id', accountId)
        .single();

    if (fetchError || !account) {
        return { success: false, error: 'Petty cash account not found' };
    }

    const oldBalance = Number(account.current_balance) || 0;
    const newBalance = oldBalance + amount;

    // Update the account
    const { error: updateError } = await supabase
        .from('petty_cash_accounts')
        .update({
            current_balance: newBalance,
            updated_at: new Date().toISOString(),
        })
        .eq('id', accountId);

    if (updateError) {
        console.error('Error recording cash collection:', updateError);
        return { success: false, error: 'Failed to record cash collection' };
    }

    // Log this collection as an expense with special type/flag or just audit?
    // User requirement: "track cash positions - monies collected... ability to expend"
    // Ideally we should have a transaction log. For now, we update balance and log audit.
    // In a full accounting system we'd insert into a 'transactions' table.
    // 'expenses' table is for MONEY OUT. We don't have an 'income' table besides bank_statement_rows.
    // To make it show in Financial Report as Income, we might need a workaround or just rely on 'petty_cash_accounts' balance changes if we tracked history.
    // BUT the requirement says "expenses info to the financial report". It doesn't explicitly say "Cash Income" must be a line item in the report,
    // but implied by "track cash positions".
    // For now, updating balance allows tracking "Position".

    await logAudit({
        action: 'UPDATE',
        entityType: 'petty_cash_accounts',
        entityId: accountId,
        entityDisplay: `Cash Collection: ${description}`,
        oldValues: { current_balance: oldBalance },
        newValues: {
            current_balance: newBalance,
            collection_amount: amount,
            description,
        },
    });

    revalidatePath('/expenditure');

    return { success: true };
}

export async function getPettyCashAccounts(): Promise<PettyCashAccount[]> {
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
        .from('petty_cash_accounts')
        .select('*')
        .order('name');

    if (error) {
        console.error('Error fetching petty cash accounts:', error);
        return [];
    }

    return (data || []) as PettyCashAccount[];
}
