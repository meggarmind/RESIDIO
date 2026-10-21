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

        threshold = resolveDuplicateThreshold(setting); // Default 90%
    }

    // 2. Exact Match (Reference)
    if (transaction.reference) {
        const table = entityType === 'expense' ? 'expenses' :
            entityType === 'petty_cash' ? 'petty_cash_transactions' : // Assuming table name
                'payment_records';

        // Expenses/Petty cash might not enforce unique Ref, but payments usually do.
        // If strict match on Ref, it's 100% duplicate.
        const { data: exactRef, error: exactRefError } = await supabase
            .from(table)
            .select('id')
            .eq('reference_number', transaction.reference)
            .limit(1)
            .maybeSingle();
        if (exactRefError) {
            throw new Error(`Duplicate check failed: ${exactRefError.message}`);
        }

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
    const { startDate, endDate } = duplicateWindow(dateObj, toleranceDays);

    // Only real columns: an unknown column makes PostgREST error, which read as "no duplicate" (#994).
    let query = supabase.from(
        entityType === 'expense' ? 'expenses' : 'payment_records'
    ).select(entityType === 'expense' ? 'id, amount, expense_date, description' : 'id, amount, payment_date, description:notes');

    // Filter
    query = query
        .eq('amount', transaction.amount)
        .gte(entityType === 'expense' ? 'expense_date' : 'payment_date', startDate)
        .lte(entityType === 'expense' ? 'expense_date' : 'payment_date', endDate);

    if (entityType === 'payment' && transaction.residentId) {
        query = query.eq('resident_id', transaction.residentId);
    }

    const { data: candidates, error } = await query;
    if (error) {
        throw new Error(`Duplicate check failed: ${error.message}`);
    }

    if (!candidates || candidates.length === 0) {
        return { isDuplicate: false, score: 0, matchType: 'none' };
    }

    // 4. Calculate Scores
    return pickBestDuplicate(
        { amount: transaction.amount, date: dateObj, description: transaction.description },
        candidates,
        threshold
    );
}

export interface DuplicateCandidate {
    id: string;
    description?: string | null;
    amount: number;
    payment_date?: string | null;
    expense_date?: string | null;
}

/**
 * Pure scoring step shared by the single-row guardrail and the batch import check:
 * the highest-scoring candidate wins (first one on ties); no positive score means "none".
 */
export function pickBestDuplicate(
    transaction: { amount: number; date: Date; description?: string },
    candidates: DuplicateCandidate[],
    threshold: number
): DuplicateCheckResult {
    let bestMatch: DuplicateCheckResult | null = null;
    let highestScore = 0;

    for (const candidate of candidates) {
        const candidateDate = new Date((candidate.payment_date || candidate.expense_date) as string);
        const score = calculateDuplicateScore(
            {
                amount: transaction.amount,
                date: transaction.date,
                description: transaction.description
            },
            {
                amount: candidate.amount,
                date: candidateDate,
                description: candidate.description ?? undefined
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

/** ISO bounds of the +-toleranceDays window around a date (same maths as the guardrail query). */
export function duplicateWindow(dateObj: Date, toleranceDays: number): { startDate: string; endDate: string } {
    const toleranceMs = toleranceDays * 24 * 60 * 60 * 1000;
    return {
        startDate: new Date(dateObj.getTime() - toleranceMs).toISOString(),
        endDate: new Date(dateObj.getTime() + toleranceMs).toISOString(),
    };
}

/** Default when no hierarchical setting exists, and how a stored setting becomes a threshold. */
export function resolveDuplicateThreshold(setting: { value: unknown } | null | undefined): number {
    return setting ? Number(setting.value) : 90;
}
