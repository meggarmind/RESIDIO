'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { idOrParentFilterStrict } from '@/lib/postgrest-filter';
import { calculateNextRunDate } from '@/lib/reports/scheduled-report-store';

// Types
export type ReportType = 'financial_overview' | 'collection_report' | 'invoice_aging' | 'transaction_log' | 'debtors_report' | 'indebtedness_summary' | 'indebtedness_detail' | 'development_levy';
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
    configuration: Record<string, unknown> | null;
    recipients: string[] | null;
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
    // Versioning fields
    version: number;
    parent_report_id: string | null;
    is_latest: boolean;
    edit_notes: string | null;
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
    configuration?: Record<string, unknown>;
    recipients?: string[];
    template_style?: TemplateStyle;
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
    const auth = await authorizePermission(PERMISSIONS.REPORTS_MANAGE_SCHEDULES);
    if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

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
            configuration: input.configuration || {},
            recipients: input.recipients || [],
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

// Editable schedule columns. Strict: last_run_at, next_run_at, created_by, id etc.
// are rejected (next_run_at is recomputed below, never taken from the caller).
const updateScheduleSchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    report_type: z.enum(['financial_overview', 'collection_report', 'invoice_aging', 'transaction_log', 'debtors_report', 'indebtedness_summary', 'indebtedness_detail', 'development_levy']).optional(),
    frequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']).optional(),
    day_of_week: z.number().int().min(0).max(6).optional(),
    day_of_month: z.number().int().min(1).max(31).optional(),
    period_preset: z.enum(['this_month', 'last_month', 'this_quarter', 'last_quarter', 'this_year', 'last_year']).optional(),
    bank_account_ids: z.array(z.string()).optional(),
    include_charts: z.boolean().optional(),
    include_summary: z.boolean().optional(),
    configuration: z.record(z.string(), z.unknown()).optional(),
    recipients: z.array(z.string()).optional(),
    template_style: z.enum(['traditional', 'modern']).optional(),
    is_active: z.boolean().optional(),
}).strict();

// Update a schedule
export async function updateReportSchedule(
    id: string,
    input: Partial<CreateScheduleInput> & { is_active?: boolean }
): Promise<{ data: ReportSchedule | null; error: string | null }> {
    const auth = await authorizePermission(PERMISSIONS.REPORTS_MANAGE_SCHEDULES);
    if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

    const parsedInput = updateScheduleSchema.safeParse(input);
    if (!parsedInput.success) {
        return { data: null, error: parsedInput.error.issues[0]?.message || 'Invalid schedule data' };
    }
    const fields = parsedInput.data;

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
    if (fields.frequency || fields.day_of_week !== undefined || fields.day_of_month !== undefined) {
        const freq = fields.frequency || existing.frequency;
        const dow = fields.day_of_week ?? existing.day_of_week;
        const dom = fields.day_of_month ?? existing.day_of_month;
        nextRunAt = calculateNextRunDate(freq, dow ?? undefined, dom ?? undefined).toISOString();
    }

    const { data, error } = await supabase
        .from('report_schedules')
        .update({
            ...fields,
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
    const auth = await authorizePermission(PERMISSIONS.REPORTS_MANAGE_SCHEDULES);
    if (!auth.authorized) return { success: false, error: auth.error || 'Unauthorized' };

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

// Save a generated report to history (interactive, session-authenticated only).
// Scheduled/cron writes live in `@/lib/reports/scheduled-report-store` (#388).
export async function saveGeneratedReport(input: {
    name: string;
    report_type: ReportType;
    period_start: string;
    period_end: string;
    period_preset?: string;
    bank_account_ids?: string[];
    template_style?: TemplateStyle;
    report_data: unknown;
    summary?: unknown;
    generation_duration_ms?: number;
}): Promise<{ data: GeneratedReport | null; error: string | null }> {
    const auth = await authorizePermission(PERMISSIONS.REPORTS_VIEW_FINANCIAL);
    if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

    const supabase = await createServerSupabaseClient();

    // Named fields only: extra properties smuggled in by a caller are ignored, and
    // trigger/schedule are server-side constants for the interactive path.
    const { data, error } = await supabase
        .from('generated_reports')
        .insert({
            name: input.name,
            report_type: input.report_type,
            schedule_id: null,
            period_start: input.period_start,
            period_end: input.period_end,
            period_preset: input.period_preset || null,
            bank_account_ids: input.bank_account_ids || null,
            template_style: input.template_style || 'modern',
            report_data: input.report_data,
            summary: input.summary || null,
            generation_trigger: 'manual',
            generation_duration_ms: input.generation_duration_ms || null,
            generated_by: auth.userId,
        })
        .select()
        .single();

    if (error || !data) {
        console.error('[Reports] Failed to save generated report:', error);
        return { data: null, error: error?.message || 'Failed to save generated report' };
    }

    await logAudit({
        action: 'CREATE',
        entityType: 'system_settings',
        entityId: data.id,
        entityDisplay: `Generated Report: ${data.name}`,
        description: 'Saved generated report to history',
    });

    return { data, error: null };
}

// Delete a generated report
export async function deleteGeneratedReport(id: string): Promise<{ success: boolean; error: string | null }> {
    const auth = await authorizePermission(PERMISSIONS.REPORTS_MANAGE_SCHEDULES);
    if (!auth.authorized) return { success: false, error: auth.error || 'Unauthorized' };

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

// ============================================================
// Report Versioning Functions
// ============================================================

// Create a new version of a report with edited data
export async function createReportVersion(input: {
    parent_report_id: string;
    report_data: unknown;
    edit_notes: string;
}): Promise<{ data: GeneratedReport | null; error: string | null }> {
    const auth = await authorizePermission(PERMISSIONS.REPORTS_MANAGE_SCHEDULES);
    if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

    const supabase = await createServerSupabaseClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { data: null, error: 'Unauthorized' };
    }

    // Get the parent report
    const { data: parent, error: parentError } = await supabase
        .from('generated_reports')
        .select('*')
        .eq('id', input.parent_report_id)
        .single();

    if (parentError || !parent) {
        return { data: null, error: 'Parent report not found' };
    }

    // Find the original report (root of version chain)
    const originalId = parent.parent_report_id || parent.id;

    // Get the highest version number in the chain
    const { data: versions } = await supabase
        .from('generated_reports')
        .select('version')
        .or(idOrParentFilterStrict('id', 'parent_report_id', originalId))
        .order('version', { ascending: false })
        .limit(1);

    const nextVersion = (versions?.[0]?.version || 1) + 1;

    // Mark all existing versions as not latest
    await supabase
        .from('generated_reports')
        .update({ is_latest: false })
        .or(idOrParentFilterStrict('id', 'parent_report_id', originalId));

    // Create the new version
    const { data, error } = await supabase
        .from('generated_reports')
        .insert({
            name: `${parent.name} (v${nextVersion})`,
            report_type: parent.report_type,
            schedule_id: parent.schedule_id,
            period_start: parent.period_start,
            period_end: parent.period_end,
            period_preset: parent.period_preset,
            bank_account_ids: parent.bank_account_ids,
            template_style: parent.template_style,
            report_data: input.report_data,
            summary: parent.summary,
            generation_trigger: 'manual',
            generated_by: user.id,
            version: nextVersion,
            parent_report_id: originalId,
            is_latest: true,
            edit_notes: input.edit_notes,
        })
        .select()
        .single();

    if (error) {
        console.error('[Reports] Failed to create report version:', error);
        return { data: null, error: error.message };
    }

    await logAudit({
        action: 'UPDATE',
        entityType: 'system_settings',
        entityId: data.id,
        entityDisplay: `Report Version: ${data.name}`,
        oldValues: { version: parent.version },
        newValues: { version: nextVersion, edit_notes: input.edit_notes },
        description: `Created version ${nextVersion} of report`,
    });

    revalidatePath('/reports');
    return { data, error: null };
}

// Get version history for a report
export async function getReportVersionHistory(reportId: string): Promise<{ data: GeneratedReport[] | null; error: string | null }> {
    const supabase = await createServerSupabaseClient();

    // First get the report to find the original
    const { data: report, error: reportError } = await supabase
        .from('generated_reports')
        .select('id, parent_report_id')
        .eq('id', reportId)
        .single();

    if (reportError || !report) {
        return { data: null, error: 'Report not found' };
    }

    // Find the original report ID
    const originalId = report.parent_report_id || report.id;

    // Get all versions including the original
    const { data, error } = await supabase
        .from('generated_reports')
        .select('*')
        .or(idOrParentFilterStrict('id', 'parent_report_id', originalId))
        .order('version', { ascending: false });

    if (error) {
        console.error('[Reports] Failed to fetch version history:', error);
        return { data: null, error: error.message };
    }

    return { data, error: null };
}
