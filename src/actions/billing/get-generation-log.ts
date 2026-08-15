'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
    mapInvoiceGenerationRunToHistoryEntry,
    mergeGenerationHistory,
    type GenerationHistoryEntry,
    type InvoiceGenerationRunHistoryRow,
    type InvoiceGenerationTrigger,
} from '@/lib/billing/invoice-generation-history';

export type { GenerationHistoryEntry as GenerationLogEntry } from '@/lib/billing/invoice-generation-history';

interface GetGenerationLogParams {
    page?: number;
    limit?: number;
    triggerType?: InvoiceGenerationTrigger;
}

const RUN_HISTORY_SELECT = `
    id, requested_at, requested_by, started_at, completed_at, status,
    scope, options, candidate_count, created_count, skipped_count,
    failed_count, cancelled_count, total_amount, total_wallet_allocated,
    result_summary
`;

const fetchRunEntries = async (
    triggerType?: InvoiceGenerationTrigger,
    limit?: number
): Promise<GenerationHistoryEntry[]> => {
    const supabase = await createServerSupabaseClient();
    let query = supabase.from('invoice_generation_runs').select(RUN_HISTORY_SELECT, { count: 'exact' });
    if (triggerType) query = query.contains('scope', { trigger: triggerType });
    const { data, error } = await query.order('requested_at', { ascending: false }).limit(limit ?? 100);
    if (error) return [];
    return (data || []).map((run) => mapInvoiceGenerationRunToHistoryEntry(run as unknown as InvoiceGenerationRunHistoryRow));
};

const fetchLegacyEntries = async (
    triggerType?: InvoiceGenerationTrigger,
    limit?: number
): Promise<GenerationHistoryEntry[]> => {
    const supabase = await createServerSupabaseClient();
    let query = supabase.from('invoice_generation_log').select('*', { count: 'exact' });
    if (triggerType) query = query.eq('trigger_type', triggerType);
    const { data, error } = await query.order('generated_at', { ascending: false }).limit(limit ?? 100);
    if (error) return [];
    return (data || []).map((entry) => ({ ...entry, source: 'legacy' }) as GenerationHistoryEntry);
};

/**
 * Get the latest invoice generation record, preferring durable runs over the
 * legacy log (which is retained for historical records only).
 */
export async function getLatestGenerationLog(): Promise<{
    data: GenerationHistoryEntry | null;
    error: string | null;
}> {
    const [runs, legacy] = await Promise.all([fetchRunEntries(undefined, 1), fetchLegacyEntries(undefined, 1)]);
    const { entries } = mergeGenerationHistory(runs, legacy, 1, 1);
    return { data: entries[0] ?? null, error: null };
}

/**
 * Get invoice generation history with pagination, merging durable runs
 * (preferred) with legacy log records.
 */
export async function getGenerationHistory(
    params: GetGenerationLogParams = {}
): Promise<{
    data: GenerationHistoryEntry[] | null;
    total: number;
    error: string | null;
}> {
    const { page = 1, limit = 10, triggerType } = params;
    const fetchLimit = page * limit;
    const [runs, legacy] = await Promise.all([
        fetchRunEntries(triggerType, fetchLimit),
        fetchLegacyEntries(triggerType, fetchLimit),
    ]);
    const { entries, total } = mergeGenerationHistory(runs, legacy, page, limit);
    return { data: entries, total, error: null };
}

/**
 * Get generation statistics for a time period across runs and legacy records.
 */
export async function getGenerationStats(
    days: number = 30
): Promise<{
    data: {
        totalRuns: number;
        totalGenerated: number;
        totalSkipped: number;
        totalErrors: number;
        avgDuration: number;
        byTrigger: Record<InvoiceGenerationTrigger, number>;
    } | null;
    error: string | null;
}> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const supabase = await createServerSupabaseClient();
    const [{ data: runs }, { data: legacy }] = await Promise.all([
        supabase.from('invoice_generation_runs').select(RUN_HISTORY_SELECT).gte('requested_at', startDate.toISOString()),
        supabase.from('invoice_generation_log').select('*').gte('generated_at', startDate.toISOString()),
    ]);

    const entries: GenerationHistoryEntry[] = [
        ...(runs || []).map((run) => mapInvoiceGenerationRunToHistoryEntry(run as unknown as InvoiceGenerationRunHistoryRow)),
        ...((legacy || []).map((entry) => ({ ...entry, source: 'legacy' })) as GenerationHistoryEntry[]),
    ];

    const stats = entries.reduce(
        (acc, entry) => {
            acc.totalRuns++;
            acc.totalGenerated += entry.generated_count;
            acc.totalSkipped += entry.skipped_count;
            acc.totalErrors += entry.error_count;
            acc.totalDuration += entry.duration_ms || 0;
            acc.byTrigger[entry.trigger_type] = (acc.byTrigger[entry.trigger_type] || 0) + 1;
            return acc;
        },
        {
            totalRuns: 0,
            totalGenerated: 0,
            totalSkipped: 0,
            totalErrors: 0,
            totalDuration: 0,
            byTrigger: { manual: 0, cron: 0, api: 0 } as Record<InvoiceGenerationTrigger, number>,
        }
    );

    return {
        data: {
            totalRuns: stats.totalRuns,
            totalGenerated: stats.totalGenerated,
            totalSkipped: stats.totalSkipped,
            totalErrors: stats.totalErrors,
            avgDuration: stats.totalRuns > 0 ? Math.round(stats.totalDuration / stats.totalRuns) : 0,
            byTrigger: stats.byTrigger,
        },
        error: null,
    };
}

/**
 * Get invoice generation day setting
 */
export async function getInvoiceGenerationDay(): Promise<{
    data: number;
    error: string | null;
}> {
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'invoice_generation_day')
        .single();

    if (error) {
        return { data: 2, error: error.message }; // Default to 2nd
    }

    // Parse the value (stored as JSON string like "2")
    const day = parseInt(String(data?.value).replace(/"/g, '')) || 2;
    return { data: day, error: null };
}

/**
 * Update invoice generation day setting
 */
export async function updateInvoiceGenerationDay(day: number): Promise<{
    success: boolean;
    error: string | null;
}> {
    if (day < 1 || day > 28) {
        return { success: false, error: 'Day must be between 1 and 28' };
    }

    const supabase = await createServerSupabaseClient();

    const { error } = await supabase
        .from('system_settings')
        .update({ value: JSON.stringify(day) })
        .eq('key', 'invoice_generation_day');

    if (error) {
        return { success: false, error: error.message };
    }

    return { success: true, error: null };
}

/**
 * Get auto-generate invoices setting
 */
export async function getAutoGenerateEnabled(): Promise<{
    data: boolean;
    error: string | null;
}> {
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'auto_generate_invoices')
        .single();

    if (error) {
        return { data: true, error: error.message }; // Default to enabled
    }

    // Parse the value
    const enabled = data?.value === true || data?.value === 'true';
    return { data: enabled, error: null };
}

/**
 * Update auto-generate invoices setting
 */
export async function updateAutoGenerateEnabled(enabled: boolean): Promise<{
    success: boolean;
    error: string | null;
}> {
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase
        .from('system_settings')
        .update({ value: enabled })
        .eq('key', 'auto_generate_invoices');

    if (error) {
        return { success: false, error: error.message };
    }

    return { success: true, error: null };
}
