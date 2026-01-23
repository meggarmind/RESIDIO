import { createServerSupabaseClient } from '@/lib/supabase/server';
import Fuse from 'fuse.js';
import { calculateDuplicateScore } from './duplicate-scoring';

export interface DuplicateCheckResult {
    isDuplicate: boolean;
    score: number; // 0-100% confidence
    reason?: string;
    existingId?: string;
    matchType?: 'exact' | 'fuzzy' | 'none';
}

export interface DuplicateCheckOptions {
    threshold?: number; // Override system setting
    toleranceDays?: number;
}


/**
 * Check transaction against database for duplicates
 */
export async function checkDuplicateGuardrail(
    transaction: {
        amount: number;
        description?: string;
        date: Date | string;
        residentId?: string; // For payments
        reference?: string;
    },
    entityType: 'payment' | 'expense' | 'petty_cash',
    options: DuplicateCheckOptions = {}
): Promise<DuplicateCheckResult> {
    const supabase = await createServerSupabaseClient();
    const dateObj = new Date(transaction.date);
    const toleranceDays = options.toleranceDays || 1;
    const toleranceMs = toleranceDays * 24 * 60 * 60 * 1000;

    // 1. Get System Threshold
    let threshold = options.threshold;
    if (threshold === undefined) {
        // Fetch from settings if not provided
        // Since settings are hierarchical, we fetch 'estate' level or use defaults
        // Note: This fetch might be cached or optimized in real app
        const { data: setting } = await supabase
            .from('hierarchical_settings')
            .select('value')
            .eq('setting_key', 'duplicate_matching_threshold')
            .maybeSingle();

        threshold = setting ? Number(setting.value) : 90; // Default 90%
    }

    // 2. Exact Match (Reference)
    if (transaction.reference) {
        const table = entityType === 'expense' ? 'expenses' :
            entityType === 'petty_cash' ? 'petty_cash_transactions' : // Assuming table name
                'payment_records';

        // Expenses/Petty cash might not enforce unique Ref, but payments usually do.
        // If strict match on Ref, it's 100% duplicate.
        const { data: exactRef } = await supabase
            .from(table)
            .select('id')
            .eq('reference_number', transaction.reference)
            .maybeSingle();

        if (exactRef) {
            return {
                isDuplicate: true,
                score: 100,
                reason: `Duplicate reference number: ${transaction.reference}`,
                existingId: exactRef.id,
                matchType: 'exact'
            };
        }
    }

    // 3. Find Candidates (Amount + Date Window)
    const startDate = new Date(dateObj.getTime() - toleranceMs).toISOString();
    const endDate = new Date(dateObj.getTime() + toleranceMs).toISOString();

    let query = supabase.from(
        entityType === 'expense' ? 'expenses' : 'payment_records'
    ).select('id, description, amount, payment_date, expense_date');

    // Filter
    query = query
        .eq('amount', transaction.amount)
        .gte(entityType === 'expense' ? 'expense_date' : 'payment_date', startDate)
        .lte(entityType === 'expense' ? 'expense_date' : 'payment_date', endDate);

    if (entityType === 'payment' && transaction.residentId) {
        query = query.eq('resident_id', transaction.residentId);
    }

    const { data: candidates } = await query;

    if (!candidates || candidates.length === 0) {
        return { isDuplicate: false, score: 0, matchType: 'none' };
    }

    // 4. Calculate Scores
    let bestMatch: DuplicateCheckResult | null = null;
    let highestScore = 0;

    for (const candidate of candidates) {
        const candidateDate = new Date(candidate.payment_date || candidate.expense_date);
        const score = calculateDuplicateScore(
            {
                amount: transaction.amount,
                date: dateObj,
                description: transaction.description
            },
            {
                amount: candidate.amount,
                date: candidateDate,
                description: candidate.description
            }
        );

        if (score > highestScore) {
            highestScore = score;
            bestMatch = {
                isDuplicate: score >= threshold,
                score,
                existingId: candidate.id,
                reason: `Potential duplicate with ${score}% confidence (Threshold: ${threshold}%)`,
                matchType: score === 100 ? 'exact' : 'fuzzy'
            };
        }
    }

    return bestMatch || { isDuplicate: false, score: 0, matchType: 'none' };
}
