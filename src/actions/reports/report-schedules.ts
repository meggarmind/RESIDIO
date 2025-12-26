'use server';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit/logger';

// Types
export type ReportType = 'financial_overview' | 'collection_report' | 'invoice_aging' | 'transaction_log';
export type ScheduleFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type PeriodPreset = 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter' | 'this_year' | 'last_year';
export type TemplateStyle = 'traditional' | 'modern';
export type GenerationTrigger = 'manual' | 'scheduled' | 'api';

export interface ReportSchedule {
    id: string;
    name: string;
    description: string | null;
    report_type: ReportType;
    frequency: ScheduleFrequency;
    day_of_week: number | null;
    day_of_month: number | null;
    period_preset: PeriodPreset | null;
    bank_account_ids: string[] | null;
    include_charts: boolean;
    include_summary: boolean;
    template_style: TemplateStyle;
    is_active: boolean;
    last_run_at: string | null;
    next_run_at: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
}

export interface GeneratedReport {
    id: string;
    name: string;
    report_type: ReportType;
    schedule_id: string | null;
    period_start: string;
    period_end: string;
    period_preset: string | null;
    bank_account_ids: string[] | null;
    template_style: TemplateStyle;
    report_data: unknown;
    summary: unknown;
    generation_trigger: GenerationTrigger;
    generation_duration_ms: number | null;
    generated_by: string | null;
    created_at: string;
}

export interface CreateScheduleInput {
    name: string;
    description?: string;
    report_type: ReportType;
    frequency: ScheduleFrequency;
    day_of_week?: number;
    day_of_month?: number;
    period_preset: PeriodPreset;
    bank_account_ids?: string[];
    include_charts?: boolean;
    include_summary?: boolean;
    template_style?: TemplateStyle;
}

// Calculate next run date based on frequency
function calculateNextRunDate(frequency: ScheduleFrequency, dayOfWeek?: number, dayOfMonth?: number): Date {
    const now = new Date();
    const next = new Date(now);

    // Set to 6 AM UTC (same as other crons)
    next.setUTCHours(6, 0, 0, 0);

    switch (frequency) {
        case 'daily':
            // Next day at 6 AM
            next.setUTCDate(next.getUTCDate() + 1);
            break;

        case 'weekly':
            // Next occurrence of day_of_week
            const targetDay = dayOfWeek ?? 1; // Default to Monday
            const currentDay = next.getUTCDay();
            let daysUntilTarget = targetDay - currentDay;
            if (daysUntilTarget <= 0) daysUntilTarget += 7;
            next.setUTCDate(next.getUTCDate() + daysUntilTarget);
            break;

        case 'monthly':
            // Next occurrence of day_of_month
            const targetDayOfMonth = dayOfMonth ?? 1;
            next.setUTCDate(targetDayOfMonth);
            if (next <= now) {
                next.setUTCMonth(next.getUTCMonth() + 1);
            }
            break;

        case 'quarterly':
            // First day of next quarter
            const currentQuarter = Math.floor(now.getUTCMonth() / 3);
            const nextQuarterMonth = (currentQuarter + 1) * 3;
            next.setUTCMonth(nextQuarterMonth);
            next.setUTCDate(dayOfMonth ?? 1);
            if (next <= now) {
                next.setUTCMonth(next.getUTCMonth() + 3);
            }
            break;

        case 'yearly':
            // January of next year (or specified day)
            next.setUTCMonth(0);
            next.setUTCDate(dayOfMonth ?? 1);
            if (next <= now) {
                next.setUTCFullYear(next.getUTCFullYear() + 1);
            }
            break;
    }

    return next;
}

// Get all report schedules
export async function getReportSchedules(): Promise<{ data: ReportSchedule[] | null; error: string | null }> {
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
        .from('report_schedules')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('[Reports] Failed to fetch schedules:', error);
        return { data: null, error: error.message };
    }

    return { data, error: null };
}

// Get a single schedule
export async function getReportSchedule(id: string): Promise<{ data: ReportSchedule | null; error: string | null }> {
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
        .from('report_schedules')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        console.error('[Reports] Failed to fetch schedule:', error);
        return { data: null, error: error.message };
    }

    return { data, error: null };
}

// Create a new schedule
export async function createReportSchedule(input: CreateScheduleInput): Promise<{ data: ReportSchedule | null; error: string | null }> {
    const supabase = await createServerSupabaseClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { data: null, error: 'Unauthorized' };
    }

    const nextRunAt = calculateNextRunDate(input.frequency, input.day_of_week, input.day_of_month);

    const { data, error } = await supabase
        .from('report_schedules')
        .insert({
            name: input.name,
            description: input.description || null,
            report_type: input.report_type,
            frequency: input.frequency,
            day_of_week: input.day_of_week ?? null,
            day_of_month: input.day_of_month ?? null,
            period_preset: input.period_preset,
            bank_account_ids: input.bank_account_ids || null,
            include_charts: input.include_charts ?? true,
            include_summary: input.include_summary ?? true,
            template_style: input.template_style || 'modern',
            is_active: true,
            next_run_at: nextRunAt.toISOString(),
            created_by: user.id,
        })
        .select()
        .single();

    if (error) {
        console.error('[Reports] Failed to create schedule:', error);
        return { data: null, error: error.message };
    }

    await logAudit({
        action: 'CREATE',
        entityType: 'system_settings',
        entityId: data.id,
        entityDisplay: `Report Schedule: ${input.name}`,
        newValues: input as unknown as Record<string, unknown>,
        description: `Created ${input.frequency} report schedule for ${input.report_type}`,
    });

    revalidatePath('/reports');
    return { data, error: null };
}

// Update a schedule
export async function updateReportSchedule(
    id: string,
    input: Partial<CreateScheduleInput> & { is_active?: boolean }
): Promise<{ data: ReportSchedule | null; error: string | null }> {
    const supabase = await createServerSupabaseClient();

    const { data: existing } = await supabase
        .from('report_schedules')
        .select('*')
        .eq('id', id)
        .single();

    if (!existing) {
        return { data: null, error: 'Schedule not found' };
    }

    // Recalculate next run if frequency changes
    let nextRunAt = existing.next_run_at;
    if (input.frequency || input.day_of_week !== undefined || input.day_of_month !== undefined) {
        const freq = input.frequency || existing.frequency;
        const dow = input.day_of_week ?? existing.day_of_week;
        const dom = input.day_of_month ?? existing.day_of_month;
        nextRunAt = calculateNextRunDate(freq, dow ?? undefined, dom ?? undefined).toISOString();
    }

    const { data, error } = await supabase
        .from('report_schedules')
        .update({
            ...input,
            next_run_at: nextRunAt,
        })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('[Reports] Failed to update schedule:', error);
        return { data: null, error: error.message };
    }

    await logAudit({
        action: 'UPDATE',
        entityType: 'system_settings',
        entityId: id,
        entityDisplay: `Report Schedule: ${data.name}`,
        oldValues: existing,
        newValues: data,
        description: `Updated report schedule`,
    });

    revalidatePath('/reports');
    return { data, error: null };
}

// Delete a schedule
export async function deleteReportSchedule(id: string): Promise<{ success: boolean; error: string | null }> {
    const supabase = await createServerSupabaseClient();

    const { data: existing } = await supabase
        .from('report_schedules')
        .select('name')
        .eq('id', id)
        .single();

    const { error } = await supabase
        .from('report_schedules')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('[Reports] Failed to delete schedule:', error);
        return { success: false, error: error.message };
    }

    await logAudit({
        action: 'DELETE',
        entityType: 'system_settings',
        entityId: id,
        entityDisplay: `Report Schedule: ${existing?.name || id}`,
        description: `Deleted report schedule`,
    });

    revalidatePath('/reports');
    return { success: true, error: null };
}

// Get generated reports history
export async function getGeneratedReports(options?: {
    limit?: number;
    offset?: number;
    report_type?: ReportType;
    schedule_id?: string;
}): Promise<{ data: GeneratedReport[] | null; count: number; error: string | null }> {
    const supabase = await createServerSupabaseClient();

    let query = supabase
        .from('generated_reports')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

    if (options?.report_type) {
        query = query.eq('report_type', options.report_type);
    }
    if (options?.schedule_id) {
        query = query.eq('schedule_id', options.schedule_id);
    }
    if (options?.limit) {
        query = query.limit(options.limit);
    }
    if (options?.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
    }

    const { data, count, error } = await query;

    if (error) {
        console.error('[Reports] Failed to fetch generated reports:', error);
        return { data: null, count: 0, error: error.message };
    }

    return { data, count: count || 0, error: null };
}

// Get a single generated report
export async function getGeneratedReport(id: string): Promise<{ data: GeneratedReport | null; error: string | null }> {
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
        .from('generated_reports')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        console.error('[Reports] Failed to fetch generated report:', error);
        return { data: null, error: error.message };
    }

    return { data, error: null };
}

// Save a generated report to history
export async function saveGeneratedReport(input: {
    name: string;
    report_type: ReportType;
    schedule_id?: string;
    period_start: string;
    period_end: string;
    period_preset?: string;
    bank_account_ids?: string[];
    template_style?: TemplateStyle;
    report_data: unknown;
    summary?: unknown;
    generation_trigger: GenerationTrigger;
    generation_duration_ms?: number;
}): Promise<{ data: GeneratedReport | null; error: string | null }> {
    // Use admin client for scheduled reports (no auth context)
    const supabase = input.generation_trigger === 'scheduled'
        ? createAdminClient()
        : await createServerSupabaseClient();

    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
        .from('generated_reports')
        .insert({
            name: input.name,
            report_type: input.report_type,
            schedule_id: input.schedule_id || null,
            period_start: input.period_start,
            period_end: input.period_end,
            period_preset: input.period_preset || null,
            bank_account_ids: input.bank_account_ids || null,
            template_style: input.template_style || 'modern',
            report_data: input.report_data,
            summary: input.summary || null,
            generation_trigger: input.generation_trigger,
            generation_duration_ms: input.generation_duration_ms || null,
            generated_by: user?.id || null,
        })
        .select()
        .single();

    if (error) {
        console.error('[Reports] Failed to save generated report:', error);
        return { data: null, error: error.message };
    }

    return { data, error: null };
}

// Delete a generated report
export async function deleteGeneratedReport(id: string): Promise<{ success: boolean; error: string | null }> {
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase
        .from('generated_reports')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('[Reports] Failed to delete generated report:', error);
        return { success: false, error: error.message };
    }

    revalidatePath('/reports');
    return { success: true, error: null };
}

// Get schedules due for execution (for cron job)
export async function getDueSchedules(): Promise<{ data: ReportSchedule[] | null; error: string | null }> {
    const supabase = createAdminClient();

    const now = new Date().toISOString();

    const { data, error } = await supabase
        .from('report_schedules')
        .select('*')
        .eq('is_active', true)
        .lte('next_run_at', now);

    if (error) {
        console.error('[Reports] Failed to fetch due schedules:', error);
        return { data: null, error: error.message };
    }

    return { data, error: null };
}

// Update schedule after execution
export async function markScheduleExecuted(id: string, frequency: ScheduleFrequency, dayOfWeek?: number, dayOfMonth?: number): Promise<void> {
    const supabase = createAdminClient();

    const nextRunAt = calculateNextRunDate(frequency, dayOfWeek, dayOfMonth);

    await supabase
        .from('report_schedules')
        .update({
            last_run_at: new Date().toISOString(),
            next_run_at: nextRunAt.toISOString(),
        })
        .eq('id', id);
}
