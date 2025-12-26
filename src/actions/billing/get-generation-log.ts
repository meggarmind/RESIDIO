'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { InvoiceGenerationTrigger } from './generate-invoices';

interface GenerationLogEntry {
    id: string;
    generated_at: string;
    generated_by: string | null;
    trigger_type: InvoiceGenerationTrigger;
    target_period: string | null;
    generated_count: number;
    skipped_count: number;
    error_count: number;
    skip_reasons: Array<{ house: string; reason: string }> | null;
    errors: string[] | null;
    duration_ms: number | null;
    created_at: string;
    // Joined data
    actor?: {
        id: string;
        full_name: string;
        email: string;
    } | null;
}

interface GetGenerationLogParams {
    page?: number;
    limit?: number;
    triggerType?: InvoiceGenerationTrigger;
}

/**
 * Get the latest invoice generation log entry
 */
export async function getLatestGenerationLog(): Promise<{
    data: GenerationLogEntry | null;
    error: string | null;
}> {
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
        .from('invoice_generation_log')
        .select(`
            *,
            actor:profiles!generated_by(id, full_name, email)
        `)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        return { data: null, error: error.message };
    }

    return { data, error: null };
}

/**
 * Get invoice generation history with pagination
 */
export async function getGenerationHistory(
    params: GetGenerationLogParams = {}
): Promise<{
    data: GenerationLogEntry[] | null;
    total: number;
    error: string | null;
}> {
    const { page = 1, limit = 10, triggerType } = params;
    const offset = (page - 1) * limit;

    const supabase = await createServerSupabaseClient();

    let query = supabase
        .from('invoice_generation_log')
        .select(`
            *,
            actor:profiles!generated_by(id, full_name, email)
        `, { count: 'exact' });

    // Filter by trigger type if specified
    if (triggerType) {
        query = query.eq('trigger_type', triggerType);
    }

    const { data, error, count } = await query
        .order('generated_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) {
        return { data: null, total: 0, error: error.message };
    }

    return { data, total: count || 0, error: null };
}

/**
 * Get generation statistics for a time period
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
    const supabase = await createServerSupabaseClient();

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data, error } = await supabase
        .from('invoice_generation_log')
        .select('*')
        .gte('generated_at', startDate.toISOString());

    if (error) {
        return { data: null, error: error.message };
    }

    if (!data || data.length === 0) {
        return {
            data: {
                totalRuns: 0,
                totalGenerated: 0,
                totalSkipped: 0,
                totalErrors: 0,
                avgDuration: 0,
                byTrigger: { manual: 0, cron: 0, api: 0 },
            },
            error: null,
        };
    }

    const stats = data.reduce(
        (acc, entry) => {
            acc.totalRuns++;
            acc.totalGenerated += entry.generated_count;
            acc.totalSkipped += entry.skipped_count;
            acc.totalErrors += entry.error_count;
            acc.totalDuration += entry.duration_ms || 0;
            acc.byTrigger[entry.trigger_type as InvoiceGenerationTrigger] =
                (acc.byTrigger[entry.trigger_type as InvoiceGenerationTrigger] || 0) + 1;
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
